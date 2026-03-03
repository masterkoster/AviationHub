'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Plus, Search, Filter, Plane, Trash2, RotateCcw, X, Pencil } from 'lucide-react'

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
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editEntry, setEditEntry] = useState<any>(null)
  const [editForm, setEditForm] = useState<any>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [airportQueryFrom, setAirportQueryFrom] = useState('')
  const [airportQueryTo, setAirportQueryTo] = useState('')
  const [airportResultsFrom, setAirportResultsFrom] = useState<any[]>([])
  const [airportResultsTo, setAirportResultsTo] = useState<any[]>([])
  const [airportLoadingFrom, setAirportLoadingFrom] = useState(false)
  const [airportLoadingTo, setAirportLoadingTo] = useState(false)
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false)
  const [historyEntry, setHistoryEntry] = useState<any>(null)
  const [historyItems, setHistoryItems] = useState<any[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [exportingAudit, setExportingAudit] = useState(false)

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

  const openEditDialog = (entry: any) => {
    setEditEntry(entry)
    setEditError(null)
    setEditForm({
      date: entry.date ? new Date(entry.date).toISOString().split('T')[0] : '',
      aircraft: entry.aircraft || '',
      routeFrom: entry.routeFrom || '',
      routeTo: entry.routeTo || '',
      totalTime: entry.totalTime?.toString() ?? '0',
      picTime: entry.picTime?.toString() ?? '0',
      sicTime: entry.sicTime?.toString() ?? '0',
      soloTime: entry.soloTime?.toString() ?? '0',
      dualGiven: entry.dualGiven?.toString() ?? '0',
      dualReceived: entry.dualReceived?.toString() ?? '0',
      nightTime: entry.nightTime?.toString() ?? '0',
      instrumentTime: entry.instrumentTime?.toString() ?? '0',
      simulatedInstrumentTime: entry.simulatedInstrumentTime?.toString() ?? '0',
      crossCountryTime: entry.crossCountryTime?.toString() ?? '0',
      dayLandings: entry.dayLandings?.toString() ?? '0',
      nightLandings: entry.nightLandings?.toString() ?? '0',
      authority: entry.authority || 'FAA',
      isPending: !!entry.isPending,
      isSimulator: !!entry.isSimulator,
      remarks: entry.remarks || '',
    })
    setEditDialogOpen(true)
  }

  const openHistoryDialog = async (entry: any) => {
    setHistoryEntry(entry)
    setHistoryItems([])
    setHistoryLoading(true)
    setHistoryDialogOpen(true)
    try {
      const res = await fetch(`/api/logbook/history?entryId=${entry.id}&limit=100`)
      const data = await res.json()
      setHistoryItems(data.history || [])
    } catch (err) {
      console.error('Failed to load history', err)
    } finally {
      setHistoryLoading(false)
    }
  }

  const exportAudit = async (format: 'csv' | 'pdf') => {
    if (!historyEntry) return
    setExportingAudit(true)
    try {
      const res = await fetch(`/api/logbook/history/export?entryId=${historyEntry.id}&format=${format}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `logbook_audit_${historyEntry.id}.${format}`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExportingAudit(false)
    }
  }

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    setEditForm((prev: any) => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }))
  }

  const handleEditSave = async () => {
    if (!editEntry || !editForm) return
    setSavingEdit(true)
    setEditError(null)
    try {
      const hoursTotal = [
        editForm.totalTime,
        editForm.picTime,
        editForm.sicTime,
        editForm.soloTime,
        editForm.dualGiven,
        editForm.dualReceived,
        editForm.nightTime,
        editForm.instrumentTime,
        editForm.simulatedInstrumentTime,
        editForm.crossCountryTime,
      ].reduce((sum, val) => sum + (parseFloat(val) || 0), 0)

      if (!editForm.isPending && hoursTotal <= 0) {
        setEditError('Enter at least one time value or mark as pending.')
        setSavingEdit(false)
        return
      }

      const payload = {
        id: editEntry.id,
        date: editForm.date,
        aircraft: editForm.aircraft,
        routeFrom: editForm.routeFrom,
        routeTo: editForm.routeTo,
        totalTime: parseFloat(editForm.totalTime) || 0,
        picTime: parseFloat(editForm.picTime) || 0,
        sicTime: parseFloat(editForm.sicTime) || 0,
        soloTime: parseFloat(editForm.soloTime) || 0,
        dualGiven: parseFloat(editForm.dualGiven) || 0,
        dualReceived: parseFloat(editForm.dualReceived) || 0,
        nightTime: parseFloat(editForm.nightTime) || 0,
        instrumentTime: parseFloat(editForm.instrumentTime) || 0,
        simulatedInstrumentTime: parseFloat(editForm.simulatedInstrumentTime) || 0,
        crossCountryTime: parseFloat(editForm.crossCountryTime) || 0,
        dayLandings: parseInt(editForm.dayLandings) || 0,
        nightLandings: parseInt(editForm.nightLandings) || 0,
        authority: editForm.authority,
        isPending: hoursTotal <= 0 ? true : !!editForm.isPending,
        isSimulator: !!editForm.isSimulator,
        remarks: editForm.remarks,
      }

      const res = await fetch('/api/logbook', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to update entry')
      }

      const updated = await res.json()
      const updatedEntry = updated.entry || payload
      setEntries(prev => prev.map(e => e.id === editEntry.id ? { ...e, ...updatedEntry } : e))
      setEditDialogOpen(false)
      setEditEntry(null)
      setEditForm(null)
    } catch (err: any) {
      setEditError(err.message || 'Failed to update entry')
    } finally {
      setSavingEdit(false)
    }
  }

  useEffect(() => {
    if (entriesData?.entries) {
      setEntries(entriesData.entries)
    }
  }, [entriesData])

  useEffect(() => {
    const q = airportQueryFrom.trim()
    if (q.length < 2) {
      setAirportResultsFrom([])
      return
    }
    const controller = new AbortController()
    setAirportLoadingFrom(true)
    fetch(`/api/airports?q=${encodeURIComponent(q)}&limit=8`, { signal: controller.signal })
      .then(r => r.json())
      .then(data => setAirportResultsFrom(data.airports || []))
      .catch(() => {})
      .finally(() => setAirportLoadingFrom(false))
    return () => controller.abort()
  }, [airportQueryFrom])

  useEffect(() => {
    const q = airportQueryTo.trim()
    if (q.length < 2) {
      setAirportResultsTo([])
      return
    }
    const controller = new AbortController()
    setAirportLoadingTo(true)
    fetch(`/api/airports?q=${encodeURIComponent(q)}&limit=8`, { signal: controller.signal })
      .then(r => r.json())
      .then(data => setAirportResultsTo(data.airports || []))
      .catch(() => {})
      .finally(() => setAirportLoadingTo(false))
    return () => controller.abort()
  }, [airportQueryTo])

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
                    {!entry.isVoided && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(entry)}
                        className="text-xs"
                      >
                        <Pencil className="w-3 h-3 mr-1" /> Edit
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openHistoryDialog(entry)}
                      className="text-xs"
                    >
                      <Search className="w-3 h-3 mr-1" /> Audit
                    </Button>
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

      {/* Edit Entry Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Edit Flight Entry</DialogTitle>
            <DialogDescription>
              Changes are recorded in the audit trail for compliance.
            </DialogDescription>
          </DialogHeader>

          {editError && (
            <div className="p-3 bg-destructive/10 border border-destructive rounded-lg text-destructive text-sm">
              {editError}
            </div>
          )}

          {editForm && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 py-2">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Aircraft</label>
                <input
                  name="aircraft"
                  value={editForm.aircraft}
                  onChange={handleEditChange}
                  className="w-full h-9 px-3 rounded-lg bg-secondary/60 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Date</label>
                <input
                  name="date"
                  type="date"
                  value={editForm.date}
                  onChange={handleEditChange}
                  className="w-full h-9 px-3 rounded-lg bg-secondary/60 border border-border text-foreground focus:outline-none focus:border-primary text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Authority</label>
                <select
                  name="authority"
                  value={editForm.authority}
                  onChange={handleEditChange}
                  className="w-full h-9 px-3 rounded-lg bg-secondary/60 border border-border text-foreground focus:outline-none focus:border-primary text-sm"
                >
                  <option value="FAA">FAA</option>
                  <option value="EASA">EASA</option>
                  <option value="BOTH">Both</option>
                </select>
              </div>
              <div className="relative">
                <label className="block text-xs font-medium text-muted-foreground mb-1">From</label>
                <input
                  name="routeFrom"
                  value={editForm.routeFrom}
                  onChange={(e) => {
                    handleEditChange(e)
                    setAirportQueryFrom(e.target.value)
                  }}
                  className="w-full h-9 px-3 rounded-lg bg-secondary/60 border border-border text-foreground focus:outline-none focus:border-primary text-sm"
                />
                {airportLoadingFrom && (
                  <div className="absolute right-2 top-2 text-xs text-muted-foreground">Loading...</div>
                )}
                {airportResultsFrom.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full bg-card border border-border rounded-lg shadow">
                    {airportResultsFrom.map((a) => (
                      <button
                        key={a.icao}
                        type="button"
                        onClick={() => {
                          setEditForm((prev: any) => ({ ...prev, routeFrom: a.icao }))
                          setAirportQueryFrom('')
                          setAirportResultsFrom([])
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-secondary/60 text-sm"
                      >
                        <div className="font-medium">{a.icao} {a.iata ? `(${a.iata})` : ''}</div>
                        <div className="text-xs text-muted-foreground">{a.name} — {a.city}, {a.state}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="relative">
                <label className="block text-xs font-medium text-muted-foreground mb-1">To</label>
                <input
                  name="routeTo"
                  value={editForm.routeTo}
                  onChange={(e) => {
                    handleEditChange(e)
                    setAirportQueryTo(e.target.value)
                  }}
                  className="w-full h-9 px-3 rounded-lg bg-secondary/60 border border-border text-foreground focus:outline-none focus:border-primary text-sm"
                />
                {airportLoadingTo && (
                  <div className="absolute right-2 top-2 text-xs text-muted-foreground">Loading...</div>
                )}
                {airportResultsTo.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full bg-card border border-border rounded-lg shadow">
                    {airportResultsTo.map((a) => (
                      <button
                        key={a.icao}
                        type="button"
                        onClick={() => {
                          setEditForm((prev: any) => ({ ...prev, routeTo: a.icao }))
                          setAirportQueryTo('')
                          setAirportResultsTo([])
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-secondary/60 text-sm"
                      >
                        <div className="font-medium">{a.icao} {a.iata ? `(${a.iata})` : ''}</div>
                        <div className="text-xs text-muted-foreground">{a.name} — {a.city}, {a.state}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Total Time</label>
                <input
                  name="totalTime"
                  type="number"
                  step="0.1"
                  value={editForm.totalTime}
                  onChange={handleEditChange}
                  className="w-full h-9 px-3 rounded-lg bg-secondary/60 border border-border text-foreground focus:outline-none focus:border-primary text-sm"
                />
              </div>

              {[
                { label: 'PIC', name: 'picTime' },
                { label: 'SIC', name: 'sicTime' },
                { label: 'Solo', name: 'soloTime' },
                { label: 'Dual Given', name: 'dualGiven' },
                { label: 'Dual Received', name: 'dualReceived' },
                { label: 'Night', name: 'nightTime' },
                { label: 'Instrument', name: 'instrumentTime' },
                { label: 'Simulated', name: 'simulatedInstrumentTime' },
                { label: 'X-Country', name: 'crossCountryTime' },
                { label: 'Day Landings', name: 'dayLandings', step: '1' },
                { label: 'Night Landings', name: 'nightLandings', step: '1' },
              ].map((f) => (
                <div key={f.name}>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">{f.label}</label>
                  <input
                    name={f.name}
                    type="number"
                    step={f.step || '0.1'}
                    value={editForm[f.name]}
                    onChange={handleEditChange}
                    className="w-full h-9 px-3 rounded-lg bg-secondary/60 border border-border text-foreground focus:outline-none focus:border-primary text-sm"
                  />
                </div>
              ))}

              <div className="md:col-span-3">
                <label className="block text-xs font-medium text-muted-foreground mb-1">Remarks</label>
                <textarea
                  name="remarks"
                  value={editForm.remarks}
                  onChange={handleEditChange}
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg bg-secondary/60 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary text-sm resize-none"
                />
              </div>

              <div className="md:col-span-3 flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="isPending" checked={editForm.isPending} onChange={handleEditChange} className="h-4 w-4" />
                  Mark as Pending
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="isSimulator" checked={editForm.isSimulator} onChange={handleEditChange} className="h-4 w-4" />
                  Simulator/FTD
                </label>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditSave} disabled={savingEdit}>
              {savingEdit ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Audit History Dialog */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Audit History</DialogTitle>
            <DialogDescription>
              All changes for this entry are recorded here.
            </DialogDescription>
          </DialogHeader>

          {historyLoading ? (
            <div className="py-6 text-center text-muted-foreground">Loading history...</div>
          ) : historyItems.length === 0 ? (
            <div className="py-6 text-center text-muted-foreground">No history found.</div>
          ) : (
            <div className="space-y-3 max-h-[60vh] overflow-y-auto">
              {historyItems.map((h: any) => (
                <div key={h.id} className="border border-border rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground uppercase">
                      {h.action}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(h.changedAt).toLocaleString()}
                    </span>
                  </div>
                  {h.fieldName && (
                    <div className="mt-2 text-sm">
                      <p className="text-muted-foreground">Field: {h.fieldName}</p>
                      <p className="text-xs text-muted-foreground mt-1">Old: {h.oldValue || '(empty)'}</p>
                      <p className="text-xs text-muted-foreground">New: {h.newValue || '(empty)'}</p>
                    </div>
                  )}
                  {h.reason && (
                    <p className="text-xs text-destructive mt-2">Reason: {h.reason}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoryDialogOpen(false)}>
              Close
            </Button>
            <Button variant="outline" onClick={() => exportAudit('csv')} disabled={exportingAudit}>
              Export CSV
            </Button>
            <Button onClick={() => exportAudit('pdf')} disabled={exportingAudit}>
              Export PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
