'use client'

import { Loader2, RefreshCw, AlertTriangle, CloudSun, CheckCircle2 } from 'lucide-react'
import type { Waypoint, AirportWeather, RouteWeatherSummary } from '../types'

interface WeatherPanelProps {
  waypoints: Waypoint[]
  weatherData: Record<string, AirportWeather | null>
  routeWeather: RouteWeatherSummary | null
  weatherLoading: boolean
  weatherError: string
  onRefresh: () => void
}

export function WeatherPanel(props: WeatherPanelProps) {
  const { waypoints, weatherData, routeWeather, weatherLoading, weatherError, onRefresh } = props

  return (
    <div className="space-y-3">
      {/* Refresh button */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Route Weather
        </span>
        <button
          onClick={onRefresh}
          disabled={weatherLoading || waypoints.length === 0}
          className="flex items-center gap-1 rounded border border-border bg-card px-2 py-1 text-[11px] hover:bg-muted disabled:opacity-50"
        >
          {weatherLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Refresh
        </button>
      </div>

      {weatherError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-[11px] text-destructive">
          {weatherError}
        </div>
      )}

      {/* Route weather summary */}
      {routeWeather && (
        <div className="rounded-md border border-border bg-muted/20 p-2.5">
          <div className="flex items-center gap-2">
            {routeWeather.significant ? (
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            )}
            <span className="text-xs font-semibold">
              {routeWeather.significant ? 'Significant weather impact' : 'Conditions look favorable'}
            </span>
          </div>
          {routeWeather.fuelImpactPercent != null && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Fuel impact: {routeWeather.fuelImpactPercent > 0 ? '+' : ''}{routeWeather.fuelImpactPercent.toFixed(1)}%
            </p>
          )}
          {routeWeather.segments && routeWeather.segments.length > 0 && (
            <div className="mt-2 space-y-1">
              {routeWeather.segments.map((seg, i) => (
                <div key={i} className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span className="font-mono">{seg.from} → {seg.to}</span>
                  <span>{Math.round(seg.groundSpeed)}kts · {seg.timeWithWind.toFixed(1)}h</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Per-waypoint weather */}
      {waypoints.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/20 p-6 text-center">
          <CloudSun className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground">Add waypoints to see route weather.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {waypoints.map((wp) => {
            const wx = weatherData[wp.icao]
            return (
              <div key={wp.icao} className="rounded-md border border-border bg-muted/20 p-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold">{wp.icao}</span>
                  {wx?.metar?.flightCategory && (
                    <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium uppercase ${
                      wx.metar.flightCategory === 'VFR' ? 'bg-emerald-500/10 text-emerald-600' :
                      wx.metar.flightCategory === 'MVFR' ? 'bg-blue-500/10 text-blue-600' :
                      wx.metar.flightCategory === 'IFR' ? 'bg-amber-500/10 text-amber-600' :
                      'bg-destructive/10 text-destructive'
                    }`}>
                      {wx.metar.flightCategory}
                    </span>
                  )}
                </div>
                <p className="mt-1 truncate text-[10px] text-muted-foreground">{wp.name}</p>
                {wx?.metar?.rawText && (
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">{wx.metar.rawText}</p>
                )}
                {!wx && (
                  <p className="mt-1 text-[10px] text-muted-foreground/50">No data</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
