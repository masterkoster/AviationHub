'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import {
  Plane, Plus, ShieldCheck, Clock, Loader2,
  List, PlaneTakeoff, MapPin, CalendarDays,
  Settings, Gauge, BarChart3, Route, TrendingUp,
  Wind, CloudSun, X, Check, HelpCircle,
  Eye, Thermometer, Award, Home, Stethoscope,
  CalendarCheck, AlertCircle,
} from 'lucide-react'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import {
  getLocalTotals, getLocalRecentFlights,
  type LocalFlight, type LocalTotals,
} from '@/apps/desktop/src/lib/local-logbook'
import { getLocalCurrencyRules } from '@/apps/desktop/src/lib/local-currency'
import { cloudApi } from '@/apps/desktop/src/lib/cloud-api'
import { listAgendaItems, markAgendaItemDone, type AgendaItem } from '@/apps/desktop/src/lib/local-agenda'
import { fetchMetar } from '@/desktop/lib/weather-fetch'
import { loadPilotCertStatus } from '@/desktop/lib/weather-rules'
import { WeatherPilotStatus } from '@/desktop/components/weather-pilot-status'
import type { PilotCertStatus } from '@/desktop/lib/weather-types'
import { getUserPreferences, updateUserPreference } from '@/desktop/lib/user-preferences'
import { TipCard } from '@/desktop/components/tip-card'
import { useFeatureTip } from '@/desktop/hooks/use-feature-tip'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Totals = {
  totalTime: number
  picTime: number
  sicTime: number
  nightTime: number
  instrumentTime: number
  crossCountryTime: number
  landingsDay: number
  landingsNight: number
  totalFlights: number
}

type Flight = {
  id: string
  date: string
  aircraft: string
  routeFrom: string
  routeTo: string
  totalTime: number
}

type Aircraft = {
  id: string
  nNumber: string
  nickname: string | null
  model: string | null
}

type FTLData = {
  days28: number  // total time in last 28 days
  days90: number  // total time in last 90 days
  days365: number // total time in last 365 days
}

type MonthlyFlight = {
  month: string  // "Jan", "Feb", etc
  count: number
}

type HoursBreakdown = {
  pic: number
  sic: number
  night: number
  instrument: number
  crossCountry: number
}

type QuickStatsData = {
  daysSinceLastFlight: number | null
  mostFlownAircraft: string | null
  mostFlownCount: number | null
  topRouteFrom: string | null
  topRouteTo: string | null
  topRouteCount: number | null
  totalLandings: number
  totalApproaches: number | null
}

type WeatherData = {
  icao: string
  wind: string
  visibility: string
  skyCondition: string
  temp: string
  dewpoint: string
  altimeter: string
  flightCategory: string | null
} | null

type WidgetId = 'stats' | 'ftl' | 'charts' | 'quickstats' | 'agenda' | 'recent-flights' | 'weather'

const ALL_WIDGETS: { id: WidgetId; label: string }[] = [
  { id: 'stats', label: 'Stat Cards' },
  { id: 'ftl', label: 'FTL Gauges' },
  { id: 'charts', label: 'Analytics Charts' },
  { id: 'quickstats', label: 'Quick Stats' },
  { id: 'agenda', label: 'Agenda' },
  { id: 'recent-flights', label: 'Recent Flights' },
  { id: 'weather', label: 'Weather' },
]

const DEFAULT_VISIBLE_WIDGETS: WidgetId[] = [
  'stats', 'ftl', 'charts', 'quickstats', 'agenda', 'recent-flights', 'weather',
]

// ─────────────────────────────────────────────────────────────────────────────
// Local DB helpers (singleton-ish, used only from local mode)
// ─────────────────────────────────────────────────────────────────────────────

let _localDbPromise: Promise<any> | null = null

async function getLocalDb(): Promise<any> {
  if (typeof window === 'undefined') return null
  if (!_localDbPromise) {
    try {
      const Database = await import('@tauri-apps/plugin-sql').then(m => m.default || m)
      _localDbPromise = Database.load('sqlite:aviationhub.db')
    } catch {
      _localDbPromise = null
      return null
    }
  }
  try {
    return await _localDbPromise
  } catch {
    _localDbPromise = null
    return null
  }
}

async function queryLocalFTL(userId: string): Promise<FTLData> {
  const db = await getLocalDb()
  if (!db) return { days28: 0, days90: 0, days365: 0 }

  const now = new Date()
  const d28 = new Date(now.getTime() - 28 * 86400000).toISOString().split('T')[0]
  const d90 = new Date(now.getTime() - 90 * 86400000).toISOString().split('T')[0]
  const d365 = new Date(now.getTime() - 365 * 86400000).toISOString().split('T')[0]

  const sql = `SELECT
    COALESCE(SUM(CASE WHEN date >= $2 THEN total_time ELSE 0 END), 0) as d28,
    COALESCE(SUM(CASE WHEN date >= $3 THEN total_time ELSE 0 END), 0) as d90,
    COALESCE(SUM(total_time), 0) as d365
  FROM logbook_entries WHERE user_id = $1 AND voided = 0 AND date >= $4`

  const rows: { d28: number; d90: number; d365: number }[] = await db.select(sql, [userId, d28, d90, d365])
  if (rows.length > 0) {
    return {
      days28: rows[0].d28 ?? 0,
      days90: rows[0].d90 ?? 0,
      days365: rows[0].d365 ?? 0,
    }
  }
  return { days28: 0, days90: 0, days365: 0 }
}

async function queryLocalFlightsPerMonth(userId: string): Promise<MonthlyFlight[]> {
  const db = await getLocalDb()
  if (!db) return []

  const twelveMonthsAgo = new Date()
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)
  const cutoff = twelveMonthsAgo.toISOString().split('T')[0]

  const rows: { month: string; count: number }[] = await db.select(
    `SELECT strftime('%Y-%m', date) as month, COUNT(*) as count
     FROM logbook_entries
     WHERE user_id = $1 AND voided = 0 AND date >= $2
     GROUP BY strftime('%Y-%m', date)
     ORDER BY month ASC`,
    [userId, cutoff]
  )

  // Fill in missing months with 0
  const result: MonthlyFlight[] = []
  const now = new Date()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const found = rows.find(r => r.month === key)
    const monthLabel = d.toLocaleString('en-US', { month: 'short' })
    result.push({ month: monthLabel, count: found ? found.count : 0 })
  }
  return result
}

async function queryLocalHoursBreakdown(userId: string): Promise<HoursBreakdown> {
  const db = await getLocalDb()
  if (!db) return { pic: 0, sic: 0, night: 0, instrument: 0, crossCountry: 0 }

  const rows: {
    pic: number; sic: number; night: number; instrument: number; crossCountry: number
  }[] = await db.select(
    `SELECT
      COALESCE(SUM(pic_time), 0) as pic,
      COALESCE(SUM(sic_time), 0) as sic,
      COALESCE(SUM(night_time), 0) as night,
      COALESCE(SUM(instrument_time), 0) as instrument,
      COALESCE(SUM(cross_country_time), 0) as crossCountry
    FROM logbook_entries WHERE user_id = $1 AND voided = 0`,
    [userId]
  )
  if (rows.length > 0) return rows[0]
  return { pic: 0, sic: 0, night: 0, instrument: 0, crossCountry: 0 }
}

async function queryLocalQuickStats(userId: string): Promise<QuickStatsData> {
  const db = await getLocalDb()
  if (!db) return {
    daysSinceLastFlight: null, mostFlownAircraft: null, mostFlownCount: null,
    topRouteFrom: null, topRouteTo: null, topRouteCount: null,
    totalLandings: 0, totalApproaches: null,
  }

  // Most recent flight date
  const recentRows: { date: string }[] = await db.select(
    `SELECT date FROM logbook_entries WHERE user_id = $1 AND voided = 0 ORDER BY date DESC LIMIT 1`,
    [userId]
  )
  let daysSinceLastFlight: number | null = null
  if (recentRows.length > 0) {
    const lastDate = new Date(recentRows[0].date)
    const now = new Date()
    daysSinceLastFlight = Math.floor((now.getTime() - lastDate.getTime()) / 86400000)
  }

  // Most flown aircraft
  const aircraftRows: { aircraft: string; cnt: number }[] = await db.select(
    `SELECT aircraft, COUNT(*) as cnt FROM logbook_entries WHERE user_id = $1 AND voided = 0 GROUP BY aircraft ORDER BY cnt DESC LIMIT 1`,
    [userId]
  )
  const mostFlownAircraft = aircraftRows.length > 0 ? aircraftRows[0].aircraft : null
  const mostFlownCount = aircraftRows.length > 0 ? aircraftRows[0].cnt : null

  // Top route
  const routeRows: { from: string; to: string; cnt: number }[] = await db.select(
    `SELECT route_from as "from", route_to as "to", COUNT(*) as cnt
     FROM logbook_entries WHERE user_id = $1 AND voided = 0 AND route_from != '' AND route_to != ''
     GROUP BY route_from, route_to ORDER BY cnt DESC LIMIT 1`,
    [userId]
  )
  const topRouteFrom = routeRows.length > 0 ? routeRows[0].from : null
  const topRouteTo = routeRows.length > 0 ? routeRows[0].to : null
  const topRouteCount = routeRows.length > 0 ? routeRows[0].cnt : null

  // Total landings
  const landRows: { day: number; night: number }[] = await db.select(
    `SELECT COALESCE(SUM(landings_day), 0) as day, COALESCE(SUM(landings_night), 0) as night
     FROM logbook_entries WHERE user_id = $1 AND voided = 0`,
    [userId]
  )
  const totalLandings = landRows.length > 0 ? (landRows[0].day + landRows[0].night) : 0

  // Approaches (may not exist in local schema — try gracefully)
  let totalApproaches: number | null = null
  try {
    const appRows: { approaches: number }[] = await db.select(
      `SELECT COALESCE(SUM(approaches), 0) as approaches FROM logbook_entries WHERE user_id = $1 AND voided = 0`,
      [userId]
    )
    if (appRows.length > 0) totalApproaches = appRows[0].approaches
  } catch {
    totalApproaches = null
  }

  return {
    daysSinceLastFlight,
    mostFlownAircraft,
    mostFlownCount,
    topRouteFrom,
    topRouteTo,
    topRouteCount,
    totalLandings,
    totalApproaches,
  }
}

async function queryLocalWeather(icao: string): Promise<WeatherData> {
  try {
    const res = await fetch(`/api/weather?icao=${encodeURIComponent(icao)}`)
    if (!res.ok) return null
    const json = await res.json()
    const metar = Array.isArray(json.data) && json.data.length > 0 ? json.data[0] : null
    if (!metar) return null

    const rawParts = (metar.rawOb || '').split(' ')

    return {
      icao: icao.toUpperCase(),
      wind: metar.wdir ? `${metar.wdir}@${metar.wspd}kt` : rawParts.find((p: string) => p.includes('KT')) || '—',
      visibility: metar.vsby ? `${metar.vsby}sm` : '—',
      skyCondition: metar.sky?.[0]?.cover
        ? metar.sky.map((s: { cover: string; base: number }) => `${s.cover}${s.base ? ` ${s.base}` : ''}`).join(', ')
        : '—',
      temp: metar.tmp ? `${metar.tmp}°C` : '—',
      dewpoint: metar.dwp ? `${metar.dwp}°C` : '—',
      altimeter: metar.alt ? `${metar.alt}"Hg` : '—',
      flightCategory: metar.flightCategory || metar.flight_category || null,
    }
  } catch {
    return null
  }
}

const FLIGHT_CATEGORY_STYLES: Record<string, { badge: string; dot: string }> = {
  VFR: { badge: 'rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600', dot: 'bg-emerald-500' },
  MVFR: { badge: 'rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-600', dot: 'bg-blue-500' },
  IFR: { badge: 'rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-600', dot: 'bg-red-500' },
  LIFR: { badge: 'rounded bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-medium text-purple-600', dot: 'bg-purple-500' },
}

// Maximum FTL limits for gauges
const FTL_LIMITS = {
  days28: 100,
  days90: 300,  // ~100/month
  days365: 1000,
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function DesktopDashboard() {
  const { status, mode, localUser, cloudUser } = useDesktopAuth()
  const [totals, setTotals] = useState<Totals | null>(null)
  const [currencyCount, setCurrencyCount] = useState(0)
  const [recentFlights, setRecentFlights] = useState<Flight[]>([])
  const [aircraft, setAircraft] = useState<Aircraft[]>([])
  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([])
  const [agendaSize, setAgendaSize] = useState<'compact' | 'expanded'>('expanded')
  const [loading, setLoading] = useState(true)

  // New state
  const [ftlData, setFtlData] = useState<FTLData | null>(null)
  const [monthlyFlights, setMonthlyFlights] = useState<MonthlyFlight[]>([])
  const [hoursBreakdown, setHoursBreakdown] = useState<HoursBreakdown | null>(null)
  const [quickStats, setQuickStats] = useState<QuickStatsData | null>(null)
  const [weather, setWeather] = useState<WeatherData>(null)
  const [weatherLoading, setWeatherLoading] = useState(false)
  const [pilotStatus, setPilotStatus] = useState<PilotCertStatus | null>(null)
  const [pilotStatusLoading, setPilotStatusLoading] = useState(false)

  // Widget visibility
  const [visibleWidgets, setVisibleWidgets] = useState<WidgetId[]>(DEFAULT_VISIBLE_WIDGETS)
  const [showCustomize, setShowCustomize] = useState(false)
  const customizeRef = useRef<HTMLDivElement>(null)

  const agendaUserId = mode === 'local' ? localUser?.id : (cloudUser?.id || 'cloud-default')
  const homeAirport = localUser?.homeAirport || (cloudUser as Record<string, any>)?.homeAirport || null

  // ── Load widget preferences ──────────────────────────────────────────────
  useEffect(() => {
    if (!agendaUserId) return
    ;(async () => {
      try {
        const prefs = await getUserPreferences(agendaUserId)
        if (prefs.widgetsVisible) {
          try {
            const parsed = JSON.parse(prefs.widgetsVisible) as WidgetId[]
            if (Array.isArray(parsed) && parsed.length > 0) {
              setVisibleWidgets(parsed)
            }
          } catch { /* use defaults */ }
        }
      } catch { /* use defaults */ }
    })()
  }, [agendaUserId])

  // ── Persist widget preferences ───────────────────────────────────────────
  const persistWidgets = useCallback(async (widgets: WidgetId[]) => {
    if (!agendaUserId) return
    try {
      await updateUserPreference(agendaUserId, 'widgetsVisible', JSON.stringify(widgets))
    } catch { /* noop */ }
  }, [agendaUserId])

  // ── Load data ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = window.localStorage.getItem('desktop.dashboard.agenda.size')
    if (stored === 'compact' || stored === 'expanded') {
      setAgendaSize(stored)
    }
  }, [])

  useEffect(() => {
    if (mode === 'local') {
      loadLocalData()
      return
    }
    if (status === 'loading') return
    if (status !== 'authenticated') return
    loadCloudData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, mode])

  useEffect(() => {
    if (!agendaUserId) return
    loadAgenda(agendaUserId)
  }, [agendaUserId])

  // ── Load weather when home airport is known (direct from NOAA) ──────────
  useEffect(() => {
    if (!homeAirport) return
    setWeatherLoading(true)
    ;(async () => {
      try {
        const metar = await fetchMetar(homeAirport)
        if (metar && metar.rawText) {
          setWeather({
            icao: (metar.icao || homeAirport).toUpperCase(),
            wind: metar.windDirDeg !== undefined ? `${metar.windDirDeg}° @ ${metar.windSpeedKts ?? 0} kt${metar.windGustKts ? ` G${metar.windGustKts}` : ''}` : '—',
            visibility: metar.visibilitySm !== undefined ? `${metar.visibilitySm.toFixed(1)} SM` : '—',
            skyCondition: metar.ceilingFt ? `${metar.ceilingFt.toLocaleString()} ft` : (metar.flightCategory || '—'),
            temp: metar.tempC !== undefined ? `${metar.tempC}°C` : '—',
            dewpoint: metar.dewpointC !== undefined ? `${metar.dewpointC}°C` : '—',
            altimeter: metar.altimeterHg !== undefined ? `${metar.altimeterHg.toFixed(2)}"Hg` : '—',
            flightCategory: metar.flightCategory || null,
          })
        } else {
          setWeather(null)
        }
      } catch {
        setWeather(null)
      } finally {
        setWeatherLoading(false)
      }
    })()
  }, [homeAirport])

  // ── Load pilot cert status ──────────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'local' || !localUser?.id) return
    setPilotStatusLoading(true)
    let cancelled = false
    loadPilotCertStatus(localUser.id)
      .then((status) => {
        if (!cancelled) setPilotStatus(status)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setPilotStatusLoading(false)
      })
    return () => { cancelled = true }
  }, [mode, localUser?.id])

  // ── Local data loader ────────────────────────────────────────────────────
  async function loadLocalData() {
    setLoading(true)
    try {
      if (!localUser) {
        setTotals(null)
        setRecentFlights([])
        setAircraft([])
        setCurrencyCount(0)
        setFtlData(null)
        setMonthlyFlights([])
        setHoursBreakdown(null)
        setQuickStats(null)
        return
      }

      const [localTotals, localFlights, currencyRules, ftl, flightsPerMonth, hours, stats] =
        await Promise.all([
          getLocalTotals(localUser.id),
          getLocalRecentFlights(localUser.id, 5),
          getLocalCurrencyRules(localUser.id),
          queryLocalFTL(localUser.id),
          queryLocalFlightsPerMonth(localUser.id),
          queryLocalHoursBreakdown(localUser.id),
          queryLocalQuickStats(localUser.id),
        ])

      const normalizedTotals: Totals = {
        totalFlights: localTotals.totalFlights,
        totalTime: localTotals.totalTime,
        picTime: localTotals.picTime,
        sicTime: localTotals.sicTime,
        nightTime: localTotals.nightTime,
        instrumentTime: localTotals.instrumentTime,
        crossCountryTime: localTotals.crossCountryTime,
        landingsDay: localTotals.landingsDay,
        landingsNight: localTotals.landingsNight,
      }

      setTotals(normalizedTotals.totalFlights > 0 ? normalizedTotals : null)
      setRecentFlights(localFlights.map((f: LocalFlight) => ({
        id: f.id,
        date: f.date,
        aircraft: f.aircraft,
        routeFrom: f.routeFrom,
        routeTo: f.routeTo,
        totalTime: f.totalTime,
      })))

      // Count rules that are NOT 'current' status
      const nonCurrent = currencyRules.filter(r => r.status !== 'current')
      setCurrencyCount(nonCurrent.length)

      setFtlData(ftl)
      setMonthlyFlights(flightsPerMonth)
      setHoursBreakdown(hours)
      setQuickStats(stats)
    } catch (e) {
      console.error('Local dashboard load error:', e)
    } finally {
      setLoading(false)
    }
  }

  // ── Cloud data loader ────────────────────────────────────────────────────
  async function loadCloudData() {
    setLoading(true)
    try {
      const [totalsRes, currencyRes, logbookRes, aircraftRes] = await Promise.all([
        cloudApi.getTotals(),
        cloudApi.getCurrency(),
        cloudApi.getLogbook(5),
        cloudApi.getAircraft(),
      ])

      setTotals((totalsRes?.totals as Totals) || null)
      setRecentFlights((Array.isArray(logbookRes) ? logbookRes : []) as Flight[])
      setAircraft(Array.isArray(aircraftRes) ? (aircraftRes as Aircraft[]) : [])
      setCurrencyCount(Array.isArray(currencyRes) ? currencyRes.length : 0)

      // Cloud FTL data — try fetching a larger set for computation
      try {
        const allEntries = await cloudApi.getLogbook(500) as any[]
        if (Array.isArray(allEntries) && allEntries.length > 0) {
          const now = new Date()
          const d28 = new Date(now.getTime() - 28 * 86400000).toISOString()
          const d90 = new Date(now.getTime() - 90 * 86400000).toISOString()
          const d365 = new Date(now.getTime() - 365 * 86400000).toISOString()

          const d28Sum = allEntries
            .filter(e => e.date >= d28)
            .reduce((s, e) => s + (e.totalTime || e.total_time || 0), 0)
          const d90Sum = allEntries
            .filter(e => e.date >= d90)
            .reduce((s, e) => s + (e.totalTime || e.total_time || 0), 0)
          const d365Sum = allEntries
            .filter(e => e.date >= d365)
            .reduce((s, e) => s + (e.totalTime || e.total_time || 0), 0)

          setFtlData({ days28: d28Sum, days90: d90Sum, days365: d365Sum })

          // Flights per month from cloud data
          const monthMap = new Map<string, number>()
          for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
            const key = d.toLocaleString('en-US', { month: 'short' })
            monthMap.set(key, 0)
          }
          for (const e of allEntries) {
            const d = new Date(e.date)
            const key = d.toLocaleString('en-US', { month: 'short' })
            if (monthMap.has(key)) {
              monthMap.set(key, (monthMap.get(key) || 0) + 1)
            }
          }
          setMonthlyFlights(
            Array.from(monthMap.entries()).map(([month, count]) => ({ month, count }))
          )

          // Quick stats from cloud data
          const sorted = [...allEntries].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
          const daysSince = sorted.length > 0
            ? Math.floor((now.getTime() - new Date(sorted[0].date).getTime()) / 86400000)
            : null

          // Most flown
          const acMap = new Map<string, number>()
          for (const e of allEntries) {
            const ac = e.aircraft || 'Unknown'
            acMap.set(ac, (acMap.get(ac) || 0) + 1)
          }
          let mostAc: string | null = null
          let mostAcCnt: number | null = null
          for (const [ac, cnt] of acMap) {
            if (mostAcCnt === null || cnt > mostAcCnt) {
              mostAc = ac; mostAcCnt = cnt
            }
          }

          // Top route
          const routeMap = new Map<string, { from: string; to: string; cnt: number }>()
          for (const e of allEntries) {
            const rf = e.routeFrom || e.route_from || ''
            const rt = e.routeTo || e.route_to || ''
            if (!rf || !rt) continue
            const key = `${rf}→${rt}`
            const existing = routeMap.get(key)
            if (existing) existing.cnt++
            else routeMap.set(key, { from: rf, to: rt, cnt: 1 })
          }
          let topFrom: string | null = null
          let topTo: string | null = null
          let topCnt: number | null = null
          for (const { from, to, cnt } of routeMap.values()) {
            if (topCnt === null || cnt > topCnt) {
              topFrom = from; topTo = to; topCnt = cnt
            }
          }

          const totalLandings = allEntries.reduce(
            (s, e) => s + (e.dayLandings || e.landings_day || 0) + (e.nightLandings || e.landings_night || 0),
            0
          )
          const totalApproaches = allEntries.reduce(
            (s, e) => s + (e.approaches || 0),
            0
          )

          setQuickStats({
            daysSinceLastFlight: daysSince,
            mostFlownAircraft: mostAc,
            mostFlownCount: mostAcCnt,
            topRouteFrom: topFrom,
            topRouteTo: topTo,
            topRouteCount: topCnt,
            totalLandings,
            totalApproaches: totalApproaches > 0 ? totalApproaches : null,
          })
        } else {
          setFtlData(null)
          setMonthlyFlights([])
          setHoursBreakdown(null)
          setQuickStats(null)
        }
      } catch {
        setFtlData(null)
        setMonthlyFlights([])
        setHoursBreakdown(null)
        setQuickStats(null)
      }

      // Hours breakdown from cloud totals
      if (totalsRes?.totals) {
        const t = totalsRes.totals
        setHoursBreakdown({
          pic: (t as any).picTime ?? (t as any).pic_time ?? 0,
          sic: (t as any).sicTime ?? (t as any).sic_time ?? 0,
          night: (t as any).nightTime ?? (t as any).night_time ?? 0,
          instrument: (t as any).instrumentTime ?? (t as any).instrument_time ?? 0,
          crossCountry: (t as any).crossCountryTime ?? (t as any).cross_country_time ?? 0,
        })
      }
    } catch (e) {
      console.error('Dashboard load error (cloud):', e)
    } finally {
      setLoading(false)
    }
  }

  // ── Agenda handlers ──────────────────────────────────────────────────────
  async function loadAgenda(userId: string) {
    try {
      const items = await listAgendaItems(userId)
      setAgendaItems(items)
    } catch (err) {
      console.error('Agenda load failed:', err)
      setAgendaItems([])
    }
  }

  async function toggleAgendaSize() {
    const next = agendaSize === 'expanded' ? 'compact' : 'expanded'
    setAgendaSize(next)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('desktop.dashboard.agenda.size', next)
    }
  }

  async function toggleAgendaDone(item: AgendaItem, done: boolean) {
    if (!agendaUserId) return
    try {
      await markAgendaItemDone(agendaUserId, item.id, done)
      await loadAgenda(agendaUserId)
    } catch (err) {
      console.error('Agenda update failed:', err)
    }
  }

  // ── Widget toggle ────────────────────────────────────────────────────────
  function toggleWidget(id: WidgetId) {
    setVisibleWidgets(prev => {
      const next = prev.includes(id)
        ? prev.filter(w => w !== id)
        : [...prev, id]
      persistWidgets(next)
      return next
    })
  }

  // ── Close customize popover on outside click ─────────────────────────────
  useEffect(() => {
    if (!showCustomize) return
    function handleClick(e: MouseEvent) {
      if (customizeRef.current && !customizeRef.current.contains(e.target as Node)) {
        setShowCustomize(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showCustomize])

  // ── Loading state ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // ── Compute max flight month for bar scaling ─────────────────────────────
  const maxMonthlyFlights = monthlyFlights.length > 0
    ? Math.max(...monthlyFlights.map(m => m.count), 1)
    : 1

  // ── FTL gauge helpers ────────────────────────────────────────────────────
  const ftl28Pct = ftlData ? Math.min((ftlData.days28 / FTL_LIMITS.days28) * 100, 100) : 0
  const ftl90Pct = ftlData ? Math.min((ftlData.days90 / FTL_LIMITS.days90) * 100, 100) : 0
  const ftl365Pct = ftlData ? Math.min((ftlData.days365 / FTL_LIMITS.days365) * 100, 100) : 0

  function ftlColor(pct: number): string {
    if (pct >= 90) return 'text-red-500'
    if (pct >= 80) return 'text-amber-500'
    return 'text-emerald-500'
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-6xl p-6">
      {/* ── Welcome header + Customize button ─────────────────────────────── */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            Welcome{localUser ? `, ${localUser.name.split(' ')[0]}` : ''}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === 'local'
              ? 'Local mode — your data lives on this machine. Cloud sign-in lets you sync anytime.'
              : 'Cloud sync — your logbook is pulled from AviationHub Cloud.'}
          </p>
        </div>
        <div className="relative" ref={customizeRef}>
          <button
            onClick={() => setShowCustomize(!showCustomize)}
            className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted"
            title="Customize Dashboard"
          >
            <Settings className="h-3.5 w-3.5" />
            Customize
          </button>

          {showCustomize && (
            <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-border bg-card p-3 shadow-lg">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold">Widgets</span>
                <button onClick={() => setShowCustomize(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="space-y-1">
                {ALL_WIDGETS.map(w => (
                  <label
                    key={w.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted"
                  >
                    <input
                      type="checkbox"
                      checked={visibleWidgets.includes(w.id)}
                      onChange={() => toggleWidget(w.id)}
                      className="h-3.5 w-3.5 rounded border-border accent-primary"
                    />
                    {w.label}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Quick actions ────────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap gap-2">
        <Link
          href="/desktop/logbook/new"
          className="flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Add Flight
        </Link>
        <Link
          href="/desktop/aircraft"
          className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          <Plane className="h-4 w-4" /> Manage Aircraft
        </Link>
        <Link
          href="/desktop/map"
          className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          <MapPin className="h-4 w-4" /> Open Map
        </Link>
        <Link
          href="/desktop/calendar"
          className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          <CalendarDays className="h-4 w-4" /> Open Calendar
        </Link>
      </div>

      {/* ── Pilot Profile ────────────────────────────────────────────────── */}
      {(localUser || pilotStatus) && (
        <div className="mb-6 rounded-lg border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {/* Name & Cert */}
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                <Award className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">{localUser?.name || 'Pilot'}</p>
                <p className="text-xs text-muted-foreground">
                  {pilotStatus?.licenseType
                    ? `${pilotStatus.licenseType}${pilotStatus.hasInstrumentRating ? ' + IR' : ''}`
                    : localUser?.homeAirport
                      ? 'Pilot'
                      : 'Complete your profile'}
                </p>
              </div>
            </div>

            {/* Home Airport */}
            {localUser?.homeAirport && (
              <div className="flex items-center gap-2" title="Home airport">
                <Home className="h-4 w-4 text-muted-foreground" />
                <Link href={`/desktop/map?icao=${localUser.homeAirport}`} className="text-sm font-mono font-medium hover:text-primary transition-colors">
                  {localUser.homeAirport.toUpperCase()}
                </Link>
              </div>
            )}

            {/* Medical */}
            {pilotStatus?.medicalExpiry && (
              <div className="flex items-center gap-2" title="Medical certificate expiry">
                <Stethoscope className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs">
                  Medical:{' '}
                  <span className={
                    'font-semibold ' + (pilotStatus.medicalExpiry > new Date().toISOString() ? 'text-emerald-500' : 'text-red-500')
                  }>
                    {pilotStatus.medicalClass ? `${pilotStatus.medicalClass} class` : ''}{' '}
                    {formatDate(pilotStatus.medicalExpiry)}
                  </span>
                </span>
              </div>
            )}

            {/* BFR */}
            <div className="flex items-center gap-2" title="Flight Review (BFR) status">
              {pilotStatus?.bfrCurrent !== undefined ? (
                pilotStatus.bfrCurrent ? (
                  <>
                    <CalendarCheck className="h-4 w-4 text-emerald-500" />
                    <span className="text-xs"><span className="text-emerald-500 font-semibold">BFR Current</span></span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                    <span className="text-xs"><span className="text-amber-500 font-semibold">BFR Due</span></span>
                  </>
                )
              ) : (
                <Link href="/desktop/logbook/currency" className="text-xs text-primary hover:underline">
                  Set up currency tracking →
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Stats cards ──────────────────────────────────────────────────── */}
      {visibleWidgets.includes('stats') && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={Clock}
            label="Total Hours"
            value={totals ? formatHours(totals.totalTime) : '—'}
            sublabel={totals ? `${totals.totalFlights} flights` : 'No data yet'}
          />
          <StatCard
            icon={ShieldCheck}
            label="Currency Alerts"
            value={currencyCount > 0 ? String(currencyCount) : '0'}
            sublabel={
              currencyCount > 0
                ? `${currencyCount} rule${currencyCount > 1 ? 's' : ''} need attention`
                : 'All current'
            }
          />
          <StatCard
            icon={Plane}
            label="Aircraft"
            value={String(aircraft.length)}
            sublabel={aircraft.length === 0 ? 'Add your first' : 'In your fleet'}
          />
          <StatCard
            icon={List}
            label="Recent Flights"
            value={String(recentFlights.length)}
            sublabel={recentFlights.length === 0 ? 'Add a flight' : 'Last 5'}
          />
        </div>
      )}

      {/* ── Pilot Status ──────────────────────────────────────────────────── */}
      {visibleWidgets.includes('weather') && !pilotStatusLoading && pilotStatus && (
        <div className="mb-6">
          <WeatherPilotStatus status={pilotStatus} />
        </div>
      )}

      {/* ── Weather Snippet ───────────────────────────────────────────────── */}
      {visibleWidgets.includes('weather') && (
        <div className="mb-6 rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CloudSun className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">
                {weather ? `Weather — ${weather.icao}` : 'Weather'}
              </span>
              {weather?.flightCategory && (
                <span className={FLIGHT_CATEGORY_STYLES[weather.flightCategory]?.badge || 'rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground'}>
                  {weather.flightCategory}
                </span>
              )}
            </div>
            <Link href="/desktop/weather" className="text-[10px] text-primary hover:underline">
              Full Briefing →
            </Link>
          </div>
          {weatherLoading ? (
            <div className="flex items-center gap-2 py-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Loading weather...</span>
            </div>
          ) : weather ? (
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-3 lg:grid-cols-5">
              <WeatherItem icon={Wind} label="Wind" value={weather.wind} />
              <WeatherItem icon={Eye} label="Visibility" value={weather.visibility} />
              <WeatherItem icon={CloudSun} label="Sky" value={weather.skyCondition} />
              <WeatherItem icon={Thermometer} label="Temp/Dew" value={`${weather.temp} / ${weather.dewpoint}`} />
              <WeatherItem icon={Gauge} label="Altimeter" value={weather.altimeter} />
            </div>
          ) : (
            <p className="py-2 text-xs text-muted-foreground">
              {homeAirport ? 'No weather data available.' : 'Set a home airport in your profile to see weather.'}
            </p>
          )}
        </div>
      )}

      {/* ── FTL Gauges ────────────────────────────────────────────────────── */}
      {visibleWidgets.includes('ftl') && (
        <div className="mb-6">
          <h2 className="mb-3 text-sm font-semibold">Flight Time Limitations</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <FTLGauge
              label="28-Day Rolling"
              value={ftlData ? ftlData.days28 : null}
              limit={FTL_LIMITS.days28}
              unit="hrs"
            />
            <FTLGauge
              label="90-Day Rolling"
              value={ftlData ? ftlData.days90 : null}
              limit={FTL_LIMITS.days90}
              unit="hrs"
            />
            <FTLGauge
              label="12-Month Rolling"
              value={ftlData ? ftlData.days365 : null}
              limit={FTL_LIMITS.days365}
              unit="hrs"
            />
          </div>
        </div>
      )}

      {/* ── Charts Section ────────────────────────────────────────────────── */}
      {visibleWidgets.includes('charts') && (
        <div className="mb-6">
          <h2 className="mb-3 text-sm font-semibold">Analytics</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Flights per Month — bar chart */}
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-3 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Flights per Month</span>
              </div>
              {monthlyFlights.length > 0 ? (
                <div className="flex items-end gap-1.5" style={{ height: 120 }}>
                  {monthlyFlights.map((m) => (
                    <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                      <div
                        className="w-full rounded-t-sm bg-primary/70 transition-all hover:bg-primary"
                        style={{
                          height: `${Math.max((m.count / maxMonthlyFlights) * 100, m.count > 0 ? 8 : 2)}%`,
                          minHeight: m.count > 0 ? 8 : 2,
                        }}
                        title={`${m.month}: ${m.count} flights`}
                      />
                      <span className="text-[10px] text-muted-foreground">{m.month}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-8 text-center text-xs text-muted-foreground">No flight data yet</p>
              )}
            </div>

            {/* Hours Breakdown — horizontal bars */}
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-3 flex items-center gap-2">
                <Gauge className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Hours Breakdown</span>
              </div>
              {hoursBreakdown ? (
                <div className="space-y-3">
                  <HoursBar label="PIC" value={hoursBreakdown.pic} color="bg-blue-500" total={totals?.totalTime || 1} />
                  <HoursBar label="SIC" value={hoursBreakdown.sic} color="bg-green-500" total={totals?.totalTime || 1} />
                  <HoursBar label="Night" value={hoursBreakdown.night} color="bg-indigo-500" total={totals?.totalTime || 1} />
                  <HoursBar label="Instrument" value={hoursBreakdown.instrument} color="bg-amber-500" total={totals?.totalTime || 1} />
                  <HoursBar
                    label="Cross-Country"
                    value={hoursBreakdown.crossCountry}
                    color="bg-rose-500"
                    total={totals?.totalTime || 1}
                  />
                </div>
              ) : (
                <p className="py-8 text-center text-xs text-muted-foreground">No breakdown data yet</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Quick Stats ──────────────────────────────────────────────────── */}
      {visibleWidgets.includes('quickstats') && quickStats && (
        <div className="mb-6">
          <h2 className="mb-3 text-sm font-semibold">Quick Stats</h2>
          <div className="flex flex-wrap gap-2">
            <QuickStatBadge
              icon={Clock}
              label="Days Since Last Flight"
              value={quickStats.daysSinceLastFlight !== null ? `${quickStats.daysSinceLastFlight}d` : '—'}
            />
            <QuickStatBadge
              icon={TrendingUp}
              label="Most Flown"
              value={quickStats.mostFlownAircraft || '—'}
              sub={quickStats.mostFlownCount ? `${quickStats.mostFlownCount} flights` : undefined}
            />
            <QuickStatBadge
              icon={Route}
              label="Top Route"
              value={
                quickStats.topRouteFrom && quickStats.topRouteTo
                  ? `${quickStats.topRouteFrom} → ${quickStats.topRouteTo}`
                  : '—'
              }
              sub={quickStats.topRouteCount ? `${quickStats.topRouteCount} flights` : undefined}
            />
            <QuickStatBadge
              icon={PlaneTakeoff}
              label="Total Landings"
              value={String(quickStats.totalLandings)}
            />
            <QuickStatBadge
              icon={HelpCircle}
              label="Total Approaches"
              value={quickStats.totalApproaches !== null ? String(quickStats.totalApproaches) : '—'}
            />
          </div>
        </div>
      )}

      {/* ── Agenda ───────────────────────────────────────────────────────── */}
      {visibleWidgets.includes('agenda') && (
        <AgendaWidget
          items={agendaItems}
          size={agendaSize}
          onToggleSize={toggleAgendaSize}
          onToggleDone={toggleAgendaDone}
        />
      )}

      {/* ── Dashboard Tip ───────────────────────────────────────────────── */}
      <DashboardTip />

      {/* ── Recent Flights table ─────────────────────────────────────────── */}
      {visibleWidgets.includes('recent-flights') && (
        <>
          {recentFlights.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold">Recent Flights</h2>
                <Link href="/desktop/logbook" className="text-xs text-primary hover:underline">
                  View all
                </Link>
              </div>
              <table className="w-full text-sm">
                <thead className="border-b border-border text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left">Date</th>
                    <th className="px-4 py-2 text-left">Aircraft</th>
                    <th className="px-4 py-2 text-left">Route</th>
                    <th className="px-4 py-2 text-right">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {recentFlights.map((f) => (
                    <tr key={f.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                      <td className="px-4 py-2">{formatDate(f.date)}</td>
                      <td className="px-4 py-2 font-mono text-xs">{f.aircraft}</td>
                      <td className="px-4 py-2 text-xs">
                        {f.routeFrom || '—'} → {f.routeTo || '—'}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {formatHours(f.totalTime)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

/** Rotating dashboard tip — shown once on first visit */
function DashboardTip() {
  const { visible, dismiss } = useFeatureTip('dashboard-tips')
  if (!visible) return null

  const tips = [
    'Press Ctrl+K to jump anywhere with the command palette.',
    'Click the Map toolbar icons to plan routes, check weather, and calculate weight & balance.',
    'Set a home airport in your Profile to see live weather on your Dashboard.',
    'You can export your logbook data as CSV from the Totals page.',
    'Open Discover to explore US states and find new flights to plan.',
  ]
  const tip = tips[Math.floor(Math.random() * tips.length)]

  return <TipCard tipId="dashboard-tips" message={tip} onDismiss={dismiss} />
}

function StatCard({
  icon: Icon,
  label,
  value,
  sublabel,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  sublabel: string
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{sublabel}</p>
    </div>
  )
}

function FTLGauge({
  label,
  value,
  limit,
  unit,
}: {
  label: string
  value: number | null
  limit: number
  unit: string
}) {
  const pct = value !== null ? Math.min((value / limit) * 100, 100) : 0
  const circumference = 2 * Math.PI * 15.5 // r=15.5
  const offset = circumference - (pct / 100) * circumference

  const colorClass =
    value === null
      ? 'text-muted-foreground'
      : pct >= 90
        ? 'text-red-500'
        : pct >= 80
          ? 'text-amber-500'
          : 'text-emerald-500'

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Gauge className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <div className="relative flex items-center justify-center">
        <svg className="h-20 w-20 -rotate-90" viewBox="0 0 36 36">
          <circle
            cx="18" cy="18" r="15.5"
            fill="none" stroke="currentColor" strokeWidth="3"
            className="text-muted/20"
          />
          <circle
            cx="18" cy="18" r="15.5"
            fill="none" stroke="currentColor" strokeWidth="3"
            strokeDasharray={`${circumference}`}
            strokeDashoffset={`${offset}`}
            className={`${colorClass} transition-all duration-700`}
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute text-sm font-bold tabular-nums">
          {value !== null ? value.toFixed(1) : '—'}
        </span>
      </div>
      <p className="mt-2 text-center text-[11px] text-muted-foreground">
        {value !== null ? `${value.toFixed(1)} ${unit} / ${limit} ${unit}` : 'No data'}
      </p>
    </div>
  )
}

function HoursBar({
  label,
  value,
  color,
  total,
}: {
  label: string
  value: number
  color: string
  total: number
}) {
  const pct = total > 0 ? Math.min((value / total) * 100, 100) : 0
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums font-medium">{formatHours(value)}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${color} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function QuickStatBadge({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-semibold tabular-nums">{value}</p>
        {sub && <p className="truncate text-[10px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  )
}

function WeatherItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div>
        <span className="text-muted-foreground">{label}: </span>
        <span className="font-medium">{value}</span>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
        <PlaneTakeoff className="h-6 w-6 text-primary" />
      </div>
      <h3 className="text-sm font-semibold">No flights yet</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Add your first flight entry to get started.
      </p>
      <Link
        href="/desktop/logbook/new"
        className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        <Plus className="h-4 w-4" /> Add Your First Flight
      </Link>
    </div>
  )
}

function AgendaWidget({
  items,
  size,
  onToggleSize,
  onToggleDone,
}: {
  items: AgendaItem[]
  size: 'compact' | 'expanded'
  onToggleSize: () => void
  onToggleDone: (item: AgendaItem, done: boolean) => void
}) {
  const planned = items.filter((i) => i.status !== 'done')
  const done = items.filter((i) => i.status === 'done')

  const now = new Date()
  const week = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const today: AgendaItem[] = []
  const nextWeek: AgendaItem[] = []
  const later: AgendaItem[] = []

  for (const item of planned) {
    const at = new Date(item.startsAt || item.dueAt || item.createdAt)
    if (isNaN(at.getTime())) {
      later.push(item)
      continue
    }
    if (sameDay(at, now)) today.push(item)
    else if (at <= week) nextWeek.push(item)
    else later.push(item)
  }

  if (size === 'compact') {
    return (
      <div className="mb-6 rounded-lg border border-border bg-card p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Agenda</span>
          </div>
          <button onClick={onToggleSize} className="text-xs text-primary hover:underline">Expand</button>
        </div>
        <p className="text-2xl font-bold tabular-nums">{planned.length}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Planned items</p>
      </div>
    )
  }

  return (
    <div className="mb-6 rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">Agenda</h2>
        <div className="flex items-center gap-3">
          <Link href="/desktop/calendar/new" className="text-xs text-primary hover:underline">Add item</Link>
          <button onClick={onToggleSize} className="text-xs text-primary hover:underline">Compact</button>
        </div>
      </div>
      <div className="grid gap-4 p-4 md:grid-cols-3">
        <AgendaSection title="Today" items={today} onToggleDone={onToggleDone} />
        <AgendaSection title="Next 7 Days" items={nextWeek} onToggleDone={onToggleDone} />
        <AgendaSection title="Later" items={later} onToggleDone={onToggleDone} />
      </div>
      {done.length > 0 && (
        <div className="border-t border-border px-4 py-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Completed</p>
          <div className="flex flex-wrap gap-2">
            {done.slice(0, 5).map((item) => (
              <button
                key={item.id}
                onClick={() => onToggleDone(item, false)}
                className="rounded-full border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted"
              >
                {item.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function AgendaSection({
  title,
  items,
  onToggleDone,
}: {
  title: string
  items: AgendaItem[]
  onToggleDone: (item: AgendaItem, done: boolean) => void
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-muted-foreground">{title}</p>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nothing scheduled</p>
      ) : (
        <div className="space-y-2">
          {items.slice(0, 6).map((item) => (
            <div key={item.id} className="rounded-md border border-border p-2">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/desktop/calendar/${item.id}`} className="text-xs font-medium hover:underline">
                  {item.title}
                </Link>
                <button
                  onClick={() => onToggleDone(item, true)}
                  className="text-[11px] text-primary hover:underline"
                >
                  Done
                </button>
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{formatAgendaTime(item)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatAgendaTime(item: AgendaItem): string {
  const value = item.startsAt || item.dueAt
  if (!value) return 'No date set'
  const d = new Date(value)
  if (isNaN(d.getTime())) return 'No date set'
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function formatHours(hours: number): string {
  if (!hours) return '0.0'
  return hours.toFixed(1)
}

function formatDate(iso: string): string {
  if (!iso) return ''
  try {
    const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z')
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return iso
  }
}
