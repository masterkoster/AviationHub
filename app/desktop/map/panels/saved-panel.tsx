'use client'

import { FolderOpen, Copy, Trash2, Calendar, PlaneTakeoff } from 'lucide-react'
import type { StoredRoute } from '../types'

interface SavedPanelProps {
  savedRoutes: StoredRoute[]
  activeRouteId: string | null
  onOpenRoute: (route: StoredRoute) => void
  onDuplicateRoute: (route: StoredRoute) => void
  onDeleteRoute: (route: StoredRoute) => void
  onLogFlight: (route: StoredRoute) => void
}

export function SavedPanel(props: SavedPanelProps) {
  const { savedRoutes, activeRouteId, onOpenRoute, onDuplicateRoute, onDeleteRoute, onLogFlight } = props

  if (savedRoutes.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/20 p-6 text-center">
        <FolderOpen className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
        <p className="text-xs text-muted-foreground">
          No saved routes yet. Build a route and click Save to store it here.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {savedRoutes.map((route) => (
        <div
          key={route.id}
          className={`rounded-md border p-2.5 transition-colors ${
            activeRouteId === route.id
              ? 'border-primary/50 bg-primary/5'
              : 'border-border bg-card hover:bg-muted/50'
          }`}
        >
          <button
            onClick={() => onOpenRoute(route)}
            className="block w-full text-left"
          >
            <span className="block truncate text-xs font-semibold">{route.name}</span>
            <span className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
              <Calendar className="h-3 w-3" />
              {route.waypoints.length} wp · {new Date(route.updatedAt).toLocaleDateString()}
            </span>
            {route.waypoints.length > 0 && (
              <span className="mt-1 block truncate font-mono text-[10px] text-muted-foreground">
                {route.waypoints.map((w) => w.icao).join(' → ')}
              </span>
            )}
          </button>
          <div className="mt-2 flex items-center gap-1">
            <button
              onClick={() => onOpenRoute(route)}
              title="Open"
              className="flex items-center gap-1 rounded border border-border px-2 py-0.5 text-[10px] hover:bg-muted"
            >
              <FolderOpen className="h-3 w-3" /> Open
            </button>
            <button
              onClick={() => onDuplicateRoute(route)}
              title="Duplicate"
              className="rounded border border-border p-1 text-muted-foreground hover:bg-muted"
            >
              <Copy className="h-3 w-3" />
            </button>
            <button
              onClick={() => onDeleteRoute(route)}
              title="Delete"
              className="rounded border border-border p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
            </button>
            {route.waypoints.length >= 2 && (
              <button
                onClick={() => onLogFlight(route)}
                title="Log Flight"
                className="ml-auto inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-[10px] hover:bg-muted"
              >
                <PlaneTakeoff className="h-3 w-3" /> Log Flight
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
