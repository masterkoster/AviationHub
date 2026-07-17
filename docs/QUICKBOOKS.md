# QuickBooks Online integration

Two independent connections share the same Intuit developer app, the same
`lib/quickbooks.ts` client, and the same `Integration` table — one **per
club** (club scope) and one **per individual** (personal scope). Both are a
**one-way push (app → QBO)**, **sandbox-first** integration.

- **Club scope** (`organizationId` set on the `Integration` row): a club
  admin/treasurer connects the club's QBO company and pushes club
  `Invoice`/`Payment` rows. Routes: `app/api/integrations/quickbooks/{connect,callback,status,sync,disconnect}`.
  UI: the **Accounting (QuickBooks)** card in the club's **Billing** tab
  (`app/desktop/flying-club/page.tsx` → `BillingTab`, finance-gated,
  component in `app/desktop/flying-club/_components/quickbooks-card.tsx`).
- **Personal scope** (`userId` set on the `Integration` row): an individual
  connects their own QBO company and pushes their own out-of-pocket
  aviation expenses (maintenance/fuel) for tax purposes. Routes:
  `app/api/me/quickbooks/{connect,callback,status,sync,disconnect}` — no
  org/finance gate, session-only. UI: **Settings → Accounting**
  (`app/desktop/settings/accounting/page.tsx`).
- Code: `lib/quickbooks.ts` (plain-fetch client, no SDK). Every OAuth/QBO
  helper takes a structurally-typed `QBIntegration` row and doesn't care
  which scope it came from — see the file's top comment.
- Tokens and the QBO company id (`realmId`) live on the `Integration` row.
  Uniqueness is enforced per scope by two SQL Server **filtered unique
  indexes** (`Integration_org_provider` WHERE `organizationId IS NOT NULL`,
  `Integration_user_provider` WHERE `userId IS NOT NULL`) added by
  `prisma/migrations/integration_user_scope.sql`, replacing the old single
  `@@unique([organizationId, provider])`. The generated Prisma client
  predates this migration (intentionally not regenerated), so **personal**
  Integration reads/writes go through parameterized raw SQL
  (`findPersonalIntegration`, `upsertPersonalIntegration`,
  `clearPersonalIntegrationTokens`, `recordPersonalSyncResult` in
  `lib/quickbooks.ts`) while the **club** path is untouched and keeps using
  the typed client exactly as before (verified against the live DB —
  `findUnique`/`upsert` by `organizationId_provider` still work correctly
  against the new filtered index).
- Every entity we push is recorded in `QuickBooksMapping` for idempotency
  (club: `entityType: 'invoice'`; personal: `'personal-maintenance'` /
  `'personal-fuel'`), and each sync run writes a `SyncLog`.

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
5. Under **Redirect URIs**, add **both** callback URLs (club and personal —
   see next section) and **Save**. Intuit apps accept a list of redirect
   URIs, not just one.

Intuit automatically provisions a **sandbox company** for your developer
account (Dashboard → **Sandbox**). That sandbox company already contains a
default chart of accounts (including the catch-all **Uncategorized
Expense** account the personal path falls back to) and a `Services` item,
which this integration relies on for invoice lines.

## 2. Register the redirect URIs

Both scopes share one Intuit app but use **different callback paths**, so
both must be registered:

```
{NEXT_PUBLIC_APP_URL || NEXTAUTH_URL}/api/integrations/quickbooks/callback   (club)
{NEXT_PUBLIC_APP_URL || NEXTAUTH_URL}/api/me/quickbooks/callback            (personal)
```

Register both **exact** strings (scheme, host, port, path — no trailing
slash) under the app's **Redirect URIs**. Examples (local dev):

- `http://localhost:3000/api/integrations/quickbooks/callback`
- `http://localhost:3000/api/me/quickbooks/callback`

If either does not match character-for-character, Intuit rejects the OAuth
request for that flow.

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
- Both connect endpoints return **503** while the client id/secret are
  unset, so the rest of the app stays functional without QuickBooks
  configured. One set of env vars covers both scopes.

## 4. Connect a club (sandbox test procedure)

1. Start the app with the env vars above and sign in as a club **ADMIN** or
   **TREASURER** (finance role — the club QuickBooks routes are
   finance-gated).
2. Go to the club's **Billing** tab (`/desktop/flying-club`, Billing tab)
   and click **Connect** on the **Accounting (QuickBooks)** card. You are
   redirected to Intuit; choose the **sandbox company** and authorize.
3. Intuit redirects back to the callback, which exchanges the code, stores
   the tokens + `realmId` on the club's (`organizationId`-scoped)
   `Integration` row, and returns you to the Billing tab.
4. Generate some billing data: run a billing cycle so the club has
   `Invoice` rows (some `pending`, some `paid`).
5. Back on the card (now showing **Connected**), click **Sync now**.
6. Open the sandbox company in QBO
   (<https://qbo.intuit.com> via the developer **Sandbox** link) and confirm:
   - **Sales → Customers** — a customer per billed member.
   - **Sales → Invoices** — one invoice per club invoice, each line reading
     `Flight N12345 — 1.4 hrs @ $142/hr`.
   - Invoices whose club status was `paid` show a linked **Payment** and a
     Paid balance.

Re-running **Sync now** is safe: already-pushed invoices are skipped via
`QuickBooksMapping`, so no duplicates are created.

## 5. Connect an individual (sandbox test procedure)

1. Sign in with a cloud account (personal QuickBooks sync requires a server
   session — it's not available in the offline/local PIN-kiosk desktop
   mode, since there's no session to attach OAuth tokens to).
2. Go to **Settings → Accounting** and click **Connect**. You are
   redirected to Intuit; choose the **sandbox company** and authorize (use
   a *different* sandbox company than the club's if you want to see the two
   scopes land in separate QBO companies — or the same one, they don't
   collide either way).
3. Intuit redirects back to `/api/me/quickbooks/callback`, which stores the
   tokens on the user's (`userId`-scoped) `Integration` row and returns you
   to the Accounting settings page.
4. Create a personal expense to sync (see "Personal sync sources" below for
   exactly what qualifies — as of this writing that means a `Maintenance`
   row with `reportedByUserId` = you, `organizationId` = NULL, and a `cost`
   set; there is no UI for this yet, so seed one directly, e.g.:
   ```sql
   UPDATE Maintenance SET cost = 214.50, maintenanceType = 'PERSONAL'
   WHERE id = '<a maintenance row reportedByUserId = your user id, organizationId IS NULL>'
   ```
5. Click **Sync now**. Confirm in the sandbox company:
   - **Expenses → Expenses** — a Purchase with the amount, dated the
     maintenance's `reportedDate`, description `Aircraft Maintenance — <your description>`.

## 6. How it works

- **OAuth** (`lib/quickbooks.ts`): `getAuthorizeUrl` → Intuit consent;
  `exchangeCode` on callback; `refreshTokens` on demand. QBO **rotates the
  refresh token on every refresh**, so each refresh persists *both* the new
  access and refresh token back to the `Integration` row immediately (this
  applies to both scopes — `refreshAndPersist` updates by `id`, which
  doesn't care about scope). Access tokens are refreshed proactively ~5 min
  before expiry and on any `401`.
- `getRedirectUri(path)` / `getAuthorizeUrl(state, redirectUri)` are
  parameterized by callback path so both scopes share the OAuth plumbing:
  club passes the default (`CALLBACK_PATH`), personal passes
  `getRedirectUri(PERSONAL_CALLBACK_PATH)`.
- **State format** disambiguates which callback handles a redirect: club
  uses `"{groupId}:{random}"`; personal uses `"u:{userId}:{random}"` (a
  `groupId` never starts with `"u:"`). Each callback also re-checks that the
  signed-in session matches the identity embedded in `state` before writing
  any tokens.
- **qboRequest** targets `/v3/company/{realmId}/…` with the bearer token.
- **Customers** (club only): `ensureCustomer` looks up `QuickBooksMapping`
  (`member` / our `userId`), then queries QBO by `DisplayName` before
  creating, to avoid duplicate-name (`6240`) errors.
- **Invoices** (club only): `pushInvoice` creates a QBO Invoice. Idempotency
  key is a `QuickBooksMapping` row of type `invoice` keyed by our invoice id.
- **Payments** (club only): for club invoices marked `paid`, `recordPayment`
  posts a QBO Payment linked to the pushed invoice (`LinkedTxn` → `Invoice`).
- **Expenses** (personal only): `pushExpense` creates a QBO Purchase
  (`AccountBasedExpenseLineDetail`). Idempotency key is a
  `QuickBooksMapping` row of type `personal-maintenance` / `personal-fuel`
  keyed by our row's id.

## 7. Personal sync sources (recon — what actually has real cost data)

The schema was audited for every place an individual has a genuine dollar
cost tied to their own aircraft use (`Maintenance`, `FuelExpense`,
`LogbookEntry`, `UserAircraft`, `TrainingFinancials`, `FlightLog`). Result:

- **`Maintenance`** (`maintenanceType` `'PERSONAL'`/`'CLUB'`, `cost`,
  `reportedByUserId`) — synced. Filter: `reportedByUserId = you`,
  `organizationId IS NULL` (not club-covered — a club-covered item is the
  club's expense, not yours, and the club may separately invoice/split it),
  `cost > 0`. **Caveat found during recon: no UI in this codebase can
  currently set `cost` on an org-less Maintenance row.** The only two
  cost-entry routes (`PATCH /api/maintenance/[id]`,
  `PATCH /api/admin/maintenance/issues/[id]`) both resolve the owning
  organization from the row (directly or via its aircraft) and 400 if there
  isn't one, then gate on ADMIN membership of that org. So personal (no
  club) maintenance cost entry is a real product gap, not just an unsynced
  edge case — this task did not add a cost-entry UI (out of scope), only
  the sync path for whenever that gap closes (or for rows seeded another
  way).
- **`FuelExpense`** (`totalCost`, `pilotProfileId`) — synced defensively
  (`organizationId IS NULL`, `totalCost > 0`, joined to the user via
  `PilotProfile.userId`), but **there is no creation route for FuelExpense
  anywhere in this codebase** — only admin read/approve routes for
  club-submitted claims (which always carry an `organizationId`). This path
  is forward-compatible, not exercised by any real data today.
- **`LogbookEntry`** — no cost field at all. Not a source.
- **`UserAircraft`** — registration info only (nNumber/nickname/notes), no
  cost field. Not a source.
- **`TrainingFinancials`** — cost *inputs* for a training-budget planning
  tool (rate estimates), not actual incurred transactions. Deliberately
  excluded — syncing an estimate as an "expense" would misstate real books.
- **`FlightLog`** (`calculatedCost`) — always `organizationId`/`clubAircraftId`
  scoped (club billing, already reflected in the club's own Invoice sync).
  Not a personal source.

## 8. Simplifications & limitations

- **One-way push only** (app → QBO), both scopes. We never read
  invoices/payments/purchases back from QBO.
- **Single generic service item** for invoice lines (club): the sandbox
  default `Services`, falling back to `ItemRef` value `1`. No per-aircraft
  item catalog — detail lives in the line description.
- **No per-category chart-of-accounts mapping or vendor catalog** for
  expenses (personal): `pushExpense` resolves the expense-line account by
  exact name match on the category (e.g. "Aircraft Maintenance"), falling
  back to QBO's own **Uncategorized Expense** account, then any Expense-type
  account at all — the intended category always still appears in the line
  description. `vendorName` (if passed) is folded into the description
  rather than resolved to a QBO Vendor entity.
- **No payment-account configuration** for expenses (personal): the "paid
  from" account (QBO requires a Bank or Credit Card account on a Purchase)
  is auto-picked as the company's first Bank account, falling back to its
  first Credit Card account. If a company has neither, sync fails clearly
  (`No bank or credit card account found...`) rather than guessing.
- **Payments land in Undeposited Funds** (QBO default, club only); there is
  no deposit-account mapping.
- **Cap of 50 records pushed per sync run** (both scopes). Unmapped records
  beyond that are picked up on the next run. No automatic/scheduled sync —
  manual only, via each scope's own UI.
- Club: only invoices with a linked member (`pilotProfileId`) and at least
  one line item are pushed; others are skipped and counted in the response.
- Personal: see section 7 above for exactly what's eligible.

## 9. Disconnecting

**Disconnect** (either scope) best-effort revokes the refresh token at
Intuit's revoke endpoint and clears the stored tokens on the `Integration`
row (status → `disconnected`). Existing `QuickBooksMapping`/`SyncLog`
history is retained.

## 10. What you must do at developer.intuit.com before this is testable

1. Create a developer account and an app (Accounting scope).
2. Copy the **Client ID** and **Client Secret** (Development keys for sandbox)
   into `QUICKBOOKS_CLIENT_ID` / `QUICKBOOKS_CLIENT_SECRET`.
3. Add **both** redirect URIs (club + personal — section 2) to the app and
   save.
4. Confirm you have a **sandbox company** (auto-provisioned; visible under
   Dashboard → Sandbox). Nothing else needs seeding — its default `Services`
   item, `Uncategorized Expense` account, and chart of accounts are enough.
5. Leave `QUICKBOOKS_ENVIRONMENT=sandbox` until you've completed Intuit's
   production review; only then switch to the Production keys and
   `QUICKBOOKS_ENVIRONMENT=production`.
