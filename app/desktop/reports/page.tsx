'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import {
  FileText, Download, Printer, Plane, Clock, BarChart3,
  ShieldCheck, Loader2, AlertTriangle, TrendingUp, Gauge,
  CalendarDays, FileSpreadsheet, ScrollText, Briefcase, Award,
} from 'lucide-react'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import {
  getLocalTotals,
  type LocalTotals,
} from '@/desktop/lib/local-logbook'
import { cloudApi } from '@/apps/desktop/src/lib/cloud-api'
import { getLocalCurrencyRules, type LocalCurrencyRule } from '@/apps/desktop/src/lib/local-currency'
import { ErrorCard } from '@/desktop/components/error-card'
import { notifyExported } from '@/desktop/lib/toast-helpers'
import AirlineComparison from '@/desktop/components/airline-comparison'

// ── Types ──────────────────────────────────────────────────────

interface MonthlyFlight {
  month: string
  count: number
}

interface AircraftHours {
  aircraft: string
  flights: number
  totalTime: number
  picTime: number
  sicTime: number
  nightTime: number
  instrumentTime: number
  crossCountryTime: number
  landings: number
}

interface CurrencySummary {
  total: number
  current: number
  expiring: number
  expired: number
  items: LocalCurrencyRule[]
}

interface LogbookEntry {
  id: string
  date: string
  aircraft: string
  routeFrom: string
  routeTo: string
  totalTime: number
  picTime: number
  sicTime: number
  nightTime: number
  instrumentTime: number
  crossCountryTime: number
  landingsDay: number
  landingsNight: number
  soloTime: number
  dualGiven: number
  dualReceived: number
  remarks: string
}

interface YearlyBreakdown {
  year: string
  flights: number
  totalTime: number
  picTime: number
  sicTime: number
  nightTime: number
  instrumentTime: number
  crossCountryTime: number
  dualGiven: number
  dualReceived: number
  soloTime: number
  landings: number
}

interface AtpProgress {
  totalTime: number
  crossCountry: number
  night: number
  instrument: number
  pic: number
}

// ── ATP minimums (FAR 61.159) ───────────────────────────────────

const ATP_REQUIREMENTS: Record<keyof AtpProgress, { label: string; required: number; far: string }> = {
  totalTime: { label: 'Total Time', required: 1500, far: '61.159(a)' },
  crossCountry: { label: 'Cross-Country', required: 500, far: '61.159(a)(1)' },
  night: { label: 'Night', required: 100, far: '61.159(a)(2)' },
  instrument: { label: 'Instrument', required: 75, far: '61.159(a)(4)' },
  pic: { label: 'PIC', required: 250, far: '61.159(a)(5)' },
}

// ── Formatting helpers ──────────────────────────────────────────

function fmtH(hours: number): string {
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function fmtD(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch { return iso }
}

function fmtNum(n: number, decimals = 1): string {
  return n.toFixed(decimals)
}

// ── Local DB helpers ────────────────────────────────────────────

let _localDbPromise: Promise<any> | null = null

async function getLocalDb(): Promise<any> {
  if (typeof window === 'undefined') return null
  if (!_localDbPromise) {
    try {
      const Database = await import('@tauri-apps/plugin-sql').then((m) => m.default || m)
      _localDbPromise = Database.load('sqlite:aviationhub.db')
    } catch { _localDbPromise = null; return null }
  }
  try { return await _localDbPromise } catch { _localDbPromise = null; return null }
}

async function queryLocalMonthlyFlights(userId: string): Promise<MonthlyFlight[]> {
  const db = await getLocalDb()
  if (!db) return []
  const twelveMonthsAgo = new Date()
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)
  const cutoff = twelveMonthsAgo.toISOString().split('T')[0]
  try {
    const rows: { month: string; count: number }[] = await db.select(
      `SELECT strftime('%Y-%m', date) as month, COUNT(*) as count
       FROM logbook_entries WHERE user_id = $1 AND voided = 0 AND date >= $2
       GROUP BY strftime('%Y-%m', date) ORDER BY month ASC`, [userId, cutoff])
    const result: MonthlyFlight[] = []
    const now = new Date()
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const found = rows.find((r) => r.month === key)
      result.push({ month: d.toLocaleString('en-US', { month: 'short' }), count: found ? found.count : 0 })
    }
    return result
  } catch { return [] }
}

async function queryLocalAircraftHours(userId: string): Promise<AircraftHours[]> {
  const db = await getLocalDb()
  if (!db) return []
  try {
    return await db.select(
      `SELECT aircraft, COUNT(*) as flights,
              COALESCE(SUM(total_time),0) as totalTime,
              COALESCE(SUM(pic_time),0) as picTime,
              COALESCE(SUM(sic_time),0) as sicTime,
              COALESCE(SUM(night_time),0) as nightTime,
              COALESCE(SUM(instrument_time),0) as instrumentTime,
              COALESCE(SUM(cross_country_time),0) as crossCountryTime,
              COALESCE(SUM(landings_day + landings_night),0) as landings
       FROM logbook_entries WHERE user_id = $1 AND voided = 0
       GROUP BY aircraft ORDER BY totalTime DESC`, [userId])
  } catch { return [] }
}

async function queryLocalFullLogbook(userId: string): Promise<LogbookEntry[]> {
  const db = await getLocalDb()
  if (!db) return []
  try {
    return await db.select(
      `SELECT id, date, aircraft,
              route_from as routeFrom, route_to as routeTo,
              total_time as totalTime, pic_time as picTime, sic_time as sicTime,
              night_time as nightTime, instrument_time as instrumentTime,
              cross_country_time as crossCountryTime,
              landings_day as landingsDay, landings_night as landingsNight,
              solo_time as soloTime, dual_given as dualGiven, dual_received as dualReceived, remarks
       FROM logbook_entries WHERE user_id = $1 AND voided = 0
       ORDER BY date DESC`, [userId])
  } catch { return [] }
}

// ── Cloud helpers ───────────────────────────────────────────────

async function qCloudMonthlyFlights(entries: any[]): Promise<MonthlyFlight[]> {
  const now = new Date()
  const monthMap = new Map<string, number>()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    monthMap.set(d.toLocaleString('en-US', { month: 'short' }), 0)
  }
  for (const e of entries) {
    const key = new Date(e.date).toLocaleString('en-US', { month: 'short' })
    if (monthMap.has(key)) monthMap.set(key, (monthMap.get(key) || 0) + 1)
  }
  return Array.from(monthMap.entries()).map(([month, count]) => ({ month, count }))
}

function cloudAircraftHours(entries: any[]): AircraftHours[] {
  const map = new Map<string, AircraftHours>()
  for (const e of entries) {
    const ac = e.aircraft || 'Unknown'
    if (!map.has(ac)) map.set(ac, { aircraft: ac, flights: 0, totalTime: 0, picTime: 0, sicTime: 0, nightTime: 0, instrumentTime: 0, crossCountryTime: 0, landings: 0 })
    const d = map.get(ac)!
    d.flights++
    d.totalTime += e.totalTime || e.total_time || 0
    d.picTime += e.picTime || e.pic_time || 0
    d.sicTime += e.sicTime || e.sic_time || 0
    d.nightTime += e.nightTime || e.night_time || 0
    d.instrumentTime += e.instrumentTime || e.instrument_time || 0
    d.crossCountryTime += e.crossCountryTime || e.cross_country_time || 0
    d.landings += (e.dayLandings || e.landings_day || 0) + (e.nightLandings || e.landings_night || 0)
  }
  return Array.from(map.values()).sort((a, b) => b.totalTime - a.totalTime)
}

// ── Pure computation helpers ────────────────────────────────────

function summarizeCurrency(rules: LocalCurrencyRule[]): CurrencySummary {
  let current = 0, expiring = 0, expired = 0
  for (const r of rules) {
    if (r.status === 'current') current++
    else if (r.status === 'expiring') expiring++
    else if (r.status === 'expired') expired++
  }
  return { total: rules.length, current, expiring, expired, items: rules }
}

function computeYearlyBreakdown(entries: LogbookEntry[]): YearlyBreakdown[] {
  const map = new Map<string, YearlyBreakdown>()
  for (const e of entries) {
    const year = e.date.substring(0, 4)
    if (!year) continue
    if (!map.has(year)) map.set(year, { year, flights: 0, totalTime: 0, picTime: 0, sicTime: 0, nightTime: 0, instrumentTime: 0, crossCountryTime: 0, dualGiven: 0, dualReceived: 0, soloTime: 0, landings: 0 })
    const d = map.get(year)!
    d.flights++
    d.totalTime += e.totalTime
    d.picTime += e.picTime
    d.sicTime += e.sicTime
    d.nightTime += e.nightTime
    d.instrumentTime += e.instrumentTime
    d.crossCountryTime += e.crossCountryTime
    d.dualGiven += e.dualGiven
    d.dualReceived += e.dualReceived
    d.soloTime += e.soloTime
    d.landings += e.landingsDay + e.landingsNight
  }
  return Array.from(map.values()).sort((a, b) => a.year.localeCompare(b.year))
}

function computeAtpProgress(entries: LogbookEntry[], totals: LocalTotals | null): AtpProgress {
  let crossCountry = 0, night = 0, instrument = 0
  for (const e of entries) {
    crossCountry += e.crossCountryTime
    night += e.nightTime
    instrument += e.instrumentTime
  }
  return {
    totalTime: totals?.totalTime || 0,
    crossCountry,
    night,
    instrument,
    pic: totals?.picTime || 0,
  }
}

function computeRecentTotals(entries: LogbookEntry[], months: number): {
  totalTime: number; pic: number; night: number; instrument: number; xc: number; flights: number
} {
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - months)
  const cutoffStr = cutoff.toISOString().split('T')[0]
  let totalTime = 0, pic = 0, night = 0, instrument = 0, xc = 0, flights = 0
  for (const e of entries) {
    if (e.date >= cutoffStr) {
      flights++
      totalTime += e.totalTime
      pic += e.picTime
      night += e.nightTime
      instrument += e.instrumentTime
      xc += e.crossCountryTime
    }
  }
  return { totalTime, pic, night, instrument, xc, flights }
}

// ── Page Component ─────────────────────────────────────────────

type TabId = 'summary' | 'aircraft' | 'forms' | 'airline'

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'summary', label: 'Summary', icon: BarChart3 },
  { id: 'aircraft', label: 'Aircraft', icon: Plane },
  { id: 'airline', label: 'Airline Prep', icon: Briefcase },
  { id: 'forms', label: 'Forms & Export', icon: ScrollText },
]

export default function DesktopReportsPage() {
  const { mode, localUser, status } = useDesktopAuth()
  const [totals, setTotals] = useState<LocalTotals | null>(null)
  const [aircraftHours, setAircraftHours] = useState<AircraftHours[]>([])
  const [monthlyFlights, setMonthlyFlights] = useState<MonthlyFlight[]>([])
  const [currencySummary, setCurrencySummary] = useState<CurrencySummary | null>(null)
  const [fullLogbook, setFullLogbook] = useState<LogbookEntry[]>([])
  const [exportLoading, setExportLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>('summary')

  // ── Initial data load ──

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      if (mode === 'local') {
        if (!localUser) return
        const uid = localUser.id
        const [t, acHours, monthly, currency] = await Promise.all([
          getLocalTotals(uid), queryLocalAircraftHours(uid), queryLocalMonthlyFlights(uid), getLocalCurrencyRules(uid),
        ])
        setTotals(t)
        setAircraftHours(acHours)
        setMonthlyFlights(monthly)
        setCurrencySummary(summarizeCurrency(currency))
        return
      }
      if (status === 'authenticated') {
        const [t, currencyRes, cloudFlights] = await Promise.all([
          cloudApi.getTotals(), cloudApi.getCurrency(), cloudApi.getLogbook(500),
        ])
        setTotals((t.totals as unknown as LocalTotals) || null)
        setCurrencySummary(summarizeCurrency((Array.isArray(currencyRes) ? currencyRes : []) as unknown as LocalCurrencyRule[]))
        if (Array.isArray(cloudFlights)) {
          setAircraftHours(cloudAircraftHours(cloudFlights))
          setMonthlyFlights(await qCloudMonthlyFlights(cloudFlights))
        }
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load report data')
    } finally { setLoading(false) }
  }, [mode, localUser, status])

  useEffect(() => { load() }, [load])

  // ── Lazy full-logbook load (for Forms & Airline Prep tabs) ──

  useEffect(() => {
    if (activeTab !== 'forms' && activeTab !== 'airline') return
    if (fullLogbook.length > 0 || !totals) return

    async function loadLogbook() {
      setExportLoading(true)
      try {
        if (mode === 'local' && localUser) {
          setFullLogbook(await queryLocalFullLogbook(localUser.id))
        } else if (status === 'authenticated') {
          const entries = await cloudApi.getLogbook(9999) as any[]
          if (Array.isArray(entries)) {
            setFullLogbook(entries.map((f: any) => ({
              id: f.id || '', date: f.date || '', aircraft: f.aircraft || '',
              routeFrom: f.routeFrom || f.route_from || '', routeTo: f.routeTo || f.route_to || '',
              totalTime: f.totalTime || f.total_time || 0,
              picTime: f.picTime || f.pic_time || 0,
              sicTime: f.sicTime || f.sic_time || 0,
              nightTime: f.nightTime || f.night_time || 0,
              instrumentTime: f.instrumentTime || f.instrument_time || 0,
              crossCountryTime: f.crossCountryTime || f.cross_country_time || 0,
              landingsDay: f.dayLandings || f.landings_day || 0,
              landingsNight: f.nightLandings || f.landings_night || 0,
              soloTime: f.soloTime || f.solo_time || 0,
              dualGiven: f.dualGiven || f.dual_given || 0,
              dualReceived: f.dualReceived || f.dual_received || 0,
              remarks: f.remarks || '',
            })))
          }
        }
      } catch { /* silent */ } finally { setExportLoading(false) }
    }
    loadLogbook()
  }, [activeTab, fullLogbook.length, mode, localUser, status, totals])

  // ── Derived data (computed from fullLogbook when available) ──

  const yearlyBreakdown = useMemo(() =>
    fullLogbook.length > 0 ? computeYearlyBreakdown(fullLogbook) : [],
  [fullLogbook])

  const atpProgress = useMemo(() =>
    fullLogbook.length > 0 && totals ? computeAtpProgress(fullLogbook, totals) : null,
  [fullLogbook, totals])

  const last12 = useMemo(() =>
    fullLogbook.length > 0 ? computeRecentTotals(fullLogbook, 12) : null,
  [fullLogbook])

  const last24 = useMemo(() =>
    fullLogbook.length > 0 ? computeRecentTotals(fullLogbook, 24) : null,
  [fullLogbook])

  const last36 = useMemo(() =>
    fullLogbook.length > 0 ? computeRecentTotals(fullLogbook, 36) : null,
  [fullLogbook])

  // User flight data for airline comparison
  const userFlightData = useMemo(() => {
    if (!totals) return null
    return {
      totalTime: totals.totalTime,
      picTime: totals.picTime,
      sicTime: totals.sicTime,
      nightTime: totals.nightTime,
      instrumentTime: totals.instrumentTime,
      crossCountryTime: totals.crossCountryTime,
      last12Total: last12?.totalTime || 0,
      last12Pic: last12?.pic || 0,
      last24Total: last24?.totalTime || 0,
      last36Total: last36?.totalTime || 0,
      flights: totals.totalFlights,
    }
  }, [totals, last12, last24, last36])

  // ── Export functions ──

  function exportFullLogbook() {
    if (fullLogbook.length === 0) return
    const headers = ['Date','Aircraft','From','To','Total','PIC','SIC','Solo','Dual Given','Dual Received','Night','Instrument','Sim Inst','Cross Country','Day Landings','Night Landings','Remarks']
    const rows = [headers.join(',')]
    for (const e of fullLogbook) {
      rows.push([
        e.date, `"${e.aircraft}"`, e.routeFrom, e.routeTo,
        fmtNum(e.totalTime), fmtNum(e.picTime), fmtNum(e.sicTime),
        fmtNum(e.soloTime), fmtNum(e.dualGiven), fmtNum(e.dualReceived),
        fmtNum(e.nightTime), fmtNum(e.instrumentTime), '0',
        fmtNum(e.crossCountryTime), e.landingsDay, e.landingsNight,
        `"${(e.remarks || '').replace(/"/g, '""')}"`,
      ].join(','))
    }
    const csv = rows.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `aviationhub-logbook-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    notifyExported('Full Logbook')
  }

  function exportSummaryCSV() {
    if (!totals) return
    const rows = ['Report,Value',
      `Total Flights,${totals.totalFlights}`,
      `Total Time,${fmtNum(totals.totalTime)}`,
      `PIC,${fmtNum(totals.picTime)}`,
      `SIC,${fmtNum(totals.sicTime)}`,
      `Night,${fmtNum(totals.nightTime)}`,
      `Instrument,${fmtNum(totals.instrumentTime)}`,
      `Cross Country,${fmtNum(totals.crossCountryTime)}`,
      `Day Landings,${totals.landingsDay}`,
      `Night Landings,${totals.landingsNight}`,
    ]
    if (aircraftHours.length > 0) {
      rows.push('')
      rows.push('Aircraft,Flights,Total Time,PIC,SIC,Night,Instrument,Cross Country,Landings')
      for (const ac of aircraftHours) {
        rows.push(`${ac.aircraft},${ac.flights},${fmtNum(ac.totalTime)},${fmtNum(ac.picTime)},${fmtNum(ac.sicTime)},${fmtNum(ac.nightTime)},${fmtNum(ac.instrumentTime)},${fmtNum(ac.crossCountryTime)},${ac.landings}`)
      }
    }
    const csv = rows.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `aviationhub-summary-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    notifyExported('Summary')
  }

  function exportAirlineAppsCSV() {
    if (!totals || yearlyBreakdown.length === 0) return

    const rows: string[] = []
    // CL-65-style header
    rows.push('Category,' + yearlyBreakdown.map(y => y.year).join(',') + ',Total,Last 12mo,Last 24mo,Last 36mo')
    const cats = [
      { label: 'Total Time', fn: (y: YearlyBreakdown) => y.totalTime, total: () => totals!.totalTime, recent: (r: typeof last12) => r?.totalTime || 0 },
      { label: 'PIC', fn: (y: YearlyBreakdown) => y.picTime, total: () => totals!.picTime, recent: (r: typeof last12) => r?.pic || 0 },
      { label: 'SIC', fn: (y: YearlyBreakdown) => y.sicTime, total: () => totals!.sicTime, recent: (r: typeof last12) => 0 },
      { label: 'Night', fn: (y: YearlyBreakdown) => y.nightTime, total: () => totals!.nightTime, recent: (r: typeof last12) => r?.night || 0 },
      { label: 'Instrument', fn: (y: YearlyBreakdown) => y.instrumentTime, total: () => totals!.instrumentTime, recent: (r: typeof last12) => r?.instrument || 0 },
      { label: 'Cross-Country', fn: (y: YearlyBreakdown) => y.crossCountryTime, total: () => totals!.crossCountryTime, recent: (r: typeof last12) => r?.xc || 0 },
      { label: 'Dual Given', fn: (y: YearlyBreakdown) => y.dualGiven, total: () => yearlyBreakdown.reduce((s, y) => s + y.dualGiven, 0), recent: () => 0 },
      { label: 'Dual Received', fn: (y: YearlyBreakdown) => y.dualReceived, total: () => yearlyBreakdown.reduce((s, y) => s + y.dualReceived, 0), recent: () => 0 },
      { label: 'Solo', fn: (y: YearlyBreakdown) => y.soloTime, total: () => yearlyBreakdown.reduce((s, y) => s + y.soloTime, 0), recent: () => 0 },
      { label: 'Flights', fn: (y: YearlyBreakdown) => y.flights, total: () => totals!.totalFlights, recent: (r: typeof last12) => r?.flights || 0 },
    ]
    for (const cat of cats) {
      rows.push([
        cat.label,
        ...yearlyBreakdown.map(y => fmtNum(cat.fn(y))),
        fmtNum(cat.total()),
        fmtNum(cat.recent(last12)),
        fmtNum(cat.recent(last24)),
        fmtNum(cat.recent(last36)),
      ].join(','))
    }
    // Aircraft section
    if (aircraftHours.length > 0) {
      rows.push('')
      rows.push('Aircraft,Total Time,PIC,Flights')
      for (const ac of aircraftHours) {
        rows.push(`${ac.aircraft},${fmtNum(ac.totalTime)},${fmtNum(ac.picTime)},${ac.flights}`)
      }
    }
    const csv = rows.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `aviationhub-airline-apps-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    notifyExported('Airline Apps CSV')
  }

  function handlePrint() { window.print() }

  // ── Loading / Error ──

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (loadError) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <ErrorCard message={loadError} onRetry={load} />
      </div>
    )
  }

  const maxMonthly = monthlyFlights.length > 0 ? Math.max(...monthlyFlights.map((m) => m.count), 1) : 1
  const totalLandings = totals ? totals.landingsDay + totals.landingsNight : 0
  const hasData = totals && totals.totalFlights > 0

  // ── Render ──

  return (
    <div className="mx-auto max-w-5xl p-6 print:max-w-full print:p-4">
      {/* ── Header ── */}
      <div className="mb-4 flex items-start justify-between print:hidden">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold">Reports</h1>
          </div>
          <p className="text-sm text-muted-foreground">Flight data, aircraft utilization, airline prep, and exportable forms</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handlePrint} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors">
            <Printer className="h-4 w-4" /> Print
          </button>
          <button onClick={exportSummaryCSV} disabled={!hasData} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50 transition-colors">
            <FileSpreadsheet className="h-4 w-4" /> Export Summary
          </button>
        </div>
      </div>

      {/* ── Tab Navigation ── */}
      <div className="mb-6 flex gap-1 rounded-lg border border-border bg-card p-1 print:hidden">
        {TABS.map((tab) => {
          const TabIcon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={cn('flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}>
              <TabIcon className="h-4 w-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Printed date */}
      <p className="mb-4 hidden text-xs text-muted-foreground print:block">
        Generated {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
      </p>

      {/* ═══════════════════════════════════════════════════════
         TAB: Summary
         ═══════════════════════════════════════════════════════ */}
      {activeTab === 'summary' && (
        <>
          {hasData ? (
            <>
              <section className="mb-6">
                <h2 className="mb-3 text-sm font-semibold">Executive Summary</h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <StatCard icon={BarChart3} label="Total Flights" value={String(totals!.totalFlights)} sub="All time" />
                  <StatCard icon={Clock} label="Total Time" value={fmtH(totals!.totalTime)} sub={`${totals!.totalFlights} flights`} />
                  <StatCard icon={TrendingUp} label="PIC" value={fmtH(totals!.picTime)} sub={`${((totals!.picTime / totals!.totalTime) * 100).toFixed(0)}% of total`} />
                  <StatCard icon={Gauge} label="SIC" value={fmtH(totals!.sicTime)} sub={`${((totals!.sicTime / totals!.totalTime) * 100).toFixed(0)}% of total`} />
                  <StatCard icon={Plane} label="Aircraft" value={String(aircraftHours.length)} sub="In fleet" />
                </div>
              </section>
              <section className="mb-6">
                <h2 className="mb-3 text-sm font-semibold">Hours Breakdown</h2>
                <div className="rounded-lg border border-border bg-card p-4">
                  <div className="space-y-3">
                    <HoursBar label="PIC" value={totals!.picTime} total={totals!.totalTime} color="bg-blue-500" />
                    <HoursBar label="SIC" value={totals!.sicTime} total={totals!.totalTime} color="bg-green-500" />
                    <HoursBar label="Night" value={totals!.nightTime} total={totals!.totalTime} color="bg-indigo-500" />
                    <HoursBar label="Instrument" value={totals!.instrumentTime} total={totals!.totalTime} color="bg-amber-500" />
                    <HoursBar label="Cross-Country" value={totals!.crossCountryTime} total={totals!.totalTime} color="bg-rose-500" />
                    <HoursBar label="Day Landings" value={totals!.landingsDay} total={Math.max(totalLandings, 1)} color="bg-cyan-500" />
                    <HoursBar label="Night Landings" value={totals!.landingsNight} total={Math.max(totalLandings, 1)} color="bg-purple-500" />
                  </div>
                </div>
              </section>
              {monthlyFlights.length > 0 && (
                <section className="mb-6 print:break-inside-avoid">
                  <h2 className="mb-3 text-sm font-semibold">Monthly Activity</h2>
                  <div className="rounded-lg border border-border bg-card p-4">
                    <div className="flex items-end gap-1.5" style={{ height: 120 }}>
                      {monthlyFlights.map((m) => (
                        <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                          <div className="w-full rounded-t-sm bg-primary/70 transition-all hover:bg-primary print:bg-primary/70"
                            style={{ height: `${Math.max((m.count / maxMonthly) * 100, m.count > 0 ? 8 : 2)}%`, minHeight: m.count > 0 ? 8 : 2 }}
                            title={`${m.month}: ${m.count} flights`} />
                          <span className="text-[10px] text-muted-foreground">{m.month}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              )}
              {currencySummary && currencySummary.total > 0 && (
                <section className="mb-6">
                  <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <ShieldCheck className="h-4 w-4 text-muted-foreground" /> Currency Status
                  </h2>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <StatCard icon={ShieldCheck} label="Current" value={String(currencySummary.current)}
                      sub={`${currencySummary.total > 0 ? ((currencySummary.current / currencySummary.total) * 100).toFixed(0) : 0}% of rules`} accent="text-emerald-500" />
                    <StatCard icon={AlertTriangle} label="Expiring Soon" value={String(currencySummary.expiring)}
                      sub={`${currencySummary.total > 0 ? ((currencySummary.expiring / currencySummary.total) * 100).toFixed(0) : 0}% of rules`} accent="text-amber-500" />
                    <StatCard icon={AlertTriangle} label="Expired" value={String(currencySummary.expired)}
                      sub={`${currencySummary.total > 0 ? ((currencySummary.expired / currencySummary.total) * 100).toFixed(0) : 0}% of rules`} accent="text-red-500" />
                  </div>
                </section>
              )}
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
              <p className="text-sm text-muted-foreground">No flight data yet.</p>
              <Link href="/desktop/logbook/new" className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline">Add your first flight</Link>
            </div>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════════
         TAB: Aircraft
         ═══════════════════════════════════════════════════════ */}
      {activeTab === 'aircraft' && (
        <>
          {aircraftHours.length > 0 ? (
            <section className="mb-6">
              <h2 className="mb-3 text-sm font-semibold">Aircraft Hours Breakdown</h2>
              <p className="mb-3 text-xs text-muted-foreground">Hours per aircraft across all flights</p>
              <div className="overflow-x-auto rounded-lg border border-border bg-card">
                <table className="w-full text-sm">
                  <thead className="border-b border-border text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Aircraft</th>
                      <th className="px-3 py-2 text-right">Flights</th>
                      <th className="px-3 py-2 text-right">Total</th>
                      <th className="px-3 py-2 text-right">PIC</th>
                      <th className="px-3 py-2 text-right">SIC</th>
                      <th className="px-3 py-2 text-right">Night</th>
                      <th className="px-3 py-2 text-right">Instrument</th>
                      <th className="px-3 py-2 text-right">X-Country</th>
                      <th className="px-3 py-2 text-right">Landings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aircraftHours.map((ac) => (
                      <tr key={ac.aircraft} className="border-b border-border last:border-0 hover:bg-muted/50">
                        <td className="px-3 py-2 font-mono text-xs font-medium">{ac.aircraft}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{ac.flights}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtH(ac.totalTime)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{ac.picTime > 0 ? fmtH(ac.picTime) : '\u2014'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{ac.sicTime > 0 ? fmtH(ac.sicTime) : '\u2014'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{ac.nightTime > 0 ? fmtH(ac.nightTime) : '\u2014'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{ac.instrumentTime > 0 ? fmtH(ac.instrumentTime) : '\u2014'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{ac.crossCountryTime > 0 ? fmtH(ac.crossCountryTime) : '\u2014'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{ac.landings}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {aircraftHours.length > 1 && (
                <div className="mt-2 rounded-lg border border-border bg-muted/30 p-3">
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs">
                    <span className="font-medium text-muted-foreground">Fleet totals:</span>
                    <span>{aircraftHours.reduce((s, a) => s + a.flights, 0)} flights</span>
                    <span>{fmtH(aircraftHours.reduce((s, a) => s + a.totalTime, 0))} total time</span>
                    <span>{fmtH(aircraftHours.reduce((s, a) => s + a.picTime, 0))} PIC</span>
                    <span>{aircraftHours.reduce((s, a) => s + a.landings, 0)} landings</span>
                  </div>
                </div>
              )}
            </section>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
              <Plane className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <p className="mt-2 text-sm text-muted-foreground">No aircraft data available.</p>
              <Link href="/desktop/aircraft" className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline">Manage aircraft</Link>
            </div>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════════
         TAB: Airline Prep
         ═══════════════════════════════════════════════════════ */}
      {activeTab === 'airline' && (
        <>
          {!atpProgress ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Loading logbook data...</span>
            </div>
          ) : (
            <>
              {/* ── Airline Comparison ──────────────────────────── */}
              <section className="mb-8">
                <div className="mb-3 flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold">Airline Requirement Comparison</h2>
                </div>
                <p className="mb-4 text-xs text-muted-foreground">
                  Compare your current logbook totals against real hiring requirements for airlines worldwide.
                  Select airlines to build a side-by-side comparison. Data sourced from official career pages (2025-2026).
                </p>
                <AirlineComparison userData={userFlightData} loading={loading} />
              </section>

              {/* ── ATP Minimums Progress ──────────────────────── */}
              <section className="mb-6">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold">FAR 61.159 ATP Minimums Progress</h2>
                  <span className="text-xs text-muted-foreground">{yearlyBreakdown.length} years of data</span>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                  <div className="space-y-4">
                    {(Object.keys(ATP_REQUIREMENTS) as (keyof AtpProgress)[]).map((key) => {
                      const req = ATP_REQUIREMENTS[key]
                      const current = atpProgress[key]
                      const pct = Math.min((current / req.required) * 100, 100)
                      const remaining = Math.max(req.required - current, 0)
                      const met = current >= req.required
                      return (
                        <div key={key}>
                          <div className="mb-1 flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-foreground">{req.label}</span>
                              <span className="text-muted-foreground">FAR {req.far}</span>
                            </div>
                            <div className="flex items-center gap-2 tabular-nums">
                              {met && <Award className="h-3.5 w-3.5 text-emerald-500" />}
                              <span className={met ? 'text-emerald-500 font-semibold' : 'text-foreground'}>
                                {fmtH(current)}
                              </span>
                              <span className="text-muted-foreground">/ {fmtH(req.required)}</span>
                            </div>
                          </div>
                          <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className={`h-full rounded-full transition-all duration-700 ${met ? 'bg-emerald-500' : pct > 80 ? 'bg-amber-500' : 'bg-primary'}`}
                              style={{ width: `${pct}%` }} />
                          </div>
                          <div className="mt-0.5 text-[10px] text-muted-foreground tabular-nums">
                            {met ? 'Requirement met' : `${fmtH(remaining)} remaining`}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </section>

              {/* ── Year-by-Year Breakdown (CL-65 style) ──────── */}
              {yearlyBreakdown.length > 0 && (
                <section className="mb-6 print:break-inside-avoid">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-semibold">Flight Time History</h2>
                    <span className="text-xs text-muted-foreground">CL-65 / AirlineApps format</span>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-border bg-card">
                    <table className="w-full text-xs">
                      <thead className="border-b border-border text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Category</th>
                          {yearlyBreakdown.map((y) => (
                            <th key={y.year} className="px-3 py-2 text-right font-medium">{y.year}</th>
                          ))}
                          <th className="border-l border-border px-3 py-2 text-right font-medium">Total</th>
                          <th className="border-l border-border px-3 py-2 text-right font-medium">Last 12mo</th>
                          <th className="px-3 py-2 text-right font-medium">Last 24mo</th>
                          <th className="px-3 py-2 text-right font-medium">Last 36mo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { label: 'Total Time', fn: (y: YearlyBreakdown) => y.totalTime, total: () => totals!.totalTime, r: () => last12?.totalTime, r24: () => last24?.totalTime, r36: () => last36?.totalTime },
                          { label: 'PIC', fn: (y: YearlyBreakdown) => y.picTime, total: () => totals!.picTime, r: () => last12?.pic, r24: () => last24?.pic, r36: () => last36?.pic },
                          { label: 'SIC', fn: (y: YearlyBreakdown) => y.sicTime, total: () => totals!.sicTime, r: () => 0, r24: () => 0, r36: () => 0 },
                          { label: 'Night', fn: (y: YearlyBreakdown) => y.nightTime, total: () => totals!.nightTime, r: () => last12?.night, r24: () => last24?.night, r36: () => last36?.night },
                          { label: 'Instrument', fn: (y: YearlyBreakdown) => y.instrumentTime, total: () => totals!.instrumentTime, r: () => last12?.instrument, r24: () => last24?.instrument, r36: () => last36?.instrument },
                          { label: 'X-Country', fn: (y: YearlyBreakdown) => y.crossCountryTime, total: () => totals!.crossCountryTime, r: () => last12?.xc, r24: () => last24?.xc, r36: () => last36?.xc },
                          { label: 'Dual Given', fn: (y: YearlyBreakdown) => y.dualGiven, total: () => yearlyBreakdown.reduce((s, y) => s + y.dualGiven, 0), r: () => 0, r24: () => 0, r36: () => 0 },
                          { label: 'Dual Recv\'d', fn: (y: YearlyBreakdown) => y.dualReceived, total: () => yearlyBreakdown.reduce((s, y) => s + y.dualReceived, 0), r: () => 0, r24: () => 0, r36: () => 0 },
                          { label: 'Solo', fn: (y: YearlyBreakdown) => y.soloTime, total: () => yearlyBreakdown.reduce((s, y) => s + y.soloTime, 0), r: () => 0, r24: () => 0, r36: () => 0 },
                          { label: 'Flights', fn: (y: YearlyBreakdown) => y.flights, total: () => totals!.totalFlights, r: () => last12?.flights, r24: () => last24?.flights, r36: () => last36?.flights },
                          { label: 'Landings', fn: (y: YearlyBreakdown) => y.landings, total: () => yearlyBreakdown.reduce((s, y) => s + y.landings, 0), r: () => 0, r24: () => 0, r36: () => 0 },
                        ].map((row) => (
                          <tr key={row.label} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                            <td className="px-3 py-1.5 text-left font-medium text-foreground">{row.label}</td>
                            {yearlyBreakdown.map((y) => (
                              <td key={y.year} className="px-3 py-1.5 text-right tabular-nums">{fmtNum(row.fn(y))}</td>
                            ))}
                            <td className="border-l border-border px-3 py-1.5 text-right tabular-nums font-semibold">{fmtNum(row.total())}</td>
                            <td className="border-l border-border px-3 py-1.5 text-right tabular-nums">
                              {typeof row.r() === 'number' ? fmtNum(row.r()!) : '\u2014'}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums">
                              {typeof row.r24() === 'number' ? fmtNum(row.r24()!) : '\u2014'}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums">
                              {typeof row.r36() === 'number' ? fmtNum(row.r36()!) : '\u2014'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* ── Aircraft Experience ────────────────────────── */}
              {aircraftHours.length > 0 && (
                <section className="mb-6 print:break-inside-avoid">
                  <h2 className="mb-3 text-sm font-semibold">Aircraft Experience</h2>
                  <div className="overflow-x-auto rounded-lg border border-border bg-card">
                    <table className="w-full text-xs">
                      <thead className="border-b border-border text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Aircraft</th>
                          <th className="px-3 py-2 text-right font-medium">Total</th>
                          <th className="px-3 py-2 text-right font-medium">PIC</th>
                          <th className="px-3 py-2 text-right font-medium">Flights</th>
                          <th className="px-3 py-2 text-right font-medium">Night</th>
                          <th className="px-3 py-2 text-right font-medium">Inst</th>
                          <th className="px-3 py-2 text-right font-medium">XC</th>
                        </tr>
                      </thead>
                      <tbody>
                        {aircraftHours.map((ac) => (
                          <tr key={ac.aircraft} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                            <td className="px-3 py-1.5 font-mono font-medium">{ac.aircraft}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums font-medium">{fmtNum(ac.totalTime)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{ac.picTime > 0 ? fmtNum(ac.picTime) : '\u2014'}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{ac.flights}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{ac.nightTime > 0 ? fmtNum(ac.nightTime) : '\u2014'}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{ac.instrumentTime > 0 ? fmtNum(ac.instrumentTime) : '\u2014'}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{ac.crossCountryTime > 0 ? fmtNum(ac.crossCountryTime) : '\u2014'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* ── Recent Experience Summary ──────────────────── */}
              {last12 && (
                <section className="mb-6 print:break-inside-avoid">
                  <h2 className="mb-3 text-sm font-semibold">Recent Experience</h2>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border border-border bg-card p-3">
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Last 12 Months</p>
                      <p className="mt-1 text-lg font-bold tabular-nums">{fmtH(last12.totalTime)}</p>
                      <p className="text-[10px] text-muted-foreground">{last12.flights} flights</p>
                    </div>
                    <div className="rounded-lg border border-border bg-card p-3">
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Last 24 Months</p>
                      <p className="mt-1 text-lg font-bold tabular-nums">{last24 ? fmtH(last24.totalTime) : '\u2014'}</p>
                      <p className="text-[10px] text-muted-foreground">{last24 ? `${last24.flights} flights` : ''}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-card p-3">
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Last 36 Months</p>
                      <p className="mt-1 text-lg font-bold tabular-nums">{last36 ? fmtH(last36.totalTime) : '\u2014'}</p>
                      <p className="text-[10px] text-muted-foreground">{last36 ? `${last36.flights} flights` : ''}</p>
                    </div>
                  </div>
                </section>
              )}

              {/* ── Career Summary (printable) ──────────────────── */}
              <section className="rounded-lg border border-border bg-card p-4 print:break-inside-avoid">
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Award className="h-4 w-4 text-muted-foreground" />
                    <h2 className="text-sm font-semibold">Career Summary</h2>
                  </div>
                  <div className="flex gap-2 print:hidden">
                    <button onClick={exportAirlineAppsCSV} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                      <Download className="h-3.5 w-3.5" /> AirlineApps CSV
                    </button>
                    <button onClick={handlePrint} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors">
                      <Printer className="h-3.5 w-3.5" /> Print
                    </button>
                  </div>
                </div>
                <p className="mb-3 text-xs text-muted-foreground">
                  Professional summary formatted for airline applications, CL-65, and insurance renewals.
                  Shows year-by-year progression plus recent experience.
                </p>

                {/* Pilot info block */}
                <div className="mb-4 grid gap-2 text-xs sm:grid-cols-3">
                  <div><span className="text-muted-foreground">Pilot: </span><span className="font-medium">{localUser?.name || '___________________'}</span></div>
                  <div><span className="text-muted-foreground">Date: </span><span className="font-medium">{new Date().toLocaleDateString()}</span></div>
                  <div><span className="text-muted-foreground">Certificate: </span><span className="font-medium">___________________</span></div>
                </div>

                {/* Compact totals table */}
                <table className="w-full text-xs mb-3">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="py-1 text-left font-medium">Category</th>
                      <th className="py-1 text-right font-medium">Total</th>
                      <th className="py-1 text-right font-medium">Last 12</th>
                      <th className="py-1 text-right font-medium">Last 24</th>
                      <th className="py-1 text-right font-medium">Last 36</th>
                      <th className="py-1 text-right font-medium">ATP Req</th>
                      <th className="py-1 text-right font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: 'Total Time', value: totals!.totalTime, recent12: last12?.totalTime, recent24: last24?.totalTime, recent36: last36?.totalTime, req: 1500 },
                      { label: 'PIC', value: totals!.picTime, recent12: last12?.pic, recent24: last24?.pic, recent36: last36?.pic, req: 250 },
                      { label: 'Cross-Country', value: totals!.crossCountryTime, recent12: last12?.xc, recent24: last24?.xc, recent36: last36?.xc, req: 500 },
                      { label: 'Night', value: totals!.nightTime, recent12: last12?.night, recent24: last24?.night, recent36: last36?.night, req: 100 },
                      { label: 'Instrument', value: totals!.instrumentTime, recent12: last12?.instrument, recent24: last24?.instrument, recent36: last36?.instrument, req: 75 },
                    ].map((r) => (
                      <tr key={r.label} className="border-b border-border/50">
                        <td className="py-1 text-left font-medium">{r.label}</td>
                        <td className="py-1 text-right tabular-nums">{fmtNum(r.value)}</td>
                        <td className="py-1 text-right tabular-nums">{r.recent12 !== undefined ? fmtNum(r.recent12!) : '\u2014'}</td>
                        <td className="py-1 text-right tabular-nums">{r.recent24 !== undefined ? fmtNum(r.recent24!) : '\u2014'}</td>
                        <td className="py-1 text-right tabular-nums">{r.recent36 !== undefined ? fmtNum(r.recent36!) : '\u2014'}</td>
                        <td className="py-1 text-right tabular-nums text-muted-foreground">{fmtNum(r.req)}</td>
                        <td className="py-1 text-right">
                          {r.value >= r.req
                            ? <span className="text-emerald-500 font-semibold">Met</span>
                            : <span className="text-amber-500 tabular-nums">{fmtH(r.req - r.value)} left</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Signature block */}
                <div className="border-t border-border pt-3 text-xs text-muted-foreground">
                  <div className="flex items-center justify-between">
                    <span>Signature: ___________________</span>
                    <span>Date: ___________________</span>
                  </div>
                  <p className="mt-1 text-[10px]">Generated from AviationHub logbook data. Verify accuracy against your official logbook.</p>
                </div>
              </section>
            </>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════════
         TAB: Forms & Export
         ═══════════════════════════════════════════════════════ */}
      {activeTab === 'forms' && (
        <div className="space-y-6">
          {/* ── Full Logbook Export ── */}
          <section>
            <div className="mb-3 flex items-start justify-between">
              <div>
                <h2 className="text-sm font-semibold">Full Logbook Export</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Download your complete logbook as CSV. Includes all flight times, landings, and remarks.</p>
              </div>
              {fullLogbook.length > 0 && <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{fullLogbook.length} entries</span>}
            </div>
            <button onClick={exportFullLogbook} disabled={fullLogbook.length === 0 || exportLoading}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium hover:bg-muted disabled:opacity-50 transition-colors w-full sm:w-auto">
              {exportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {exportLoading ? 'Loading logbook...' : fullLogbook.length > 0 ? `Download Full Logbook (${fullLogbook.length} entries)` : 'Load logbook data...'}
            </button>
          </section>

          {/* ── Insurance Summary ── */}
          <section className="rounded-lg border border-border bg-card p-4 print:break-inside-avoid">
            <div className="mb-3 flex items-start justify-between">
              <div>
                <h2 className="text-sm font-semibold">Insurance Summary Form</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Printable hours breakdown for insurance applications and renewals.</p>
              </div>
              <button onClick={handlePrint} className="hidden items-center gap-1 text-xs text-primary hover:underline print:hidden sm:inline-flex"><Printer className="h-3 w-3" /> Print</button>
            </div>
            <div className="space-y-3">
              <div className="grid gap-3 text-xs sm:grid-cols-2">
                <div><span className="text-muted-foreground">Pilot Name: </span><span className="font-medium">{localUser?.name || '___________________'}</span></div>
                <div><span className="text-muted-foreground">Date: </span><span className="font-medium">{new Date().toLocaleDateString()}</span></div>
              </div>
              {hasData ? (
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-border text-muted-foreground"><th className="py-1.5 text-left font-medium">Category</th><th className="py-1.5 text-right font-medium">Hours</th></tr></thead>
                  <tbody>
                    <Tr label="Total Time" value={fmtH(totals!.totalTime)} />
                    <Tr label="Pilot-in-Command (PIC)" value={fmtH(totals!.picTime)} />
                    <Tr label="Second-in-Command (SIC)" value={fmtH(totals!.sicTime)} />
                    <Tr label="Night" value={fmtH(totals!.nightTime)} />
                    <Tr label="Instrument" value={fmtH(totals!.instrumentTime)} />
                    <Tr label="Cross-Country" value={fmtH(totals!.crossCountryTime)} />
                    <Tr label="Total Landings" value={String(totalLandings)} />
                  </tbody>
                </table>
              ) : (
                <p className="py-4 text-center text-xs text-muted-foreground">Add flight data to generate an insurance summary.</p>
              )}
              {aircraftHours.length > 0 && (
                <>
                  <p className="text-xs font-medium text-muted-foreground pt-2">By Aircraft:</p>
                  <table className="w-full text-xs">
                    <thead><tr className="border-b border-border text-muted-foreground"><th className="py-1 text-left font-medium">Aircraft</th><th className="py-1 text-right font-medium">Flights</th><th className="py-1 text-right font-medium">Total Time</th></tr></thead>
                    <tbody>{aircraftHours.map((ac) => (<tr key={ac.aircraft}><td className="py-1 font-mono">{ac.aircraft}</td><td className="py-1 text-right tabular-nums">{ac.flights}</td><td className="py-1 text-right tabular-nums font-medium">{fmtH(ac.totalTime)}</td></tr>))}</tbody>
                  </table>
                </>
              )}
              <div className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
                <div className="flex items-center justify-between"><span>Signature: ___________________</span><span>Date: ___________________</span></div>
                <p className="mt-1 text-[10px]">This summary is generated from AviationHub logbook data. Verify accuracy against your official logbook.</p>
              </div>
            </div>
          </section>

          {/* ── FAR 61 Currency Compliance ── */}
          <section className="rounded-lg border border-border bg-card p-4 print:break-inside-avoid">
            <div className="mb-3 flex items-start justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">FAR 61 Currency Compliance</h2>
              </div>
              <button onClick={handlePrint} className="hidden items-center gap-1 text-xs text-primary hover:underline print:hidden sm:inline-flex"><Printer className="h-3 w-3" /> Print</button>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">Printable record of regulatory currency compliance under 14 CFR Part 61. Useful for checkrides, rental checkouts, and CFI endorsements.</p>
            {currencySummary && currencySummary.items.length > 0 ? (
              <>
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-border text-muted-foreground"><th className="py-1.5 text-left font-medium">Requirement</th><th className="py-1.5 text-center font-medium">Status</th><th className="py-1.5 text-right font-medium">Days Remaining</th></tr></thead>
                  <tbody>
                    {currencySummary.items.map((rule) => (
                      <tr key={rule.id} className="border-b border-border/50 last:border-0">
                        <td className="py-1.5"><span className="font-medium">{rule.name}</span>{rule.authority && <span className="ml-1 text-muted-foreground">({rule.authority})</span>}</td>
                        <td className="py-1.5 text-center">
                          <span className={cn('inline-block rounded-full px-2 py-0.5 text-[10px] font-medium',
                            rule.status === 'current' ? 'bg-emerald-500/10 text-emerald-600' : rule.status === 'expiring' ? 'bg-amber-500/10 text-amber-600' : 'bg-red-500/10 text-red-600'
                          )}>{rule.status.charAt(0).toUpperCase() + rule.status.slice(1)}</span>
                        </td>
                        <td className="py-1.5 text-right tabular-nums">{rule.daysRemaining !== null ? rule.daysRemaining >= 0 ? `${rule.daysRemaining}d` : 'Overdue' : '\u2014'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
                  <div className="flex items-center justify-between"><span>Pilot: {localUser?.name || '___________________'}</span><span>Certificate: ___________________</span></div>
                  <div className="mt-1 flex items-center justify-between"><span>Signature: ___________________</span><span>Date: {new Date().toLocaleDateString()}</span></div>
                  <p className="mt-2 text-[10px]">This form summarizes currency tracking data from AviationHub. Always verify compliance with current regulations.</p>
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center">
                <ShieldCheck className="mx-auto mb-2 h-6 w-6 text-muted-foreground/50" />
                <p className="text-xs text-muted-foreground">No currency rules configured. Set up currency tracking in your Currency page.</p>
                <Link href="/desktop/logbook/currency" className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline">Go to Currency</Link>
              </div>
            )}
          </section>

          {/* ── Recent Entries ── */}
          {fullLogbook.length > 0 && (
            <section className="rounded-lg border border-border bg-card p-4 print:break-inside-avoid">
              <div className="mb-3 flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">Recent Entries (Last 10)</h2>
              </div>
              <table className="w-full text-xs">
                <thead><tr className="border-b border-border text-muted-foreground"><th className="py-1.5 text-left font-medium">Date</th><th className="py-1.5 text-left font-medium">Aircraft</th><th className="py-1.5 text-left font-medium">Route</th><th className="py-1.5 text-right font-medium">Total</th><th className="py-1.5 text-right font-medium">PIC</th><th className="py-1.5 text-right font-medium">Night</th><th className="py-1.5 text-right font-medium">Inst</th><th className="py-1.5 text-right font-medium">Landings</th></tr></thead>
                <tbody>
                  {fullLogbook.slice(0, 10).map((e) => (
                    <tr key={e.id} className="border-b border-border/50 last:border-0">
                      <td className="py-1.5">{fmtD(e.date)}</td>
                      <td className="py-1.5 font-mono">{e.aircraft}</td>
                      <td className="py-1.5 text-muted-foreground">{e.routeFrom || '\u2014'}\u2192{e.routeTo || '\u2014'}</td>
                      <td className="py-1.5 text-right tabular-nums">{e.totalTime.toFixed(1)}</td>
                      <td className="py-1.5 text-right tabular-nums">{e.picTime > 0 ? e.picTime.toFixed(1) : '\u2014'}</td>
                      <td className="py-1.5 text-right tabular-nums">{e.nightTime > 0 ? e.nightTime.toFixed(1) : '\u2014'}</td>
                      <td className="py-1.5 text-right tabular-nums">{e.instrumentTime > 0 ? e.instrumentTime.toFixed(1) : '\u2014'}</td>
                      <td className="py-1.5 text-right tabular-nums">{e.landingsDay + e.landingsNight}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[10px] text-muted-foreground">
                {fullLogbook.length > 10 ? `Showing 10 of ${fullLogbook.length} entries. Download the full CSV for complete data.` : 'All entries shown above.'}
              </p>
            </section>
          )}
        </div>
      )}

      {/* Footer (print) */}
      <p className="mt-8 text-center text-[10px] text-muted-foreground print:block hidden">AviationHub Report \u2014 Generated {new Date().toLocaleDateString()}</p>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, accent }: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: string; sub: string; accent?: string
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-2 flex items-center gap-2">
        <Icon className={cn('h-4 w-4', accent || 'text-muted-foreground')} />
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <p className={cn('text-2xl font-bold tabular-nums', accent)}>{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
    </div>
  )
}

function HoursBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.min((value / total) * 100, 100) : 0
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums font-medium">{fmtH(value)}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function Tr({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-border/50">
      <td className="py-1 text-left">{label}</td>
      <td className="py-1 text-right tabular-nums font-medium">{value}</td>
    </tr>
  )
}

function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ')
}
