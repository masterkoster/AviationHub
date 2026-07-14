import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import type Stripe from 'stripe';

// POST /api/stripe/webhook — PUBLIC BY DESIGN. Auth is the Stripe signature,
// verified below; there is no session to check (Stripe itself is the caller).
// Register this endpoint in the Stripe dashboard listening to CONNECTED
// ACCOUNT events (checkout.session.completed, account.updated) — Connect
// events arrive with `event.account` set to the club's connected account id.
export async function POST(request: Request) {
  if (!stripe) {
    return NextResponse.json({ error: 'Payments not configured' }, { status: 503 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: 'Payments not configured' }, { status: 503 });
  }

  const body = await request.text();
  const sig = request.headers.get('stripe-signature');

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig || '', webhookSecret);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const checkoutSession = event.data.object as Stripe.Checkout.Session;
        const invoiceId = checkoutSession.metadata?.invoiceId;
        if (!invoiceId) {
          console.warn('checkout.session.completed with no invoiceId metadata; ignoring');
          break;
        }

        const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { status: true } });
        if (!invoice) {
          console.warn('checkout.session.completed for unknown invoice', invoiceId);
          break;
        }
        if (invoice.status === 'paid') {
          break; // already-paid — idempotent no-op
        }

        const paymentId =
          typeof checkoutSession.payment_intent === 'string'
            ? checkoutSession.payment_intent
            : checkoutSession.payment_intent?.id || checkoutSession.id;

        await prisma.invoice.update({
          where: { id: invoiceId },
          data: { status: 'paid', stripePaymentId: paymentId },
        });
        break;
      }

      case 'account.updated': {
        const account = event.data.object as Stripe.Account;
        const accountId = event.account || account.id;
        if (!accountId) break;

        // stripeAccountId/stripeChargesEnabled predate the generated Prisma
        // Client — read/write via raw SQL.
        await prisma.$executeRaw`
          UPDATE Organization
          SET stripeChargesEnabled = ${!!account.charges_enabled}
          WHERE stripeAccountId = ${accountId}
        `;
        break;
      }

      default:
        console.log('Unhandled Stripe webhook event type:', event.type);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Error handling Stripe webhook event:', event.type, error);
    // 500 (not 200) on unexpected processing failures so Stripe retries —
    // safe because both handlers above are idempotent (already-paid /
    // already-matching-charges-enabled are no-ops).
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}
