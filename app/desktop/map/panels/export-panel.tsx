'use client'

import { Download, ExternalLink, FileText } from 'lucide-react'
import type { Waypoint } from '../types'

interface ExportPanelProps {
  waypoints: Waypoint[]
  routeName: string
  onExport: (format: 'gpx' | 'fpl' | 'json') => void
  onFileFlightPlan: () => void
}

export function ExportPanel(props: ExportPanelProps) {
  const { waypoints, routeName, onExport, onFileFlightPlan } = props
  const hasRoute = waypoints.length >= 2

  return (
    <div className="space-y-4">
      {!hasRoute ? (
        <div className="rounded-md border border-dashed border-border bg-muted/20 p-6 text-center">
          <Download className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground">
            Add at least 2 waypoints to export your route.
          </p>
        </div>
      ) : (
        <>
          {/* Route summary */}
          <div className="rounded-md border border-border bg-muted/20 p-2.5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Route</p>
            <p className="mt-0.5 font-mono text-xs font-semibold">
              {waypoints.map((w) => w.icao).join(' → ')}
            </p>
            {routeName && (
              <p className="mt-0.5 text-[10px] text-muted-foreground">"{routeName}"</p>
            )}
          </div>

          {/* Export formats */}
          <div>
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Export Route
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {(['gpx', 'fpl', 'json'] as const).map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => onExport(fmt)}
                  className="flex flex-col items-center gap-1 rounded-md border border-border bg-card p-2.5 text-[10px] font-medium uppercase hover:bg-muted"
                >
                  <Download className="h-4 w-4 text-muted-foreground" />
                  {fmt}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              GPX works with Garmin and most GPS devices. FPL is for flight plan software. JSON is for backup/import.
            </p>
          </div>

          {/* Flight plan filing */}
          <div className="rounded-md border border-border bg-muted/20 p-2.5">
            <div className="flex items-start gap-2">
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <p className="text-xs font-semibold">File Flight Plan</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  Opens 1800wxbrief.com (free FAA service) with your route pre-filled in your default browser.
                </p>
                <button
                  onClick={onFileFlightPlan}
                  className="mt-2 flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <ExternalLink className="h-3 w-3" />
                  File on 1800wxbrief
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
