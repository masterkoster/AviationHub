import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('STRIPE_SECRET_KEY not set - Stripe features will be disabled');
}

export const stripe = process.env.STRIPE_SECRET_KEY 
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-01-28.clover' })
  : null;

export async function createCustomer(email: string, name?: string) {
  if (!stripe) throw new Error('Stripe not configured');
  
  return stripe.customers.create({
    email,
    name: name || undefined,
  });
}

/**
 * @deprecated Platform-charge helper — the resulting PaymentIntent lands on
 * the PLATFORM's Stripe account, which conflicts with the club-payments
 * money model (Standard connected accounts + direct charges; the platform
 * NEVER holds club funds). Do not use for new club billing/payments work —
 * see the Connect helpers below and `app/api/invoices/[invoiceId]/pay/route.ts`,
 * which creates a Checkout Session as a direct charge on the club's own
 * connected account instead. Left in place only because `lib/billing.ts`'s
 * legacy account-credit billing cycle still calls it.
 */
export async function chargeCustomer(
  customerId: string,
  amount: number,
  description: string
) {
  if (!stripe) throw new Error('Stripe not configured');

  // Amount in cents
  const amountInCents = Math.round(amount * 100);

  return stripe.paymentIntents.create({
    amount: amountInCents,
    currency: 'usd',
    customer: customerId,
    description,
    automatic_payment_methods: {
      enabled: true,
    },
  });
}

export async function getPaymentMethods(customerId: string) {
  if (!stripe) throw new Error('Stripe not configured');
  
  return stripe.paymentMethods.list({
    customer: customerId,
    type: 'card',
  });
}

export async function createCheckoutSession(
  customerId: string,
  priceId: string,
  successUrl: string,
  cancelUrl: string
) {
  if (!stripe) throw new Error('Stripe not configured');

  return stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ['card'],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    mode: 'subscription',
    success_url: successUrl,
    cancel_url: cancelUrl,
  });
}

// ============ CLUB PAYMENTS (Stripe Connect — Standard accounts, direct charges) ============
//
// Money model: each club onboards its own Stripe account (type "standard").
// Members pay the club directly via a Checkout Session created as a DIRECT
// CHARGE on the club's connected account (the `{ stripeAccount }` request
// option below). The platform never holds club funds and never touches
// club-scoped payment data outside of Connect's webhook events.

/** Creates a new Standard connected account for a club. */
export async function createConnectedAccount() {
  if (!stripe) throw new Error('Stripe not configured');
  return stripe.accounts.create({ type: 'standard' });
}

/** Creates an onboarding (or re-onboarding) link for a club's connected account. */
export async function createAccountOnboardingLink(accountId: string, refreshUrl: string, returnUrl: string) {
  if (!stripe) throw new Error('Stripe not configured');
  return stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: 'account_onboarding',
  });
}

/** Retrieves a club's connected account (used to check onboarding/charges status). */
export async function retrieveConnectedAccount(accountId: string) {
  if (!stripe) throw new Error('Stripe not configured');
  return stripe.accounts.retrieve(accountId);
}

/**
 * Creates a Checkout Session for a single invoice, charged directly to the
 * club's connected account (a "direct charge" — funds settle to the club,
 * Stripe fees come out of the club's balance, the platform never holds the
 * money). `unitAmountCents` must be server-computed from the invoice total.
 */
export async function createInvoiceCheckoutSession(params: {
  connectedAccountId: string;
  unitAmountCents: number;
  clubName: string;
  invoiceId: string;
  organizationId: string;
  successUrl: string;
  cancelUrl: string;
}) {
  if (!stripe) throw new Error('Stripe not configured');
  const { connectedAccountId, unitAmountCents, clubName, invoiceId, organizationId, successUrl, cancelUrl } = params;

  return stripe.checkout.sessions.create(
    {
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: unitAmountCents,
            product_data: { name: `Club statement — ${clubName}` },
          },
          quantity: 1,
        },
      ],
      metadata: { invoiceId, organizationId },
      success_url: successUrl,
      cancel_url: cancelUrl,
    },
    { stripeAccount: connectedAccountId }
  );
}
