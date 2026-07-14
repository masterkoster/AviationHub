'use client'

import { useMemo } from 'react'
import { Fuel, BarChart3 } from 'lucide-react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  BarChart,
  Bar,
  Legend,
} from 'recharts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FuelPanelProps {
  fuelGal: number
  fuelMaxGal: number
  fuelPercent: number
  setFuelPercent: (v: number) => void
  burnGph: number
  cruiseKts: number
  estRangeNm: number
  waypoints: Array<{ icao: string; name: string; latitude: number; longitude: number }>
  aircraftName?: string
}

interface LegData {
  from: string
  to: string
  distanceNm: number
  timeHrs: number
  fuelBurnGal: number
  fuelRemainingGal: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3440.065
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function formatTime(totalHours: number): string {
  const h = Math.floor(totalHours)
  const m = Math.round((totalHours - h) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Sub-components (matching project Stat pattern)
// ---------------------------------------------------------------------------

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-card px-2 py-1">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-xs font-semibold text-foreground">{value}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function FuelPanel(props: FuelPanelProps) {
  const {
    fuelGal,
    fuelMaxGal,
    fuelPercent,
    setFuelPercent,
    burnGph,
    cruiseKts,
    estRangeNm,
    waypoints,
    aircraftName,
  } = props

  // Derive per-leg data (at least 2 waypoints needed for legs)
  const legs: LegData[] = useMemo(() => {
    if (waypoints.length < 2) return []
    const result: LegData[] = []
    let fuelRemaining = fuelGal

    for (let i = 1; i < waypoints.length; i++) {
      const prev = waypoints[i - 1]
      const curr = waypoints[i]
      const distNm = haversineNm(prev.latitude, prev.longitude, curr.latitude, curr.longitude)
      const timeHrs = distNm / cruiseKts
      const fuelBurnGal = timeHrs * burnGph
      fuelRemaining = Math.max(0, fuelRemaining - fuelBurnGal)

      result.push({
        from: prev.icao,
        to: curr.icao,
        distanceNm: distNm,
        timeHrs,
        fuelBurnGal,
        fuelRemainingGal: fuelRemaining,
      })
    }
    return result
  }, [waypoints, fuelGal, cruiseKts, burnGph])

  // Cumulative distance chart data — starts with departure (0 nm, full fuel)
  const lineChartData = useMemo(() => {
    if (waypoints.length < 2) return []
    let cumDist = 0
    let fuelRemaining = fuelGal
    const points = [{ dist: 0, fuel: fuelGal, label: waypoints[0].icao }]

    for (let i = 1; i < waypoints.length; i++) {
      const prev = waypoints[i - 1]
      const curr = waypoints[i]
      const distNm = haversineNm(prev.latitude, prev.longitude, curr.latitude, curr.longitude)
      cumDist += distNm
      const timeHrs = distNm / cruiseKts
      const fuelBurnGal = timeHrs * burnGph
      fuelRemaining = Math.max(0, fuelRemaining - fuelBurnGal)
      points.push({ dist: Number(cumDist.toFixed(1)), fuel: Number(fuelRemaining.toFixed(2)), label: curr.icao })
    }
    return points
  }, [waypoints, fuelGal, cruiseKts, burnGph])

  // Bar chart data — fuel burned per leg + remaining on arrival
  const barChartData = useMemo(() => {
    return legs.map((leg) => ({
      name: leg.to,
      burned: Number(leg.fuelBurnGal.toFixed(2)),
      remaining: Number(leg.fuelRemainingGal.toFixed(2)),
    }))
  }, [legs])

  const reserveGal = fuelMaxGal * 0.2
  const enduranceHrs = burnGph > 0 ? fuelGal / burnGph : 0

  return (
    <div className="space-y-3">
      {/* Section: Aircraft indicator */}
      {aircraftName && (
        <div className="rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-[10px] text-muted-foreground">
          <span className="font-medium">Aircraft:</span>{' '}
          <span className="font-mono text-foreground">{aircraftName}</span>
        </div>
      )}

      {/* Section: Fuel Summary */}
      <div className="rounded-md border border-border bg-muted/20 p-2.5">
        <div className="mb-1.5 flex items-center gap-1.5">
          <Fuel className="h-3.5 w-3.5 text-sky-500" />
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Fuel Summary</p>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <Stat label="Fuel Load" value={`${fuelGal.toFixed(1)} gal`} />
          <Stat label="Percent" value={`${fuelPercent}%`} />
          <Stat label="Burn Rate" value={`${burnGph} gph`} />
          <Stat label="Cruise" value={`${cruiseKts} kts`} />
          <Stat label="Range" value={`${Math.round(estRangeNm)} nm`} />
          <Stat label="Endurance" value={`${enduranceHrs.toFixed(1)} hrs`} />
        </div>
      </div>

      {/* Section: Fuel Slider */}
      <div className="rounded-md border border-border bg-muted/20 p-2.5">
        <div className="mb-1 flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">Fuel Load</span>
          <span className="font-medium">{fuelPercent}% — {fuelGal.toFixed(1)} / {fuelMaxGal} gal</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={fuelPercent}
          onInput={(e) => setFuelPercent(Number((e.target as HTMLInputElement).value))}
          onPointerDown={(e) => e.stopPropagation()}
          className="w-full cursor-ew-resize accent-sky-500"
        />
        <p className="mt-1 text-[10px] text-muted-foreground">
          Adjust fuel load to see range and endurance impact.
        </p>
      </div>

      {/* Section: Fuel Remaining Over Distance (Line Chart) */}
      {lineChartData.length >= 2 && (
        <div className="rounded-md border border-border bg-muted/20 p-2.5">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Fuel Remaining vs Distance
          </p>
          <div className="h-48 w-full [&_.recharts-cartesian-axis-tick-value]:fill-muted-foreground [&_.recharts-cartesian-axis-line]:stroke-border [&_.recharts-cartesian-grid-horizontal_line]:stroke-border [&_.recharts-cartesian-grid-vertical_line]:stroke-border">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lineChartData} margin={{ top: 4, right: 8, left: -12, bottom: 4 }}>
                <XAxis
                  dataKey="dist"
                  type="number"
                  tickFormatter={(v: number) => `${v}`}
                  tick={{ fontSize: 10 }}
                  axisLine={{ strokeWidth: 1 }}
                  tickLine={false}
                  label={{ value: 'nm', position: 'insideBottomRight', offset: -4, fontSize: 10 }}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  axisLine={{ strokeWidth: 1 }}
                  tickLine={false}
                  label={{ value: 'gal', angle: -90, position: 'insideLeft', offset: 16, fontSize: 10 }}
                />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 6, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))', color: 'hsl(var(--foreground))' }}
                  formatter={(value) => [`${Number(value).toFixed(1)} gal`, 'Remaining']}
                  labelFormatter={(label) => `${label} nm`}
                />
                {/* 20% reserve line */}
                <ReferenceLine
                  y={reserveGal}
                  stroke="#ef4444"
                  strokeDasharray="6 3"
                  strokeWidth={1.5}
                  label={{
                    value: `Reserve ${reserveGal.toFixed(0)} gal`,
                    position: 'right',
                    fontSize: 10,
                    fill: '#ef4444',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="fuel"
                  stroke="hsl(199, 89%, 48%)"
                  strokeWidth={2}
                  dot={{ r: 3, fill: 'hsl(199, 89%, 48%)', strokeWidth: 0 }}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Section: Per-Waypoint Fuel Bar Chart */}
      {barChartData.length > 0 && (
        <div className="rounded-md border border-border bg-muted/20 p-2.5">
          <div className="mb-2 flex items-center gap-1.5">
            <BarChart3 className="h-3.5 w-3.5 text-sky-500" />
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Per-Waypoint Fuel
            </p>
          </div>
          <div className="h-48 w-full [&_.recharts-cartesian-axis-tick-value]:fill-muted-foreground [&_.recharts-cartesian-axis-line]:stroke-border [&_.recharts-cartesian-grid-horizontal_line]:stroke-border [&_.recharts-cartesian-grid-vertical_line]:stroke-border">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barChartData} margin={{ top: 4, right: 8, left: -12, bottom: 4 }}>
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10 }}
                  axisLine={{ strokeWidth: 1 }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  axisLine={{ strokeWidth: 1 }}
                  tickLine={false}
                  label={{ value: 'gal', angle: -90, position: 'insideLeft', offset: 16, fontSize: 10 }}
                />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 6, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))', color: 'hsl(var(--foreground))' }}
                  formatter={(value, name) => [
                    `${Number(value).toFixed(1)} gal`,
                    name === 'burned' ? 'Fuel Burned' : 'Fuel Remaining',
                  ]}
                />
                <Legend
                  iconType="square"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 10 }}
                />
                <Bar dataKey="burned" name="Burned" stackId="fuel" fill="hsl(14, 70%, 50%)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="remaining" name="Remaining" stackId="fuel" fill="hsl(174, 60%, 45%)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Section: Per-Leg Table */}
      {legs.length > 0 && (
        <div className="rounded-md border border-border bg-muted/20 p-2.5">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Per-Leg Breakdown
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="pb-1 pr-2 text-left font-medium">From → To</th>
                  <th className="pb-1 pr-2 text-right font-medium">Dist</th>
                  <th className="pb-1 pr-2 text-right font-medium">Time</th>
                  <th className="pb-1 pr-2 text-right font-medium">Burn</th>
                  <th className="pb-1 text-right font-medium">Remaining</th>
                </tr>
              </thead>
              <tbody>
                {legs.map((leg, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-b-0">
                    <td className="py-1 pr-2 font-mono">
                      <span className="text-foreground">{leg.from}</span>
                      <span className="mx-0.5 text-muted-foreground">→</span>
                      <span className="text-foreground">{leg.to}</span>
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums text-foreground">{leg.distanceNm.toFixed(1)}</td>
                    <td className="py-1 pr-2 text-right font-mono tabular-nums text-foreground">{formatTime(leg.timeHrs)}</td>
                    <td className="py-1 pr-2 text-right tabular-nums text-foreground">{leg.fuelBurnGal.toFixed(1)}</td>
                    <td className="py-1 text-right tabular-nums">
                      <span
                        className={
                          leg.fuelRemainingGal <= reserveGal
                            ? 'font-semibold text-red-500'
                            : ''
                        }
                      >
                        {leg.fuelRemainingGal.toFixed(1)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {waypoints.length < 2 && (
        <div className="rounded-md border border-dashed border-border bg-muted/20 p-6 text-center">
          <Fuel className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground">
            Add at least 2 waypoints to see fuel planning charts.
          </p>
        </div>
      )}
    </div>
  )
}
