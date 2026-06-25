'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  Plane, Plus, ShieldCheck, Clock, Loader2, ArrowRight,
  BarChart3, List, PlaneTakeoff, User, MapPin, CheckCircle2,
  AlertTriangle, ChevronRight,
} from 'lucide-react'

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

type CurrencyRule = {
  code: string
  name: string
  authority: string
  status: string
  daysRemaining?: number | null
  completed?: number
  required?: number
  unit?: string
  nextDue?: string | null
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

export default function V1Dashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [totals, setTotals] = useState<Totals | null>(null)
  const [currency, setCurrency] = useState<CurrencyRule[]>([])
  const [recentFlights, setRecentFlights] = useState<Flight[]>([])
  const [aircraft, setAircraft] = useState<Aircraft[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/v1/login')
      return
    }
    if (status !== 'authenticated') return

    let cancelled = false
    async function load() {
      try {
        const [totalsRes, currencyRes, logbookRes, aircraftRes] = await Promise.all([
          fetch('/api/v1/totals'),
          fetch('/api/v1/currency'),
          fetch('/api/v1/logbook?limit=5'),
          fetch('/api/v1/aircraft'),
        ])

        if (cancelled) return

        if (totalsRes.ok) {
          const data = await totalsRes.json()
          setTotals(data.totals)
        }
        if (currencyRes.ok) {
          const data = await currencyRes.json()
          setCurrency(data.rules || [])
        }
        if (logbookRes.ok) {
          const data = await logbookRes.json()
          setRecentFlights(Array.isArray(data) ? data : [])
        }
        if (aircraftRes.ok) {
          const data = await aircraftRes.json()
          setAircraft(Array.isArray(data) ? data : [])
        }
      } catch (e) {
        console.error('Dashboard load error:', e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [status, router])

  if (status === 'loading' || loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const hasData = totals && totals.totalFlights > 0
  const expiredCount = currency.filter(r => r.status === 'expired').length
  const expiringCount = currency.filter(r => r.status === 'expiring').length
  const currentCount = currency.filter(r => r.status === 'current').length

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            Welcome{session?.user?.name ? `, ${session.user.name.split(' ')[0]}` : ''}
          </h1>
          <p className="text-sm text-muted-foreground">
            {hasData
              ? `${totals.totalFlights} flights logged · ${totals.totalTime.toFixed(1)} total hours`
              : 'Your pilot logbook at a glance'}
          </p>
        </div>
        <Link
          href="/v1/logbook/new"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Log Flight
        </Link>
      </div>

      {/* Empty state — getting started */}
      {!hasData && !loading && (
        <div className="space-y-4">
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <Plane className="mx-auto h-10 w-10 text-muted-foreground/50" />
            <h2 className="mt-3 text-lg font-semibold">Get started</h2>
            <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
              Log your first flight to see your stats, currency status, and flight history here.
            </p>
            <Link
              href="/v1/logbook/new"
              className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Log Your First Flight
            </Link>
          </div>

          {/* Getting started checklist */}
          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="text-sm font-semibold mb-3">Getting started</h3>
            <div className="space-y-2.5">
              <ChecklistItem
                done={!!session?.user?.name}
                label="Set up your profile"
                href="/v1/profile"
              />
              <ChecklistItem
                done={aircraft.length > 0}
                label="Add your first aircraft"
                href="/v1/aircraft"
              />
              <ChecklistItem
                done={!!hasData}
                label="Log your first flight"
                href="/v1/logbook/new"
              />
            </div>
          </div>
        </div>
      )}

      {/* Main content — when data exists */}
      {hasData && (
        <>
          {/* Big stat cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <BigStat
              label="Total Flights"
              value={String(totals.totalFlights)}
              icon={<List className="h-5 w-5" />}
              color="bg-blue-500/10 text-blue-500"
            />
            <BigStat
              label="Total Hours"
              value={totals.totalTime.toFixed(1)}
              sub="hours"
              icon={<Clock className="h-5 w-5" />}
              color="bg-violet-500/10 text-violet-500"
            />
            <BigStat
              label="PIC Hours"
              value={totals.picTime.toFixed(1)}
              sub="hours"
              icon={<PlaneTakeoff className="h-5 w-5" />}
              color="bg-emerald-500/10 text-emerald-500"
            />
            <BigStat
              label="Currency"
              value={
                currency.length > 0
                  ? expiredCount === 0 && expiringCount === 0
                    ? 'All Current'
                    : `${expiredCount} expired`
                  : '—'
              }
              sub={currency.length > 0 ? `${currentCount}/${currency.length} rules` : undefined}
              icon={<ShieldCheck className="h-5 w-5" />}
              color={
                expiredCount > 0
                  ? 'bg-red-500/10 text-red-500'
                  : expiringCount > 0
                    ? 'bg-amber-500/10 text-amber-500'
                    : 'bg-emerald-500/10 text-emerald-500'
              }
            />
          </div>

          {/* Two-column: Flights + Currency */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left — Recent flights */}
            <div className="lg:col-span-2 space-y-6">
              <div className="rounded-lg border border-border bg-card">
                <div className="flex items-center justify-between px-4 pt-4 pb-2">
                  <h2 className="text-sm font-semibold flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Recent Flights
                  </h2>
                  <Link href="/v1/logbook" className="text-xs text-primary hover:underline flex items-center gap-1">
                    View all <ChevronRight className="h-3 w-3" />
                  </Link>
                </div>
                <div className="divide-y divide-border">
                  {recentFlights.map((flight) => (
                    <button
                      key={flight.id}
                      onClick={() => router.push(`/v1/logbook/${flight.id}`)}
                      className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                          <Plane className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">
                            {flight.routeFrom && flight.routeTo
                              ? `${flight.routeFrom} → ${flight.routeTo}`
                              : 'No route'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(flight.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            {' · '}
                            {flight.aircraft}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{flight.totalTime.toFixed(1)}h</span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Time breakdown */}
              <div className="rounded-lg border border-border bg-card p-4">
                <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Time Breakdown
                </h2>
                <div className="grid grid-cols-3 gap-4">
                  <TimeBreakdownItem label="PIC" value={totals.picTime} total={totals.totalTime} />
                  <TimeBreakdownItem label="SIC" value={totals.sicTime} total={totals.totalTime} />
                  <TimeBreakdownItem label="Night" value={totals.nightTime} total={totals.totalTime} />
                  <TimeBreakdownItem label="Instrument" value={totals.instrumentTime} total={totals.totalTime} />
                  <TimeBreakdownItem label="Cross Country" value={totals.crossCountryTime} total={totals.totalTime} />
                  <TimeBreakdownItem label="Dual" value={totals.totalTime - totals.picTime} total={totals.totalTime} />
                </div>
                <div className="mt-4 pt-3 border-t border-border">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Day Landings</span>
                      <span className="text-sm font-semibold">{totals.landingsDay}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Night Landings</span>
                      <span className="text-sm font-semibold">{totals.landingsNight}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right — Currency + Aircraft + Actions */}
            <div className="space-y-6">
              {/* Currency */}
              {currency.length > 0 && (
                <div className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-semibold flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4" />
                      Currency
                    </h2>
                    <Link href="/v1/logbook/currency" className="text-xs text-primary hover:underline">
                      Details
                    </Link>
                  </div>
                  <div className="space-y-3">
                    {currency.map((rule) => (
                      <CurrencyRow key={rule.code} rule={rule} />
                    ))}
                  </div>
                </div>
              )}

              {/* My Aircraft */}
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold flex items-center gap-2">
                    <Plane className="h-4 w-4" />
                    My Aircraft
                  </h2>
                  <Link href="/v1/aircraft" className="text-xs text-primary hover:underline">
                    Manage
                  </Link>
                </div>
                {aircraft.length > 0 ? (
                  <div className="space-y-2">
                    {aircraft.slice(0, 4).map((a) => (
                      <div key={a.id} className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2">
                        <div>
                          <p className="text-sm font-medium font-mono">{a.nNumber}</p>
                          <p className="text-xs text-muted-foreground">{a.nickname || a.model || '—'}</p>
                        </div>
                      </div>
                    ))}
                    {aircraft.length > 4 && (
                      <Link href="/v1/aircraft" className="block text-center text-xs text-primary hover:underline py-1">
                        +{aircraft.length - 4} more
                      </Link>
                    )}
                  </div>
                ) : (
                  <Link
                    href="/v1/aircraft"
                    className="flex items-center justify-center gap-2 rounded-md border border-dashed border-border px-4 py-4 text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    Add your first aircraft
                  </Link>
                )}
              </div>

              {/* Quick Actions */}
              <div className="rounded-lg border border-border bg-card p-4">
                <h2 className="text-sm font-semibold mb-3">Quick Actions</h2>
                <div className="grid grid-cols-2 gap-2">
                  <QuickActionCard href="/v1/logbook/new" icon={<Plus className="h-4 w-4" />} label="Log Flight" color="bg-blue-500/10 text-blue-500" />
                  <QuickActionCard href="/v1/logbook" icon={<List className="h-4 w-4" />} label="Logbook" color="bg-violet-500/10 text-violet-500" />
                  <QuickActionCard href="/v1/logbook/totals" icon={<BarChart3 className="h-4 w-4" />} label="Totals" color="bg-emerald-500/10 text-emerald-500" />
                  <QuickActionCard href="/v1/profile" icon={<User className="h-4 w-4" />} label="Profile" color="bg-amber-500/10 text-amber-500" />
                </div>
              </div>

              {/* Expiration alerts */}
              {currency.some(r => r.daysRemaining !== null && r.daysRemaining !== undefined && r.daysRemaining < 90) && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                  <h2 className="text-sm font-semibold text-amber-600 mb-2 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Expiring Soon
                  </h2>
                  <div className="space-y-1.5">
                    {currency
                      .filter(r => r.daysRemaining !== null && r.daysRemaining !== undefined && r.daysRemaining < 90)
                      .map((rule) => (
                        <p key={rule.code} className="text-xs text-muted-foreground">
                          <span className="font-medium">{rule.name}</span> — {rule.daysRemaining} days left
                        </p>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function BigStat({ label, value, sub, icon, color }: { label: string; value: string; sub?: string; icon: React.ReactNode; color: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
        {icon}
      </div>
      <p className="text-2xl font-bold">{value}</p>
      <div className="flex items-center gap-1.5">
        <p className="text-xs text-muted-foreground">{label}</p>
        {sub && <span className="text-[10px] text-muted-foreground/60">· {sub}</span>}
      </div>
    </div>
  )
}

function TimeBreakdownItem({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total > 0 ? (value / total) * 100 : 0
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs font-medium">{value.toFixed(1)}h</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary/60 transition-all"
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  )
}

function CurrencyRow({ rule }: { rule: CurrencyRule }) {
  const hasProgress = rule.completed !== undefined && rule.required !== undefined
  const pct = hasProgress && rule.required! > 0 ? (rule.completed! / rule.required!) * 100 : 0

  return (
    <div className="rounded-md bg-muted/50 px-3 py-2.5">
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-medium">{rule.name}</p>
        <StatusBadge status={rule.status} />
      </div>
      {hasProgress ? (
        <>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs text-muted-foreground">
              {rule.completed}/{rule.required} {rule.unit || ''}
            </p>
            <p className="text-xs text-muted-foreground">{Math.round(pct)}%</p>
          </div>
          <div className="h-1.5 rounded-full bg-border overflow-hidden">
            <div
              className="h-full rounded-full bg-primary/60 transition-all"
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          {rule.daysRemaining !== null && rule.daysRemaining !== undefined
            ? `${rule.daysRemaining} days remaining`
            : rule.nextDue
              ? `Due ${new Date(rule.nextDue).toLocaleDateString()}`
              : rule.authority}
        </p>
      )}
    </div>
  )
}

function ChecklistItem({ done, label, href }: { done: boolean; label: string; href: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-muted/50 transition-colors"
    >
      <div className={`flex h-5 w-5 items-center justify-center rounded-full border ${done ? 'border-emerald-500 bg-emerald-500/10' : 'border-border'}`}>
        {done && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
      </div>
      <span className={`text-sm ${done ? 'text-muted-foreground line-through' : 'font-medium'}`}>
        {label}
      </span>
      {!done && <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />}
    </Link>
  )
}

function QuickActionCard({ href, icon, label, color }: { href: string; icon: React.ReactNode; label: string; color: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 text-sm font-medium hover:bg-muted/50 transition-colors"
    >
      <div className={`flex h-8 w-8 items-center justify-center rounded-md ${color}`}>
        {icon}
      </div>
      {label}
    </Link>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles = {
    current: 'bg-emerald-500/10 text-emerald-500',
    expiring: 'bg-amber-500/10 text-amber-500',
    expired: 'bg-destructive/10 text-destructive',
    unknown: 'bg-muted text-muted-foreground',
  }
  const labels = { current: 'Current', expiring: 'Expiring', expired: 'Expired', unknown: 'Unknown' }

  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${(styles as any)[status] || styles.unknown}`}>
      {(labels as any)[status] || status}
    </span>
  )
}
