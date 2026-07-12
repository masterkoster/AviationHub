'use client'

import Link from 'next/link'
import { useEffect, useState, useCallback } from 'react'
import { BarChart3, Download } from 'lucide-react'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from '@/components/ui/breadcrumb'
import { getLocalTotals, type LocalTotals } from '@/apps/desktop/src/lib/local-logbook'
import { cloudApi } from '@/apps/desktop/src/lib/cloud-api'
import { ErrorCard } from '@/desktop/components/error-card'
import { notifyExported } from '@/desktop/lib/toast-helpers'

export default function DesktopTotalsPage() {
  const { mode, localUser, status } = useDesktopAuth()
  const [totals, setTotals] = useState<LocalTotals | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      if (mode === 'local') {
        if (!localUser) return
        const t = await getLocalTotals(localUser.id)
        setTotals(t)
        return
      }
      if (status === 'authenticated') {
        const t = await cloudApi.getTotals()
        setTotals((t.totals as unknown as LocalTotals) || null)
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load totals')
    } finally {
      setLoading(false)
    }
  }, [mode, localUser, status])

  useEffect(() => {
    load()
  }, [load])

  function handleExportCSV() {
    if (!totals) return
    const headers = [
      'Total Flights',
      'Total Hours',
      'PIC',
      'SIC',
      'Night',
      'Instrument',
      'Cross Country',
      'Day Landings',
      'Night Landings',
    ]
    const values = [
      totals.totalFlights,
      totals.totalTime.toFixed(1),
      totals.picTime.toFixed(1),
      totals.sicTime.toFixed(1),
      totals.nightTime.toFixed(1),
      totals.instrumentTime.toFixed(1),
      totals.crossCountryTime.toFixed(1),
      totals.landingsDay,
      totals.landingsNight,
    ]
    const csv = [headers.join(','), values.join(',')].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `flight-totals-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    notifyExported('Totals')
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/desktop/logbook">Logbook</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Totals</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Flight Totals</h1>
          <p className="mt-1 text-xs text-muted-foreground">Lifetime logbook totals from all non-voided entries</p>
        </div>
        {totals && !loading && (
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        )}
      </div>

      {loading ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-4">
              <div className="h-3 w-16 animate-pulse rounded bg-muted" />
              <div className="mt-2 h-8 w-24 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : loadError ? (
        <div className="mt-4">
          <ErrorCard message={loadError} onRetry={load} />
        </div>
      ) : !totals ? (
        <div className="mt-8 rounded-lg border border-dashed border-border bg-muted/20 p-10 text-center">
          <BarChart3 className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <h2 className="mt-4 text-base font-semibold">No flight data yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Add your first flight to see your totals here.
          </p>
          <Link
            href="/desktop/logbook/new"
            className="mt-5 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Add Your First Flight
          </Link>
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Card label="Total Flights" value={String(totals.totalFlights)} />
          <Card label="Total Hours" value={totals.totalTime.toFixed(1)} />
          <Card label="PIC" value={totals.picTime.toFixed(1)} />
          <Card label="SIC" value={totals.sicTime.toFixed(1)} />
          <Card label="Night" value={totals.nightTime.toFixed(1)} />
          <Card label="Instrument" value={totals.instrumentTime.toFixed(1)} />
          <Card label="Cross Country" value={totals.crossCountryTime.toFixed(1)} />
          <Card label="Day Landings" value={String(totals.landingsDay)} />
          <Card label="Night Landings" value={String(totals.landingsNight)} />
        </div>
      )}
    </div>
  )
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  )
}
