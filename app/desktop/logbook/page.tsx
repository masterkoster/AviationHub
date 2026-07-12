'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useMemo } from 'react'
import { List, Plus, Search } from 'lucide-react'
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

type SortKey = 'date' | 'aircraft' | 'route' | 'time'
type SortDir = 'asc' | 'desc'

export default function DesktopLogbookPage() {
  const router = useRouter()
  const { mode, localUser, status } = useDesktopAuth()
  const [rows, setRows] = useState<FlightRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

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
          if (!cancelled) setRows((Array.isArray(cloud) ? cloud : []) as FlightRow[])
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

  const displayed = useMemo(() => {
    let filtered = rows

    if (search.trim()) {
      const q = search.toLowerCase()
      filtered = rows.filter(
        (f) =>
          f.aircraft.toLowerCase().includes(q) ||
          f.routeFrom.toLowerCase().includes(q) ||
          f.routeTo.toLowerCase().includes(q) ||
          f.date.toLowerCase().includes(q) ||
          new Date(f.date).toLocaleDateString().toLowerCase().includes(q)
      )
    }

    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'date':
          cmp = new Date(a.date).getTime() - new Date(b.date).getTime()
          break
        case 'aircraft':
          cmp = a.aircraft.localeCompare(b.aircraft)
          break
        case 'route': {
          const ar = `${a.routeFrom} ${a.routeTo}`
          const br = `${b.routeFrom} ${b.routeTo}`
          cmp = ar.localeCompare(br)
          break
        }
        case 'time':
          cmp = a.totalTime - b.totalTime
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

    return sorted
  }, [rows, search, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  function sortIndicator(key: SortKey): string {
    if (sortKey !== key) return ''
    return sortDir === 'asc' ? ' ▲' : ' ▼'
  }

  function thClass(key: SortKey): string {
    return `cursor-pointer select-none px-4 py-2 text-left transition-colors hover:text-foreground${sortKey === key ? ' text-foreground' : ''}`
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Logbook</h1>
          <p className="text-xs text-muted-foreground">Click any row to view or edit an entry</p>
        </div>
        <Link
          href="/desktop/logbook/new"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Add Flight
        </Link>
      </div>

      {loading ? (
        <div className="rounded-lg border border-border bg-card">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-0"
            >
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              <div className="h-4 w-16 animate-pulse rounded bg-muted" />
              <div className="h-4 w-32 animate-pulse rounded bg-muted" />
              <div className="ml-auto h-4 w-12 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
          <List className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">No flights found yet.</p>
        </div>
      ) : (
        <>
          <div className="mb-3 relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by aircraft, route, or date…"
              className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-xs text-muted-foreground">
                <tr>
                  <th className={thClass('date')} onClick={() => toggleSort('date')}>
                    Date{sortIndicator('date')}
                  </th>
                  <th className={thClass('aircraft')} onClick={() => toggleSort('aircraft')}>
                    Aircraft{sortIndicator('aircraft')}
                  </th>
                  <th className={thClass('route')} onClick={() => toggleSort('route')}>
                    Route{sortIndicator('route')}
                  </th>
                  <th className={`cursor-pointer select-none px-4 py-2 text-right transition-colors hover:text-foreground${sortKey === 'time' ? ' text-foreground' : ''}`} onClick={() => toggleSort('time')}>
                    Time{sortIndicator('time')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((f) => (
                  <tr
                    key={f.id}
                    onClick={() => router.push(`/desktop/logbook/${f.id}/edit`)}
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/50"
                  >
                    <td className="px-4 py-2">{new Date(f.date).toLocaleDateString()}</td>
                    <td className="px-4 py-2 font-mono text-xs">{f.aircraft}</td>
                    <td className="px-4 py-2 text-xs">{f.routeFrom || '—'} → {f.routeTo || '—'}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{f.totalTime.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {displayed.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No flights match your search.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
