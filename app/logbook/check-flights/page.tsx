'use client'

import useSWR from 'swr'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle, CheckCircle2, XCircle } from 'lucide-react'

const fetcher = (url: string) => fetch(url).then(r => r.json())

export default function CheckFlightsPage() {
  const { data, isLoading } = useSWR('/api/logbook?limit=1000&includeVoided=true', fetcher)
  const entries = data?.entries || []

  const issues = entries.flatMap((e: any) => {
    const list: string[] = []
    if (!e.isPending) {
      const hoursTotal = [
        e.totalTime, e.picTime, e.sicTime, e.soloTime,
        e.dualGiven, e.dualReceived, e.nightTime,
        e.instrumentTime, e.simulatedInstrumentTime,
        e.crossCountryTime
      ].reduce((sum: number, v: any) => sum + (parseFloat(v) || 0), 0)
      if (hoursTotal <= 0) list.push('No time values for completed flight')
    }
    if (!e.aircraft) list.push('Missing aircraft')
    if (!e.routeFrom || !e.routeTo) list.push('Missing route')
    if (!e.date) list.push('Missing date')
    return list.map((message) => ({ id: e.id, message, entry: e }))
  })

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card/50 px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Check Flights</h1>
            <p className="text-sm text-muted-foreground">Validate flight entries</p>
          </div>
        </div>
      </div>
      <div className="px-6 py-6 space-y-4">
        {isLoading ? (
          <Card><CardContent className="py-6 text-center text-muted-foreground">Loading...</CardContent></Card>
        ) : issues.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center">
              <CheckCircle2 className="w-6 h-6 mx-auto text-green-500 mb-2" />
              <p className="text-sm">All flights look good.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                Issues Found ({issues.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {issues.map((i: any, idx: number) => (
                <div key={`${i.id}-${idx}`} className="flex items-start gap-2 text-sm">
                  <XCircle className="w-4 h-4 text-destructive mt-0.5" />
                  <div>
                    <p className="font-medium">{i.message}</p>
                    <p className="text-xs text-muted-foreground">
                      {i.entry.aircraft || 'Aircraft'} • {i.entry.routeFrom || '—'} → {i.entry.routeTo || '—'} • {i.entry.date ? new Date(i.entry.date).toLocaleDateString() : 'No date'}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
