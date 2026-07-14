import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isUuid } from '@/lib/validate';
import { stripe, createConnectedAccount, createAccountOnboardingLink } from '@/lib/stripe';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

// POST /api/groups/[groupId]/stripe/onboard — create (if needed) the club's
// Stripe Standard connected account and return an onboarding link (admin only).
export async function POST(_request: Request, { params }: RouteParams) {
  try {
    if (!stripe) {
      return NextResponse.json({ error: 'Payments not configured' }, { status: 503 });
    }

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { groupId } = await params;
    if (!isUuid(groupId)) {
      return NextResponse.json({ error: 'Invalid groupId' }, { status: 400 });
    }

    const membership = await prisma.organizationMember.findFirst({
      where: { organizationId: groupId, userId: session.user.id, role: 'ADMIN' },
    });
    if (!membership) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // stripeAccountId predates the generated Prisma Client — read via raw SQL.
    const rows = await prisma.$queryRaw<{ stripeAccountId: string | null }[]>`
      SELECT stripeAccountId FROM Organization WHERE id = ${groupId}
    `;
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Club not found' }, { status: 404 });
    }

    let accountId = rows[0].stripeAccountId;
    if (!accountId) {
      const account = await createConnectedAccount();
      accountId = account.id;
      await prisma.$executeRaw`UPDATE Organization SET stripeAccountId = ${accountId} WHERE id = ${groupId}`;
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const returnUrl = `${appUrl}/flying-club/billing?stripe=return`;
    const link = await createAccountOnboardingLink(accountId, returnUrl, returnUrl);

    return NextResponse.json({ url: link.url });
  } catch (error) {
    console.error('Error starting Stripe onboarding:', error);
    return NextResponse.json({ error: 'Failed to start onboarding' }, { status: 500 });
  }
}
