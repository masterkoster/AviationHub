'use client'

import useSWR from 'swr'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BookOpen, Clock, Sunset, Gauge, MapPin, Sun, Moon, Plane } from 'lucide-react'

const fetcher = (url: string) => fetch(url).then(r => r.json())

export default function TotalsPage() {
  const { data, isLoading } = useSWR('/api/logbook?limit=5000&includeVoided=true', fetcher)

  const entries = data?.entries || []

  const totals = entries.reduce((acc: any, e: any) => ({
    totalTime: acc.totalTime + (parseFloat(e.totalTime) || 0),
    picTime: acc.picTime + (parseFloat(e.picTime) || 0),
    sicTime: acc.sicTime + (parseFloat(e.sicTime) || 0),
    soloTime: acc.soloTime + (parseFloat(e.soloTime) || 0),
    dualGiven: acc.dualGiven + (parseFloat(e.dualGiven) || 0),
    dualReceived: acc.dualReceived + (parseFloat(e.dualReceived) || 0),
    nightTime: acc.nightTime + (parseFloat(e.nightTime) || 0),
    instrumentTime: acc.instrumentTime + (parseFloat(e.instrumentTime) || 0),
    simulatedInstrumentTime: acc.simulatedInstrumentTime + (parseFloat(e.simulatedInstrumentTime) || 0),
    crossCountryTime: acc.crossCountryTime + (parseFloat(e.crossCountryTime) || 0),
    dayLandings: acc.dayLandings + (parseInt(e.dayLandings) || 0),
    nightLandings: acc.nightLandings + (parseInt(e.nightLandings) || 0),
    approaches: acc.approaches + (parseInt(e.approaches) || 0),
    holds: acc.holds + (parseInt(e.holds) || 0),
    intercepts: acc.intercepts + (parseInt(e.intercepts) || 0),
  }), {
    totalTime: 0, picTime: 0, sicTime: 0, soloTime: 0, 
    dualGiven: 0, dualReceived: 0, nightTime: 0, instrumentTime: 0,
    simulatedInstrumentTime: 0, crossCountryTime: 0, dayLandings: 0, 
    nightLandings: 0, approaches: 0, holds: 0, intercepts: 0
  })

  const formatHours = (val: number) => val.toFixed(1)
  const totalLandings = totals.dayLandings + totals.nightLandings

  const statCards = [
    { label: 'Total Time', value: formatHours(totals.totalTime), icon: Clock, color: 'text-blue-500' },
    { label: 'PIC Time', value: formatHours(totals.picTime), icon: Plane, color: 'text-green-500' },
    { label: 'SIC Time', value: formatHours(totals.sicTime), icon: Plane, color: 'text-purple-500' },
    { label: 'Solo Time', value: formatHours(totals.soloTime), icon: Plane, color: 'text-orange-500' },
    { label: 'Dual Received', value: formatHours(totals.dualReceived), icon: BookOpen, color: 'text-cyan-500' },
    { label: 'Dual Given', value: formatHours(totals.dualGiven), icon: BookOpen, color: 'text-indigo-500' },
    { label: 'Night Time', value: formatHours(totals.nightTime), icon: Moon, color: 'text-indigo-400' },
    { label: 'Instrument Time', value: formatHours(totals.instrumentTime), icon: Gauge, color: 'text-red-500' },
    { label: 'Simulated Instrument', value: formatHours(totals.simulatedInstrumentTime), icon: Gauge, color: 'text-pink-500' },
    { label: 'Cross Country', value: formatHours(totals.crossCountryTime), icon: MapPin, color: 'text-teal-500' },
  ]

  const landingStats = [
    { label: 'Day Landings', value: totals.dayLandings, icon: Sun },
    { label: 'Night Landings', value: totals.nightLandings, icon: Moon },
    { label: 'Total Landings', value: totalLandings, icon: Plane },
  ]

  const approachStats = [
    { label: 'Approaches', value: totals.approaches, icon: MapPin },
    { label: 'Holds', value: totals.holds, icon: Gauge },
    { label: 'Intercepts', value: totals.intercepts, icon: Gauge },
  ]

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card/50 px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Totals</h1>
            <p className="text-sm text-muted-foreground">
              {entries.length} total flight {entries.length === 1 ? 'entry' : 'entries'}
            </p>
          </div>
        </div>
      </div>
      
      <div className="px-6 py-6 space-y-6">
        {isLoading ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Loading flight data...
            </CardContent>
          </Card>
        ) : entries.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No flight entries found. Start logging flights to see your totals.
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Flight Time Totals */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Flight Time Totals
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                  {statCards.map(({ label, value, icon: Icon, color }) => (
                    <div key={label} className="bg-secondary/30 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Icon className={`w-4 h-4 ${color}`} />
                        <p className="text-xs text-muted-foreground">{label}</p>
                      </div>
                      <p className="text-2xl font-bold">{value}</p>
                      <p className="text-xs text-muted-foreground">hours</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Landings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plane className="w-5 h-5" />
                  Landings
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  {landingStats.map(({ label, value, icon: Icon }) => (
                    <div key={label} className="bg-secondary/30 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Icon className="w-4 h-4 text-amber-500" />
                        <p className="text-xs text-muted-foreground">{label}</p>
                      </div>
                      <p className="text-2xl font-bold">{value}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Approaches & Procedures */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="w-5 h-5" />
                  Approaches & Procedures
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  {approachStats.map(({ label, value, icon: Icon }) => (
                    <div key={label} className="bg-secondary/30 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Icon className="w-4 h-4 text-sky-500" />
                        <p className="text-xs text-muted-foreground">{label}</p>
                      </div>
                      <p className="text-2xl font-bold">{value}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
