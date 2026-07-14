import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isUuid } from '@/lib/validate';
import { stripe, retrieveConnectedAccount } from '@/lib/stripe';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

// GET /api/groups/[groupId]/stripe/status — the club's Stripe Connect status
// (any member may check this — it's just onboarding progress, no financial data).
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { groupId } = await params;
    if (!isUuid(groupId)) {
      return NextResponse.json({ error: 'Invalid groupId' }, { status: 400 });
    }

    const membership = await prisma.organizationMember.findFirst({
      where: { organizationId: groupId, userId: session.user.id },
    });
    if (!membership) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }

    // stripeAccountId/stripeChargesEnabled predate the generated Prisma
    // Client — read/write via raw SQL.
    const rows = await prisma.$queryRaw<{ stripeAccountId: string | null; stripeChargesEnabled: boolean }[]>`
      SELECT stripeAccountId, stripeChargesEnabled FROM Organization WHERE id = ${groupId}
    `;
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Club not found' }, { status: 404 });
    }

    const { stripeAccountId } = rows[0];
    if (!stripeAccountId) {
      return NextResponse.json({ connected: false });
    }

    if (!stripe) {
      return NextResponse.json({ error: 'Payments not configured' }, { status: 503 });
    }

    const account = await retrieveConnectedAccount(stripeAccountId);
    const chargesEnabled = !!account.charges_enabled;
    const detailsSubmitted = !!account.details_submitted;

    if (chargesEnabled !== !!rows[0].stripeChargesEnabled) {
      await prisma.$executeRaw`UPDATE Organization SET stripeChargesEnabled = ${chargesEnabled} WHERE id = ${groupId}`;
    }

    return NextResponse.json({ connected: true, chargesEnabled, detailsSubmitted });
  } catch (error) {
    console.error('Error fetching Stripe status:', error);
    return NextResponse.json({ error: 'Failed to fetch Stripe status' }, { status: 500 });
  }
}
