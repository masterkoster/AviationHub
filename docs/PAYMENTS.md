# Club Payments (Stripe Connect)

## Money model

Every flying club onboards its **own** Stripe account (a Standard connected
account). Members pay the club **directly** — Checkout Sessions are created
as **direct charges** on the club's connected account
(`{ stripeAccount: org.stripeAccountId }`). The platform (AviationHub) never
holds club funds, never touches club payouts, and is not a party to the
charge beyond facilitating the Checkout Session. Stripe's fees are deducted
from the club's own balance, same as if the club had signed up for Stripe
directly.

This is deliberately different from the legacy `chargeCustomer` /
`paymentIntents.create` helper in `lib/stripe.ts` (now marked
`@deprecated`), which charges the **platform's** Stripe account — that
helper must not be used for new club billing/payments work.

## Data model

- `Organization.stripeAccountId` (`NVARCHAR(255)`, nullable) — the club's
  connected account id (`acct_...`). Set once, on first onboarding.
- `Organization.stripeChargesEnabled` (`BIT`, default `0`) — mirrors the
  connected account's `charges_enabled` flag. Kept in sync by
  `GET /api/groups/[groupId]/stripe/status` and the `account.updated`
  webhook event.

Both columns were added directly to the database
(`prisma/migrations/organization_stripe.sql`, idempotent) ahead of
regenerating the Prisma Client, so all reads/writes of them go through
parameterized `$queryRaw` / `$executeRaw` until the client is regenerated
(see the `contactEmail` precedent in `app/api/groups/route.ts`).

`Invoice.status` / `Invoice.stripePaymentId` already existed on the model
and are used as-is: `pending` -> `paid`, with `stripePaymentId` set to the
Checkout Session's `payment_intent` id.

## Environment variables

Set these in `.env.local` (test keys) and in your deployment environment
(live keys):

| Variable | Purpose |
|---|---|
| `STRIPE_SECRET_KEY` | Platform account secret key. Required for onboarding links, status checks, and creating Checkout Sessions. |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for `/api/stripe/webhook` (`whsec_...`). Without it the webhook route responds `503`. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Publishable key, safe for client-side use if a client-side Stripe.js integration is added later. |

## Endpoints

| Endpoint | Auth | Behavior |
|---|---|---|
| `POST /api/groups/[groupId]/stripe/onboard` | Club admin | Creates the club's Standard connected account if one doesn't exist yet, then returns `{ url }` — an Account Link to Stripe-hosted onboarding. |
| `GET /api/groups/[groupId]/stripe/status` | Any club member | Returns `{ connected, chargesEnabled, detailsSubmitted }`. Refreshes `stripeChargesEnabled` on the org if it changed. |
| `POST /api/invoices/[invoiceId]/pay` | The invoice's own member, or a club admin | Creates a Checkout Session as a direct charge on the club's connected account for the invoice's exact amount (server-computed, never trusts the request body). Returns `{ url }`. `409` if already paid or the club hasn't enabled charges yet. |
| `POST /api/stripe/webhook` | **Public** — the Stripe signature IS the auth | Handles `checkout.session.completed` (marks the invoice paid, idempotent) and `account.updated` (syncs `stripeChargesEnabled`). Always `200` on handled/ignored event types; `400` on bad signature; `503` if `STRIPE_WEBHOOK_SECRET` is unset. |

## Registering the webhook in the Stripe dashboard

1. Go to **Developers -> Webhooks** in the Stripe dashboard.
2. Click **Add endpoint**.
3. Endpoint URL: `https://<your-domain>/api/stripe/webhook`
   (for local testing, use the Stripe CLI — see below).
4. **Important**: set "Listen to" to **Events on Connected accounts**, not
   just your own account. Direct charges on connected accounts emit their
   `checkout.session.completed` event on the **connected account**, and
   `account.updated` events (onboarding progress, `charges_enabled` flips)
   are inherently Connect events. The webhook handler reads `event.account`
   to know which club's connected account fired the event.
5. Subscribe to these events:
   - `checkout.session.completed`
   - `account.updated`
6. Copy the **Signing secret** (`whsec_...`) into `STRIPE_WEBHOOK_SECRET`.

## End-to-end test procedure (test mode)

1. Ensure `STRIPE_SECRET_KEY` (test, `sk_test_...`) and
   `STRIPE_WEBHOOK_SECRET` are set in `.env.local`.
2. Forward webhooks to your local dev server with the Stripe CLI:
   ```
   stripe listen --forward-to localhost:3000/api/stripe/webhook --forward-connect-to localhost:3000/api/stripe/webhook
   ```
   `stripe listen` prints a `whsec_...` value — use that as
   `STRIPE_WEBHOOK_SECRET` for local testing (it's different from the
   dashboard's production signing secret).
3. As a club admin, open **Flying Club -> Settings -> Payments** (desktop
   app) and click **Connect Stripe**. Complete the Stripe-hosted onboarding
   flow with test data (Stripe's onboarding accepts made-up business/bank
   details in test mode — use `000123456789` for a test bank account
   routing/account number if prompted).
4. After returning to `/flying-club/billing?stripe=return`, re-check the
   Payments card — it should read "Ready to accept payments" once
   `charges_enabled` is true (may take a few seconds; the status endpoint
   re-fetches from Stripe).
5. As a member with an unpaid statement, go to **Flying Club -> Billing**
   and click **Pay** on an unpaid invoice row. This redirects to a
   Stripe-hosted Checkout page.
6. Use a Stripe test card to complete payment:
   - **Success**: `4242 4242 4242 4242`, any future expiry, any CVC, any ZIP.
   - **Decline**: `4000 0000 0000 0002`.
7. On success, Checkout redirects back to `/flying-club/billing?paid=1` and
   Stripe fires `checkout.session.completed`. Confirm in the app that the
   invoice's status flipped to `paid` (and, in the Stripe CLI output / your
   server logs, that the webhook handler ran without error).
8. Re-run step 5 against the same invoice — it should now be blocked
   (already paid), confirming the idempotent no-op path.
