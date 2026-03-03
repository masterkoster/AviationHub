'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { createLogbookEntry, fetchLogbookEntries } from '@/lib/logbook/api'

export default function NewFlightPage() {
  const router = useRouter()
  const [aircraft, setAircraft] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    aircraft: '',
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
    fetch('/api/aircraft')
      .then(r => r.json())
      .then(data => setAircraft(data || []))
      .catch(console.error)
  }, [])

  // Get unique aircraft from user's logbook entries
  useEffect(() => {
    fetchLogbookEntries(100)
      .then(data => {
        if (data.entries) {
          const uniqueAircraft = [...new Set(data.entries.map((e: any) => e.aircraft).filter(Boolean))]
          if (uniqueAircraft.length > 0) {
            // Merge with aircraft from API
            const aircraftSet = new Set([...aircraft.map((a: any) => a.tail_number || a.nNumber), ...uniqueAircraft])
            // Already have them from form, but this is for autocomplete
          }
        }
      })
      .catch(console.error)
  }, [aircraft])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    setForm(prev => {
      const updated = { ...prev, [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value }
      
      // Auto-calculate night time based on conditions
      if (name === 'totalTime' && value) {
        // Could add auto-fill logic here
      }
      return updated
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    
    try {
      const payload = {
        ...form,
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
          {/* Basic Info */}
          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="font-bold text-foreground mb-4">Flight Details</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {field('Aircraft', 'aircraft', 'text', 'N12345')}
              {field('Date', 'date', 'date', '')}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Authority</label>
                <select name="authority" value={form.authority} onChange={handleChange} className="w-full h-9 px-3 rounded-lg bg-secondary/60 border border-border text-foreground focus:outline-none focus:border-primary text-sm">
                  <option value="FAA">FAA</option>
                  <option value="EASA">EASA</option>
                  <option value="BOTH">Both</option>
                </select>
              </div>
              {field('From', 'routeFrom', 'text', 'KJFK')}
              {field('To', 'routeTo', 'text', 'KBOS')}
              {field('Total Time', 'totalTime', 'number', '1.5')}
            </div>
          </div>

          {/* Time Fields */}
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

          {/* Landings */}
          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="font-bold text-foreground mb-4">Landings & Approaches</h2>
            <div className="grid grid-cols-3 gap-4">
              {field('Day Landings', 'dayLandings', 'number', '1', '1')}
              {field('Night Landings', 'nightLandings', 'number', '0', '1')}
            </div>
          </div>

          {/* Options */}
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

          {/* Remarks */}
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
              {loading ? 'Saving...' : 'Log Flight'}
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
