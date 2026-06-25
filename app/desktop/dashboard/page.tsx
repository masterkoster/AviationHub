'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Plane, Plus, ShieldCheck, Clock, Loader2,
  List, PlaneTakeoff, MapPin, CalendarDays,
} from 'lucide-react'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import { getLocalTotals, getLocalRecentFlights, type LocalFlight } from '@/apps/desktop/src/lib/local-logbook'
import { cloudApi } from '@/apps/desktop/src/lib/cloud-api'
import { listAgendaItems, markAgendaItemDone, type AgendaItem } from '@/apps/desktop/src/lib/local-agenda'

// Types match v1 dashboard so we can reuse the markup
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

export default function DesktopDashboard() {
  const { status, mode, localUser, cloudUser } = useDesktopAuth()
  const [totals, setTotals] = useState<Totals | null>(null)
  const [currencyCount, setCurrencyCount] = useState(0)
  const [recentFlights, setRecentFlights] = useState<Flight[]>([])
  const [aircraft, setAircraft] = useState<Aircraft[]>([])
  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([])
  const [agendaSize, setAgendaSize] = useState<'compact' | 'expanded'>('expanded')
  const [loading, setLoading] = useState(true)

  const agendaUserId = mode === 'local' ? localUser?.id : (cloudUser?.id || 'cloud-default')

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = window.localStorage.getItem('desktop.dashboard.agenda.size')
    if (stored === 'compact' || stored === 'expanded') {
      setAgendaSize(stored)
    }
  }, [])

  useEffect(() => {
    // Local mode — load data from local SQLite + show empty states.
    // Cloud mode — reuses the v1 dashboard (handled in app/desktop/dashboard/page).
    if (mode === 'local') {
      loadLocalData()
      return
    }
    // Not ready yet
    if (status === 'loading') return
    if (status !== 'authenticated') return
    loadCloudData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, mode])

  useEffect(() => {
    if (!agendaUserId) return
    loadAgenda(agendaUserId)
  }, [agendaUserId])

  async function loadLocalData() {
    setLoading(true)
    try {
      if (!localUser) {
        setTotals(null)
        setRecentFlights([])
        setAircraft([])
        return
      }

      const [localTotals, localFlights] = await Promise.all([
        getLocalTotals(localUser.id),
        getLocalRecentFlights(localUser.id, 5),
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
      setCurrencyCount(0)
    } catch (e) {
      console.error('Local dashboard load error:', e)
    } finally {
      setLoading(false)
    }
  }

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
    } catch (e) {
      console.error('Dashboard load error (cloud):', e)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      {/* Welcome header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">
          Welcome{localUser ? `, ${localUser.name.split(' ')[0]}` : ''}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === 'local'
            ? 'Local mode — your data lives on this machine. Cloud sign-in lets you sync anytime.'
            : 'Cloud sync — your logbook is pulled from AviationHub Cloud.'}
        </p>
      </div>

      {/* Quick actions */}
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

      {/* Stats cards */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Clock}
          label="Total Hours"
          value={totals ? formatHours(totals.totalTime) : '—'}
          sublabel={totals ? `${totals.totalFlights} flights` : 'No data yet'}
        />
        <StatCard
          icon={ShieldCheck}
          label="Currency"
          value={currencyCount > 0 ? String(currencyCount) : '—'}
          sublabel={currencyCount > 0 ? 'Active rules' : 'No rules found'}
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

      <AgendaWidget
        items={agendaItems}
        size={agendaSize}
        onToggleSize={toggleAgendaSize}
        onToggleDone={toggleAgendaDone}
      />

      {/* Empty state OR flights list */}
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
    </div>
  )
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
