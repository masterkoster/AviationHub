import type { CurrencyProgressRule, LogbookEntry, LogbookPreferences, PaginatedEntriesResponse, StartingTotals } from './types'

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`)
  }
  return res.json() as Promise<T>
}

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`)
  }
  return res.json() as Promise<T>
}

export function fetchLogbookEntries(limit = 50, cursor?: string | null, includeVoided = false) {
  const qs = new URLSearchParams({ limit: String(limit) })
  if (cursor) qs.set('cursor', cursor)
  if (includeVoided) qs.set('includeVoided', 'true')
  return getJson<PaginatedEntriesResponse>(`/api/logbook?${qs.toString()}`)
}

export function createLogbookEntry(payload: Record<string, unknown>) {
  return postJson<{ entry: LogbookEntry; message: string }>('/api/logbook', payload)
}

export function voidLogbookEntry(id: string, reason: string) {
  return postJson<{ entry: LogbookEntry; message: string }>('/api/logbook', { 
    action: 'void', 
    id, 
    reason 
  })
}

export function unvoidLogbookEntry(id: string) {
  return postJson<{ entry: LogbookEntry; message: string }>('/api/logbook', { 
    action: 'unvoid', 
    id 
  })
}

export function updateLogbookEntry(id: string, payload: Record<string, unknown>) {
  return postJson<{ entry: LogbookEntry; message: string }>('/api/logbook', { 
    id, 
    ...payload 
  })
}

export function fetchStartingTotals() {
  return getJson<{ totals: StartingTotals | null }>('/api/logbook/starting-totals')
}

export function saveStartingTotals(totals: StartingTotals) {
  return postJson<{ totals: StartingTotals }>('/api/logbook/starting-totals', totals)
}

export function fetchCurrencyProgress() {
  return getJson<{ progress: CurrencyProgressRule[] }>('/api/logbook/currency/progress')
}

export function refreshCurrency() {
  return postJson<{ ok: boolean }>('/api/logbook/currency/calc')
}

export function fetchPreferences() {
  return getJson<{ preferences: LogbookPreferences | null }>('/api/logbook/preferences')
}

export function savePreferences(prefs: LogbookPreferences) {
  return postJson<{ preferences: LogbookPreferences }>('/api/logbook/preferences', prefs)
}
