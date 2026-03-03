'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Plus, Search, Filter, Plane, Trash2, RotateCcw, X } from 'lucide-react'

const fetcher = (url: string) => fetch(url).then(r => r.json())

export default function FlightsPage() {
  const { data: entriesData, isLoading, mutate } = useSWR('/api/logbook?limit=500&includeVoided=true', fetcher, {
    refreshInterval: 30000
  })
  const { data: aircraft } = useSWR('/api/aircraft', fetcher)
  
  const [entries, setEntries] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [filterAircraft, setFilterAircraft] = useState('')
  const [filterYear, setFilterYear] = useState('')
  const [showVoided, setShowVoided] = useState(false)
  const [voidDialogOpen, setVoidDialogOpen] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState<any>(null)
  const [voidReason, setVoidReason] = useState('')
  const [voiding, setVoiding] = useState(false)

  // Void entry handler
  const handleVoid = async () => {
    if (!selectedEntry || !voidReason.trim()) return
    setVoiding(true)
    try {
      const res = await fetch('/api/logbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'void', id: selectedEntry.id, reason: voidReason })
      })
      if (res.ok) {
        // Update local state
        setEntries(entries.map(e => 
          e.id === selectedEntry.id 
            ? { ...e, isVoided: true, voidReason, voidedAt: new Date().toISOString() }
            : e
        ))
        setVoidDialogOpen(false)
        setVoidReason('')
        setSelectedEntry(null)
      }
    } catch (err) {
      console.error('Failed to void entry:', err)
    } finally {
      setVoiding(false)
    }
  }

  // Unvoid entry handler
  const handleUnvoid = async (entry: any) => {
    try {
      const res = await fetch('/api/logbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unvoid', id: entry.id })
      })
      if (res.ok) {
        setEntries(entries.map(e => 
          e.id === entry.id 
            ? { ...e, isVoided: false, voidReason: null, voidedAt: null }
            : e
        ))
      }
    } catch (err) {
      console.error('Failed to unvoid entry:', err)
    }
  }

  const openVoidDialog = (entry: any) => {
    setSelectedEntry(entry)
    setVoidReason('')
    setVoidDialogOpen(true)
  }

  useEffect(() => {
    if (entriesData?.entries) {
      setEntries(entriesData.entries)
    }
  }, [entriesData])

  const filtered = useMemo(() => {
    if (!entries) return []
    return entries.filter((e: any) => {
      const matchSearch = !search || 
        [e.aircraft, e.routeFrom, e.routeTo, e.remarks]
          .some(f => f?.toLowerCase().includes(search.toLowerCase()))
      const matchAircraft = !filterAircraft || e.aircraft === filterAircraft
      const matchYear = !filterYear || new Date(e.date).getFullYear().toString() === filterYear
      const matchVoided = showVoided || !e.isVoided
      return matchSearch && matchAircraft && matchYear && matchVoided
    })
  }, [entries, search, filterAircraft, filterYear, showVoided])

  const uniqueAircraft = useMemo(() => {
    const ac = new Set(entries?.map((e: any) => e.aircraft).filter(Boolean))
    return Array.from(ac).sort()
  }, [entries])

  const years = useMemo(() => {
    const y = new Set(entries?.map((e: any) => new Date(e.date).getFullYear().toString()))
    return Array.from(y).sort().reverse()
  }, [entries])

  const totals = useMemo(() => filtered.reduce((acc: any, e: any) => ({
    totalTime: acc.totalTime + (parseFloat(e.totalTime) || 0),
    picTime: acc.picTime + (parseFloat(e.picTime) || 0),
    nightTime: acc.nightTime + (parseFloat(e.nightTime) || 0),
    instrumentTime: acc.instrumentTime + (parseFloat(e.instrumentTime) || 0),
    crossCountryTime: acc.crossCountryTime + (parseFloat(e.crossCountryTime) || 0),
    dayLandings: acc.dayLandings + (parseInt(e.dayLandings) || 0),
    nightLandings: acc.nightLandings + (parseInt(e.nightLandings) || 0),
  }), { totalTime: 0, picTime: 0, nightTime: 0, instrumentTime: 0, crossCountryTime: 0, dayLandings: 0, nightLandings: 0 }), [filtered])

  const hasFilters = search || filterAircraft || filterYear

  const formatHours = (val: number) => val.toFixed(1)

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/50 px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Flight Log</h1>
            <p className="text-sm text-muted-foreground">
              {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
              {hasFilters && entries?.length !== filtered.length && ` of ${entries?.length} total`}
            </p>
          </div>
          <Link href="/logbook/flights/new">
            <Button className="bg-primary hover:bg-primary/90 gap-2">
              <Plus className="w-4 h-4" /> Log Flight
            </Button>
          </Link>
        </div>
      </div>

      <div className="px-6 py-5 space-y-5">
        {/* Search & Filters */}
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">Search & Filter</span>
            {hasFilters && (
              <button
                onClick={() => { setSearch(''); setFilterAircraft(''); setFilterYear('') }}
                className="ml-auto text-xs text-primary hover:underline"
              >
                Clear all
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-2 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search aircraft, airports, remarks..."
                className="w-full h-9 pl-9 pr-3 rounded-lg bg-secondary/60 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary text-sm"
              />
            </div>
            <select
              value={filterAircraft}
              onChange={e => setFilterAircraft(e.target.value)}
              className="h-9 px-3 rounded-lg bg-secondary/60 border border-border text-foreground focus:outline-none focus:border-primary text-sm"
            >
              <option value="">All Aircraft</option>
              {uniqueAircraft.map((ac: any) => (
                <option key={ac} value={ac}>{ac}</option>
              ))}
            </select>
            <select
              value={filterYear}
              onChange={e => setFilterYear(e.target.value)}
              className="h-9 px-3 rounded-lg bg-secondary/60 border border-border text-foreground focus:outline-none focus:border-primary text-sm"
            >
              <option value="">All Years</option>
              {years.map((y: any) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input 
              type="checkbox" 
              checked={showVoided} 
              onChange={(e) => setShowVoided(e.target.checked)}
              className="h-4 w-4"
            />
            Show voided entries
          </label>
        </div>

        {/* Totals Banner */}
        {filtered.length > 0 && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {hasFilters ? 'Filtered Totals' : 'All Totals'}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary/20">
                    {['Total', 'PIC', 'Night', 'Instrument', 'X-Country', 'Day Ldg', 'Night Ldg'].map(h => (
                      <th key={h} className="px-4 py-2 text-xs font-medium text-muted-foreground whitespace-nowrap text-center">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {[
                      formatHours(totals.totalTime),
                      formatHours(totals.picTime),
                      formatHours(totals.nightTime),
                      formatHours(totals.instrumentTime),
                      formatHours(totals.crossCountryTime),
                      totals.dayLandings,
                      totals.nightLandings,
                    ].map((val, i) => (
                      <td key={i} className="px-4 py-2 text-center font-semibold">{val}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Entries List */}
        <div className="space-y-3">
          {isLoading && <div className="text-center py-8 text-muted-foreground">Loading...</div>}
          {!isLoading && filtered.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              {entries?.length === 0 ? 'No flights logged yet' : 'No entries match your filters'}
            </div>
          )}
          {filtered.map((entry: any) => (
            <div key={entry.id} className={`bg-card border rounded-xl p-4 ${entry.isVoided ? 'opacity-60 border-dashed' : ''}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Plane className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className={`font-bold text-lg ${entry.isVoided ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                        {entry.aircraft}
                      </p>
                      {entry.isVoided && <Badge variant="destructive">VOIDED</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {entry.routeFrom} → {entry.routeTo}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(entry.date).toLocaleDateString()}
                      {entry.voidReason && <span className="text-destructive ml-2">Void: {entry.voidReason}</span>}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-xl font-bold ${entry.isVoided ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                    {formatHours(entry.totalTime)} hrs
                  </p>
                  <div className="mt-2 flex flex-wrap justify-end gap-1">
                    {entry.authority && <Badge variant="secondary">{entry.authority}</Badge>}
                    {entry.isPending && <Badge variant="outline">Pending</Badge>}
                    {entry.nightTime > 0 && <Badge variant="outline">Night</Badge>}
                    {entry.instrumentTime > 0 && <Badge variant="outline">Instrument</Badge>}
                  </div>
                  <div className="mt-2 flex justify-end gap-1">
                    {entry.isVoided ? (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => handleUnvoid(entry)}
                        className="text-xs text-green-600 hover:text-green-700"
                      >
                        <RotateCcw className="w-3 h-3 mr-1" /> Restore
                      </Button>
                    ) : (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => openVoidDialog(entry)}
                        className="text-xs text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-3 h-3 mr-1" /> Void
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              {entry.remarks && (
                <p className="text-sm text-muted-foreground mt-3 pt-3 border-t">{entry.remarks}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Void Confirmation Dialog */}
      <Dialog open={voidDialogOpen} onOpenChange={setVoidDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Void Flight Entry</DialogTitle>
            <DialogDescription>
              Are you sure you want to void this flight? This action creates an audit trail and cannot be undone by deletion.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium text-foreground">Reason for voiding</label>
            <textarea
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="Enter reason (e.g., Duplicate entry, Wrong aircraft, etc.)"
              className="w-full mt-2 h-24 px-3 py-2 rounded-lg bg-secondary/60 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary text-sm resize-none"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleVoid} 
              disabled={!voidReason.trim() || voiding}
            >
              {voiding ? 'Voiding...' : 'Void Entry'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
