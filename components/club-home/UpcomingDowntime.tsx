'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CalendarOff, Settings } from 'lucide-react'
import type { BlockOutItem } from './types'
import { aircraftLabel, formatDate } from './utils'

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

interface UpcomingDowntimeProps {
  blockOuts: BlockOutItem[]
  loading: boolean
  error: string | null
  canManage: boolean
}

export function UpcomingDowntime({ blockOuts, loading, error, canManage }: UpcomingDowntimeProps) {
  const now = Date.now()
  const cutoff = now + THIRTY_DAYS_MS
  const upcoming = blockOuts
    .filter(b => new Date(b.startTime).getTime() <= cutoff)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarOff className="h-4 w-4 text-muted-foreground" />
            <CardTitle>Upcoming Downtime</CardTitle>
          </div>
          {canManage && (
            <Link href="/flying-club/admin">
              <Button size="sm" variant="outline">
                <Settings className="mr-2 h-4 w-4" />
                Manage
              </Button>
            </Link>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!loading && !error && upcoming.length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing on the books for the next 30 days.</p>
        )}
        <div className="space-y-2">
          {upcoming.map(b => {
            const active = new Date(b.startTime).getTime() <= now && new Date(b.endTime).getTime() >= now
            return (
              <div key={b.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium truncate">{b.title}</p>
                    <Badge variant={b.clubAircraftId ? 'outline' : 'secondary'} className="text-xs">
                      {b.clubAircraftId ? aircraftLabel(b.aircraft) : 'Whole club'}
                    </Badge>
                    {active && <Badge variant="destructive" className="text-xs">Active</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(b.startTime)} – {formatDate(b.endTime)}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
