'use client'

import { getCloudBaseUrl } from '@/apps/desktop/src/lib/cloud-base-url'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getCloudBaseUrl()
  const url = `${base}${path}`
  const res = await fetch(url, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Cloud request failed (${res.status}): ${text || res.statusText}`)
  }
  return res.json() as Promise<T>
}

// QuickBooks routes (both /api/me/quickbooks/* and
// /api/integrations/quickbooks/*) always return a JSON body with an `error`
// string on failure - callers historically read `data.error` for the
// message shown to the user (see app/desktop/settings/accounting/page.tsx
// and app/desktop/flying-club/_components/quickbooks-card.tsx pre-migration).
// `request()` above throws a generic "Cloud request failed (status): ..."
// message that doesn't surface that text, so these use a variant that reads
// the body first and throws with `data.error` (falling back to the same
// default text each call site used) - callers catch and read `err.message`
// exactly like they used to read `data.error`.
async function requestApi<T>(path: string, init: RequestInit | undefined, fallbackError: string): Promise<T> {
  const base = getCloudBaseUrl()
  const url = `${base}${path}`
  const res = await fetch(url, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as { error?: string })?.error || fallbackError)
  }
  return data as T
}

// Some desktop call sites (booking-policy-block errors that need res.status,
// dual-branch success/failure messaging, "is this username taken" checks)
// branch on res.ok/res.status themselves rather than treating any non-2xx as
// a hard failure. This mirrors bare `fetch()` exactly — it never throws for
// HTTP error responses, only for genuine network failures — so migrated call
// sites can keep their original branching logic unchanged.
async function requestRaw<T = unknown>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T }> {
  const base = getCloudBaseUrl()
  const url = `${base}${path}`
  const res = await fetch(url, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data: data as T }
}

// Multipart uploads must NOT get the JSON Content-Type header that
// request()/requestApi() force — the browser needs to set its own
// multipart boundary. Mirrors requestApi's throw-with-data.error contract
// otherwise.
async function requestForm<T>(path: string, formData: FormData, fallbackError: string): Promise<T> {
  const base = getCloudBaseUrl()
  const url = `${base}${path}`
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as { error?: string })?.error || fallbackError)
  }
  return data as T
}

export const cloudApi = {
  signup(payload: { name: string; email: string; password: string }) {
    const username = payload.email
      .split('@')[0]
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 16) + Math.floor(Math.random() * 900 + 100)
    return request<{ ok: boolean; message?: string }>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ ...payload, username }),
    })
  },
  getTotals() {
    return request<{ totals: Record<string, number> }>('/api/v1/totals')
  },
  getCurrency() {
    return request<Array<Record<string, unknown>>>('/api/v1/currency')
  },
  getLogbook(limit = 25) {
    return request<Array<Record<string, unknown>>>(`/api/v1/logbook?limit=${limit}`)
  },
  getAircraft() {
    return request<Array<{ id: string; nNumber: string; nickname?: string | null }>>('/api/v1/aircraft')
  },
  searchAirports(q: string) {
    return request<Array<{ icao: string; name: string; city?: string; state?: string }>>(
      `/api/v1/airports/search?q=${encodeURIComponent(q)}`
    )
  },
  createLogbookEntry(payload: Record<string, unknown>) {
    return request<{ id: string }>('/api/v1/logbook', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  getLogbookEntry(id: string) {
    return request<Record<string, unknown>>(`/api/v1/logbook/${id}`)
  },
  updateLogbookEntry(id: string, payload: Record<string, unknown>) {
    return request<Record<string, unknown>>(`/api/v1/logbook/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  },
  getLogbookUpdatedSince(updatedSince: string | null, opts?: { includeVoided?: boolean; limit?: number }) {
    const params = new URLSearchParams()
    if (updatedSince) params.set('updatedSince', updatedSince)
    if (opts?.includeVoided) params.set('includeVoided', '1')
    params.set('limit', String(opts?.limit ?? 500))
    return request<Array<Record<string, unknown>>>(`/api/v1/logbook?${params.toString()}`)
  },
  getWeather(icao: string) {
    return request<{ data?: Array<Record<string, unknown>>; taf?: Array<Record<string, unknown>> }>(
      `/api/weather?icao=${encodeURIComponent(icao)}`
    )
  },
  getRouteWeather(payload: { waypoints: Array<{ icao: string; lat: number; lon: number }>; altitude: number; aircraftTAS: number; fuelBurnGph?: number }) {
    return request<Record<string, unknown>>('/api/route-weather', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  // ── Airports ─────────────────────────────────────────────────

  getAirports(params: { q?: string; limit?: number; country?: string; type?: string }) {
    const qs = new URLSearchParams()
    if (params.q !== undefined) qs.set('q', params.q)
    if (params.limit !== undefined) qs.set('limit', String(params.limit))
    if (params.country !== undefined) qs.set('country', params.country)
    if (params.type !== undefined) qs.set('type', params.type)
    const query = qs.toString()
    return request<{ airports: CloudAirportRow[] }>(`/api/airports${query ? `?${query}` : ''}`)
  },

  getAirport(icao: string) {
    return request<Record<string, unknown>>(`/api/airports/${encodeURIComponent(icao)}`)
  },

  // ── State media (photo panels for map/discover state cards) ────

  getStateMedia(code: string) {
    return request<{ state: string; images: StateMediaImage[]; fetchedAt: string; fromCache: boolean }>(
      `/api/state-media/${encodeURIComponent(code)}`
    )
  },

  // ── Discover: community routes & flying clubs ───────────────

  getDiscoverRoutes(params: { minDist?: number; maxDist?: number; category?: string; limit?: number; offset?: number }) {
    const qs = new URLSearchParams()
    if (params.minDist !== undefined) qs.set('minDist', String(params.minDist))
    if (params.maxDist !== undefined) qs.set('maxDist', String(params.maxDist))
    if (params.category) qs.set('category', params.category)
    if (params.limit !== undefined) qs.set('limit', String(params.limit))
    if (params.offset !== undefined) qs.set('offset', String(params.offset))
    const query = qs.toString()
    return request<{ routes: DiscoverSharedRoute[]; total: number; offset: number; limit: number }>(
      `/api/discover/routes${query ? `?${query}` : ''}`
    )
  },

  getDiscoverClubs() {
    return request<DiscoverClub[]>('/api/discover/clubs')
  },

  importDiscoverRoute(id: string) {
    return request<{ ok: boolean }>(`/api/discover/routes/${encodeURIComponent(id)}`, {
      method: 'POST',
      body: JSON.stringify({ action: 'import' }),
    })
  },

  createDiscoverRoute(payload: {
    name: string
    description?: string | null
    waypoints: DiscoverSharedRouteWaypoint[]
    totalDistanceNm: number
    aircraftCategory: string
  }) {
    return requestApi<{ id: string }>(
      '/api/discover/routes',
      { method: 'POST', body: JSON.stringify(payload) },
      'Failed'
    )
  },

  async getUserPreferences(): Promise<Record<string, unknown> | null> {
    return request('/api/v1/preferences')
  },

  async updateUserPreferences(prefs: Record<string, unknown>): Promise<void> {
    await request('/api/v1/preferences', { method: 'PUT', body: JSON.stringify(prefs) })
  },

  async getProfile(): Promise<Record<string, unknown> | null> {
    return request('/api/v1/profile')
  },

  async updateProfile(profile: Record<string, unknown>): Promise<void> {
    await request('/api/v1/profile', { method: 'PUT', body: JSON.stringify(profile) })
  },

  async getCertifications(): Promise<Record<string, unknown>[]> {
    return request('/api/v1/certifications') || []
  },

  async createCertification(data: Record<string, unknown>): Promise<void> {
    await request('/api/v1/certifications', { method: 'POST', body: JSON.stringify(data) })
  },

  async deleteCertification(id: string): Promise<void> {
    await request(`/api/v1/certifications/${id}`, { method: 'DELETE' })
  },

  async updateAircraft(
    id: string,
    data: {
      nNumber?: string
      nickname?: string | null
      model?: string | null
      emptyWeight?: number | null
      emptyCg?: number | null
      maxWeight?: number | null
      armPilot?: number | null
      armPassenger?: number | null
      armBaggage?: number | null
      armFuel?: number | null
      fuelCapacity?: number | null
      cruiseSpeed?: number | null
      fuelBurn?: number | null
      unusableFuel?: number | null
      cgMin?: number | null
      cgMax?: number | null
    }
  ): Promise<void> {
    await request(`/api/v1/aircraft/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  async deleteAircraft(id: string): Promise<void> {
    await request(`/api/v1/aircraft/${id}`, { method: 'DELETE' })
  },

  logFuel(payload: { airportIcao: string; gallons: number; pricePerGallon: number; fuelType: string; purchaseDate?: string; notes?: string; contributeToCommunity?: boolean }) {
    return request<{ id: string; totalCost: number; contributed: boolean }>('/api/me/fuel', { method: 'POST', body: JSON.stringify(payload) })
  },
  getFuelLogs() {
    return request<{ fuelLogs: Array<{ id: string; airportIcao: string | null; gallons: number; pricePerGallon: number; totalCost: number; fuelType: string | null; notes: string | null; createdAt: string }> }>('/api/me/fuel')
  },

  // ── Community fuel price feed ───────────────────────────────

  getFuelFeed(params: { q?: string; fuelType?: string; sort?: string; mode?: string; limit?: number; offset?: number }) {
    const qs = new URLSearchParams()
    if (params.q) qs.set('q', params.q)
    if (params.fuelType) qs.set('fuelType', params.fuelType)
    if (params.sort) qs.set('sort', params.sort)
    if (params.mode) qs.set('mode', params.mode)
    if (params.limit !== undefined) qs.set('limit', String(params.limit))
    if (params.offset !== undefined) qs.set('offset', String(params.offset))
    const query = qs.toString()
    return request<{ prices: FuelFeedRow[]; mode: string; hasMore: boolean }>(
      `/api/fuel-prices/feed${query ? `?${query}` : ''}`
    )
  },

  reportFuelPrice(payload: { icao: string; fbo?: string; fuelType: string; price: number; purchaseDate?: string }) {
    return request<{ ok: boolean; id: string }>('/api/fuel-prices/feed', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  voteFuelPrice(fuelPriceId: string, value: -1 | 0 | 1) {
    return request<{
      fuelPriceId: string
      upvotes: number
      downvotes: number
      score: number
      myVote: number
      disputed: boolean
    }>('/api/fuel-prices/feed/vote', {
      method: 'POST',
      body: JSON.stringify({ fuelPriceId, value }),
    })
  },

  getFuelTrend(params: { icao?: string; fuelType?: string }) {
    const qs = new URLSearchParams()
    if (params.icao) qs.set('icao', params.icao)
    if (params.fuelType) qs.set('fuelType', params.fuelType)
    const query = qs.toString()
    return request<{
      scope: 'airport' | 'overall'
      fuelType: string
      points: { date: string; price: number; count?: number; icao?: string }[]
      stats: {
        count: number
        contributors: number
        avgPrice: number | null
        cheapest: { icao: string; price: number } | null
        fuelType: string
      }
    }>(`/api/fuel-prices/feed/trend${query ? `?${query}` : ''}`)
  },

  // ── Aircraft cost of ownership ──────────────────────────────

  listAircraftCost() {
    return request<{ profiles: AircraftCostProfile[] }>('/api/me/aircraft-cost')
  },

  createAircraftCost(payload: { nNumber: string; engineModelKey?: string; userAircraftId?: string; nickname?: string }) {
    return request<{
      profile: AircraftCostProfile
      reservesPerHourPreview: ReservesBreakdown
      engineMatched: boolean
      matchedBy: 'engine' | 'airframe' | 'manual' | null
    }>('/api/me/aircraft-cost', { method: 'POST', body: JSON.stringify(payload) })
  },

  updateAircraftCost(id: string, payload: Partial<AircraftCostEditableFields>) {
    return request<{ profile: AircraftCostProfile }>(`/api/me/aircraft-cost/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  },

  getAircraftCostSummary(id: string, fuelPrice?: number) {
    const qs = fuelPrice !== undefined ? `?fuelPrice=${encodeURIComponent(String(fuelPrice))}` : ''
    return request<AircraftCostSummary>(`/api/me/aircraft-cost/${id}/summary${qs}`)
  },

  calcFlightCost(
    id: string,
    payload: { hours: number; actualFuelCost?: number; fuelPricePerGal?: number; customItems?: { label: string; amount: number }[] }
  ) {
    return request<FlightCostResponse>(`/api/me/aircraft-cost/${id}/flight-cost`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  listEngineReference() {
    return request<{ engines: EngineReference[] }>('/api/me/aircraft-cost/engines')
  },

  // ── Contribution reputation ─────────────────────────────────

  getMyContributions() {
    return request<{
      points: number
      tier: { key: string; label: string; weight: number }
      counts: { fuelLogs: number; priceReports: number }
      recentEvents: { type: string; points: number; refType: string | null; createdAt: string }[]
    }>('/api/me/contributions')
  },

  getFuelDeals(params: { icao?: string; type?: string; limit?: number } = {}) {
    const qs = new URLSearchParams()
    if (params.icao) qs.set('icao', params.icao)
    if (params.type) qs.set('type', params.type)
    if (params.limit) qs.set('limit', String(params.limit))
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    return request<{ deals: FuelDeal[] }>(`/api/fuel-prices/deals${suffix}`)
  },

  // ── QuickBooks: personal (user's own out-of-pocket expenses) ───

  getMyQuickbooksStatus() {
    return requestApi<QuickBooksStatusResponse>(
      '/api/me/quickbooks/status',
      undefined,
      'Failed to load QuickBooks status'
    )
  },

  connectMyQuickbooks() {
    return requestApi<QuickBooksConnectResponse>(
      '/api/me/quickbooks/connect',
      undefined,
      'Failed to start QuickBooks connection'
    )
  },

  syncMyQuickbooks() {
    return requestApi<QuickBooksSyncResponse>('/api/me/quickbooks/sync', { method: 'POST' }, 'Sync failed')
  },

  disconnectMyQuickbooks() {
    return requestApi<QuickBooksDisconnectResponse>(
      '/api/me/quickbooks/disconnect',
      { method: 'POST' },
      'Failed to disconnect'
    )
  },

  // ── QuickBooks: flying club (group's invoices/payments) ────────

  getGroupQuickbooksStatus(groupId: string) {
    return requestApi<QuickBooksStatusResponse>(
      `/api/integrations/quickbooks/status?groupId=${encodeURIComponent(groupId)}`,
      undefined,
      'Failed to load QuickBooks status'
    )
  },

  connectGroupQuickbooks(groupId: string) {
    return requestApi<QuickBooksConnectResponse>(
      `/api/integrations/quickbooks/connect?groupId=${encodeURIComponent(groupId)}`,
      undefined,
      'Failed to start QuickBooks connection'
    )
  },

  syncGroupQuickbooks(groupId: string) {
    return requestApi<QuickBooksGroupSyncResponse>(
      '/api/integrations/quickbooks/sync',
      { method: 'POST', body: JSON.stringify({ groupId }) },
      'Sync failed'
    )
  },

  disconnectGroupQuickbooks(groupId: string) {
    return requestApi<QuickBooksDisconnectResponse>(
      '/api/integrations/quickbooks/disconnect',
      { method: 'POST', body: JSON.stringify({ groupId }) },
      'Failed to disconnect'
    )
  },

  // ── Admin (desktop admin console) ────────────────────────────

  getAdminStats() {
    return requestApi<AdminStats>('/api/admin/stats', undefined, 'Failed to load stats')
  },

  getAdminUsers(params: { page: number; limit?: number; search?: string }) {
    const qs = new URLSearchParams({ page: String(params.page), limit: String(params.limit ?? 20) })
    if (params.search) qs.set('search', params.search)
    return requestApi<{ users: AdminUserRow[]; pagination: AdminPagination }>(
      `/api/admin/users?${qs.toString()}`,
      undefined,
      'Failed to load users'
    )
  },

  createAdminUser(payload: { username: string; email: string; password: string; name: string; role: string; tier: string }) {
    return requestApi<AdminCreateUserResult>(
      '/api/admin/users',
      { method: 'POST', body: JSON.stringify(payload) },
      'Failed to create user'
    )
  },

  getAdminUser(id: string) {
    return requestApi<{ user: AdminUserDetail }>(`/api/admin/users/${id}`, undefined, 'Failed to load user')
  },

  updateAdminUser(id: string, payload: { tier?: string; role?: string; verifyEmail?: boolean }) {
    return requestApi<{ success: boolean }>(
      `/api/admin/users/${id}`,
      { method: 'PUT', body: JSON.stringify(payload) },
      'Failed to update user'
    )
  },

  resetAdminUserPassword(id: string, newPassword: string) {
    return requestApi<{ success: boolean; message?: string }>(
      `/api/admin/users/${id}`,
      { method: 'POST', body: JSON.stringify({ newPassword }) },
      'Failed'
    )
  },

  getAdminErrorReports(params: { page: number; limit?: number; status?: string }) {
    const qs = new URLSearchParams({ page: String(params.page), limit: String(params.limit ?? 20) })
    if (params.status && params.status !== 'all') qs.set('status', params.status)
    return requestApi<{ reports: AdminErrorReport[]; pagination: AdminPagination; statusCounts: Record<string, number> }>(
      `/api/admin/error-reports?${qs.toString()}`,
      undefined,
      'Failed to load error reports'
    )
  },

  // Mirrors the pre-migration raw `fetch(...)` call this replaces: that call
  // never checked `res.ok`, so the caller refreshed its list regardless of
  // response status (only a genuine network failure would throw/reject).
  // Uses the bare `fetch` primitive rather than `request`/`requestApi`
  // (which both throw on non-2xx) to preserve that exact behavior.
  async updateErrorReportStatus(id: string, status: string, resolution?: string): Promise<void> {
    const base = getCloudBaseUrl()
    await fetch(`${base}/api/admin/error-reports`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(resolution !== undefined ? { id, status, resolution } : { id, status }),
    })
  },

  getAdminClubs(params: { search?: string } = {}) {
    const qs = new URLSearchParams()
    if (params.search) qs.set('search', params.search)
    const query = qs.toString()
    return requestApi<{ clubs: AdminClub[]; pagination: AdminPagination }>(
      `/api/admin/clubs${query ? `?${query}` : ''}`,
      undefined,
      'Failed to load clubs'
    )
  },

  getAdminClub(id: string) {
    return requestApi<{ club: AdminClubDetail }>(`/api/admin/clubs/${id}`, undefined, 'Failed to load club detail')
  },

  updateGroupMemberRole(groupId: string, memberId: string, role: string) {
    return requestApi<{ success: boolean }>(
      `/api/groups/${groupId}/members`,
      { method: 'PUT', body: JSON.stringify({ memberId, role }) },
      'Failed to update member role'
    )
  },

  // ── Flying club (group) management ──────────────────────────
  // Migrated from app/desktop/flying-club/page.tsx's raw `fetch('/api/...')`
  // calls. Note: this is the non-`/v1` airport search (returns
  // {ident,name,municipality,region}, not the {icao,name,city,state,...}
  // shape `searchAirports`/`/api/v1/airports/search` returns) — kept
  // separate rather than reusing `searchAirports` because the response
  // shapes differ and the page's home-airport autocomplete reads `.ident`.

  searchAirportsBasic(q: string) {
    return request<Array<{ ident: string; name: string; municipality?: string | null; region?: string | null }>>(
      `/api/airports/search?q=${encodeURIComponent(q)}`
    )
  },

  createGroup(payload: {
    name: string
    type: 'partnership' | 'club'
    description?: string
    website?: string
    contactEmail?: string
    homeAirport?: string
    sizeBracket?: string
    showOnMap?: boolean
  }) {
    return requestApi<Record<string, unknown>>('/api/groups', { method: 'POST', body: JSON.stringify(payload) }, 'Failed to create group')
  },

  // Returns the raw {ok,status,data} shape (not throwing) because the
  // caller distinguishes policy-block failures (403/422) from other errors
  // using res.status, not just the message.
  createGroupBooking(groupId: string, payload: { aircraftId: string; startTime: string; endTime: string; purpose?: string }) {
    return requestRaw<{ error?: string } & Record<string, unknown>>(`/api/groups/${groupId}/bookings`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  cancelGroupBooking(groupId: string, bookingId: string, reason?: string) {
    return requestApi<Record<string, unknown>>(
      `/api/groups/${groupId}/bookings/${bookingId}`,
      { method: 'DELETE', body: JSON.stringify({ reason }) },
      'Failed to cancel booking'
    )
  },

  // Raw (non-throwing): the caller reads `data.available`/`data.error` on
  // both the ok and non-ok paths.
  checkUsernameAvailable(username: string) {
    return requestRaw<{ available: boolean | null; error?: string }>(
      `/api/auth/signup?checkUsername=${encodeURIComponent(username)}`
    )
  },

  // Distinct from `signup()` above — this call site lets the user pick their
  // own username (checked for availability client-side first), whereas
  // `signup()` auto-generates one from the email.
  signupWithUsername(payload: { name: string; email: string; username: string; password: string }) {
    return requestApi<{ success: boolean; user?: Record<string, unknown>; message?: string }>(
      '/api/auth/signup',
      { method: 'POST', body: JSON.stringify(payload) },
      'Failed to create account'
    )
  },

  addGroupAircraft(groupId: string, payload: Record<string, unknown>) {
    return requestApi<Record<string, unknown>>(`/api/groups/${groupId}/aircraft`, { method: 'POST', body: JSON.stringify(payload) }, 'Failed to add aircraft')
  },

  inviteGroupMember(groupId: string, email: string) {
    return requestApi<{
      type: 'direct_add' | 'invite'
      member?: { user: { name?: string; email: string } }
      inviteLink?: string
    }>(`/api/groups/${groupId}/invites`, { method: 'POST', body: JSON.stringify({ email }) }, 'Failed to send invite')
  },

  deleteGroup(groupId: string) {
    return requestApi<Record<string, unknown>>(`/api/groups/${groupId}`, { method: 'DELETE' }, 'Failed to delete club')
  },

  createGroupPost(groupId: string, payload: { title: string; content: string; pinned: boolean }) {
    return requestApi<Record<string, unknown>>(`/api/groups/${groupId}/posts`, { method: 'POST', body: JSON.stringify(payload) }, 'Failed to create post')
  },

  // Raw (non-throwing): callers show different messages for a server-side
  // failure (data.error) vs. a network exception, which requires seeing
  // res.ok directly rather than a thrown Error.
  notifyGroupRaw(groupId: string, payload: Record<string, unknown>) {
    return requestRaw<{ error?: string; sent?: number; failed?: number; skipped?: number }>(
      `/api/groups/${groupId}/notify`,
      { method: 'POST', body: JSON.stringify(payload) }
    )
  },

  uploadGroupDocument(groupId: string, formData: FormData) {
    return requestForm<Record<string, unknown>>(`/api/groups/${groupId}/documents`, formData, 'Failed to upload')
  },

  // Lenient, non-throwing GET used only to read the current policy so a
  // partial-field save (billing schedule) doesn't clobber the rest of the
  // policy document. Mirrors the pre-migration
  // `fetch(url).then(r => r.json()).catch(() => ({}))` exactly — it never
  // checks res.ok, and swallows network/parse failures into `{}`.
  getGroupPolicyLenient(groupId: string): Promise<Record<string, unknown>> {
    const base = getCloudBaseUrl()
    return fetch(`${base}/api/groups/${groupId}/policy`, { credentials: 'include' })
      .then(r => r.json())
      .catch(() => ({}))
  },

  updateGroupPolicy(groupId: string, payload: Record<string, unknown>, fallbackError: string) {
    return requestApi<Record<string, unknown>>(`/api/groups/${groupId}/policy`, { method: 'PUT', body: JSON.stringify(payload) }, fallbackError)
  },

  connectGroupStripe(groupId: string) {
    return requestApi<{ url?: string }>(`/api/groups/${groupId}/stripe/onboard`, { method: 'POST' }, 'Failed to start Stripe onboarding')
  },

  payInvoice(invoiceId: string) {
    return requestApi<{ url?: string }>(`/api/invoices/${invoiceId}/pay`, { method: 'POST' }, 'Unable to start payment')
  },

  runGroupBilling(groupId: string) {
    return requestApi<{ summary?: { successful: number; totalMembers: number; failed: number } }>(
      `/api/clubs/${groupId}/billing/run`,
      { method: 'POST' },
      'Failed to run billing'
    )
  },

  // Non-throwing (bare fetch, result discarded): mirrors the pre-migration
  // `await fetch(...)` calls that never checked res.ok and always refreshed
  // the list afterward regardless of outcome.
  async deleteGroupPost(groupId: string, postId: string): Promise<void> {
    const base = getCloudBaseUrl()
    await fetch(`${base}/api/groups/${groupId}/posts/${postId}`, { method: 'DELETE', credentials: 'include' })
  },

  async deleteGroupDocument(groupId: string, docId: string): Promise<void> {
    const base = getCloudBaseUrl()
    await fetch(`${base}/api/groups/${groupId}/documents/${docId}`, { method: 'DELETE', credentials: 'include' })
  },
}

// ── Airport search types ─────────────────────────────────────────

export interface CloudAirportRow {
  icao: string
  iata?: string | null
  name: string
  city?: string | null
  state?: string | null
  country?: string | null
  type?: string | null
  latitude: number
  longitude: number
  elevation_ft?: number | null
}

// ── State media types ─────────────────────────────────────────────

export interface StateMediaImage {
  title: string
  imageUrl: string
  sourceUrl: string
  author: string
  license: string
  licenseUrl: string
}

// ── Discover types ─────────────────────────────────────────────────

export interface DiscoverSharedRouteWaypoint {
  icao: string
  name: string
  latitude: number
  longitude: number
}

export interface DiscoverSharedRoute {
  id: string
  name: string
  description: string | null
  waypoints: DiscoverSharedRouteWaypoint[]
  totalDistanceNm: number
  aircraftCategory: string
  downloadsCount: number
  createdAt: string
  sharedBy: string
}

export interface DiscoverClub {
  id: string
  name: string
  description: string | null
  website: string | null
  contactEmail: string | null
  sizeBracket: string | null
  homeAirport: string
  airportName: string
  lat: number
  lon: number
}

// ── Fuel feed types ─────────────────────────────────────────────

export interface FuelFeedRow {
  id: string
  icao: string
  fbo: string | null
  fuelType: string
  price: number
  purchaseDate: string
  createdAt: string
  isMine: boolean
  submittedBy: string | null
  submitterTier: { key: string; label: string; weight: number } | null
  upvotes: number
  downvotes: number
  score: number
  myVote: number
  disputed: boolean
  source: 'community' | 'airnav'
  sourceLabel: string | null
}

export interface FuelDeal {
  id: string
  title: string
  brand: string | null
  dealType: string
  icao: string | null
  region: string | null
  description: string | null
  discountText: string | null
  url: string | null
  startsAt: string | null
  endsAt: string | null
  isSample: boolean
}

// ── Aircraft cost types ───────────────────────────────────────

export interface ReservesBreakdown {
  engine: number
  prop: number
  maint: number
  oil: number
  total: number
}

export interface AircraftCostProfile {
  id: string
  scope: string
  userId: string | null
  userAircraftId: string | null
  clubAircraftId: string | null
  organizationId: string | null
  nNumber: string | null
  engineModelKey: string | null
  tboHours: number | null
  overhaulCost: number | null
  propOverhaulHours: number | null
  propOverhaulCost: number | null
  costYear: number | null
  fuelBurnGph: number | null
  oilReservePerHour: number | null
  maintReservePerHour: number | null
  insuranceAnnual: number | null
  hangarMonthly: number | null
  annualInspectionCost: number | null
  financingMonthly: number | null
  subscriptionsAnnual: number | null
  otherFixedAnnual: number | null
  expectedAnnualHours: number | null
  hourlyRateOverride: number | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface AircraftCostEditableFields {
  fuelBurnGph: number | null
  oilReservePerHour: number | null
  maintReservePerHour: number | null
  insuranceAnnual: number | null
  hangarMonthly: number | null
  annualInspectionCost: number | null
  financingMonthly: number | null
  subscriptionsAnnual: number | null
  otherFixedAnnual: number | null
  expectedAnnualHours: number | null
  hourlyRateOverride: number | null
  tboHours: number | null
  overhaulCost: number | null
  propOverhaulHours: number | null
  propOverhaulCost: number | null
  notes: string | null
}

export interface AircraftCostSummary {
  profileId: string
  nNumber: string | null
  engineModelKey: string | null
  reservesPerHour: ReservesBreakdown
  fixedAnnual: number
  fixedPerHour: number | null
  allInPerHour: number
  isEstimate: true
  components: {
    fuelPricePerGal: number | null
    fuelBurnGph: number | null
    expectedAnnualHours: number | null
    hourlyRateOverride: number | null
    insuranceAnnual: number | null
    hangarMonthly: number | null
    annualInspectionCost: number | null
    financingMonthly: number | null
    subscriptionsAnnual: number | null
    otherFixedAnnual: number | null
  }
}

export interface FlightCostResponse {
  profileId: string
  reserves: number
  fuel: number
  fixed: number
  custom: number
  total: number
  breakdown: {
    reservesPerHour: number
    fixedPerHour: number | null
    hours: number
    fuelBurnGph: number
    fuelPricePerGal: number | null
    actualFuelCost: number | null
    customItems: { label: string; amount: number }[]
  }
}

export interface EngineReference {
  engineModelKey: string
  engineMfr: string | null
  engineModel: string | null
  aircraftClass: string | null
  tboHours: number | null
  overhaulCost: number | null
  propOverhaulHours: number | null
  propOverhaulCost: number | null
  annualInspectionCost: number | null
  costYear: number
  isEstimate: boolean
}

// ── QuickBooks types ─────────────────────────────────────────

export interface QuickBooksStatusResponse {
  connected: boolean
  status: string
  companyName?: string | null
  companyId?: string | null
  lastSync?: string | null
  lastSyncStatus?: string | null
  lastSyncError?: string | null
  syncedCount?: number
  syncFrequency?: string | null
  mappings?: Record<string, unknown>[]
  recentSyncs?: Record<string, unknown>[]
}

export interface QuickBooksConnectResponse {
  success: boolean
  authUrl: string
  message?: string
}

export interface QuickBooksSyncResponse {
  success: boolean
  pushed: number
  skipped: number
  errors: string[]
  syncLog: Record<string, unknown>
}

export interface QuickBooksGroupSyncResponse extends QuickBooksSyncResponse {
  paymentsRecorded: number
}

export interface QuickBooksDisconnectResponse {
  success: boolean
  message?: string
}

// ── Admin (desktop admin console) types ─────────────────────────

export interface AdminPagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface AdminStats {
  totalUsers: number
  freeUsers: number
  proUsers: number
  newUsersThisWeek: number
  newUsers30Days: number
  openErrorReports: number
  totalFlightPlans: number
  totalGroups: number
  totalAircraft: number
  bookingsLast30Days: number
  totalListings: number
  listingActive: number
  listingPending: number
  listingFlagged: number
  listingSold: number
  estimatedAnnualRevenue: number
  estimatedMRR: number
}

export interface AdminUserRow {
  id: string
  email: string
  name: string | null
  username: string | null
  tier: string
  role: string
  createdAt: string
  updatedAt: string
  flightPlanCount: number
  clubCount: number
  status: string
  hours: number
  club: string
  joined: string
}

export interface AdminUserDetail {
  id: string
  email: string
  name: string | null
  username: string | null
  tier: string
  role: string
  homeState: string | null
  stripeCustomerId: string | null
  subscriptionEnd: string | null
  createdAt: string
  updatedAt: string
  flightPlanCount: number
  clubCount: number
  errorReports: Array<{ id: string; title: string; status: string; createdAt: string }>
}

export interface AdminCreateUserResult {
  user: {
    id: string
    username: string
    email: string
    name: string | null
    role: string
    tier: string
    createdAt: string
  }
}

export interface AdminErrorReport {
  id: string
  title: string
  description?: string
  status: string
  severity?: string
  url?: string
  userEmail: string | null
  userName: string | null
  createdAt: string
  updatedAt: string
}

export interface AdminClub {
  id: string
  name: string
  description: string | null
  ownerId: string
  owner: { id: string; name: string | null; email: string; username: string | null }
  createdAt: string
  members: number
  aircraft: number
  plan: string
  revenue: number
  status: string
}

export interface AdminClubDetail {
  id: string
  name: string
  description: string | null
  type: string
  publicSlug: string | null
  ownerId: string
  owner: { id: string; name: string | null; email: string; username: string | null }
  createdAt: string
  stats: { members: number; aircraft: number; bookings: number }
  members: Array<{
    id: string
    userId: string
    role: string
    joinedAt: string | null
    user: { id: string; name: string | null; email: string; username: string | null }
  }>
  aircraft: Array<{
    id: string
    make: string | null
    model: string | null
    nickname: string | null
    customName: string | null
    nNumber: string | null
    status: string | null
    hourlyRate: number | null
    year: number | null
  }>
}
