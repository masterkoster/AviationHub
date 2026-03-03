'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { createLogbookEntry, fetchLogbookEntries } from '@/lib/logbook/api'
import { Plane, Loader2 } from 'lucide-react'

export default function NewFlightPage() {
  const router = useRouter()
  const [myAircraft, setMyAircraft] = useState<any[]>([])
  const [recentAircraft, setRecentAircraft] = useState<string[]>([])
  const [selectedAircraft, setSelectedAircraft] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [fetchingAircraft, setFetchingAircraft] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [airportQueryFrom, setAirportQueryFrom] = useState('')
  const [airportQueryTo, setAirportQueryTo] = useState('')
  const [airportResultsFrom, setAirportResultsFrom] = useState<any[]>([])
  const [airportResultsTo, setAirportResultsTo] = useState<any[]>([])
  const [airportLoadingFrom, setAirportLoadingFrom] = useState(false)
  const [airportLoadingTo, setAirportLoadingTo] = useState(false)
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    aircraft: '',
    aircraftId: '',
    routeFrom: '',
    routeTo: '',
    totalTime: '',
    picTime: '',
    sicTime: '',
    soloTime: '',
    dualGiven: '',
    dualReceived: '',
    nightTime: '',
    instrumentTime: '',
    simulatedInstrumentTime: '',
    crossCountryTime: '',
    dayLandings: '0',
    nightLandings: '0',
    isDay: true,
    isNight: false,
    isSimulator: false,
    isPending: false,
    remarks: '',
    authority: 'FAA',
  })

  useEffect(() => {
    Promise.all([
      fetch('/api/logbook/aircraft').then(r => r.json()),
      fetchLogbookEntries(100).then(data => data.entries || [])
    ]).then(([aircraftData, entries]) => {
      setMyAircraft(aircraftData.aircraft || [])

      const uniqueAircraft = [...new Set(entries.map((e: any) => e.aircraft).filter(Boolean))]
      setRecentAircraft(uniqueAircraft.slice(0, 10))
    }).catch(console.error)
    .finally(() => setFetchingAircraft(false))
  }, [])

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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    setForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }))

    if (name === 'aircraft') {
      setSelectedAircraft(null)
      setForm(prev => ({ ...prev, aircraftId: '' }))
    }
  }

  const handleAircraftSelect = (value: string) => {
    if (!value) return
    if (value.startsWith('saved:')) {
      const id = value.replace('saved:', '')
      const ac = myAircraft.find((a: any) => a.id === id)
      if (ac) {
        setSelectedAircraft(ac)
        setForm(prev => ({
          ...prev,
          aircraft: ac.nNumber,
          aircraftId: ac.id,
        }))
      }
      return
    }
    if (value.startsWith('recent:')) {
      const n = value.replace('recent:', '')
      setSelectedAircraft(null)
      setForm(prev => ({ ...prev, aircraft: n, aircraftId: '' }))
      return
    }
    setSelectedAircraft(null)
    setForm(prev => ({ ...prev, aircraft: value, aircraftId: '' }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const hoursTotal = [
        form.totalTime,
        form.picTime,
        form.sicTime,
        form.soloTime,
        form.dualGiven,
        form.dualReceived,
        form.nightTime,
        form.instrumentTime,
        form.simulatedInstrumentTime,
        form.crossCountryTime,
      ].reduce((sum, val) => sum + (parseFloat(val) || 0), 0)

      if (!form.isPending && hoursTotal <= 0) {
        setError('Enter at least one time value or mark as pending.')
        setLoading(false)
        return
      }

      const payload = {
        ...form,
        aircraftId: form.aircraftId || undefined,
        totalTime: parseFloat(form.totalTime) || 0,
        picTime: parseFloat(form.picTime) || 0,
        sicTime: parseFloat(form.sicTime) || 0,
        soloTime: parseFloat(form.soloTime) || 0,
        dualGiven: parseFloat(form.dualGiven) || 0,
        dualReceived: parseFloat(form.dualReceived) || 0,
        nightTime: parseFloat(form.nightTime) || 0,
        instrumentTime: parseFloat(form.instrumentTime) || 0,
        simulatedInstrumentTime: parseFloat(form.simulatedInstrumentTime) || 0,
        crossCountryTime: parseFloat(form.crossCountryTime) || 0,
        dayLandings: parseInt(form.dayLandings) || 0,
        nightLandings: parseInt(form.nightLandings) || 0,
        isPending: hoursTotal <= 0 ? true : form.isPending,
      }

      await createLogbookEntry(payload)
      router.push('/logbook/flights')
    } catch (err: any) {
      setError(err.message || 'Failed to save entry')
    } finally {
      setLoading(false)
    }
  }

  const field = (label: string, name: string, type = 'text', placeholder = '', step = '0.1') => (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
      <input 
        name={name} 
        type={type} 
        step={type === 'number' ? step : undefined}
        value={(form as any)[name]} 
        onChange={handleChange} 
        placeholder={placeholder}
        className="w-full h-9 px-3 rounded-lg bg-secondary/60 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary text-sm" 
      />
    </div>
  )

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card/50 px-6 py-5">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Link href="/logbook" className="hover:text-foreground">Logbook</Link>
            <span>/</span>
            <Link href="/logbook/flights" className="hover:text-foreground">Flights</Link>
            <span>/</span>
            <span className="text-foreground">New</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Log Flight</h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {error && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive rounded-lg text-destructive text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="font-bold text-foreground mb-4">Flight Details</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Aircraft {myAircraft.length > 0 && <span className="text-primary">(Your aircraft in bold)</span>}
                </label>
                {fetchingAircraft ? (
                  <div className="w-full h-9 flex items-center justify-center text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading...
                  </div>
                ) : (
                  <div className="relative">
                    <select
                      name="aircraft"
                      value=""
                      onChange={(e) => handleAircraftSelect(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg bg-secondary/60 border border-border text-foreground focus:outline-none focus:border-primary text-sm appearance-none"
                    >
                      <option value="">Select saved aircraft...</option>
                      {myAircraft.length > 0 && (
                        <optgroup label="Your Aircraft">
                          {myAircraft.map((ac: any) => (
                            <option key={ac.id} value={`saved:${ac.id}`}>
                              {ac.nickname ? `${ac.nickname} (${ac.nNumber})` : ac.nNumber}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {recentAircraft.filter(n => !myAircraft.find(ac => ac.nNumber === n)).length > 0 && (
                        <optgroup label="Recent">
                          {recentAircraft
                            .filter(n => !myAircraft.find(ac => ac.nNumber === n))
                            .map(n => (
                              <option key={n} value={`recent:${n}`}>{n}</option>
                            ))}
                        </optgroup>
                      )}
                    </select>
                  </div>
                )}
                <input 
                  name="aircraft"
                  type="text"
                  value={form.aircraft}
                  onChange={handleChange}
                  placeholder="N12345 or custom"
                  className="w-full h-9 px-3 rounded-lg bg-secondary/60 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary text-sm mt-2" 
                />
                <p className="text-xs text-muted-foreground mt-1">
                  <Link href="/logbook/aircraft" className="text-primary hover:underline">
                    Manage your aircraft
                  </Link>
                </p>
              </div>
              {field('Date', 'date', 'date', '')}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Authority</label>
                <select name="authority" value={form.authority} onChange={handleChange} className="w-full h-9 px-3 rounded-lg bg-secondary/60 border border-border text-foreground focus:outline-none focus:border-primary text-sm">
                  <option value="FAA">FAA</option>
                  <option value="EASA">EASA</option>
                  <option value="BOTH">Both</option>
                </select>
              </div>
              <div className="relative">
                <label className="block text-xs font-medium text-muted-foreground mb-1">From</label>
                <input
                  name="routeFrom"
                  value={form.routeFrom}
                  onChange={(e) => {
                    handleChange(e)
                    setAirportQueryFrom(e.target.value)
                  }}
                  placeholder="KJFK"
                  className="w-full h-9 px-3 rounded-lg bg-secondary/60 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary text-sm"
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
                          setForm(prev => ({ ...prev, routeFrom: a.icao }))
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
                  value={form.routeTo}
                  onChange={(e) => {
                    handleChange(e)
                    setAirportQueryTo(e.target.value)
                  }}
                  placeholder="KBOS"
                  className="w-full h-9 px-3 rounded-lg bg-secondary/60 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary text-sm"
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
                          setForm(prev => ({ ...prev, routeTo: a.icao }))
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
              {field('Total Time', 'totalTime', 'number', '1.5')}
            </div>

            {selectedAircraft && (
              <div className="mt-4 p-4 rounded-lg bg-secondary/30 border border-border">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                  <Plane className="w-4 h-4 text-primary" />
                  Aircraft Details (auto-filled)
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                  {selectedAircraft.categoryClass && (
                    <div>
                      <p className="text-xs text-muted-foreground">Category/Class</p>
                      <p className="font-medium">{selectedAircraft.categoryClass}</p>
                    </div>
                  )}
                  {selectedAircraft.engineType && (
                    <div>
                      <p className="text-xs text-muted-foreground">Engine Type</p>
                      <p className="font-medium">{selectedAircraft.engineType}</p>
                    </div>
                  )}
                  {selectedAircraft.model && (
                    <div>
                      <p className="text-xs text-muted-foreground">Model</p>
                      <p className="font-medium">
                        {selectedAircraft.model.manufacturer} {selectedAircraft.model.model}
                      </p>
                    </div>
                  )}
                  {selectedAircraft.notes && (
                    <div className="md:col-span-3">
                      <p className="text-xs text-muted-foreground">Notes</p>
                      <p className="font-medium">{selectedAircraft.notes}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="font-bold text-foreground mb-4">Time Breakdown</h2>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
              {field('PIC', 'picTime')}
              {field('SIC', 'sicTime')}
              {field('Night', 'nightTime')}
              {field('Instrument', 'instrumentTime')}
              {field('Simulated', 'simulatedInstrumentTime')}
              {field('X-Country', 'crossCountryTime')}
              {field('Solo', 'soloTime')}
              {field('Dual Given', 'dualGiven')}
              {field('Dual Recv', 'dualReceived')}
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="font-bold text-foreground mb-4">Landings & Approaches</h2>
            <div className="grid grid-cols-3 gap-4">
              {field('Day Landings', 'dayLandings', 'number', '1', '1')}
              {field('Night Landings', 'nightLandings', 'number', '0', '1')}
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="font-bold text-foreground mb-4">Options</h2>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="isSimulator" checked={form.isSimulator} onChange={handleChange} className="h-4 w-4" />
                Simulator/FTD
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="isPending" checked={form.isPending} onChange={handleChange} className="h-4 w-4" />
                Mark as Pending
              </label>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="font-bold text-foreground mb-4">Remarks</h2>
            <textarea 
              name="remarks" 
              value={form.remarks} 
              onChange={handleChange} 
              rows={3} 
              placeholder="Flight remarks..." 
              className="w-full px-3 py-2 rounded-lg bg-secondary/60 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary text-sm resize-none" 
            />
          </div>

          <div className="flex gap-3">
            <Button type="submit" disabled={loading} className="bg-primary hover:bg-primary/90">
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Log Flight
            </Button>
            <Link href="/logbook/flights">
              <Button type="button" variant="outline">Cancel</Button>
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
