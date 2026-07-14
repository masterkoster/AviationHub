import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isUuid } from '@/lib/validate';
import { stripe, createInvoiceCheckoutSession } from '@/lib/stripe';

interface RouteParams {
  params: Promise<{ invoiceId: string }>;
}

// POST /api/invoices/[invoiceId]/pay — creates a Stripe Checkout Session for
// a single invoice, charged directly to the club's connected Stripe account.
// Callable by the invoice's own member, or an org admin.
export async function POST(request: Request, { params }: RouteParams) {
  try {
    if (!stripe) {
      return NextResponse.json({ error: 'Payments not configured' }, { status: 503 });
    }

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { invoiceId } = await params;
    if (!isUuid(invoiceId)) {
      return NextResponse.json({ error: 'Invalid invoiceId' }, { status: 400 });
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        organization: { select: { id: true, name: true } },
        pilotProfile: { select: { userId: true } },
      },
    });
    if (!invoice || !invoice.organizationId) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const isOwnInvoice = invoice.pilotProfile?.userId === session.user.id;
    let isAdmin = false;
    if (!isOwnInvoice) {
      const membership = await prisma.organizationMember.findFirst({
        where: { organizationId: invoice.organizationId, userId: session.user.id, role: 'ADMIN' },
      });
      isAdmin = !!membership;
    }
    if (!isOwnInvoice && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (invoice.status === 'paid') {
      return NextResponse.json({ error: 'Invoice already paid' }, { status: 409 });
    }

    // stripeAccountId/stripeChargesEnabled predate the generated Prisma
    // Client — read via raw SQL.
    const orgRows = await prisma.$queryRaw<{ stripeAccountId: string | null; stripeChargesEnabled: boolean }[]>`
      SELECT stripeAccountId, stripeChargesEnabled FROM Organization WHERE id = ${invoice.organizationId}
    `;
    const org = orgRows[0];
    if (!org?.stripeAccountId || !org.stripeChargesEnabled) {
      return NextResponse.json({ error: 'This club has not enabled payments yet' }, { status: 409 });
    }

    // Server-computed cents from the invoice total — never from the request body.
    const unitAmountCents = Math.round(Number(invoice.totalAmount) * 100);
    if (!Number.isFinite(unitAmountCents) || unitAmountCents <= 0) {
      return NextResponse.json({ error: 'Invoice has no amount due' }, { status: 400 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const successUrl = `${appUrl}/flying-club/billing?paid=1`;
    const cancelUrl = `${appUrl}/flying-club/billing?paid=0`;

    const checkoutSession = await createInvoiceCheckoutSession({
      connectedAccountId: org.stripeAccountId,
      unitAmountCents,
      clubName: invoice.organization?.name || 'Your Flying Club',
      invoiceId: invoice.id,
      organizationId: invoice.organizationId,
      successUrl,
      cancelUrl,
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    console.error('Error creating invoice checkout session:', error);
    return NextResponse.json({ error: 'Failed to start payment' }, { status: 500 });
  }
}
