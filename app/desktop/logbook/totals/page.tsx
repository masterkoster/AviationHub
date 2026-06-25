'use client'

import { useEffect, useState } from 'react'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import { getLocalTotals, type LocalTotals } from '@/apps/desktop/src/lib/local-logbook'
import { cloudApi } from '@/apps/desktop/src/lib/cloud-api'

export default function DesktopTotalsPage() {
  const { mode, localUser, status } = useDesktopAuth()
  const [totals, setTotals] = useState<LocalTotals | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (mode === 'local') {
        if (!localUser) return
        const t = await getLocalTotals(localUser.id)
        if (!cancelled) setTotals(t)
        return
      }
      if (status === 'authenticated') {
        const t = await cloudApi.getTotals()
        if (!cancelled) setTotals((t.totals as unknown as LocalTotals) || null)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [mode, localUser, status])

  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="text-2xl font-bold">Flight Totals</h1>
      <p className="mt-1 text-xs text-muted-foreground">Desktop-native totals view</p>

      {!totals ? (
        <div className="mt-4 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">No totals available yet.</div>
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
