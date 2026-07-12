/**
 * Desktop weather data fetching — direct from NOAA/NWS APIs.
 * No server needed. Caches in local SQLite (Tauri) or localStorage (web fallback).
 *
 * Sources:
 *   - METAR/TAF:   https://aviationweather.gov/api/data/
 *   - Winds aloft: https://aviationweather.gov/api/data/windtemp
 *   - PIREPs:      https://aviationweather.gov/api/data/pirep
 *   - AIRMET:      https://aviationweather.gov/api/data/gairmet
 *   - Radar index: https://api.rainviewer.com/public/weather-maps.json
 *   - Radar tiles: https://tilecache.rainviewer.com/v2/radar/
 */

import type {
  MetarData,
  TafData,
  WindsAloftPoint,
  FlightCategory,
  HazardData,
} from './weather-types'

// ── Constants ──
const CACHE_PREFIX = 'wx_cache_v3_'
const CACHE_TTL: Record<string, number> = {
  metar: 6 * 60 * 60 * 1000,     // 6 hours
  taf: 6 * 60 * 60 * 1000,       // 6 hours
  windtemp: 24 * 60 * 60 * 1000, // 24 hours
  radar: 5 * 60 * 1000,          // 5 minutes
}

// ── Cache Helpers ──

interface CacheEntry<T> {
  data: T
  fetchedAt: number
  expiresAt: number
}

function getCacheKey(type: string, key: string): string {
  return `${CACHE_PREFIX}${type}_${key.toUpperCase()}`
}

async function readCache<T>(type: string, key: string): Promise<T | null> {
  if (typeof window === 'undefined') return null

  // Try Tauri SQLite store first
  try {
    const { default: Database } = await import('@tauri-apps/plugin-sql')
    const db = await Database.load('sqlite:aviationhub.db')
    const rows = await db.select<Array<{ data: string }>>(
      `SELECT data FROM weather_cache WHERE icao = ? AND data_type = ? AND expires_at > datetime('now')`,
      [key.toUpperCase(), type]
    )
    if (rows?.length > 0) {
      return JSON.parse(rows[0].data) as T
    }
  } catch {
    // Fall through to localStorage fallback
  }

  // Fallback: localStorage
  try {
    const raw = localStorage.getItem(getCacheKey(type, key))
    if (!raw) return null
    const entry: CacheEntry<T> = JSON.parse(raw)
    if (Date.now() > entry.expiresAt) {
      localStorage.removeItem(getCacheKey(type, key))
      return null
    }
    return entry.data
  } catch {
    return null
  }
}

async function deleteCacheEntry(type: string, key: string): Promise<void> {
  // Try Tauri SQLite
  try {
    const { default: Database } = await import('@tauri-apps/plugin-sql')
    const db = await Database.load('sqlite:aviationhub.db')
    await db.execute(
      `DELETE FROM weather_cache WHERE icao = ? AND data_type = ?`,
      [key.toUpperCase(), type]
    )
  } catch {
    // ignore
  }

  // localStorage fallback
  try {
    localStorage.removeItem(getCacheKey(type, key))
  } catch {
    // ignore
  }
}

async function writeCache<T>(type: string, key: string, data: T): Promise<void> {
  const ttl = CACHE_TTL[type] ?? 6 * 60 * 60 * 1000
  const now = Date.now()
  const isoNow = new Date(now).toISOString()
  const isoExpires = new Date(now + ttl).toISOString()

  // Try Tauri SQLite
  try {
    const { default: Database } = await import('@tauri-apps/plugin-sql')
    const db = await Database.load('sqlite:aviationhub.db')
    const id = `${key.toUpperCase()}_${type}_${now}`
    await db.execute(
      `INSERT OR REPLACE INTO weather_cache (id, icao, data_type, data, fetched_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, key.toUpperCase(), type, JSON.stringify(data), isoNow, isoExpires]
    )
    return
  } catch {
    // Fall through to localStorage
  }

  // Fallback: localStorage
  try {
    const entry: CacheEntry<T> = { data, fetchedAt: now, expiresAt: now + ttl }
    localStorage.setItem(getCacheKey(type, key), JSON.stringify(entry))
  } catch {
    // storage full, ignore
  }
}

// ── Direct HTTP Fetchers ──

async function fetchFromNOAA<T>(url: string): Promise<T> {
  // Proxy through our API route to avoid CORS (aviationweather.gov has no CORS headers)
  const proxyUrl = `/api/noaa?url=${encodeURIComponent(url)}`
  const res = await fetch(proxyUrl, {
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`NOAA fetch failed (${res.status})`)
  return res.json()
}

// ── METAR Parser ──

function parseFlightCategory(raw: string | undefined): FlightCategory | undefined {
  if (!raw) return undefined
  const u = raw.toUpperCase().trim()
  if (u === 'VFR' || u === 'MVFR' || u === 'IFR' || u === 'LIFR') return u
  return undefined
}

function parseNOAAMetar(raw: unknown, icao: string): MetarData {
  const r = raw as Record<string, unknown> | undefined
  if (!r) return { icao }

  // Parse obsTime which is a Unix timestamp (number)
  let observationTime: string | undefined
  if (typeof r.obsTime === 'number') {
    observationTime = new Date(r.obsTime * 1000).toISOString()
  } else if (typeof r.reportTime === 'string') {
    observationTime = r.reportTime
  }

  // Parse visib — NOAA returns a string like "10+", "3/4", "1 1/2", etc.
  let visibilitySm: number | undefined
  if (r.visib !== undefined && r.visib !== null) {
    const visStr = String(r.visib).replace(/\+/g, '').trim()
    // Handle fractional vis like "1 1/2" or "3/4"
    const fracMatch = visStr.match(/^(\d+)\s+(\d+)\/(\d+)$/)
    const simpleFrac = visStr.match(/^(\d+)\/(\d+)$/)
    if (fracMatch) {
      visibilitySm = parseInt(fracMatch[1]) + parseInt(fracMatch[2]) / parseInt(fracMatch[3])
    } else if (simpleFrac) {
      visibilitySm = parseInt(simpleFrac[1]) / parseInt(simpleFrac[2])
    } else {
      const parsed = parseFloat(visStr)
      if (!isNaN(parsed)) visibilitySm = parsed
    }
  }

  // altim is in hPa — convert to inHg (÷ 33.8639)
  let altimeterHg: number | undefined
  if (r.altim !== undefined && r.altim !== null) {
    const hPa = Number(r.altim)
    if (!isNaN(hPa) && hPa > 0) {
      altimeterHg = Math.round((hPa / 33.8639) * 100) / 100 // round to 2 decimal places
    }
  }

  return {
    icao: (r.icaoId as string) || icao,
    observationTime,
    rawText: (r.rawOb || r.raw_text) as string | undefined,
    tempC: (r.temp ?? r.tmp) as number | undefined,
    dewpointC: (r.dewp ?? r.dwp) as number | undefined,
    windDirDeg: (r.wdir ?? r.wind_dir_degrees) as number | undefined,
    windSpeedKts: (r.wspd ?? r.wind_speed_kt) as number | undefined,
    windGustKts: (r.wgst ?? r.wind_gust_kt) as number | undefined,
    visibilitySm,
    altimeterHg,
    flightCategory: parseFlightCategory((r.fltCat || r.flight_category) as string | undefined),
    ceilingFt: parseCeiling((r.rawOb || r.raw_text) as string | undefined),
  }
}

/** Parse ceiling (lowest BKN/OVC layer) from raw METAR text */
function parseCeiling(rawText?: string): number | undefined {
  if (!rawText) return undefined
  // Match BKN or OVC followed by 3-digit altitude (e.g., "BKN250", "OVC008")
  const matches = Array.from(rawText.matchAll(/\b(OVC|BKN|-OVC)\s*(\d{3})\b/g))
  if (matches.length > 0) {
    // Take the lowest ceiling (first match)
    return parseInt(matches[0][2]) * 100
  }
  return undefined
}

// ── Public API ──

export async function fetchMetar(icao: string): Promise<MetarData> {
  const key = icao.toUpperCase().trim()
  if (key.length < 3) return { icao: key }

  // Try cache — validate parsed data is not stale (old parser stored altim hPa as inHg)
  const cached = await readCache<MetarData>('metar', key)
  if (cached && cached.rawText) {
    // Sanity check: altimeter > 50 inHg is impossible — old bug stored hPa as inHg
    if (cached.altimeterHg !== undefined && cached.altimeterHg > 50) {
      await deleteCacheEntry('metar', key)
    } else {
      return cached
    }
  }

  // Fetch from NOAA
  try {
    const data = await fetchFromNOAA<unknown[]>(
      `https://aviationweather.gov/api/data/metar?ids=${key}&format=json`
    )
    const parsed = parseNOAAMetar(data?.[0], key)
    await writeCache('metar', key, parsed)
    return parsed
  } catch {
    return { icao: key }
  }
}

export async function fetchMetarBatch(icaos: string[]): Promise<Record<string, MetarData>> {
  const results: Record<string, MetarData> = {}
  const unique = [...new Set(icaos.map((i) => i.toUpperCase().trim()))].filter((i) => i.length >= 3)

  // Try cache first for all — only accept entries with actual data
  const uncached: string[] = []
  for (const icao of unique) {
    const cached = await readCache<MetarData>('metar', icao)
    if (cached && cached.rawText) {
      if (cached.altimeterHg !== undefined && cached.altimeterHg > 50) {
        await deleteCacheEntry('metar', icao)
        uncached.push(icao)
      } else {
        results[icao] = cached
      }
    } else {
      if (cached) await deleteCacheEntry('metar', icao)
      uncached.push(icao)
    }
  }

  // Fetch uncached in parallel
  if (uncached.length > 0) {
    const fetches = uncached.map(async (icao) => {
      try {
        const data = await fetchMetar(icao)
        results[icao] = data
        await writeCache('metar', icao, data)
      } catch {
        results[icao] = { icao }
      }
    })
    await Promise.all(fetches)
  }

  return results
}

export async function fetchTaf(icao: string): Promise<TafData> {
  const key = icao.toUpperCase().trim()
  if (key.length < 3) return { icao: key }

  const cached = await readCache<TafData>('taf', key)
  if (cached && cached.rawText) return cached

  try {
    const data = await fetchFromNOAA<unknown[]>(
      `https://aviationweather.gov/api/data/taf?ids=${key}&format=json`
    )
    const raw = data?.[0] as Record<string, unknown> | undefined
    const result: TafData = {
      icao: key,
      rawText: (raw?.rawTAF || raw?.raw_text) as string | undefined,
      issueTime: raw?.issueTime as string | undefined,
      validFrom: raw?.validTimeFrom as string | undefined,
      validTo: raw?.validTimeTo as string | undefined,
    }
    if (result.rawText) await writeCache('taf', key, result)
    return result
  } catch {
    return { icao: key }
  }
}

/** Batch-fetch TAFs for multiple ICAOs in a single request */
export async function fetchTafBatch(icaos: string[]): Promise<Record<string, TafData>> {
  const results: Record<string, TafData> = {}
  const unique = [...new Set(icaos.map((i) => i.toUpperCase().trim()))].filter((i) => i.length >= 3)
  if (unique.length === 0) return results

  // Check cache first
  const uncached: string[] = []
  for (const icao of unique) {
    const cached = await readCache<TafData>('taf', icao)
    if (cached && cached.rawText) {
      results[icao] = cached
    } else {
      uncached.push(icao)
    }
  }

  // Fetch uncached in single batch request
  if (uncached.length > 0) {
    try {
      const data = await fetchFromNOAA<unknown[]>(
        `https://aviationweather.gov/api/data/taf?ids=${uncached.join(',')}&format=json`
      )
      if (Array.isArray(data)) {
        for (const item of data) {
          const raw = item as Record<string, unknown>
          const icao = (raw.icaoId as string)?.toUpperCase()
          if (!icao) continue
          const result: TafData = {
            icao,
            rawText: (raw.rawTAF || raw.raw_text) as string | undefined,
            issueTime: raw.issueTime as string | undefined,
            validFrom: raw.validTimeFrom as string | undefined,
            validTo: raw.validTimeTo as string | undefined,
          }
          results[icao] = result
          if (result.rawText) await writeCache('taf', icao, result)
        }
      }
    } catch {
      // Individual failures handled gracefully
    }
  }

  // Fill missing with empty
  for (const icao of unique) {
    if (!results[icao]) results[icao] = { icao }
  }

  return results
}

export async function fetchWindsAloft(icao: string): Promise<WindsAloftPoint[]> {
  const key = icao.toUpperCase().trim()

  const cached = await readCache<WindsAloftPoint[]>('windtemp', key)
  if (cached) return cached

  try {
    const data = await fetchFromNOAA<unknown[]>(
      `https://aviationweather.gov/api/data/windtemp?ids=${key}&format=json`
    )
    const raw = data?.[0] as Record<string, unknown> | undefined
    if (!raw) return []

    // Parse winds aloft levels (3,000 / 6,000 / 9,000 / 12,000 / 18,000 / 24,000 / 30,000 / 34,000 / 39,000)
    const levels: WindsAloftPoint[] = []
    const altFields = ['three', 'six', 'nine', 'twelve', 'eighteen', 'twentyfour', 'thirty', 'thirtyfour', 'thirtynine']
    const altValues = [3000, 6000, 9000, 12000, 18000, 24000, 30000, 34000, 39000]

    for (let i = 0; i < altFields.length; i++) {
      const rawVal = (raw as Record<string, unknown>)[altFields[i]] as string | undefined
      if (!rawVal) continue

      // Format: "DDDffT" or "DDDff" where DDD=dir, ff=speed, T=temp sign
      // e.g. "24018" = 240° @ 18kt, "2418M12" = 240° @ 18kt, temp -12°C
      const dir = parseInt(rawVal.substring(0, 3))
      const speed = parseInt(rawVal.substring(3, 5))
      // Temp suffix if present: "M12" = -12, "05" = +5, missing = no data
      let temp: number | undefined
      const tempStr = rawVal.substring(5)
      if (tempStr) {
        if (tempStr.startsWith('M')) {
          temp = -parseInt(tempStr.substring(1))
        } else {
          temp = parseInt(tempStr)
        }
      }

      if (!isNaN(dir) && !isNaN(speed)) {
        levels.push({ altitudeFt: altValues[i], windDirDeg: dir, windSpeedKts: speed, tempC: temp })
      }
    }

    await writeCache('windtemp', key, levels)
    return levels
  } catch {
    return []
  }
}

export async function fetchRadarFrames(): Promise<{
  past: Array<{ time: number; path: string }>
  nowcast: Array<{ time: number; path: string }>
}> {
  const cached = await readCache<{
    past: Array<{ time: number; path: string }>
    nowcast: Array<{ time: number; path: string }>
  }>('radar', 'frames')
  if (cached) return cached

  try {
    const res = await fetch('https://api.rainviewer.com/public/weather-maps.json')
    const data = await res.json() as {
      version: string
      generated: number
      past: Array<{ time: number; path: string; type: string }>
      nowcast: Array<{ time: number; path: string; type: string }>
    }
    const result = {
      past: data.past.map((f) => ({ time: f.time, path: f.path })),
      nowcast: data.nowcast.map((f) => ({ time: f.time, path: f.path })),
    }
    await writeCache('radar', 'frames', result)
    return result
  } catch {
    return { past: [], nowcast: [] }
  }
}

export function getRadarTileUrl(time: number, z: number, x: number, y: number): string {
  return `https://tilecache.rainviewer.com/v2/radar/${time}/${z}/${x}/${y}/2/1_1.png`
}

export async function fetchHazards(
  bounds?: { minLat: number; maxLat: number; minLon: number; maxLon: number }
): Promise<HazardData[]> {
  const hazards: HazardData[] = []

  // AIRMET/SIGMET
  try {
    const data = await fetchFromNOAA<unknown[]>(
      'https://aviationweather.gov/api/data/gairmet?format=json'
    )
    if (Array.isArray(data)) {
      for (const item of data.slice(0, 30)) {
        const r = item as Record<string, unknown>
        const type = String(r.type || '').toUpperCase()
        hazards.push({
          type: type.includes('SIGMET') ? 'SIGMET' : 'AIRMET',
          title: String(r.name || r.hazard || ''),
          description: String(r.body || r.text || ''),
          severity: type.includes('SIGMET') ? 'warning' : 'advisory',
          validFrom: r.validTimeFrom as string | undefined,
          validTo: r.validTimeTo as string | undefined,
        })
      }
    }
  } catch {
    // ignore
  }

  // PIREPs (if bounds provided)
  if (bounds) {
    try {
      const { minLat, maxLat, minLon, maxLon } = bounds
      const data = await fetchFromNOAA<unknown[]>(
        `https://aviationweather.gov/api/data/pirep?format=json&bbox=${minLat},${minLon},${maxLat},${maxLon}`
      )
      if (Array.isArray(data)) {
        for (const item of data.slice(0, 20)) {
          const r = item as Record<string, unknown>
          hazards.push({
            type: 'PIREP',
            title: 'PIREP',
            description: String(r.rawOb || r.text || ''),
            severity: 'advisory',
          })
        }
      }
    } catch {
      // ignore
    }
  }

  return hazards
}

// ── Region detection from ICAO ──
// Simple map: first char of US ICAO codes generally indicates region
export function detectRegion(icao: string): string {
  const prefix = icao.toUpperCase().substring(0, 2)
  // US airports start with K
  if (prefix.startsWith('K')) {
    // Rough geographic: K + second letter
    // This is simplified; a real impl would use lat/lon
    return 'conus'
  }
  if (prefix === 'PA' || prefix === 'PH') return 'alaska'
  if (prefix === 'PH') return 'hawaii'
  if (prefix === 'C') return 'canada'
  if (prefix === 'E') return 'europe'
  return 'conus'
}
