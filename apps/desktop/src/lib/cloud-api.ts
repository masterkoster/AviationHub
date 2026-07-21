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
  getRouteWeather(payload: { waypoints: Array<{ icao: string; lat: number; lon: number }>; altitude: number; aircraftTAS: number }) {
    return request<Record<string, unknown>>('/api/route-weather', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
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
