'use client'

import { AlertTriangle, Clock3, Wrench } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { BlockOutItem, MaintenanceItemLite } from './types'
import { aircraftLabel, formatDate } from './utils'

interface ClubStatusBannerProps {
  blockOuts: BlockOutItem[]
  maintenance: MaintenanceItemLite[]
}

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000

export function ClubStatusBanner({ blockOuts, maintenance }: ClubStatusBannerProps) {
  const now = Date.now()

  const closures = blockOuts.filter(b => !b.clubAircraftId)
  const activeClosure = closures.find(b => new Date(b.startTime).getTime() <= now && new Date(b.endTime).getTime() >= now)
  const upcomingClosure = !activeClosure
    ? closures.find(b => {
        const start = new Date(b.startTime).getTime()
        return start > now && start <= now + FOURTEEN_DAYS_MS
      })
    : undefined

  // Aircraft currently unavailable: an active per-aircraft block-out, or an open grounding squawk.
  const activeAircraftBlockOuts = blockOuts.filter(
    b => b.clubAircraftId && new Date(b.startTime).getTime() <= now && new Date(b.endTime).getTime() >= now
  )
  const groundedItems = maintenance.filter(m => m.isGrounded && !m.resolvedDate)

  const unavailable = new Map<string, string>()
  for (const b of activeAircraftBlockOuts) {
    if (!b.clubAircraftId) continue
    unavailable.set(b.clubAircraftId, `${aircraftLabel(b.aircraft)} down for ${b.title} until ${formatDate(b.endTime)}`)
  }
  for (const m of groundedItems) {
    if (!m.aircraft) continue
    if (unavailable.has(m.aircraft.id)) continue
    unavailable.set(m.aircraft.id, `${aircraftLabel(m.aircraft)} grounded — ${m.description}`)
  }
  const unavailableList = Array.from(unavailable.values())

  if (!activeClosure && !upcomingClosure && unavailableList.length === 0) {
    return null
  }

  return (
    <div className="space-y-3">
      {activeClosure && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-destructive mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-destructive">
              Club closed: {activeClosure.title} until {formatDate(activeClosure.endTime)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Closed since {formatDate(activeClosure.startTime)}
            </p>
          </div>
        </div>
      )}

      {!activeClosure && upcomingClosure && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <Clock3 className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
              Upcoming closure: {upcomingClosure.title}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatDate(upcomingClosure.startTime)} – {formatDate(upcomingClosure.endTime)}
            </p>
          </div>
        </div>
      )}

      {unavailableList.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
          <Wrench className="h-5 w-5 shrink-0 text-muted-foreground mt-0.5" />
          <div className="space-y-1.5 flex-1">
            <p className="text-sm font-medium">Aircraft unavailable</p>
            <div className="flex flex-wrap gap-2">
              {unavailableList.map((text, idx) => (
                <Badge key={idx} variant="destructive" className="text-xs font-normal">{text}</Badge>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
