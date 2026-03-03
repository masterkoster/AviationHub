'use client'

import useSWR from 'swr'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plane } from 'lucide-react'

const fetcher = (url: string) => fetch(url).then(r => r.json())

export default function PendingPage() {
  const { data, isLoading, mutate } = useSWR('/api/logbook?limit=500&includeVoided=true', fetcher)
  const entries = (data?.entries || []).filter((e: any) => e.isPending)

  const markComplete = async (id: string) => {
    await fetch('/api/logbook', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, isPending: false })
    })
    mutate()
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card/50 px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Pending Flights</h1>
            <p className="text-sm text-muted-foreground">Flights awaiting completion</p>
          </div>
        </div>
      </div>
      <div className="px-6 py-6">
        {isLoading ? (
          <Card><CardContent className="py-6 text-center text-muted-foreground">Loading...</CardContent></Card>
        ) : entries.length === 0 ? (
          <Card><CardContent className="py-6 text-center text-muted-foreground">No pending flights.</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {entries.map((e: any) => (
              <Card key={e.id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Plane className="w-4 h-4" /> {e.aircraft}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    {e.routeFrom} → {e.routeTo} • {new Date(e.date).toLocaleDateString()}
                  </div>
                  <Button size="sm" onClick={() => markComplete(e.id)}>Mark Complete</Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
