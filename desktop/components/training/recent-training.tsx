'use client'

import { Plane, Clock, MapPin } from 'lucide-react'
import { type LogbookEntry } from '@/desktop/data/training-data'

interface Props {
  entries: LogbookEntry[]
}

export default function RecentTrainingFlights({ entries }: Props) {
  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center">
        <Plane className="mx-auto h-6 w-6 text-muted-foreground/50" />
        <p className="mt-1 text-xs text-muted-foreground">No flights in your logbook yet.</p>
      </div>
    )
  }

  const last10 = entries.slice(0, 10)

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Recent Flights</h3>
        </div>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          Last {Math.min(entries.length, 10)} of {entries.length}
        </span>
      </div>

      <div className="divide-y divide-border/50">
        {last10.map((entry) => {
          const tags: string[] = []
          if (entry.soloTime && entry.soloTime > 0) tags.push('Solo')
          if (entry.dualGiven && entry.dualGiven > 0) tags.push('Dual Given')
          if (entry.dualReceived && entry.dualReceived > 0) tags.push('Dual Recv')
          if (entry.nightTime && entry.nightTime > 0) tags.push('Night')
          if (entry.instrumentTime && entry.instrumentTime > 0) tags.push('Instrument')
          if (entry.crossCountryTime && entry.crossCountryTime > 0) tags.push('XC')

          return (
            <div key={entry.id} className="flex items-center gap-3 px-4 py-2 text-xs hover:bg-muted/30 transition-colors">
              {/* Date */}
              <span className="w-16 shrink-0 tabular-nums text-muted-foreground">
                {fmtDate(entry.date)}
              </span>

              {/* Aircraft */}
              <span className="w-16 shrink-0 font-mono font-medium">
                {entry.aircraft || '\u2014'}
              </span>

              {/* Route */}
              <div className="flex items-center gap-1 min-w-0 flex-1">
                <MapPin className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                <span className="truncate text-muted-foreground">
                  {entry.routeFrom || '\u2014'} → {entry.routeTo || '\u2014'}
                </span>
              </div>

              {/* Hours */}
              <span className="w-14 shrink-0 text-right tabular-nums font-medium">
                {fmtH(entry.totalTime)}
              </span>

              {/* Tags */}
              <div className="hidden sm:flex w-32 shrink-0 flex-wrap gap-0.5 justify-end">
                {tags.slice(0, 2).map(tag => (
                  <span key={tag} className="rounded bg-muted px-1 py-0.5 text-[9px] text-muted-foreground">
                    {tag}
                  </span>
                ))}
                {tags.length > 2 && (
                  <span className="rounded bg-muted px-1 py-0.5 text-[9px] text-muted-foreground">
                    +{tags.length - 2}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch { return iso }
}

function fmtH(hours: number): string {
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ')
}
