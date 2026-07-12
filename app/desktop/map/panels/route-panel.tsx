'use client'

import { useRef, useState } from 'react'
import {
  Plus,
  X,
  GripVertical,
  Search,
  Download,
  Upload,
  Plane,
  Trash2,
  ArrowUp,
  ArrowDown,
  ArrowLeftRight,
  Repeat,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Waypoint, Airport } from '../types'

interface RoutePanelProps {
  waypoints: Waypoint[]
  airportSearch: string
  setAirportSearch: (v: string) => void
  airportResults: Airport[]
  onAddWaypoint: (a: Airport) => void
  onRemoveWaypoint: (icao: string) => void
  onClearWaypoints: () => void
  onReorder: (from: number, to: number) => void
  onOptimize: () => void
  onRoundTrip: () => void
  onExport: (format: 'gpx' | 'fpl' | 'json') => void
  onImportFile: (file: File) => void
  routeName: string
  setRouteName: (v: string) => void
  onSaveRoute: () => void
  onSaveFlightPlan: () => void
}

export function RoutePanel(props: RoutePanelProps) {
  const {
    waypoints,
    airportSearch,
    setAirportSearch,
    airportResults,
    onAddWaypoint,
    onRemoveWaypoint,
    onClearWaypoints,
    onReorder,
    onOptimize,
    onRoundTrip,
    onExport,
    onImportFile,
    routeName,
    setRouteName,
    onSaveRoute,
  } = props

  const [showAll, setShowAll] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(-1)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const dragIdxRef = useRef<number | null>(null)
  const importRef = useRef<HTMLInputElement>(null)

  function handleDragStart(e: React.DragEvent, idx: number) {
    e.dataTransfer.effectAllowed = 'move'
    dragIdxRef.current = idx
    setDragIndex(idx)
  }

  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIndex(idx)
  }

  function handleDrop(idx: number) {
    const from = dragIdxRef.current
    if (from !== null && from !== idx) {
      onReorder(from, idx)
    }
    dragIdxRef.current = null
    setDragIndex(null)
    setDragOverIndex(null)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && airportResults[highlightIdx >= 0 ? highlightIdx : 0]) {
      onAddWaypoint(airportResults[highlightIdx >= 0 ? highlightIdx : 0])
    } else if (e.key === 'ArrowDown' && airportResults.length > 0) {
      e.preventDefault()
      setHighlightIdx((i) => Math.min(i + 1, airportResults.length - 1))
    } else if (e.key === 'ArrowUp' && airportResults.length > 0) {
      e.preventDefault()
      setHighlightIdx((i) => Math.max(i - 1, 0))
    }
  }

  return (
    <div className="space-y-3">
      {/* Airport search */}
      <div>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={airportSearch}
            onChange={(e) => { setAirportSearch(e.target.value); setHighlightIdx(-1) }}
            onKeyDown={handleKeyDown}
            placeholder="Search airport (ICAO, name, city)..."
            className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-xs outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        {airportResults.length > 0 && (
          <ul className="mt-1 max-h-44 overflow-y-auto rounded-md border border-border bg-card">
            {airportResults.map((a, i) => (
              <li key={a.icao}>
                <button
                  onClick={() => onAddWaypoint(a)}
                  onMouseEnter={() => setHighlightIdx(i)}
                  className={cn(
                    'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-muted',
                    i === highlightIdx && 'bg-primary/10',
                  )}
                >
                  <span className="font-mono font-semibold">{a.icao}</span>
                  <span className="truncate text-muted-foreground">{a.name}</span>
                  <Plus className="ml-auto h-3 w-3 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Route name + save */}
      <div className="flex items-center gap-1.5">
        <input
          value={routeName}
          onChange={(e) => setRouteName(e.target.value)}
          placeholder="Route name"
          className="h-7 flex-1 rounded border border-input bg-background px-2 text-[11px] outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          onClick={onSaveRoute}
          disabled={waypoints.length < 2}
          className="inline-flex h-7 items-center gap-1 rounded border border-border bg-card px-2 text-[11px] hover:bg-muted disabled:opacity-50"
        >
          Save
        </button>
      </div>

      {/* Waypoint list */}
      {waypoints.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/20 p-6 text-center">
          <Plane className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground">
            No waypoints yet. Search above to start building a route.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Route ({waypoints.length})
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => importRef.current?.click()}
                title="Import route file"
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Upload className="h-3.5 w-3.5" />
              </button>
              {waypoints.length > 1 && (
                <button
                  onClick={() => onExport('gpx')}
                  title="Export GPX"
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
              )}
              {waypoints.length >= 3 && (
                <button
                  onClick={onOptimize}
                  title="Optimize route order (nearest neighbor)"
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                </button>
              )}
              {waypoints.length >= 2 && (
                <button
                  onClick={onRoundTrip}
                  title="Round trip — add first airport to end"
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Repeat className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                onClick={onClearWaypoints}
                title="Clear all waypoints"
                className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <input
            ref={importRef}
            type="file"
            accept=".gpx,.fpl,.json,.txt"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onImportFile(f)
              e.currentTarget.value = ''
            }}
          />

          <ol className="space-y-1">
            {(showAll ? waypoints : waypoints.slice(0, 8)).map((w, i) => (
              <li
                key={w.id}
                draggable
                onDragStart={(e) => handleDragStart(e, i)}
                onDragOver={(e) => handleDragOver(e, i)}
                onDrop={() => handleDrop(i)}
                onDragEnd={() => { dragIdxRef.current = null; setDragIndex(null); setDragOverIndex(null) }}
                className={cn(
                  'group flex items-center gap-2 rounded-md px-2 py-1.5',
                  dragIndex === i
                    ? 'bg-primary/20 ring-1 ring-primary/40'
                    : dragOverIndex === i
                    ? 'bg-primary/5 ring-1 ring-primary/20'
                    : 'bg-muted/40 hover:bg-muted/60',
                )}
              >
                <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground/50 active:cursor-grabbing" />
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-xs font-medium">{w.icao}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">{w.name}</span>
                </span>
                {waypoints.length > 1 && (
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => onReorder(i, Math.max(0, i - 1))}
                      disabled={i === 0}
                      className="rounded p-0.5 text-muted-foreground/60 hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed"
                      title="Move up"
                    >
                      <ArrowUp className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => onReorder(i, Math.min(waypoints.length - 1, i + 1))}
                      disabled={i === waypoints.length - 1}
                      className="rounded p-0.5 text-muted-foreground/60 hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed"
                      title="Move down"
                    >
                      <ArrowDown className="h-3 w-3" />
                    </button>
                  </div>
                )}
                <button
                  onClick={() => onRemoveWaypoint(w.icao)}
                  className="rounded p-0.5 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ol>

          {waypoints.length > 8 && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="w-full rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/50"
            >
              {showAll ? 'Show less' : `Show all (${waypoints.length})`}
            </button>
          )}

          {waypoints.length > 1 && (
            <div className="rounded-md border border-border bg-muted/30 p-2">
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Plane className="h-3 w-3" />
                {waypoints.map((w) => w.icao).join(' → ')}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {(['gpx', 'fpl', 'json'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => onExport(fmt)}
                    className="rounded border border-border bg-card px-2 py-0.5 text-[10px] uppercase hover:bg-muted"
                  >
                    {fmt}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
