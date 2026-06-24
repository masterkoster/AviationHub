'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { ArrowLeft, Loader2, Save, Trash2 } from 'lucide-react'

type Flight = {
  id: string
  date: string
  aircraft: string
  routeFrom: string
  routeTo: string
  totalTime: number
  picTime: number
  sicTime: number
  soloTime: number
  dualGiven: number
  dualReceived: number
  nightTime: number
  instrumentTime: number
  simulatedInstrumentTime: number
  crossCountryTime: number
  dayLandings: number
  nightLandings: number
  isSimulator: boolean
  remarks?: string | null
}

const TIME_FIELDS = [
  { key: 'picTime', label: 'PIC' },
  { key: 'sicTime', label: 'SIC' },
  { key: 'nightTime', label: 'Night' },
  { key: 'instrumentTime', label: 'Instrument' },
  { key: 'crossCountryTime', label: 'Cross-Country' },
  { key: 'soloTime', label: 'Solo' },
  { key: 'dualReceived', label: 'Dual Rec.' },
  { key: 'dualGiven', label: 'Dual Given' },
  { key: 'simulatedInstrumentTime', label: 'Sim. IFR' },
]

export default function FlightDetailPage() {
  const router = useRouter()
  const params = useParams()
  const { status } = useSession()
  const id = params.id as string

  const [flight, setFlight] = useState<Flight | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Editable fields
  const [date, setDate] = useState('')
  const [aircraft, setAircraft] = useState('')
  const [routeFrom, setRouteFrom] = useState('')
  const [routeTo, setRouteTo] = useState('')
  const [totalTime, setTotalTime] = useState('')
  const [dayLandings, setDayLandings] = useState('')
  const [nightLandings, setNightLandings] = useState('')
  const [isSimulator, setIsSimulator] = useState(false)
  const [remarks, setRemarks] = useState('')
  const [times, setTimes] = useState<Record<string, string>>({})

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/v1/login')
  }, [status, router])

  useEffect(() => {
    if (!id || status !== 'authenticated') return
    fetch(`/api/v1/logbook/${id}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) { router.push('/v1/logbook'); return }
        setFlight(data)
        setDate(data.date?.split('T')[0] || '')
        setAircraft(data.aircraft || '')
        setRouteFrom(data.routeFrom || '')
        setRouteTo(data.routeTo || '')
        setTotalTime(String(data.totalTime || ''))
        setDayLandings(String(data.dayLandings || ''))
        setNightLandings(String(data.nightLandings || ''))
        setIsSimulator(data.isSimulator || false)
        setRemarks(data.remarks || '')
        const t: Record<string, string> = {}
        for (const f of TIME_FIELDS) t[f.key] = String((data as any)[f.key] || '')
        setTimes(t)
      })
      .catch(() => router.push('/v1/logbook'))
      .finally(() => setLoading(false))
  }, [id, status, router])

  const handleSave = async () => {
    setSaving(true)
    setError('')
    const body: any = {
      date, aircraft, routeFrom, routeTo,
      totalTime: parseFloat(totalTime) || 0,
      dayLandings: parseInt(dayLandings) || 0,
      nightLandings: parseInt(nightLandings) || 0,
      isSimulator,
      remarks: remarks || undefined,
    }
    for (const [key, val] of Object.entries(times)) {
      body[key] = parseFloat(val as string) || 0
    }

    try {
      const res = await fetch(`/api/v1/logbook/${id}`, {
        method: 'PUT',
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

  if (status === 'loading' || loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!flight) return null

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-1.5 rounded-md hover:bg-muted transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold">Edit Flight</h1>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</div>
      )}

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Date">
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input" />
          </Field>
          <Field label="Aircraft">
            <input type="text" value={aircraft} onChange={e => setAircraft(e.target.value)} className="input" />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="From">
            <input type="text" value={routeFrom} onChange={e => setRouteFrom(e.target.value)} placeholder="ICAO" className="input" />
          </Field>
          <Field label="To">
            <input type="text" value={routeTo} onChange={e => setRouteTo(e.target.value)} placeholder="ICAO" className="input" />
          </Field>
        </div>

        <Field label="Total Time (hours)">
          <input type="number" step="0.1" min="0" value={totalTime} onChange={e => setTotalTime(e.target.value)} className="input" />
        </Field>

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Time Breakdown</p>
          <div className="grid grid-cols-3 gap-3">
            {TIME_FIELDS.map(f => (
              <Field key={f.key} label={f.label}>
                <input type="number" step="0.1" min="0" value={times[f.key] || ''}
                  onChange={e => setTimes(prev => ({ ...prev, [f.key]: e.target.value }))}
                  className="input" />
              </Field>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Day Landings">
            <input type="number" min="0" step="1" value={dayLandings} onChange={e => setDayLandings(e.target.value)} className="input" />
          </Field>
          <Field label="Night Landings">
            <input type="number" min="0" step="1" value={nightLandings} onChange={e => setNightLandings(e.target.value)} className="input" />
          </Field>
        </div>

        <div className="flex items-center gap-2">
          <input type="checkbox" id="sim" checked={isSimulator} onChange={e => setIsSimulator(e.target.checked)} className="h-4 w-4 rounded border-border" />
          <label htmlFor="sim" className="text-sm">Simulator / FTD</label>
        </div>

        <Field label="Remarks">
          <textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={3}
            className="input resize-none" />
        </Field>
      </div>

      <div className="flex gap-3 pt-2">
        <button onClick={() => router.back()}
          className="px-4 py-2.5 rounded-md border border-border text-sm font-medium hover:bg-muted transition-colors">
          Cancel
        </button>
        <button onClick={handleSave} disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          <Save className="h-4 w-4" />
          Save Changes
        </button>
      </div>

      <style jsx>{`
        .input {
          width: 100%;
          padding: 0.5rem 0.75rem;
          border-radius: 0.375rem;
          border: 1px solid var(--border);
          background: var(--background);
          font-size: 0.875rem;
          outline: none;
        }
        .input:focus {
          box-shadow: 0 0 0 2px var(--ring);
        }
      `}</style>
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
