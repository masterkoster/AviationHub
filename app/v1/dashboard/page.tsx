'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  Plane, Plus, ShieldCheck, Clock, Loader2, ArrowRight,
} from 'lucide-react'

type Totals = {
  totalTime: number
  picTime: number
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

export default function V1Dashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [totals, setTotals] = useState<Totals | null>(null)
  const [currency, setCurrency] = useState<CurrencyRule[]>([])
  const [recentFlights, setRecentFlights] = useState<Flight[]>([])
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
        const [totalsRes, currencyRes, logbookRes] = await Promise.all([
          fetch('/api/v1/totals'),
          fetch('/api/v1/currency'),
          fetch('/api/v1/logbook?limit=5'),
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

  return (
    <div className="p-6 max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            Welcome{session?.user?.name ? `, ${session.user.name.split(' ')[0]}` : ''}
          </h1>
          <p className="text-sm text-muted-foreground">Your pilot logbook at a glance</p>
        </div>
        <Link
          href="/v1/logbook/new"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Log Flight
        </Link>
      </div>

      {/* Empty state */}
      {!hasData && !loading && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <Plane className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <h2 className="mt-3 text-lg font-semibold">Get started</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Log your first flight to see your stats here.
          </p>
          <Link
            href="/v1/logbook/new"
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Log Your First Flight
          </Link>
        </div>
      )}

      {/* Stat Cards */}
      {hasData && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Total Flights" value={String(totals.totalFlights)} />
          <StatCard label="Total Hours" value={totals.totalTime.toFixed(1)} />
          <StatCard label="PIC Hours" value={totals.picTime.toFixed(1)} />
          <StatCard
            label="Currency"
            value={
              currency.length > 0
                ? currency.filter(r => r.status === 'current').length === currency.length
                  ? 'Current'
                  : `${currency.filter(r => r.status === 'expired').length} expired`
                : '—'
            }
          />
        </div>
      )}

      {/* Currency */}
      {currency.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              Currency Status
            </h2>
            <Link href="/v1/logbook/currency" className="text-xs text-primary hover:underline">
              View all
            </Link>
          </div>
          <div className="space-y-2">
            {currency.map((rule) => (
              <div key={rule.code} className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{rule.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {rule.completed !== undefined && rule.required !== undefined
                      ? `${rule.completed}/${rule.required} ${rule.unit || ''}`
                      : rule.daysRemaining !== null && rule.daysRemaining !== undefined
                        ? `${rule.daysRemaining} days remaining`
                        : rule.nextDue
                          ? `Due ${new Date(rule.nextDue).toLocaleDateString()}`
                          : rule.authority}
                  </p>
                </div>
                <StatusBadge status={rule.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Flights */}
      {recentFlights.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Recent Flights
            </h2>
            <Link href="/v1/logbook" className="text-xs text-primary hover:underline">
              View all
            </Link>
          </div>
          <div className="divide-y divide-border">
            {recentFlights.map((flight) => (
              <button
                key={flight.id}
                onClick={() => router.push(`/v1/logbook/${flight.id}`)}
                className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-muted/50 transition-colors rounded-md"
              >
                <div>
                  <p className="text-sm font-medium">
                    {flight.routeFrom && flight.routeTo
                      ? `${flight.routeFrom} → ${flight.routeTo}`
                      : flight.aircraft}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(flight.date).toLocaleDateString()} · {flight.aircraft}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{flight.totalTime.toFixed(1)}h</span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
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
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${(styles as any)[status] || styles.unknown}`}>
      {(labels as any)[status] || status}
    </span>
  )
}
