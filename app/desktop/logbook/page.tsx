'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { List, Plus } from 'lucide-react'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import { getLocalRecentFlights, type LocalFlight } from '@/apps/desktop/src/lib/local-logbook'
import { cloudApi } from '@/apps/desktop/src/lib/cloud-api'

type FlightRow = {
  id: string
  date: string
  aircraft: string
  routeFrom: string
  routeTo: string
  totalTime: number
}

export default function DesktopLogbookPage() {
  const { mode, localUser, status } = useDesktopAuth()
  const [rows, setRows] = useState<FlightRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        if (mode === 'local') {
          if (!localUser) {
            setRows([])
            return
          }
          const local = await getLocalRecentFlights(localUser.id, 200)
          if (!cancelled) {
            setRows(local.map((f: LocalFlight) => ({
              id: f.id,
              date: f.date,
              aircraft: f.aircraft,
              routeFrom: f.routeFrom,
              routeTo: f.routeTo,
              totalTime: f.totalTime,
            })))
          }
          return
        }

        if (status === 'authenticated') {
          const cloud = await cloudApi.getLogbook(200)
          if (!cancelled) setRows(Array.isArray(cloud) ? cloud : [])
          return
        }

        setRows([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [mode, localUser, status])

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Logbook</h1>
          <p className="text-xs text-muted-foreground">Desktop-native logbook list</p>
        </div>
        <Link
          href="/desktop/logbook/new"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Add Flight
        </Link>
      </div>

      {loading ? (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">Loading flights…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
          <List className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">No flights found yet.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card">
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
              {rows.map((f) => (
                <tr key={f.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                  <td className="px-4 py-2">{new Date(f.date).toLocaleDateString()}</td>
                  <td className="px-4 py-2 font-mono text-xs">{f.aircraft}</td>
                  <td className="px-4 py-2 text-xs">{f.routeFrom || '—'} → {f.routeTo || '—'}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{f.totalTime.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
