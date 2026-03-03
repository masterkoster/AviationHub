'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Plane, AlertTriangle, BookOpen, Clock, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { fetchLogbookEntries, fetchStartingTotals } from '@/lib/logbook/api'

const fetcher = (url: string) => fetch(url).then(r => r.json())

export default function LogbookDashboard() {
  const { data: entriesData, isLoading: loadingEntries } = useSWR(
    '/api/logbook?limit=100',
    fetcher,
    { refreshInterval: 30000 }
  )
  const { data: aircraft } = useSWR('/api/aircraft', fetcher)
  
  const [entries, setEntries] = useState<any[]>([])
  const [startingTotals, setStartingTotals] = useState<any>(null)

  useEffect(() => {
    if (entriesData?.entries) {
      setEntries(entriesData.entries)
    }
  }, [entriesData])

  useEffect(() => {
    fetchStartingTotals().then(data => {
      if (data?.totals) setStartingTotals(data.totals)
    }).catch(console.error)
  }, [])

  const totalFlights = entries?.length || 0
  const totalTime = entries?.reduce((acc: number, e: any) => acc + (parseFloat(e.totalTime) || 0), 0) || 0
  const startingTime = startingTotals?.totalTime || 0
  const grandTotal = totalTime + startingTime

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card/50 px-6 py-5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Logbook</h1>
            <p className="text-sm text-muted-foreground">Flight records overview</p>
          </div>
          <Link href="/logbook/flights/new">
            <Button className="bg-primary hover:bg-primary/90 gap-2">
              <Plane className="w-4 h-4" /> Log Flight
            </Button>
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Aircraft', value: aircraft?.length ?? '—', icon: Plane },
            { label: 'Total Flights', value: totalFlights, icon: BookOpen },
            { label: 'Flight Hours', value: grandTotal.toFixed(1), icon: Clock },
            { label: 'Logged Hours', value: totalTime.toFixed(1), icon: Clock },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-muted-foreground">{label}</span>
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <div className="text-3xl font-bold text-primary">{value}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Flights */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="font-bold text-foreground">Recent Flights</h2>
              <Link href="/logbook/flights" className="text-xs text-primary hover:underline">View all</Link>
            </div>
            <div className="divide-y divide-border">
              {loadingEntries ? (
                <div className="px-5 py-8 text-center text-muted-foreground text-sm">Loading...</div>
              ) : entries.length === 0 ? (
                <div className="px-5 py-8 text-center text-muted-foreground text-sm">No flights logged yet</div>
              ) : entries.slice(0, 5).map((entry: any) => (
                <Link key={entry.id} href={`/logbook/flights?id=${entry.id}`} className="flex items-center justify-between px-5 py-4 hover:bg-secondary/40 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Plane className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-bold text-foreground">{entry.aircraft}</p>
                      <p className="text-xs text-muted-foreground">{entry.routeFrom} → {entry.routeTo}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-foreground">{(entry.totalTime || 0).toFixed(1)} hrs</p>
                    <p className="text-xs text-muted-foreground">{new Date(entry.date).toLocaleDateString()}</p>
                  </div>
                </Link>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-border">
              <Link href="/logbook/flights/new" className="text-xs text-primary hover:underline">+ Log a flight</Link>
            </div>
          </div>

          {/* Quick Links */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="font-bold text-foreground">Quick Links</h2>
            </div>
            <div className="divide-y divide-border">
              {[
                { href: '/logbook/totals', label: 'View Totals' },
                { href: '/logbook/currency', label: 'Check Currency' },
                { href: '/logbook/download', label: 'Export Data' },
                { href: '/logbook/flights', label: 'Search Flights' },
              ].map(({ href, label }) => (
                <Link key={href} href={href} className="flex items-center justify-between px-5 py-4 hover:bg-secondary/40 transition-colors">
                  <span className="text-sm font-medium text-foreground">{label}</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
