'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { ArrowLeft, Loader2, Plus, Search, Filter } from 'lucide-react'

type Flight = {
  id: string
  date: string
  aircraft: string
  routeFrom: string
  routeTo: string
  totalTime: number
  picTime: number
  nightTime: number
  instrumentTime: number
  dayLandings: number
  nightLandings: number
  remarks?: string | null
  isSimulator: boolean
}

export default function LogbookListPage() {
  const router = useRouter()
  const { status } = useSession()
  const [flights, setFlights] = useState<Flight[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterAircraft, setFilterAircraft] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/v1/login')
  }, [status, router])

  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/v1/logbook?limit=500')
      .then(r => r.ok ? r.json() : [])
      .then(data => setFlights(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [status])

  const aircraftList = [...new Set(flights.map(f => f.aircraft))].sort()

  const filtered = flights.filter(f => {
    if (search) {
      const q = search.toLowerCase()
      const match = f.aircraft.toLowerCase().includes(q) ||
        f.routeFrom.toLowerCase().includes(q) ||
        f.routeTo.toLowerCase().includes(q) ||
        (f.remarks || '').toLowerCase().includes(q)
      if (!match) return false
    }
    if (filterAircraft && f.aircraft !== filterAircraft) return false
    return true
  })

  if (status === 'loading' || loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const totalHours = filtered.reduce((sum, f) => sum + f.totalTime, 0)

  return (
    <div className="p-6 max-w-4xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Flight Log</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} flights · {totalHours.toFixed(1)} hours</p>
        </div>
        <Link href="/v1/logbook/new"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
          <Plus className="h-4 w-4" />
          Log Flight
        </Link>
      </div>

      {/* Search + Filter */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search aircraft, airports, remarks..."
            className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <select value={filterAircraft} onChange={e => setFilterAircraft(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring">
          <option value="">All aircraft</option>
          {aircraftList.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {/* Flight list */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">No flights found</p>
        </div>
      ) : (
        <div className="space-y-1">
          {filtered.map(f => (
            <button
              key={f.id}
              onClick={() => router.push(`/v1/logbook/${f.id}`)}
              className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-left hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="min-w-[80px]">
                  <p className="text-xs text-muted-foreground">
                    {new Date(f.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(f.date).getFullYear()}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium">
                    {f.routeFrom && f.routeTo ? `${f.routeFrom} → ${f.routeTo}` : '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {f.aircraft}{f.isSimulator ? ' (Sim)' : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-right">
                <div className="hidden sm:block">
                  {f.picTime > 0 && <span className="text-xs text-muted-foreground mr-2">PIC {f.picTime.toFixed(1)}</span>}
                  {f.nightTime > 0 && <span className="text-xs text-muted-foreground mr-2">Night {f.nightTime.toFixed(1)}</span>}
                  {f.instrumentTime > 0 && <span className="text-xs text-muted-foreground">IFR {f.instrumentTime.toFixed(1)}</span>}
                </div>
                <span className="text-sm font-semibold min-w-[40px] text-right">{f.totalTime.toFixed(1)}h</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
