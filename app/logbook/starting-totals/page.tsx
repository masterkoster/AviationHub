'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Clock, Loader2, Save } from 'lucide-react'

export default function StartingTotalsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    asOfDate: '',
    totalTime: '0',
    picTime: '0',
    sicTime: '0',
    nightTime: '0',
    instrumentTime: '0',
    crossCountryTime: '0',
    landingsDay: '0',
    landingsNight: '0',
  })

  useEffect(() => {
    fetch('/api/logbook/starting-totals')
      .then(r => r.json())
      .then(data => {
        if (data?.totals) {
          const t = data.totals
          setForm({
            asOfDate: t.asOfDate ? new Date(t.asOfDate).toISOString().split('T')[0] : '',
            totalTime: String(t.totalTime ?? 0),
            picTime: String(t.picTime ?? 0),
            sicTime: String(t.sicTime ?? 0),
            nightTime: String(t.nightTime ?? 0),
            instrumentTime: String(t.instrumentTime ?? 0),
            crossCountryTime: String(t.crossCountryTime ?? 0),
            landingsDay: String(t.landingsDay ?? 0),
            landingsNight: String(t.landingsNight ?? 0),
          })
        }
      })
      .catch(() => setError('Failed to load starting totals'))
      .finally(() => setLoading(false))
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const payload = {
        asOfDate: form.asOfDate || null,
        totalTime: parseFloat(form.totalTime) || 0,
        picTime: parseFloat(form.picTime) || 0,
        sicTime: parseFloat(form.sicTime) || 0,
        nightTime: parseFloat(form.nightTime) || 0,
        instrumentTime: parseFloat(form.instrumentTime) || 0,
        crossCountryTime: parseFloat(form.crossCountryTime) || 0,
        landingsDay: parseInt(form.landingsDay) || 0,
        landingsNight: parseInt(form.landingsNight) || 0,
      }

      const res = await fetch('/api/logbook/starting-totals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) throw new Error('Failed to save')
    } catch (e) {
      setError('Failed to save starting totals')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card/50 px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Starting Totals</h1>
            <p className="text-sm text-muted-foreground">Set baseline hours before logged flights</p>
          </div>
        </div>
      </div>
      <div className="px-6 py-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Baseline Totals
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-muted-foreground">Loading...</div>
            ) : (
              <div className="space-y-4">
                {error && <div className="text-sm text-destructive">{error}</div>}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">As of Date</label>
                  <input
                    type="date"
                    name="asOfDate"
                    value={form.asOfDate}
                    onChange={handleChange}
                    className="w-full h-9 px-3 rounded-lg bg-secondary/60 border border-border text-foreground focus:outline-none focus:border-primary text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'Total Time', name: 'totalTime' },
                    { label: 'PIC Time', name: 'picTime' },
                    { label: 'SIC Time', name: 'sicTime' },
                    { label: 'Night Time', name: 'nightTime' },
                    { label: 'Instrument', name: 'instrumentTime' },
                    { label: 'Cross Country', name: 'crossCountryTime' },
                    { label: 'Day Landings', name: 'landingsDay', step: '1' },
                    { label: 'Night Landings', name: 'landingsNight', step: '1' },
                  ].map((f) => (
                    <div key={f.name}>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">{f.label}</label>
                      <input
                        type="number"
                        step={f.step || '0.1'}
                        name={f.name}
                        value={(form as any)[f.name]}
                        onChange={handleChange}
                        className="w-full h-9 px-3 rounded-lg bg-secondary/60 border border-border text-foreground focus:outline-none focus:border-primary text-sm"
                      />
                    </div>
                  ))}
                </div>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                  Save Starting Totals
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
