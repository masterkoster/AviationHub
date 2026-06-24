'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { ArrowLeft, Loader2, Search, Plus } from 'lucide-react'

type Aircraft = { id: string; nNumber: string; nickname?: string | null }
type Airport = { icao: string; name: string; city?: string; state?: string }

const FIELDS = [
  { key: 'picTime', label: 'PIC', step: '0.1' },
  { key: 'sicTime', label: 'SIC', step: '0.1' },
  { key: 'nightTime', label: 'Night', step: '0.1' },
  { key: 'instrumentTime', label: 'Instrument', step: '0.1' },
  { key: 'crossCountryTime', label: 'Cross-Country', step: '0.1' },
  { key: 'soloTime', label: 'Solo', step: '0.1' },
  { key: 'dualReceived', label: 'Dual Rec.', step: '0.1' },
  { key: 'dualGiven', label: 'Dual Given', step: '0.1' },
]

export default function NewFlightPage() {
  const router = useRouter()
  const { status } = useSession()

  // Form state
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [aircraft, setAircraft] = useState('')
  const [aircraftId, setAircraftId] = useState('')
  const [routeFrom, setRouteFrom] = useState('')
  const [routeTo, setRouteTo] = useState('')
  const [totalTime, setTotalTime] = useState('')
  const [dayLandings, setDayLandings] = useState('')
  const [nightLandings, setNightLandings] = useState('')
  const [isSimulator, setIsSimulator] = useState(false)
  const [remarks, setRemarks] = useState('')
  const [times, setTimes] = useState<Record<string, string>>({})

  // Lookup state
  const [aircraftList, setAircraftList] = useState<Aircraft[]>([])
  const [fromResults, setFromResults] = useState<Airport[]>([])
  const [toResults, setToResults] = useState<Airport[]>([])
  const [showFromDrop, setShowFromDrop] = useState(false)
  const [showToDrop, setShowToDrop] = useState(false)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/v1/login')
  }, [status, router])

  useEffect(() => {
    fetch('/api/v1/aircraft')
      .then(r => r.ok ? r.json() : [])
      .then(data => setAircraftList(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  const searchAirports = useCallback(async (q: string, setter: (a: Airport[]) => void) => {
    if (q.length < 2) { setter([]); return }
    try {
      const res = await fetch(`/api/v1/airports/search?q=${encodeURIComponent(q)}`)
      if (res.ok) setter(await res.json())
    } catch {}
  }, [])

  const setField = (key: string, val: string) => setTimes(prev => ({ ...prev, [key]: val }))

  const handleSave = async () => {
    if (!aircraft.trim()) { setError('Aircraft is required'); return }
    if (!totalTime || parseFloat(totalTime) <= 0) { setError('Total time must be greater than 0'); return }

    setSaving(true)
    setError('')

    const body: any = {
      date,
      aircraft: aircraft.trim(),
      aircraftId: aircraftId || undefined,
      routeFrom: routeFrom.toUpperCase() || '',
      routeTo: routeTo.toUpperCase() || '',
      totalTime: parseFloat(totalTime) || 0,
      dayLandings: parseInt(dayLandings) || 0,
      nightLandings: parseInt(nightLandings) || 0,
      isSimulator,
      remarks: remarks || undefined,
    }

    for (const [key, val] of Object.entries(times)) {
      if (val) body[key] = parseFloat(val) || 0
    }

    try {
      const res = await fetch('/api/v1/logbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to save')
        return
      }

      router.push('/v1/logbook')
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-1.5 rounded-md hover:bg-muted transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold">Log Flight</h1>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</div>
      )}

      <div className="space-y-4">
        {/* Date + Aircraft */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Date">
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
          </Field>
          <Field label="Aircraft">
            <input type="text" value={aircraft} placeholder="N-number"
              onChange={e => { setAircraft(e.target.value); setAircraftId('') }}
              list="aircraft-list" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
            <datalist id="aircraft-list">
              {aircraftList.map(a => (
                <option key={a.id} value={a.nNumber}>
                  {a.nickname ? `${a.nNumber} (${a.nickname})` : a.nNumber}
                </option>
              ))}
            </datalist>
          </Field>
        </div>

        {/* Route */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="From">
            <div className="relative">
              <input type="text" value={routeFrom} placeholder="ICAO (e.g. KDTW)"
                onChange={e => { setRouteFrom(e.target.value); searchAirports(e.target.value, setFromResults); setShowFromDrop(true) }}
                onBlur={() => setTimeout(() => setShowFromDrop(false), 200)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
              {showFromDrop && fromResults.length > 0 && (
                <AirportDropdown airports={fromResults} onSelect={(a) => { setRouteFrom(a.icao); setShowFromDrop(false) }} />
              )}
            </div>
          </Field>
          <Field label="To">
            <div className="relative">
              <input type="text" value={routeTo} placeholder="ICAO (e.g. KLAX)"
                onChange={e => { setRouteTo(e.target.value); searchAirports(e.target.value, setToResults); setShowToDrop(true) }}
                onBlur={() => setTimeout(() => setShowToDrop(false), 200)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
              {showToDrop && toResults.length > 0 && (
                <AirportDropdown airports={toResults} onSelect={(a) => { setRouteTo(a.icao); setShowToDrop(false) }} />
              )}
            </div>
          </Field>
        </div>

        {/* Total Time */}
        <Field label="Total Time (hours)">
          <input type="number" step="0.1" min="0" value={totalTime} placeholder="0.0"
            onChange={e => setTotalTime(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </Field>

        {/* Time Breakdown */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Time Breakdown (optional)</p>
          <div className="grid grid-cols-4 gap-3">
            {FIELDS.map(f => (
              <Field key={f.key} label={f.label}>
                <input type="number" step={f.step} min="0" value={times[f.key] || ''}
                  placeholder="0.0" onChange={e => setField(f.key, e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
              </Field>
            ))}
          </div>
        </div>

        {/* Landings */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Day Landings">
            <input type="number" min="0" step="1" value={dayLandings} placeholder="0"
              onChange={e => setDayLandings(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
          </Field>
          <Field label="Night Landings">
            <input type="number" min="0" step="1" value={nightLandings} placeholder="0"
              onChange={e => setNightLandings(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
          </Field>
        </div>

        {/* Simulator + Remarks */}
        <div className="flex items-center gap-2">
          <input type="checkbox" id="sim" checked={isSimulator}
            onChange={e => setIsSimulator(e.target.checked)}
            className="h-4 w-4 rounded border-border" />
          <label htmlFor="sim" className="text-sm">Simulator / FTD</label>
        </div>

        <Field label="Remarks">
          <textarea value={remarks} placeholder="Notes about this flight..."
            onChange={e => setRemarks(e.target.value)} rows={3}
            className="field-input resize-none" />
        </Field>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button onClick={() => router.back()}
          className="px-4 py-2.5 rounded-md border border-border text-sm font-medium hover:bg-muted transition-colors">
          Cancel
        </button>
        <button onClick={handleSave} disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save Flight
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
      {children}
    </div>
  )
}

function AirportDropdown({ airports, onSelect }: { airports: Airport[]; onSelect: (a: Airport) => void }) {
  return (
    <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-card shadow-lg max-h-48 overflow-y-auto">
      {airports.map(a => (
        <button key={a.icao} onMouseDown={() => onSelect(a)}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-left transition-colors">
          <span className="font-mono font-medium">{a.icao}</span>
          <span className="text-muted-foreground truncate">{a.name}</span>
        </button>
      ))}
    </div>
  )
}
