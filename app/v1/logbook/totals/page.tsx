'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { ArrowLeft, Loader2, BarChart3 } from 'lucide-react'

type Totals = {
  totalTime: number
  picTime: number
  sicTime: number
  soloTime: number
  nightTime: number
  instrumentTime: number
  simulatedInstrumentTime: number
  crossCountryTime: number
  dualGiven: number
  dualReceived: number
  dayLandings: number
  nightLandings: number
  approaches: number
  holds: number
  totalFlights: number
}

const SECTIONS = [
  {
    title: 'Flight Time',
    items: [
      { key: 'totalTime', label: 'Total Time' },
      { key: 'picTime', label: 'PIC' },
      { key: 'sicTime', label: 'SIC' },
      { key: 'soloTime', label: 'Solo' },
    ],
  },
  {
    title: 'Conditions',
    items: [
      { key: 'nightTime', label: 'Night' },
      { key: 'instrumentTime', label: 'Instrument' },
      { key: 'simulatedInstrumentTime', label: 'Simulated IFR' },
      { key: 'crossCountryTime', label: 'Cross-Country' },
    ],
  },
  {
    title: 'Training',
    items: [
      { key: 'dualReceived', label: 'Dual Received' },
      { key: 'dualGiven', label: 'Dual Given' },
    ],
  },
  {
    title: 'Landings & Other',
    items: [
      { key: 'dayLandings', label: 'Day Landings', isInt: true },
      { key: 'nightLandings', label: 'Night Landings', isInt: true },
      { key: 'approaches', label: 'Approaches', isInt: true },
      { key: 'holds', label: 'Holds', isInt: true },
    ],
  },
]

export default function TotalsPage() {
  const router = useRouter()
  const { status } = useSession()
  const [totals, setTotals] = useState<Totals | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/v1/login')
  }, [status, router])

  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/v1/totals')
      .then(r => r.ok ? r.json() : null)
      .then(data => setTotals(data?.totals || null))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [status])

  if (status === 'loading' || loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-1.5 rounded-md hover:bg-muted transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Totals
          </h1>
          <p className="text-sm text-muted-foreground">{totals?.totalFlights || 0} flights logged</p>
        </div>
      </div>

      {!totals || totals.totalFlights === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">No flights logged yet. Add your first flight to see totals.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {SECTIONS.map(section => (
            <div key={section.title} className="rounded-lg border border-border bg-card p-4">
              <h2 className="text-sm font-semibold mb-3">{section.title}</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {section.items.map(item => {
                  const val = (totals as any)[item.key] || 0
                  return (
                    <div key={item.key} className="rounded-md bg-muted/50 px-3 py-2">
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                      <p className="text-lg font-bold mt-0.5">
                        {'isInt' in item && item.isInt ? val : val.toFixed(1)}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
