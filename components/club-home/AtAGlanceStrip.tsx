'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Calendar, Wrench, Plane } from 'lucide-react'
import { aircraftLabel, formatDateTime } from './utils'

interface NextBookingLite {
  startTime: string
  endTime: string
  purpose: string | null
  aircraft: { nNumber: string | null; nickname?: string | null; customName?: string | null } | null
}

interface AtAGlanceStripProps {
  nextBooking: NextBookingLite | null
  openSquawkCount: number
  groundedCount: number
  fleetSize: number
  availableCount: number
}

export function AtAGlanceStrip({ nextBooking, openSquawkCount, groundedCount, fleetSize, availableCount }: AtAGlanceStripProps) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Your Next Flight</CardTitle>
          <Calendar className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {nextBooking ? (
            <>
              <div className="text-2xl font-bold">{aircraftLabel(nextBooking.aircraft)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {formatDateTime(nextBooking.startTime)}{nextBooking.purpose ? ` · ${nextBooking.purpose}` : ''}
              </p>
            </>
          ) : (
            <>
              <div className="text-2xl font-bold text-muted-foreground">—</div>
              <p className="text-xs text-muted-foreground mt-1">No upcoming bookings</p>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Open Squawks</CardTitle>
          <Wrench className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${openSquawkCount > 0 ? 'text-destructive' : ''}`}>{openSquawkCount}</div>
          <p className="text-xs text-muted-foreground mt-1">
            {groundedCount > 0 ? `${groundedCount} grounding` : 'None grounding aircraft'}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Fleet</CardTitle>
          <Plane className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{fleetSize}</div>
          <p className="text-xs text-muted-foreground mt-1">{availableCount} available now</p>
        </CardContent>
      </Card>
    </div>
  )
}
