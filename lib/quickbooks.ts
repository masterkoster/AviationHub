/**
 * QuickBooks Online integration (one-way push: app -> QBO).
 *
 * Plain-fetch client for Intuit OAuth2 + the QBO v3 Accounting API.
 * See docs/QUICKBOOKS.md for the Intuit developer-app setup and the
 * sandbox test procedure.
 *
 * Two independent connection scopes share this file and the `Integration`
 * table (see prisma/migrations/integration_user_scope.sql):
 * - Club scope (organizationId set): app/api/integrations/quickbooks/* -
 *   pushes club Invoices/Payments (`ensureCustomer`, `pushInvoice`, `recordPayment`).
 * - Personal scope (userId set): app/api/me/quickbooks/* - an individual
 *   pushes their own aviation expenses for tax purposes (`pushExpense`).
 * Every helper below takes an `Integration` row and does not care which
 * scope it came from - OAuth/token refresh/qboRequest are scope-agnostic.
 *
 * Design notes / simplifications:
 * - Sandbox-first: QUICKBOOKS_ENVIRONMENT defaults to 'sandbox'.
 * - QBO refresh tokens ROTATE on every refresh - every refresh persists the
 *   new access AND refresh token back to the Integration row immediately.
 * - Invoice lines all use one generic Service item ("Services", the QBO
 *   sandbox default, falling back to ItemRef value "1"). We do not create a
 *   per-aircraft item catalog in QBO; the flight detail lives in the line
 *   description ("Flight N12345 — 1.4 hrs @ $142/hr").
 * - Payments are recorded as undeposited-funds payments linked to the QBO
 *   invoice; no deposit account mapping.
 * - Expenses (`pushExpense`) similarly do not map a per-category chart of
 *   accounts or a vendor catalog - see the doc comments on
 *   `getPaymentAccountRef` / `getExpenseAccountRef` / `pushExpense`.
 */

import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

/**
 * Structural type covering exactly the Integration fields the OAuth/QBO-
 * request helpers below touch. The generated Prisma `Integration` type
 * (club scope, typed client) satisfies this structurally; so does
 * `IntegrationRow` (personal scope, raw SQL - the generated client predates
 * `userId` / nullable `organizationId`, see
 * prisma/migrations/integration_user_scope.sql), so every helper in this
 * file is scope-agnostic and accepts either without an explicit cast.
 */
export interface QBIntegration {
  id: string
  status: string
  accessToken: string | null
  refreshToken: string | null
  tokenExpiry: Date | null
  realmId: string | null
}

/** Raw-SQL shape of a personal-scope Integration row (see findPersonalIntegration). */
export interface IntegrationRow extends QBIntegration {
  organizationId: string | null
  userId: string | null
  provider: string
  config: string
  lastSyncAt: Date | null
  lastSyncStatus: string | null
  lastSyncError: string | null
  syncFrequency: number
  createdAt: Date
  updatedAt: Date
}

// ────────────────────────────────────────────────────────────────────────────
// Errors
// ────────────────────────────────────────────────────────────────────────────

/** QuickBooks env vars are missing - integration unavailable (surface as 503). */
export class QuickBooksConfigError extends Error {
  constructor(message = 'QuickBooks is not configured. Set QUICKBOOKS_CLIENT_ID and QUICKBOOKS_CLIENT_SECRET.') {
    super(message)
    this.name = 'QuickBooksConfigError'
  }
}

/** An Intuit OAuth or QBO API call failed. `message` carries the QBO fault text. */
export class QuickBooksApiError extends Error {
  status: number
  detail?: string

  constructor(message: string, status: number, detail?: string) {
    super(message)
    this.name = 'QuickBooksApiError'
    this.status = status
    this.detail = detail
  }
}

/** Extract a readable message from a QBO fault / OAuth error body. */
function faultMessage(body: string, fallback: string): { message: string; detail?: string } {
  try {
    const parsed = JSON.parse(body)
    const fault = parsed?.Fault?.Error?.[0] || parsed?.fault?.error?.[0]
    if (fault) {
      return {
        message: fault.Message || fault.message || fallback,
        detail: fault.Detail || fault.detail,
      }
    }
    if (parsed?.error) {
      return {
        message: String(parsed.error_description || parsed.error),
        detail: undefined,
      }
    }
  } catch {
    // not JSON - fall through
  }
  return { message: body ? `${fallback}: ${body.slice(0, 300)}` : fallback }
}

// ────────────────────────────────────────────────────────────────────────────
// Config
// ────────────────────────────────────────────────────────────────────────────

const AUTHORIZE_URL = 'https://appcenter.intuit.com/connect/oauth2'
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'
const REVOKE_URL = 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke'
export const CALLBACK_PATH = '/api/integrations/quickbooks/callback'
/** Callback path for the personal (per-user) QuickBooks connection - see app/api/me/quickbooks/*. */
export const PERSONAL_CALLBACK_PATH = '/api/me/quickbooks/callback'

export function isQuickBooksConfigured(): boolean {
  return Boolean(process.env.QUICKBOOKS_CLIENT_ID && process.env.QUICKBOOKS_CLIENT_SECRET)
}

function getConfig(): { clientId: string; clientSecret: string; apiBase: string } {
  const clientId = process.env.QUICKBOOKS_CLIENT_ID
  const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new QuickBooksConfigError()
  }
  const apiBase =
    process.env.QUICKBOOKS_ENVIRONMENT === 'production'
      ? 'https://quickbooks.api.intuit.com'
      : 'https://sandbox-quickbooks.api.intuit.com'
  return { clientId, clientSecret, apiBase }
}

/**
 * Redirect URI registered with the Intuit app. Defaults to the club callback
 * (`CALLBACK_PATH`); pass `PERSONAL_CALLBACK_PATH` for the personal flow.
 * Both paths must be registered as valid Redirect URIs on the same Intuit
 * app (Intuit apps accept a list, not just one) - see docs/QUICKBOOKS.md.
 */
export function getRedirectUri(path: string = CALLBACK_PATH): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000').replace(/\/+$/, '')
  return `${base}${path}`
}

function basicAuth(): string {
  const { clientId, clientSecret } = getConfig()
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
}

// ────────────────────────────────────────────────────────────────────────────
// OAuth
// ────────────────────────────────────────────────────────────────────────────

/**
 * Build the Intuit authorize URL.
 * `state` must carry `groupId:random` (club) or `u:userId:random` (personal)
 * - the respective callback parses it. `redirectUri` defaults to the club
 * callback; personal connect passes `getRedirectUri(PERSONAL_CALLBACK_PATH)`.
 */
export function getAuthorizeUrl(state: string, redirectUri: string = getRedirectUri()): string {
  const { clientId } = getConfig()
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'com.intuit.quickbooks.accounting',
    state,
  })
  return `${AUTHORIZE_URL}?${params.toString()}`
}

export interface QuickBooksTokens {
  accessToken: string
  refreshToken: string
  /** Access-token lifetime in seconds (typically 3600). */
  expiresIn: number
}

async function tokenGrant(body: URLSearchParams, action: string): Promise<QuickBooksTokens> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuth(),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  })

  const text = await response.text()
  if (!response.ok) {
    const { message, detail } = faultMessage(text, `QuickBooks ${action} failed`)
    throw new QuickBooksApiError(message, response.status, detail)
  }

  const data = JSON.parse(text)
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: Number(data.expires_in) || 3600,
  }
}

/** Exchange the OAuth authorization code for tokens. */
export async function exchangeCode(code: string, redirectUri: string = getRedirectUri()): Promise<QuickBooksTokens> {
  return tokenGrant(
    new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
    'code exchange'
  )
}

/** Refresh tokens. NOTE: QBO rotates the refresh token - persist BOTH returned tokens. */
export async function refreshTokens(refreshToken: string): Promise<QuickBooksTokens> {
  return tokenGrant(
    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    'token refresh'
  )
}

/** Revoke a refresh (or access) token at Intuit. Throws on failure - callers treat as best-effort. */
export async function revokeToken(token: string): Promise<void> {
  const response = await fetch(REVOKE_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuth(),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({ token }),
  })
  if (!response.ok) {
    const text = await response.text()
    const { message, detail } = faultMessage(text, 'QuickBooks token revoke failed')
    throw new QuickBooksApiError(message, response.status, detail)
  }
}

export function tokenExpiryDate(expiresIn: number): Date {
  return new Date(Date.now() + expiresIn * 1000)
}

// ────────────────────────────────────────────────────────────────────────────
// Personal (per-user) Integration persistence - raw SQL
//
// The generated Prisma client predates the `userId` column and nullable
// `organizationId` added by prisma/migrations/integration_user_scope.sql
// (the client was intentionally NOT regenerated - see docs/QUICKBOOKS.md),
// so `prisma.integration.*` cannot express a userId-scoped read/write at the
// type level. These helpers use parameterized `$queryRaw`/`$executeRaw`
// instead and are the ONLY place app/api/me/quickbooks/* touches the
// Integration table directly. The club path is unaffected and keeps using
// the typed client (`prisma.integration.findUnique({ where: { organizationId_provider: ... } })`
// etc.) exactly as before.
// ────────────────────────────────────────────────────────────────────────────

/** Find a user's personal Integration row for `provider`, or null if never connected. */
export async function findPersonalIntegration(userId: string, provider: string = 'quickbooks'): Promise<IntegrationRow | null> {
  const rows = await prisma.$queryRaw<IntegrationRow[]>`
    SELECT * FROM [Integration] WHERE [userId] = ${userId} AND [provider] = ${provider}
  `
  return rows[0] ?? null
}

/**
 * Find-or-update-or-create the personal Integration row for (userId, provider)
 * with fresh OAuth tokens, and return its id. Mirrors the club callback's
 * `prisma.integration.upsert(...)`, but by (userId, provider) instead of
 * (organizationId, provider).
 */
export async function upsertPersonalIntegration(
  userId: string,
  provider: string,
  data: { accessToken: string; refreshToken: string; tokenExpiry: Date; realmId: string }
): Promise<string> {
  const existing = await prisma.$queryRaw<{ id: string }[]>`
    SELECT [id] FROM [Integration] WHERE [userId] = ${userId} AND [provider] = ${provider}
  `
  if (existing[0]) {
    await prisma.$executeRaw`
      UPDATE [Integration]
      SET [status] = 'connected', [accessToken] = ${data.accessToken}, [refreshToken] = ${data.refreshToken},
          [tokenExpiry] = ${data.tokenExpiry}, [realmId] = ${data.realmId}, [lastSyncError] = NULL, [updatedAt] = GETDATE()
      WHERE [id] = ${existing[0].id}
    `
    return existing[0].id
  }

  const id = randomUUID()
  await prisma.$executeRaw`
    INSERT INTO [Integration] ([id], [userId], [provider], [status], [accessToken], [refreshToken], [tokenExpiry], [realmId], [config], [syncFrequency], [createdAt], [updatedAt])
    VALUES (${id}, ${userId}, ${provider}, 'connected', ${data.accessToken}, ${data.refreshToken}, ${data.tokenExpiry}, ${data.realmId}, '{}', 10, GETDATE(), GETDATE())
  `
  return id
}

/** Clear stored tokens on a personal Integration row (disconnect). */
export async function clearPersonalIntegrationTokens(id: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE [Integration]
    SET [status] = 'disconnected', [accessToken] = NULL, [refreshToken] = NULL, [tokenExpiry] = NULL,
        [lastSyncStatus] = NULL, [lastSyncError] = NULL, [updatedAt] = GETDATE()
    WHERE [id] = ${id}
  `
}

/** Record the outcome of a personal sync run on the Integration row. */
export async function recordPersonalSyncResult(id: string, status: string, errorMessage: string | null): Promise<void> {
  await prisma.$executeRaw`
    UPDATE [Integration]
    SET [lastSyncAt] = GETDATE(), [lastSyncStatus] = ${status}, [lastSyncError] = ${errorMessage}, [updatedAt] = GETDATE()
    WHERE [id] = ${id}
  `
}

// ────────────────────────────────────────────────────────────────────────────
// Authenticated QBO requests (auto-refresh + rotating-token persistence)
// ────────────────────────────────────────────────────────────────────────────

/** Refresh the integration's tokens and persist the rotated pair. Mutates `integration` in place. */
async function refreshAndPersist(integration: QBIntegration): Promise<void> {
  if (!integration.refreshToken) {
    throw new QuickBooksApiError('QuickBooks integration has no refresh token - reconnect required', 401)
  }
  const tokens = await refreshTokens(integration.refreshToken)
  const tokenExpiry = tokenExpiryDate(tokens.expiresIn)

  // Persist immediately: the old refresh token is now invalid (rotation).
  await prisma.integration.update({
    where: { id: integration.id },
    data: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiry,
      status: 'connected',
    },
  })
  integration.accessToken = tokens.accessToken
  integration.refreshToken = tokens.refreshToken
  integration.tokenExpiry = tokenExpiry
}

/**
 * Make an authenticated request against the connected company:
 *   {apiBase}/v3/company/{realmId}/{path}
 * Proactively refreshes tokens near expiry and retries once on 401.
 */
export async function qboRequest<T = any>(
  integration: QBIntegration,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const { apiBase } = getConfig()
  if (!integration.realmId) {
    throw new QuickBooksApiError('QuickBooks company (realmId) missing - reconnect required', 400)
  }
  if (!integration.accessToken || !integration.refreshToken) {
    throw new QuickBooksApiError('QuickBooks tokens missing - reconnect required', 401)
  }

  // Proactive refresh 5 minutes before expiry.
  const expiresAt = integration.tokenExpiry ? integration.tokenExpiry.getTime() : 0
  if (Date.now() >= expiresAt - 5 * 60 * 1000) {
    await refreshAndPersist(integration)
  }

  const url = `${apiBase}/v3/company/${integration.realmId}/${path}`
  const doFetch = () =>
    fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${integration.accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...init.headers,
      },
    })

  let response = await doFetch()

  // Access token rejected despite our expiry bookkeeping - refresh once and retry.
  if (response.status === 401) {
    await refreshAndPersist(integration)
    response = await doFetch()
  }

  const text = await response.text()
  if (!response.ok) {
    const { message, detail } = faultMessage(text, `QuickBooks API error (${path})`)
    throw new QuickBooksApiError(message, response.status, detail)
  }
  return (text ? JSON.parse(text) : {}) as T
}

/** Escape a string literal for a QBO SQL-ish query. */
function qboEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

async function qboQuery(integration: QBIntegration, query: string): Promise<any> {
  const data = await qboRequest(integration, `query?query=${encodeURIComponent(query)}`, { method: 'GET' })
  return data.QueryResponse || {}
}

/** Fetch CompanyInfo for the connected company. */
export async function getCompanyInfo(integration: QBIntegration): Promise<{ CompanyName?: string } & Record<string, any>> {
  const data = await qboRequest(integration, `companyinfo/${integration.realmId}`, { method: 'GET' })
  return data.CompanyInfo || {}
}

// ────────────────────────────────────────────────────────────────────────────
// Customers (members)
// ────────────────────────────────────────────────────────────────────────────

export interface MemberInfo {
  /** Our User.id - the QuickBooksMapping key (entityType 'member'). */
  userId: string
  name: string
  email?: string | null
}

/**
 * Find-or-create the QBO Customer for a club member and return its QBO id.
 * Idempotent via QuickBooksMapping (integrationId + 'member' + userId).
 */
export async function ensureCustomer(integration: QBIntegration, member: MemberInfo): Promise<string> {
  const existing = await prisma.quickBooksMapping.findUnique({
    where: {
      integrationId_entityType_entityId: {
        integrationId: integration.id,
        entityType: 'member',
        entityId: member.userId,
      },
    },
  })
  if (existing) return existing.qbId

  const displayName = member.name || member.email || `Member ${member.userId.slice(0, 8)}`

  // Reuse a QBO customer with the same display name before creating a duplicate
  // (DisplayName is unique in QBO - a blind create would 6240 on collision).
  const found = await qboQuery(
    integration,
    `SELECT Id, DisplayName FROM Customer WHERE DisplayName = '${qboEscape(displayName)}'`
  )
  let customer = found.Customer?.[0]

  if (!customer) {
    const created = await qboRequest(integration, 'customer', {
      method: 'POST',
      body: JSON.stringify({
        DisplayName: displayName,
        ...(member.email ? { PrimaryEmailAddr: { Address: member.email } } : {}),
      }),
    })
    customer = created.Customer
  }

  await prisma.quickBooksMapping.create({
    data: {
      integrationId: integration.id,
      entityType: 'member',
      entityId: member.userId,
      entityName: displayName,
      qbType: 'Customer',
      qbId: String(customer.Id),
      qbName: customer.DisplayName || displayName,
    },
  })

  return String(customer.Id)
}

// ────────────────────────────────────────────────────────────────────────────
// Invoices & payments
// ────────────────────────────────────────────────────────────────────────────

/** Per-integration cache of the generic service ItemRef (resolved once per process). */
const serviceItemCache = new Map<string, { value: string; name?: string }>()

/**
 * Resolve the single generic service item used for every invoice line.
 * Looks for an Item named 'Services' (present in every QBO sandbox company);
 * falls back to ItemRef value "1" (the sandbox default Services item id).
 */
async function getServiceItemRef(integration: QBIntegration): Promise<{ value: string; name?: string }> {
  const cached = serviceItemCache.get(integration.id)
  if (cached) return cached

  let ref: { value: string; name?: string } = { value: '1' }
  try {
    const found = await qboQuery(integration, "SELECT Id, Name FROM Item WHERE Name = 'Services'")
    const item = found.Item?.[0]
    if (item?.Id) ref = { value: String(item.Id), name: item.Name }
  } catch {
    // Query failure is non-fatal - fall back to the sandbox default item id.
  }
  serviceItemCache.set(integration.id, ref)
  return ref
}

export interface InvoiceLine {
  /** e.g. "Flight N12345 — 1.4 hrs @ $142/hr" */
  description: string
  amount: number
}

/**
 * Create a QBO Invoice for a member and return its QBO id.
 * All lines use the generic service item; flight detail is in the description.
 */
export async function pushInvoice(
  integration: QBIntegration,
  args: { customerId: string; lines: InvoiceLine[]; docNumber?: string }
): Promise<string> {
  const itemRef = await getServiceItemRef(integration)

  const body = {
    CustomerRef: { value: args.customerId },
    // QBO DocNumber is limited to 21 chars.
    ...(args.docNumber ? { DocNumber: args.docNumber.slice(0, 21) } : {}),
    Line: args.lines.map((line) => ({
      DetailType: 'SalesItemLineDetail',
      Amount: Math.round(line.amount * 100) / 100,
      Description: line.description,
      SalesItemLineDetail: { ItemRef: itemRef },
    })),
  }

  const created = await qboRequest(integration, 'invoice', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return String(created.Invoice.Id)
}

/**
 * Record a QBO Payment against a previously pushed QBO invoice.
 * Lands in Undeposited Funds (QBO default) - no deposit-account mapping.
 */
export async function recordPayment(
  integration: QBIntegration,
  args: { customerId: string; qboInvoiceId: string; amount: number }
): Promise<string> {
  const amount = Math.round(args.amount * 100) / 100
  const created = await qboRequest(integration, 'payment', {
    method: 'POST',
    body: JSON.stringify({
      CustomerRef: { value: args.customerId },
      TotalAmt: amount,
      Line: [
        {
          Amount: amount,
          LinkedTxn: [{ TxnId: args.qboInvoiceId, TxnType: 'Invoice' }],
        },
      ],
    }),
  })
  return String(created.Payment.Id)
}

// ────────────────────────────────────────────────────────────────────────────
// Expenses (personal aviation costs, e.g. an individual's own maintenance/fuel)
// ────────────────────────────────────────────────────────────────────────────

/** Per-integration cache of the "paid from" bank/credit-card account. */
const paymentAccountCache = new Map<string, { value: string; name?: string; paymentType: 'Cash' | 'CreditCard' }>()
/** Per-integration+category cache of the expense-line account. */
const expenseAccountCache = new Map<string, { value: string; name?: string }>()

/**
 * Resolve the account a Purchase is paid FROM. QBO requires a Bank or
 * Credit Card account here; we do not let the caller configure one (no
 * per-integration account-mapping UI), so we pick the company's first Bank
 * account, falling back to its first Credit Card account.
 */
async function getPaymentAccountRef(
  integration: QBIntegration
): Promise<{ value: string; name?: string; paymentType: 'Cash' | 'CreditCard' }> {
  const cached = paymentAccountCache.get(integration.id)
  if (cached) return cached

  let account: any
  try {
    const banks = await qboQuery(integration, "SELECT Id, Name FROM Account WHERE AccountType = 'Bank' MAXRESULTS 1")
    account = banks.Account?.[0]
  } catch {
    // fall through to credit card lookup below
  }
  let paymentType: 'Cash' | 'CreditCard' = 'Cash'
  if (!account) {
    try {
      const cards = await qboQuery(integration, "SELECT Id, Name FROM Account WHERE AccountType = 'Credit Card' MAXRESULTS 1")
      account = cards.Account?.[0]
      paymentType = 'CreditCard'
    } catch {
      // handled by the !account check below
    }
  }

  if (!account?.Id) {
    throw new QuickBooksApiError(
      'No bank or credit card account found in QuickBooks - add one to your chart of accounts before syncing expenses',
      400
    )
  }

  const ref = { value: String(account.Id), name: account.Name, paymentType }
  paymentAccountCache.set(integration.id, ref)
  return ref
}

/**
 * Resolve the expense-line account for a category (e.g. "Aircraft
 * Maintenance"). We do NOT create a per-category chart-of-accounts entry in
 * QBO (that would require guessing a valid AccountSubType and risks
 * duplicate-name errors); instead, mirroring pushInvoice's single generic
 * service item, we try an exact-name match first, then QBO's own catch-all
 * "Uncategorized Expense" account, then any Expense-type account at all.
 * The intended category always still appears in the line Description.
 */
async function getExpenseAccountRef(integration: QBIntegration, category: string): Promise<{ value: string; name?: string }> {
  const cacheKey = `${integration.id}::${category}`
  const cached = expenseAccountCache.get(cacheKey)
  if (cached) return cached

  let account: any
  try {
    const exact = await qboQuery(
      integration,
      `SELECT Id, Name FROM Account WHERE AccountType = 'Expense' AND Name = '${qboEscape(category)}'`
    )
    account = exact.Account?.[0]
  } catch {
    // fall through
  }
  if (!account) {
    try {
      const uncategorized = await qboQuery(integration, "SELECT Id, Name FROM Account WHERE Name = 'Uncategorized Expense'")
      account = uncategorized.Account?.[0]
    } catch {
      // fall through
    }
  }
  if (!account) {
    try {
      const anyExpense = await qboQuery(integration, "SELECT Id, Name FROM Account WHERE AccountType = 'Expense' MAXRESULTS 1")
      account = anyExpense.Account?.[0]
    } catch {
      // handled by the !account check below
    }
  }

  if (!account?.Id) {
    throw new QuickBooksApiError(
      `No QuickBooks expense account found to post "${category}" against - add an Expense account to your chart of accounts`,
      400
    )
  }

  const ref = { value: String(account.Id), name: account.Name }
  expenseAccountCache.set(cacheKey, ref)
  return ref
}

export interface ExpenseInput {
  /** Transaction date. */
  date: Date | string
  amount: number
  /** e.g. "Aircraft Maintenance", "Aircraft Fuel" - used as an Account lookup and always kept in the line description. */
  category: string
  memo?: string
  /** Not resolved to a QBO Vendor entity (no vendor catalog, same simplification as the single-item invoice line) - folded into the description instead. */
  vendorName?: string
}

/**
 * Create a QBO Purchase (expense) - used for personal aviation-expense sync
 * (an individual pushing their own maintenance/fuel costs for tax purposes),
 * as opposed to the club path's Invoice/Payment flow.
 */
export async function pushExpense(integration: QBIntegration, args: ExpenseInput): Promise<string> {
  const [paymentAccount, expenseAccount] = await Promise.all([
    getPaymentAccountRef(integration),
    getExpenseAccountRef(integration, args.category),
  ])

  const txnDate = typeof args.date === 'string' ? args.date.slice(0, 10) : args.date.toISOString().slice(0, 10)
  const amount = Math.round(args.amount * 100) / 100
  const description = [args.category, args.vendorName, args.memo].filter(Boolean).join(' — ').slice(0, 4000)

  const created = await qboRequest(integration, 'purchase', {
    method: 'POST',
    body: JSON.stringify({
      TxnDate: txnDate,
      PaymentType: paymentAccount.paymentType,
      AccountRef: { value: paymentAccount.value },
      Line: [
        {
          Amount: amount,
          DetailType: 'AccountBasedExpenseLineDetail',
          Description: description,
          AccountBasedExpenseLineDetail: { AccountRef: { value: expenseAccount.value } },
        },
      ],
    }),
  })
  return String(created.Purchase.Id)
}
