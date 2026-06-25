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

export const cloudApi = {
  signup(payload: { name: string; email: string; password: string }) {
    return request<{ ok: boolean; message?: string }>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify(payload),
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
}
