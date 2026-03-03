'use client'

import useSWR from 'swr'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingUp, Calendar, Plane, Clock, MapPin, BarChart3 } from 'lucide-react'
import { useMemo } from 'react'

const fetcher = (url: string) => fetch(url).then(r => r.json())

export default function AnalysisPage() {
  const { data, isLoading } = useSWR('/api/logbook?limit=5000&includeVoided=true', fetcher)

  const entries = data?.entries || []

  const stats = useMemo(() => {
    // Monthly breakdown
    const monthly: Record<string, { flights: number; hours: number }> = {}
    // Year breakdown
    const yearly: Record<string, { flights: number; hours: number }> = {}
    // Aircraft breakdown
    const byAircraft: Record<string, { flights: number; hours: number }> = {}
    // Route breakdown
    const routes: Record<string, number> = {}

    entries.forEach((e: any) => {
      const date = new Date(e.date)
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      const yearKey = String(date.getFullYear())
      const hours = parseFloat(e.totalTime) || 0

      // Monthly
      if (!monthly[monthKey]) monthly[monthKey] = { flights: 0, hours: 0 }
      monthly[monthKey].flights++
      monthly[monthKey].hours += hours

      // Yearly
      if (!yearly[yearKey]) yearly[yearKey] = { flights: 0, hours: 0 }
      yearly[yearKey].flights++
      yearly[yearKey].hours += hours

      // Aircraft
      if (e.aircraft) {
        if (!byAircraft[e.aircraft]) byAircraft[e.aircraft] = { flights: 0, hours: 0 }
        byAircraft[e.aircraft].flights++
        byAircraft[e.aircraft].hours += hours
      }

      // Routes
      const route = `${e.routeFrom} → ${e.routeTo}`
      routes[route] = (routes[route] || 0) + 1
    })

    // Get top aircraft
    const topAircraft = Object.entries(byAircraft)
      .sort((a, b) => b[1].hours - a[1].hours)
      .slice(0, 5)

    // Get top routes
    const topRoutes = Object.entries(routes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)

    // Get recent months (last 6)
    const sortedMonths = Object.keys(monthly).sort().slice(-6)

    // Total stats
    const totalFlights = entries.length
    const totalHours = entries.reduce((acc: number, e: any) => acc + (parseFloat(e.totalTime) || 0), 0)
    const avgFlightLength = totalFlights > 0 ? totalHours / totalFlights : 0

    // Days since first flight
    const validDates = entries
      .map((e: any) => new Date(e.date))
      .filter((d: any) => d instanceof Date && !isNaN(d.getTime()))
      .sort((a: Date, b: Date) => a.getTime() - b.getTime())
    const firstFlight = validDates[0]
    const lastFlight = validDates[validDates.length - 1]
    const daysActive = firstFlight ? Math.ceil((new Date().getTime() - firstFlight.getTime()) / (1000 * 60 * 60 * 24)) : 0

    return {
      monthly,
      yearly,
      topAircraft,
      topRoutes,
      sortedMonths,
      totalFlights,
      totalHours,
      avgFlightLength,
      daysActive,
      firstFlight: firstFlight?.toLocaleDateString() || 'N/A',
      lastFlight: lastFlight?.toLocaleDateString() || 'N/A'
    }
  }, [entries])

  const formatHours = (val: number) => val.toFixed(1)

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card/50 px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Analysis</h1>
            <p className="text-sm text-muted-foreground">Flight data analytics and trends</p>
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
              No flight entries found. Start logging flights to see analytics.
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Overview Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                      <Plane className="w-5 h-5 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{stats.totalFlights}</p>
                      <p className="text-xs text-muted-foreground">Total Flights</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                      <Clock className="w-5 h-5 text-green-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{formatHours(stats.totalHours)}</p>
                      <p className="text-xs text-muted-foreground">Total Hours</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                      <TrendingUp className="w-5 h-5 text-purple-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{formatHours(stats.avgFlightLength)}</p>
                      <p className="text-xs text-muted-foreground">Avg Flight</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                      <Calendar className="w-5 h-5 text-amber-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{stats.daysActive}</p>
                      <p className="text-xs text-muted-foreground">Days Active</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* First/Last Flight */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  Flight History
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-secondary/30 rounded-lg p-4">
                    <p className="text-xs text-muted-foreground">First Flight</p>
                    <p className="text-lg font-semibold">{stats.firstFlight}</p>
                  </div>
                  <div className="bg-secondary/30 rounded-lg p-4">
                    <p className="text-xs text-muted-foreground">Last Flight</p>
                    <p className="text-lg font-semibold">{stats.lastFlight}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Top Aircraft */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Plane className="w-5 h-5" />
                    Top Aircraft
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {stats.topAircraft.map(([aircraft, data]: [string, any], i: number) => (
                    <div key={aircraft} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold">
                          {i + 1}
                        </span>
                        <span className="font-medium">{aircraft}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-semibold">{formatHours(data.hours)} hrs</span>
                        <span className="text-xs text-muted-foreground ml-2">({data.flights} flights)</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Top Routes */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="w-5 h-5" />
                    Top Routes
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {stats.topRoutes.map(([route, count]: [string, any], i: number) => (
                    <div key={route} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold">
                          {i + 1}
                        </span>
                        <span className="font-medium text-sm">{route}</span>
                      </div>
                      <span className="text-sm text-muted-foreground">{count} flights</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* Recent Monthly Activity */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  Recent Monthly Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-2 h-32">
                  {stats.sortedMonths.map((month: string) => {
                    const data = stats.monthly[month]
                    const maxHours = Math.max(...stats.sortedMonths.map((m: string) => stats.monthly[m].hours), 1)
                    const height = (data.hours / maxHours) * 100
                    return (
                      <div key={month} className="flex-1 flex flex-col items-center gap-2">
                        <div 
                          className="w-full bg-primary rounded-t transition-all"
                          style={{ height: `${Math.max(height, 4)}%` }}
                          title={`${data.flights} flights, ${formatHours(data.hours)} hours`}
                        />
                        <span className="text-xs text-muted-foreground">{month}</span>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
