# QuickBooks Online integration

Clubs connect their QuickBooks Online (QBO) company and push their club
invoices and payments into their books. This is a **one-way push (app → QBO)**,
**sandbox-first** integration.

- Code: `lib/quickbooks.ts` (plain-fetch client, no SDK), routes under
  `app/api/integrations/quickbooks/{connect,callback,status,sync,disconnect}`.
- Tokens and the QBO company id (`realmId`) live on the `Integration` row
  (provider `quickbooks`, one per organization).
- Every entity we push is recorded in `QuickBooksMapping` for idempotency, and
  each sync run writes a `SyncLog`.

---

## 1. Create the Intuit developer app

1. Sign in at <https://developer.intuit.com> with an Intuit developer account.
2. **Dashboard → Create an app → QuickBooks Online and Payments.**
3. Select the scope **`com.intuit.quickbooks.accounting`** (Accounting).
4. Open the app → **Keys & credentials**. You will see two sets of keys:
   - **Development** keys — used against the **sandbox** company.
   - **Production** keys — used against real company data (requires going
     through Intuit's production/app-assessment review first).
   Copy the **Client ID** and **Client Secret** for the environment you're
   targeting (start with Development / sandbox).
5. Under **Redirect URIs**, add the exact callback URL for your deployment
   (see next section) and **Save**.

Intuit automatically provisions a **sandbox company** for your developer
account (Dashboard → **Sandbox**). That sandbox company already contains a
default chart of accounts and a `Services` item, which this integration relies
on for invoice lines.

## 2. Register the redirect URI

The redirect URI is derived at runtime as:

```
{NEXT_PUBLIC_APP_URL || NEXTAUTH_URL || http://localhost:3000}/api/integrations/quickbooks/callback
```

Register that **exact** string (scheme, host, port, path — no trailing slash)
under the app's **Redirect URIs**. Examples:

- Local: `http://localhost:3000/api/integrations/quickbooks/callback`
- Prod:  `https://app.example.com/api/integrations/quickbooks/callback`

If it does not match character-for-character, Intuit rejects the OAuth request.

## 3. Environment variables

Add to `.env.local` (see `.env.example`):

```bash
QUICKBOOKS_CLIENT_ID=<from Keys & credentials>
QUICKBOOKS_CLIENT_SECRET=<from Keys & credentials>
QUICKBOOKS_ENVIRONMENT=sandbox            # or "production"
NEXT_PUBLIC_APP_URL=http://localhost:3000 # must match the registered redirect base
```

- `QUICKBOOKS_ENVIRONMENT=sandbox` (default) targets
  `https://sandbox-quickbooks.api.intuit.com`; `production` targets
  `https://quickbooks.api.intuit.com`. Use the matching Client ID/Secret set.
- The **connect** endpoint returns **503** while the client id/secret are unset,
  so the rest of the app stays functional without QuickBooks configured.

## 4. Connect a club (sandbox test procedure)

1. Start the app with the env vars above and sign in as a club **ADMIN** or
   **TREASURER** (finance role — the QuickBooks routes are finance-gated).
2. Go to the club's **Manage → Add-ons** page and click **Connect** on the
   QuickBooks card. You are redirected to Intuit; choose the **sandbox
   company** and authorize.
3. Intuit redirects back to the callback, which exchanges the code, stores the
   tokens + `realmId`, and returns you to Add-ons with
   `?success=quickbooks_connected`.
4. Generate some billing data: run a billing cycle so the club has `Invoice`
   rows (some `pending`, some `paid`).
5. Back on the Add-ons card (now showing **Connected**), click **Sync**.
6. Open the sandbox company in QBO
   (<https://qbo.intuit.com> via the developer **Sandbox** link) and confirm:
   - **Sales → Customers** — a customer per billed member.
   - **Sales → Invoices** — one invoice per club invoice, each line reading
     `Flight N12345 — 1.4 hrs @ $142/hr`.
   - Invoices whose club status was `paid` show a linked **Payment** and a
     Paid balance.

Re-running **Sync** is safe: already-pushed invoices are skipped via
`QuickBooksMapping`, so no duplicates are created.

## 5. How it works

- **OAuth** (`lib/quickbooks.ts`): `getAuthorizeUrl` → Intuit consent;
  `exchangeCode` on callback; `refreshTokens` on demand. QBO **rotates the
  refresh token on every refresh**, so each refresh persists *both* the new
  access and refresh token back to the `Integration` row immediately. Access
  tokens are refreshed proactively ~5 min before expiry and on any `401`.
- **qboRequest** targets `/v3/company/{realmId}/…` with the bearer token.
- **Customers**: `ensureCustomer` looks up `QuickBooksMapping`
  (`member` / our `userId`), then queries QBO by `DisplayName` before creating,
  to avoid duplicate-name (`6240`) errors. The QBO customer id is cached in the
  mapping.
- **Invoices**: `pushInvoice` creates a QBO Invoice. Idempotency key is a
  `QuickBooksMapping` row of type `invoice` keyed by our invoice id.
- **Payments**: for club invoices marked `paid`, `recordPayment` posts a QBO
  Payment linked to the pushed invoice (`LinkedTxn` → `Invoice`).

## 6. Simplifications & limitations

- **One-way push only** (app → QBO). We never read invoices/payments back from
  QBO, and changes made in QBO are not synced back. Editing or deleting a
  pushed invoice must be done in QBO directly.
- **Single generic service item.** Every invoice line uses one QBO service item
  (the sandbox default `Services`, falling back to `ItemRef` value `1`). We do
  **not** build a per-aircraft item catalog in QBO — the aircraft/hours/rate
  detail lives in each line's description. Income-account mapping therefore
  follows that one item's account.
- **Payments land in Undeposited Funds** (QBO default); there is no
  deposit-account mapping.
- **Cap of 50 invoices per sync run.** Unmapped invoices beyond that are picked
  up on the next run. There is no automatic/scheduled sync yet — sync is
  manual via the Add-ons page.
- Only invoices with a linked member (`pilotProfileId`) and at least one line
  item are pushed; others are skipped and counted in the response.

## 7. Disconnecting

**Disconnect** best-effort revokes the refresh token at Intuit's revoke
endpoint and clears the stored tokens on the `Integration` row (status →
`disconnected`). Existing `QuickBooksMapping`/`SyncLog` history is retained.

## 8. What you must do at developer.intuit.com before this is testable

1. Create a developer account and an app (Accounting scope).
2. Copy the **Client ID** and **Client Secret** (Development keys for sandbox)
   into `QUICKBOOKS_CLIENT_ID` / `QUICKBOOKS_CLIENT_SECRET`.
3. Add the redirect URI
   `{NEXT_PUBLIC_APP_URL}/api/integrations/quickbooks/callback` to the app and
   save it.
4. Confirm you have a **sandbox company** (auto-provisioned; visible under
   Dashboard → Sandbox). Nothing else needs seeding — its default `Services`
   item and chart of accounts are enough.
5. Leave `QUICKBOOKS_ENVIRONMENT=sandbox` until you've completed Intuit's
   production review; only then switch to the Production keys and
   `QUICKBOOKS_ENVIRONMENT=production`.
