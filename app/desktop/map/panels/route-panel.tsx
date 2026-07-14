'use client'

import { useMemo, useRef, useState } from 'react'
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
  Route,
  Clock,
  Ruler,
  Compass,
  ChevronDown,
  ChevronUp,
  FileDown,
  PlaneTakeoff,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Waypoint, Airport } from '../types'

// ─── Navigation helpers ───────────────────────────────────────────────────────

function haversineNm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 3440.065 // Earth radius in nautical miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function trueHeading(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const y = Math.sin(dLon) * Math.cos((lat2 * Math.PI) / 180)
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.cos(dLon)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h === 0) return `${m}m`
  return `${h}h ${m.toString().padStart(2, '0')}m`
}

function formatTimeHrsMin(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
  const m = Math.round(totalMinutes % 60)
  return `${h}:${m.toString().padStart(2, '0')}`
}

function compassCardinal(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return dirs[Math.round(deg / 45) % 8]
}

// ─── Types ────────────────────────────────────────────────────────────────────

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
  onSaveAs?: () => void
  onSaveFlightPlan: () => void
  onLogFlight?: () => void
  isExistingRoute?: boolean
}

// ─── Component ────────────────────────────────────────────────────────────────

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
    onSaveAs,
    onSaveFlightPlan,
    onLogFlight,
    isExistingRoute,
  } = props

  const [showAll, setShowAll] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(-1)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [expandedLeg, setExpandedLeg] = useState<number | null>(null)
  const dragIdxRef = useRef<number | null>(null)
  const importRef = useRef<HTMLInputElement>(null)

  // ── Per-leg calculations ──────────────────────────────────────────────────

  const legs = useMemo(() => {
    if (waypoints.length < 2) return []
    const result: Array<{
      from: Waypoint
      to: Waypoint
      distance: number
      heading: number
      time: number
    }> = []
    for (let i = 0; i < waypoints.length - 1; i++) {
      const from = waypoints[i]
      const to = waypoints[i + 1]
      const distance = haversineNm(from.latitude, from.longitude, to.latitude, to.longitude)
      const heading = trueHeading(from.latitude, from.longitude, to.latitude, to.longitude)
      const time = (distance / 120) * 60 // minutes at 120kt
      result.push({ from, to, distance, heading, time })
    }
    return result
  }, [waypoints])

  const totalDistance = useMemo(
    () => legs.reduce((sum, l) => sum + l.distance, 0),
    [legs],
  )

  const totalTime = useMemo(
    () => legs.reduce((sum, l) => sum + l.time, 0),
    [legs],
  )

  // ── Drag-and-drop handlers ────────────────────────────────────────────────

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

  const displayWaypoints = showAll ? waypoints : waypoints.slice(0, 8)

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-3">

      {/* ── Airport search ──────────────────────────────────────────────── */}
      <section>
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Add Waypoint
        </label>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={airportSearch}
            onChange={(e) => {
              setAirportSearch(e.target.value)
              setHighlightIdx(-1)
            }}
            onKeyDown={handleKeyDown}
            placeholder="ICAO, name, or city…"
            className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-3 text-xs outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-ring focus:ring-1 focus:ring-ring/30"
          />
        </div>

        {airportResults.length > 0 && (
          <ul className="mt-1 max-h-40 overflow-y-auto rounded-md border border-border bg-popover shadow-md">
            {airportResults.map((a, i) => (
              <li key={a.icao}>
                <button
                  onClick={() => onAddWaypoint(a)}
                  onMouseEnter={() => setHighlightIdx(i)}
                  className={cn(
                    'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent/50',
                    i === highlightIdx && 'bg-accent text-accent-foreground',
                  )}
                >
                  <span className="font-mono text-[11px] font-semibold">{a.icao}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {a.name}
                  </span>
                  {a.city && (
                    <span className="shrink-0 text-[10px] text-muted-foreground/60">
                      {a.city}
                    </span>
                  )}
                  <Plus className="ml-1 h-3 w-3 shrink-0 text-muted-foreground/50" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Route name + save ───────────────────────────────────────────── */}
      <section className="flex items-center gap-1.5">
        <input
          value={routeName}
          onChange={(e) => setRouteName(e.target.value)}
          placeholder="Route name"
          className="h-7 flex-1 rounded-md border border-border bg-background px-2.5 text-[11px] outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-ring focus:ring-1 focus:ring-ring/30"
        />
        <button
          onClick={onSaveRoute}
          disabled={waypoints.length < 2}
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-[11px] font-medium transition-colors hover:bg-accent/50 disabled:opacity-40 disabled:pointer-events-none"
        >
          {isExistingRoute ? 'Update' : 'Save'}
        </button>
        {isExistingRoute && onSaveAs && (
          <button
            onClick={onSaveAs}
            disabled={waypoints.length < 2}
            title="Save as new route"
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-[11px] font-medium transition-colors hover:bg-accent/50 disabled:opacity-40 disabled:pointer-events-none"
          >
            Save As
          </button>
        )}
        <button
          onClick={onSaveFlightPlan}
          disabled={waypoints.length < 2}
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-[11px] font-medium transition-colors hover:bg-accent/50 disabled:opacity-40 disabled:pointer-events-none"
          title="Save as FAA Flight Plan"
        >
          FPL
        </button>
        {onLogFlight && waypoints.length >= 2 && (
          <button
            onClick={onLogFlight}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-[11px] font-medium transition-colors hover:bg-accent/50"
            title="Log Flight"
          >
            <PlaneTakeoff className="h-3.5 w-3.5 -rotate-45" />
          </button>
        )}
      </section>

      {/* ── Waypoint list ───────────────────────────────────────────────── */}
      {waypoints.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 bg-muted/10 py-10 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted/30">
            <Plane className="h-5 w-5 text-muted-foreground/40" />
          </div>
          <p className="text-xs font-medium text-muted-foreground">No waypoints yet</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground/60">
            Search above to start building a route
          </p>
        </div>
      ) : (
        <>
          {/* ── Stats bar ─────────────────────────────────────────────── */}
          {waypoints.length >= 2 && (
            <div className="flex items-stretch gap-2 rounded-lg border border-border bg-card p-2.5">
              <div className="flex flex-1 items-center gap-2 rounded-md bg-primary/5 px-2.5 py-1.5">
                <Ruler className="h-3.5 w-3.5 text-primary/70" />
                <div className="min-w-0">
                  <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Distance
                  </div>
                  <div className="font-mono text-sm font-semibold text-foreground">
                    {totalDistance.toFixed(1)}{' '}
                    <span className="text-[10px] font-normal text-muted-foreground">nm</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-1 items-center gap-2 rounded-md bg-primary/5 px-2.5 py-1.5">
                <Clock className="h-3.5 w-3.5 text-primary/70" />
                <div className="min-w-0">
                  <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    ETA
                  </div>
                  <div className="font-mono text-sm font-semibold text-foreground">
                    {formatTimeHrsMin(totalTime)}{' '}
                    <span className="text-[10px] font-normal text-muted-foreground">hr</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-1 items-center gap-2 rounded-md bg-primary/5 px-2.5 py-1.5">
                <Route className="h-3.5 w-3.5 text-primary/70" />
                <div className="min-w-0">
                  <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Legs
                  </div>
                  <div className="font-mono text-sm font-semibold text-foreground">
                    {legs.length}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Toolbar ──────────────────────────────────────────────── */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Waypoints · {waypoints.length}
            </span>
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => importRef.current?.click()}
                title="Import route"
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Upload className="h-3.5 w-3.5" />
              </button>
              {waypoints.length > 1 && (
                <button
                  onClick={() => onExport('gpx')}
                  title="Export GPX"
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
              )}
              {waypoints.length >= 3 && (
                <button
                  onClick={onOptimize}
                  title="Optimize route order"
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                </button>
              )}
              {waypoints.length >= 2 && (
                <button
                  onClick={onRoundTrip}
                  title="Round trip"
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Repeat className="h-3.5 w-3.5" />
                </button>
              )}
              <div className="mx-0.5 h-3 w-px bg-border" />
              <button
                onClick={onClearWaypoints}
                title="Clear all"
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
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

          {/* ── Waypoint + leg rows ──────────────────────────────────── */}
          <ol className="space-y-0">
            {displayWaypoints.map((w, i) => {
              const isLast = i === displayWaypoints.length - 1
              const leg = legs[i]
              const isExpanded = expandedLeg === i

              return (
                <li key={w.id} className="relative">
                  {/* ── Waypoint card ──────────────────────────────── */}
                  <div
                    draggable
                    onDragStart={(e) => handleDragStart(e, i)}
                    onDragOver={(e) => handleDragOver(e, i)}
                    onDrop={() => handleDrop(i)}
                    onDragEnd={() => {
                      dragIdxRef.current = null
                      setDragIndex(null)
                      setDragOverIndex(null)
                    }}
                    className={cn(
                      'group relative flex items-center gap-2 rounded-lg border px-2.5 py-2 transition-all duration-150',
                      dragIndex === i
                        ? 'border-primary/40 bg-primary/10 shadow-sm'
                        : dragOverIndex === i
                        ? 'border-primary/20 bg-primary/5'
                        : 'border-border/50 bg-card hover:border-border hover:bg-accent/20',
                    )}
                  >
                    {/* Drag handle */}
                    <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground/30 transition-colors group-hover:text-muted-foreground/60 active:cursor-grabbing" />

                    {/* Number badge */}
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 font-mono text-[10px] font-bold text-primary ring-1 ring-primary/10">
                      {i + 1}
                    </span>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-mono text-xs font-semibold tracking-tight">
                          {w.icao}
                        </span>
                        {w.name && w.name !== w.icao && (
                          <span className="min-w-0 truncate text-[10px] text-muted-foreground/70">
                            {w.name}
                          </span>
                        )}
                      </div>
                      {w.latitude !== undefined && (
                        <div className="mt-0.5 font-mono text-[9px] text-muted-foreground/40">
                          {w.latitude.toFixed(4)}° {w.longitude.toFixed(4)}°
                        </div>
                      )}
                    </div>

                    {/* Move buttons */}
                    {waypoints.length > 1 && (
                      <div className="flex flex-col items-center gap-px shrink-0">
                        <button
                          onClick={() => onReorder(i, Math.max(0, i - 1))}
                          disabled={i === 0}
                          className="rounded p-0.5 text-muted-foreground/60 hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed"
                          title="Move up"
                        >
                          <ArrowUp className="h-2.5 w-2.5" />
                        </button>
                        <button
                          onClick={() => onReorder(i, Math.min(waypoints.length - 1, i + 1))}
                          disabled={i === waypoints.length - 1}
                          className="rounded p-0.5 text-muted-foreground/60 hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed"
                          title="Move down"
                        >
                          <ArrowDown className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    )}

                    {/* Remove */}
                    <button
                      onClick={() => onRemoveWaypoint(w.icao)}
                      className="rounded p-0.5 text-muted-foreground/30 opacity-0 transition-all hover:text-destructive group-hover:opacity-100"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* ── Leg connector row ────────────────────────────── */}
                  {!isLast && leg && (
                    <div className="relative ml-5 flex items-center py-0.5">
                      {/* Vertical connecting line */}
                      <div className="absolute left-2.5 top-0 bottom-0 w-px bg-border/60" />

                      {/* Leg info button */}
                      <button
                        onClick={() => setExpandedLeg(isExpanded ? null : i)}
                        className="relative z-10 ml-1 flex items-center gap-1.5 rounded-md border border-border/40 bg-background px-2 py-1 text-[9px] transition-colors hover:border-border hover:bg-muted/30 max-w-full overflow-hidden"
                      >
                        <Compass className="h-2.5 w-2.5 shrink-0 text-muted-foreground/50" />
                        <span className="font-mono font-medium text-foreground/70 shrink-0">
                          {leg.heading.toFixed(0)}°{compassCardinal(leg.heading)}
                        </span>
                        <span className="text-muted-foreground/30 shrink-0">·</span>
                        <span className="font-mono font-medium text-foreground/70 shrink-0">
                          {leg.distance.toFixed(1)}nm
                        </span>
                        <span className="text-muted-foreground/30 shrink-0">·</span>
                        <span className="font-mono font-medium text-foreground/70 shrink-0">
                          {formatTime(leg.time)}
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="h-2.5 w-2.5 shrink-0 text-muted-foreground/40" />
                        ) : (
                          <ChevronDown className="h-2.5 w-2.5 shrink-0 text-muted-foreground/40" />
                        )}
                      </button>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div className="relative z-10 ml-2 flex items-center gap-2 flex-wrap rounded-md bg-muted/40 px-2 py-1 text-[9px]">
                          <span className="text-muted-foreground/50">{leg.from.icao}</span>
                          <span className="text-muted-foreground/30">→</span>
                          <span className="text-muted-foreground/50">{leg.to.icao}</span>
                          <span className="text-muted-foreground/30">·</span>
                          <span className="text-muted-foreground/50">120kt</span>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ol>

          {/* ── Show more / less ────────────────────────────────────── */}
          {waypoints.length > 8 && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="flex w-full items-center justify-center gap-1 rounded-md border border-border/40 bg-muted/10 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted/30"
            >
              {showAll ? (
                <>
                  <ChevronUp className="h-3 w-3" />
                  Show less
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3" />
                  Show all ({waypoints.length})
                </>
              )}
            </button>
          )}

          {/* ── Export bar ──────────────────────────────────────────── */}
          {waypoints.length > 1 && (
            <div className="rounded-lg border border-border bg-card p-2.5">
              <div className="mb-2 flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
                <Plane className="h-3 w-3 -rotate-45" />
                <span className="truncate">
                  {waypoints.map((w) => w.icao).join(' → ')}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {(['gpx', 'fpl', 'json'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => onExport(fmt)}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[10px] font-medium uppercase tracking-wide transition-colors hover:bg-muted"
                  >
                    <FileDown className="h-2.5 w-2.5" />
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
