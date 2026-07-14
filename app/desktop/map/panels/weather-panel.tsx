'use client'

import {
  Loader2,
  RefreshCw,
  AlertTriangle,
  CloudSun,
  CheckCircle2,
  Thermometer,
  Droplets,
  Wind,
  Eye,
  Gauge,
  Cloud,
  ChevronDown,
  ChevronRight,
  Clock,
} from 'lucide-react'
import { useState } from 'react'
import type { Waypoint, AirportWeather, RouteWeatherSummary } from '../types'

interface WeatherPanelProps {
  waypoints: Waypoint[]
  weatherData: Record<string, AirportWeather | null>
  routeWeather: RouteWeatherSummary | null
  weatherLoading: boolean
  weatherError: string
  onRefresh: () => void
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function flightCategoryStyles(category: string) {
  switch (category) {
    case 'VFR':
      return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
    case 'MVFR':
      return 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
    case 'IFR':
      return 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
    case 'LIFR':
      return 'bg-destructive/10 text-destructive'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

function ceilFromCategory(category?: string): string {
  switch (category) {
    case 'VFR':
      return '> 3,000 ft'
    case 'MVFR':
      return '1,000 – 3,000 ft'
    case 'IFR':
      return '500 – 999 ft'
    case 'LIFR':
      return '< 500 ft'
    default:
      return '—'
  }
}

function formatWind(dir?: number, speed?: number, gust?: number): string {
  if (dir == null && speed == null) return '—'
  const dirStr = dir != null ? `${String(dir).padStart(3, '0')}°` : 'VRB'
  const speedStr = speed != null ? `${speed}` : '0'
  const gustStr = gust != null ? `G${gust}` : ''
  return `${dirStr} @ ${speedStr}${gustStr} kt`
}

function formatTime(iso?: string): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                             */
/* -------------------------------------------------------------------------- */

function MetarGrid({ metar }: { metar: NonNullable<AirportWeather['metar']> }) {
  const cells: Array<{
    icon: React.ReactNode
    label: string
    value: string
  }> = [
    {
      icon: <Thermometer className="h-3 w-3" />,
      label: 'Temp',
      value: metar.tempC != null ? `${metar.tempC}°C` : '—',
    },
    {
      icon: <Droplets className="h-3 w-3" />,
      label: 'Dewpoint',
      value: metar.dewpointC != null ? `${metar.dewpointC}°C` : '—',
    },
    {
      icon: <Wind className="h-3 w-3" />,
      label: 'Wind',
      value: formatWind(metar.windDirKts, metar.windSpeedKts, metar.windGustKts),
    },
    {
      icon: <Eye className="h-3 w-3" />,
      label: 'Visibility',
      value: metar.visibilitySm != null ? `${metar.visibilitySm} SM` : '—',
    },
    {
      icon: <Gauge className="h-3 w-3" />,
      label: 'Altimeter',
      value: metar.altHg != null ? `${metar.altHg.toFixed(2)} inHg` : '—',
    },
    {
      icon: <Cloud className="h-3 w-3" />,
      label: 'Ceiling',
      value: ceilFromCategory(metar.flightCategory),
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
      {cells.map((cell) => (
        <div key={cell.label} className="flex items-start gap-1.5">
          <span className="mt-px text-muted-foreground">{cell.icon}</span>
          <div className="min-w-0">
            <div className="text-[9px] uppercase tracking-wide text-muted-foreground">
              {cell.label}
            </div>
            <div className="truncate font-mono text-[11px] font-medium">{cell.value}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

function CollapsibleRaw({
  label,
  content,
  icon,
}: {
  label: string
  content: string
  icon?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <details open={open} className="group">
      <summary
        className="flex cursor-pointer select-none items-center gap-1.5 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
        onClick={(e) => {
          e.preventDefault()
          setOpen((v) => !v)
        }}
      >
        {open ? (
          <ChevronDown className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0" />
        )}
        {icon}
        {label}
      </summary>
      <div className="mt-1 whitespace-pre-wrap break-all rounded bg-muted/40 p-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
        {content}
      </div>
    </details>
  )
}

/* -------------------------------------------------------------------------- */
/*  Main component                                                             */
/* -------------------------------------------------------------------------- */

export function WeatherPanel(props: WeatherPanelProps) {
  const {
    waypoints,
    weatherData,
    routeWeather,
    weatherLoading,
    weatherError,
    onRefresh,
  } = props

  return (
    <div className="space-y-3">
      {/* ---- Refresh bar ---- */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Route Weather
        </span>
        <button
          onClick={onRefresh}
          disabled={weatherLoading || waypoints.length === 0}
          className="flex items-center gap-1 rounded border border-border bg-card px-2 py-1 text-[11px] hover:bg-muted disabled:opacity-50"
        >
          {weatherLoading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          Refresh
        </button>
      </div>

      {/* ---- Error ---- */}
      {weatherError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-[11px] text-destructive">
          {weatherError}
        </div>
      )}

      {/* ---- Route weather summary ---- */}
      {routeWeather && (
        <div className="rounded-md border border-border bg-muted/20 p-2.5">
          <div className="flex items-center gap-2">
            {routeWeather.significant ? (
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            )}
            <span className="text-xs font-semibold">
              {routeWeather.significant
                ? 'Significant weather impact'
                : 'Conditions look favorable'}
            </span>
          </div>
          {routeWeather.fuelImpactPercent != null && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Fuel impact:{' '}
              {routeWeather.fuelImpactPercent > 0 ? '+' : ''}
              {routeWeather.fuelImpactPercent.toFixed(1)}%
            </p>
          )}
          {routeWeather.segments && routeWeather.segments.length > 0 && (
            <div className="mt-2 space-y-1">
              {routeWeather.segments.map((seg, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-[10px] text-muted-foreground"
                >
                  <span className="font-mono">
                    {seg.from} → {seg.to}
                  </span>
                  <span>
                    {Math.round(seg.groundSpeed)}kts ·{' '}
                    {seg.timeWithWind.toFixed(1)}h
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---- Per-waypoint weather cards ---- */}
      {waypoints.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/20 p-6 text-center">
          <CloudSun className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground">
            Add waypoints to see route weather.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {waypoints.map((wp) => {
            const wx = weatherData[wp.icao]
            const metar = wx?.metar
            const taf = wx?.taf

            return (
              <div
                key={wp.icao}
                className="rounded-md border border-border bg-muted/20 p-2.5 space-y-2"
              >
                {/* -- Header: ICAO, name, badge -- */}
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold">
                        {wp.icao}
                      </span>
                      {metar?.observationTime && (
                        <span className="flex items-center gap-0.5 text-[9px] text-muted-foreground">
                          <Clock className="h-2.5 w-2.5" />
                          {formatTime(metar.observationTime)}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-[10px] text-muted-foreground">
                      {wp.name}
                    </p>
                  </div>

                  {metar?.flightCategory && (
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${flightCategoryStyles(metar.flightCategory)}`}
                    >
                      {metar.flightCategory}
                    </span>
                  )}
                </div>

                {/* -- No data -- */}
                {!wx && (
                  <p className="text-[10px] text-muted-foreground/50">
                    No data
                  </p>
                )}

                {/* -- Weather error -- */}
                {wx?.error && (
                  <p className="text-[10px] text-destructive">{wx.error}</p>
                )}

                {/* -- Decoded METAR grid -- */}
                {metar && <MetarGrid metar={metar} />}

                {/* -- Raw METAR (collapsible) -- */}
                {metar?.rawText && (
                  <CollapsibleRaw
                    label="Raw METAR"
                    content={metar.rawText}
                  />
                )}

                {/* -- TAF (collapsible) -- */}
                {taf?.rawText && (
                  <CollapsibleRaw
                    label="Terminal Aerodrome Forecast"
                    content={taf.rawText}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
