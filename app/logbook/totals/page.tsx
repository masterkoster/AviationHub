'use client'

import useSWR from 'swr'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { BookOpen, Clock, Sunset, Gauge, MapPin, Sun, Moon, Plane, HelpCircle } from 'lucide-react'

const fetcher = (url: string) => fetch(url).then(r => r.json())

export default function TotalsPage() {
  const { data, isLoading } = useSWR('/api/logbook?limit=5000&includeVoided=true', fetcher)
  const { data: startingData } = useSWR('/api/logbook/starting-totals', fetcher)

  const entries = data?.entries || []
  const starting = startingData?.totals

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
  const startingTotals = starting ? {
    totalTime: starting.totalTime || 0,
    picTime: starting.picTime || 0,
    sicTime: starting.sicTime || 0,
    nightTime: starting.nightTime || 0,
    instrumentTime: starting.instrumentTime || 0,
    crossCountryTime: starting.crossCountryTime || 0,
    dayLandings: starting.landingsDay || 0,
    nightLandings: starting.landingsNight || 0,
  } : null

  const combinedTotals = startingTotals ? {
    totalTime: totals.totalTime + startingTotals.totalTime,
    picTime: totals.picTime + startingTotals.picTime,
    sicTime: totals.sicTime + startingTotals.sicTime,
    soloTime: totals.soloTime,
    dualGiven: totals.dualGiven,
    dualReceived: totals.dualReceived,
    nightTime: totals.nightTime + startingTotals.nightTime,
    instrumentTime: totals.instrumentTime + startingTotals.instrumentTime,
    simulatedInstrumentTime: totals.simulatedInstrumentTime,
    crossCountryTime: totals.crossCountryTime + startingTotals.crossCountryTime,
    dayLandings: totals.dayLandings + startingTotals.dayLandings,
    nightLandings: totals.nightLandings + startingTotals.nightLandings,
    approaches: totals.approaches,
    holds: totals.holds,
    intercepts: totals.intercepts,
  } : totals

  const totalLandings = combinedTotals.dayLandings + combinedTotals.nightLandings

  const statCards = [
    { label: 'Total Time', value: formatHours(combinedTotals.totalTime), icon: Clock, color: 'text-blue-500', description: 'Total flight time across all flights' },
    { label: 'PIC Time', value: formatHours(combinedTotals.picTime), icon: Plane, color: 'text-green-500', description: 'Pilot in Command - time serving as the pilot in command' },
    { label: 'SIC Time', value: formatHours(combinedTotals.sicTime), icon: Plane, color: 'text-purple-500', description: 'Second in Command - time serving as co-pilot' },
    { label: 'Solo Time', value: formatHours(totals.soloTime), icon: Plane, color: 'text-orange-500', description: 'Time flown as pilot-in-command without an instructor on board' },
    { label: 'Dual Received', value: formatHours(totals.dualReceived), icon: BookOpen, color: 'text-cyan-500', description: 'Time received from an instructor (training)' },
    { label: 'Dual Given', value: formatHours(totals.dualGiven), icon: BookOpen, color: 'text-indigo-500', description: 'Time given as flight instructor' },
    { label: 'Night Time', value: formatHours(combinedTotals.nightTime), icon: Moon, color: 'text-indigo-400', description: 'Flight time during darkness (after sunset to sunrise)' },
    { label: 'Instrument Time', value: formatHours(combinedTotals.instrumentTime), icon: Gauge, color: 'text-red-500', description: 'Actual instrument flight time in IMC' },
    { label: 'Simulated Instrument', value: formatHours(totals.simulatedInstrumentTime), icon: Gauge, color: 'text-pink-500', description: 'Simulated instrument time (hood/charts) while with a safety pilot' },
    { label: 'Cross Country', value: formatHours(combinedTotals.crossCountryTime), icon: MapPin, color: 'text-teal-500', description: 'Flight over 50nm from origin, including point-to-point' },
  ]

  const landingStats = [
    { label: 'Day Landings', value: combinedTotals.dayLandings, icon: Sun, description: 'Landings performed during daylight hours' },
    { label: 'Night Landings', value: combinedTotals.nightLandings, icon: Moon, description: 'Landings performed during darkness' },
    { label: 'Total Landings', value: totalLandings, icon: Plane, description: 'Combined day and night landings' },
  ]

  const approachStats = [
    { label: 'Approaches', value: totals.approaches, icon: MapPin, description: 'Instrument approaches completed' },
    { label: 'Holds', value: totals.holds, icon: Gauge, description: 'Holding procedures performed' },
    { label: 'Intercepts', value: totals.intercepts, icon: Gauge, description: 'Localizer/GS intercepts performed' },
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
        ) : entries.length === 0 && !startingTotals ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No flight entries found. Start logging flights to see your totals.
            </CardContent>
          </Card>
        ) : (
          <>
            {startingTotals && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    Starting Totals
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-secondary/30 rounded-lg p-4">
                      <p className="text-xs text-muted-foreground">Total Time</p>
                      <p className="text-lg font-semibold">{formatHours(startingTotals.totalTime)} hrs</p>
                    </div>
                    <div className="bg-secondary/30 rounded-lg p-4">
                      <p className="text-xs text-muted-foreground">PIC</p>
                      <p className="text-lg font-semibold">{formatHours(startingTotals.picTime)} hrs</p>
                    </div>
                    <div className="bg-secondary/30 rounded-lg p-4">
                      <p className="text-xs text-muted-foreground">Night</p>
                      <p className="text-lg font-semibold">{formatHours(startingTotals.nightTime)} hrs</p>
                    </div>
                    <div className="bg-secondary/30 rounded-lg p-4">
                      <p className="text-xs text-muted-foreground">Instrument</p>
                      <p className="text-lg font-semibold">{formatHours(startingTotals.instrumentTime)} hrs</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
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
                  {statCards.map(({ label, value, icon: Icon, color, description }) => (
                    <Tooltip key={label}>
                      <TooltipTrigger asChild>
                        <div className="bg-secondary/30 rounded-lg p-4 cursor-help">
                          <div className="flex items-center gap-2 mb-2">
                            <Icon className={`w-4 h-4 ${color}`} />
                            <p className="text-xs text-muted-foreground">{label}</p>
                            <HelpCircle className="w-3 h-3 text-muted-foreground/50" />
                          </div>
                          <p className="text-2xl font-bold">{value}</p>
                          <p className="text-xs text-muted-foreground">hours</p>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{description}</p>
                      </TooltipContent>
                    </Tooltip>
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
                  {landingStats.map(({ label, value, icon: Icon, description }) => (
                    <Tooltip key={label}>
                      <TooltipTrigger asChild>
                        <div className="bg-secondary/30 rounded-lg p-4 cursor-help">
                          <div className="flex items-center gap-2 mb-2">
                            <Icon className="w-4 h-4 text-amber-500" />
                            <p className="text-xs text-muted-foreground">{label}</p>
                            <HelpCircle className="w-3 h-3 text-muted-foreground/50" />
                          </div>
                          <p className="text-2xl font-bold">{value}</p>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{description}</p>
                      </TooltipContent>
                    </Tooltip>
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
                  {approachStats.map(({ label, value, icon: Icon, description }) => (
                    <Tooltip key={label}>
                      <TooltipTrigger asChild>
                        <div className="bg-secondary/30 rounded-lg p-4 cursor-help">
                          <div className="flex items-center gap-2 mb-2">
                            <Icon className="w-4 h-4 text-sky-500" />
                            <p className="text-xs text-muted-foreground">{label}</p>
                            <HelpCircle className="w-3 h-3 text-muted-foreground/50" />
                          </div>
                          <p className="text-2xl font-bold">{value}</p>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{description}</p>
                      </TooltipContent>
                    </Tooltip>
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

function formatHours(val: number): string {
  return val.toFixed(1)
}
