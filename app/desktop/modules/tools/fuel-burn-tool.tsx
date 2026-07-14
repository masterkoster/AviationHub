'use client'

/**
 * Fuel Burn Planner — fuel planning tool with live depletion chart.
 *
 * Live-computes fuel required, endurance, reserves, cost, and range.
 * Features a Recharts area chart showing fuel depletion over time,
 * an inline SVG fuel-gauge visual, and color-coded results.
 */

import { useState, useMemo, useEffect, useRef } from 'react'
import { HelpCircle } from 'lucide-react'
import { Slider } from '@/components/ui/slider'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceArea,
} from 'recharts'
import {
  ToolShell, Field,
  StatCard, StatGrid,
} from '@/components/ui/e6b'
import { logToolUse } from '@/desktop/lib/e6b-store'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Chart tooltip for the fuel-depletion area chart. */
function FuelTooltip({
  active, payload,
}: {
  active?: boolean
  payload?: Array<{ payload?: { time: number; fuel: number } }>
}) {
  if (!active || !payload || payload.length === 0) return null
  const p = payload[0]?.payload
  if (!p) return null
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="font-mono tabular-nums">Time: {p.time.toFixed(1)} hrs</p>
      <p className="font-mono tabular-nums">Fuel: {p.fuel.toFixed(1)} gal</p>
    </div>
  )
}

// ── Component ────────────────────────────────────────────────────────────────

export default function FuelBurnTool() {
  const { localUser, cloudUser } = useDesktopAuth()
  const userId = localUser?.id ?? cloudUser?.id ?? 'local-anon'

  // ── Input state ──────────────────────────────────────────────────────────
  const [burnRate, setBurnRate] = useState(10)
  const [totalFuel, setTotalFuel] = useState(53)
  const [flightTime, setFlightTime] = useState(2.5)
  const [fuelPrice, setFuelPrice] = useState<number | string>('')
  const [cruiseSpeed, setCruiseSpeed] = useState<number | string>('')
  const [aircraftList, setAircraftList] = useState<any[]>([])
  const [selectedAircraft, setSelectedAircraft] = useState<string>('')
  const [aircraftLoading, setAircraftLoading] = useState(false)

  const loadAircraft = async () => {
    if (aircraftList.length > 0) { setAircraftList([]); return }
    setAircraftLoading(true)
    try {
      const res = await fetch('/api/weight-balance')
      const data = await res.json()
      setAircraftList(data.aircraft ?? [])
    } catch { toast.error('Failed to load aircraft') }
    setAircraftLoading(false)
  }

  const applyAircraft = (makeModel: string) => {
    const ac = aircraftList.find((a: any) => `${a.make} ${a.model}` === makeModel)
    if (!ac) return
    setBurnRate(ac.fuel_burn ?? 10)
    setTotalFuel(ac.fuel_capacity ?? 53)
    if (ac.cruise_speed) setCruiseSpeed(ac.cruise_speed)
    setSelectedAircraft(makeModel)
    toast.success(`Loaded ${makeModel}`)
  }

  // ── Live computation ─────────────────────────────────────────────────────
  const {
    fuelRequired, endurance, fuelRemaining, reserveMinGal,
    reserve, enduranceMm, fuelCost, rangeNm,
  } = useMemo(() => {
    const fuelReq = burnRate * flightTime
    const endur = totalFuel > 0 && burnRate > 0 ? totalFuel / burnRate : 0
    const remaining = totalFuel - fuelReq
    const rMinGal = burnRate * 1 // 1-hour VFR reserve
    const res = remaining - rMinGal
    const resTime = burnRate > 0 ? remaining / burnRate : 0
    const hrs = Math.floor(endur)
    const mins = String(Math.round((endur % 1) * 60)).padStart(2, '0')
    const cost = fuelPrice !== '' ? fuelReq * Number(fuelPrice) : 0
    const speed = cruiseSpeed !== '' ? Number(cruiseSpeed) : 0
    const rng = remaining > 0 && burnRate > 0 && speed > 0
      ? ((remaining - rMinGal) / burnRate) * speed
      : 0
    return {
      fuelRequired: fuelReq,
      endurance: endur,
      fuelRemaining: remaining,
      reserveMinGal: rMinGal,
      reserve: res,
      reserveTime: resTime,
      enduranceMm: `${hrs}:${mins}`,
      fuelCost: cost,
      rangeNm: rng,
    }
  }, [burnRate, totalFuel, flightTime, fuelPrice, cruiseSpeed])

  // ── Chart data (memoized) ────────────────────────────────────────────────
  const chartData = useMemo(() => {
    if (burnRate <= 0 || totalFuel <= 0) return []
    const endur = totalFuel / burnRate
    const steps = Math.max(1, Math.ceil(endur / 0.1))
    const data: { time: number; fuel: number }[] = []
    for (let i = 0; i <= steps; i++) {
      const t = Math.min(+(i * 0.1).toFixed(1), +endur.toFixed(1))
      data.push({ time: t, fuel: Math.max(0, totalFuel - burnRate * t) })
    }
    return data
  }, [totalFuel, burnRate])

  // ── Fuel gauge helpers ───────────────────────────────────────────────────
  const fuelPercent = totalFuel > 0
    ? Math.max(0, Math.min(100, (fuelRemaining / totalFuel) * 100))
    : 0
  const gaugeColor = fuelPercent > 40
    ? '#10b981'
    : fuelPercent > 20
      ? '#f59e0b'
      : '#ef4444'

  // ── Reserve badge ────────────────────────────────────────────────────────
  const reserveStatus: { label: string; tone: 'good' | 'warn' | 'bad' } =
    reserve >= 6
      ? { label: 'Adequate', tone: 'good' }
      : reserve >= 0
        ? { label: 'Marginal', tone: 'warn' }
        : { label: 'Insufficient', tone: 'bad' }

  // ── Debounced history logging ────────────────────────────────────────────
  const logTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (logTimer.current) clearTimeout(logTimer.current)
    logTimer.current = setTimeout(async () => {
      try {
        await logToolUse(
          userId,
          'fuel',
          { burnRate, totalFuel, flightTime, fuelPrice, cruiseSpeed },
          { fuelRequired, fuelRemaining, endurance, reserve, fuelCost },
        )
      } catch (err) {
        console.error('logToolUse failed', err)
      }
    }, 1000)
    return () => {
      if (logTimer.current) clearTimeout(logTimer.current)
    }
  }, [
    userId, burnRate, totalFuel, flightTime, fuelPrice, cruiseSpeed,
    fuelRequired, fuelRemaining, endurance, reserve, fuelCost,
  ])

  return (
    <ToolShell
      title="Fuel Burn Planner"
      description="Plan fuel requirements, endurance, reserves, cost, and range with a live depletion chart."
      notesUserId={userId}
      notesTool="fuel"
    >
      <div className="h-full flex flex-col gap-4 min-h-0">
        {/* ── Formula hint ───────────────────────────────────────────────── */}
        <div className="shrink-0 flex items-center gap-1 text-xs text-muted-foreground">
          <HelpCircle className="w-3 h-3" />
          <span>
            Fuel Required = Burn Rate × Time &nbsp;|&nbsp;
            Endurance = Total Fuel ÷ Burn Rate &nbsp;|&nbsp;
            VFR reserve = 1 hr
          </span>
        </div>

        {/* ── Two-column grid ────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0">
          {/* ── Left column: inputs + fuel gauge (scrollable) ──────────── */}
          <div className="flex flex-col min-h-0 overflow-y-auto space-y-3 pr-1">
            <div>
              <Field
                label="Fuel Burn Rate (gph)"
                value={burnRate}
                onChange={(v) => setBurnRate(Number(v) || 0)}
                step={0.1}
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={loadAircraft}
                  className="text-xs text-primary hover:underline"
                  type="button"
                >
                  {aircraftList.length > 0 ? 'Hide aircraft list' : aircraftLoading ? 'Loading...' : 'Import from Aircraft Database'}
                </button>
              </div>
              {aircraftList.length > 0 && (
                <div className="mt-2">
                  <select
                    value={selectedAircraft}
                    onChange={(e) => applyAircraft(e.target.value)}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Select aircraft...</option>
                    {aircraftList.map((ac: any) => (
                      <option key={`${ac.make}-${ac.model}`} value={`${ac.make} ${ac.model}`}>
                        {ac.make} {ac.model} — {ac.fuel_burn} gph, {ac.fuel_capacity} gal
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {selectedAircraft && (
                <Badge variant="outline" className="mt-1 text-xs">
                  Using: {selectedAircraft}
                </Badge>
              )}
            </div>
            <div>
              <Field
                label="Total Usable Fuel (gal)"
                value={totalFuel}
                onChange={(v) => setTotalFuel(Number(v) || 0)}
                step={0.5}
              />
              <Slider
                min={0}
                max={100}
                step={0.5}
                value={[totalFuel]}
                onValueChange={(vals) => {
                  const v = Array.isArray(vals) ? vals[0] : vals
                  setTotalFuel(typeof v === 'number' ? v : 0)
                }}
                className="mt-2"
              />
            </div>
            <div>
              <Field
                label="Flight Time (hrs)"
                value={flightTime}
                onChange={(v) => setFlightTime(Number(v) || 0)}
                step={0.1}
              />
              <Slider
                min={0}
                max={10}
                step={0.1}
                value={[flightTime]}
                onValueChange={(vals) => {
                  const v = Array.isArray(vals) ? vals[0] : vals
                  setFlightTime(typeof v === 'number' ? v : 0)
                }}
                className="mt-2"
              />
            </div>

            <Separator />

            <Field
              label="Fuel Price ($/gal, optional)"
              value={fuelPrice}
              onChange={(v) => setFuelPrice(v)}
              placeholder="—"
            />
            <Field
              label="Cruise Speed (kts, optional)"
              value={cruiseSpeed}
              onChange={(v) => setCruiseSpeed(v)}
              placeholder="—"
            />

            {/* ── Fuel gauge visual ──────────────────────────────────────── */}
            <div className="shrink-0 rounded-xl bg-muted/30 p-4">
              <svg viewBox="0 0 600 100" className="w-full h-20" role="img" aria-label="Fuel gauge">
                {/* Tank outline */}
                <rect
                  x="1" y="1" width="598" height="98"
                  rx="8" ry="8"
                  fill="none"
                  stroke="currentColor"
                  strokeOpacity={0.15}
                  strokeWidth="2"
                />
                {/* Fill level */}
                <rect
                  x="2" y="2"
                  width={Math.min(596, Math.max(0, (fuelRemaining / Math.max(totalFuel, 1)) * 596))}
                  height="98"
                  rx="7" ry="7"
                  fill={gaugeColor}
                  fillOpacity={0.35}
                  style={{ transition: 'width 0.3s ease-out' }}
                />
                {/* Remaining label */}
                <text
                  x="300" y="44"
                  textAnchor="middle"
                  className="fill-foreground font-semibold"
                  fontSize={16}
                >
                  {fuelRemaining.toFixed(1)} gal remaining
                </text>
                <text
                  x="300" y="70"
                  textAnchor="middle"
                  className="fill-muted-foreground"
                  fontSize={13}
                >
                  {endurance.toFixed(1)} hrs endurance · {fuelRequired.toFixed(1)} gal required
                </text>
              </svg>
            </div>
          </div>

          {/* ── Right column: chart + stat cards ─────────────────────────── */}
          <div className="flex flex-col min-h-0">
            {/* Recharts AreaChart — fills remaining space */}
            <div className="flex-1 min-h-0 rounded-xl bg-muted/30 p-3">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  margin={{ top: 24, right: 16, left: 4, bottom: 16 }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis
                    dataKey="time"
                    type="number"
                    domain={[0, Math.max(endurance, 1)]}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: number) => `${v.toFixed(0)}h`}
                    label={{
                      value: 'Time (hrs)',
                      position: 'insideBottom',
                      offset: -4,
                      fontSize: 11,
                    }}
                  />
                  <YAxis
                    dataKey="fuel"
                    type="number"
                    domain={[0, Math.max(totalFuel, 1)]}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: number) => `${v.toFixed(0)}`}
                    label={{
                      value: 'Fuel (gal)',
                      angle: -90,
                      position: 'insideLeft',
                      fontSize: 11,
                    }}
                  />
                  <Tooltip content={<FuelTooltip />} />
                  {/* Planned flight vertical reference */}
                  <ReferenceLine
                    x={flightTime}
                    stroke="#f59e0b"
                    strokeDasharray="4 4"
                    label={{
                      value: 'Planned flight',
                      position: 'top',
                      fontSize: 10,
                      fill: '#f59e0b',
                    }}
                  />
                  {/* Reserve zone after planned flight */}
                  {endurance > flightTime && (
                    <ReferenceArea
                      x1={flightTime}
                      x2={endurance}
                      fill="#f59e0b"
                      fillOpacity={0.08}
                    />
                  )}
                  {/* VFR 1-hour reserve line */}
                  <ReferenceLine
                    y={reserveMinGal}
                    stroke="#ef4444"
                    strokeDasharray="6"
                    label={{
                      value: 'VFR 1-hr reserve',
                      position: 'right',
                      fontSize: 10,
                      fill: '#ef4444',
                    }}
                  />
                  {/* Fuel depletion area */}
                  <Area
                    type="monotone"
                    dataKey="fuel"
                    stroke="#10b981"
                    strokeWidth={2}
                    fill="#10b981"
                    fillOpacity={0.2}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* ── Stat cards — fixed height below chart ──────────────────── */}
            <div className="shrink-0 mt-3">
              <StatGrid cols={2}>
                <StatCard
                  label="Fuel Required"
                  value={<span className="text-base font-bold">{fuelRequired.toFixed(1)} gal</span>}
                  tone={fuelRequired > totalFuel ? 'bad' : 'default'}
                />
                <StatCard
                  label="Fuel Remaining"
                  value={<span className="text-base font-bold">{fuelRemaining.toFixed(1)} gal</span>}
                  tone={
                    fuelPercent > 40 ? 'good' : fuelPercent > 20 ? 'warn' : 'bad'
                  }
                />
                <StatCard
                  label="Endurance"
                  value={
                    <span className="flex items-center gap-1.5 text-base font-bold">
                      {endurance.toFixed(1)} hrs
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                        {enduranceMm}
                      </Badge>
                    </span>
                  }
                />
                <StatCard
                  label="Reserve"
                  value={
                    <span className="flex items-center gap-1.5 text-base font-bold">
                      {reserve.toFixed(1)} gal
                      <Badge
                        variant="outline"
                        className={`text-[9px] px-1.5 py-0 ${
                          reserveStatus.tone === 'good'
                            ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                            : reserveStatus.tone === 'warn'
                              ? 'border-amber-500/40 text-amber-600 dark:text-amber-400'
                              : 'border-red-500/40 text-red-600 dark:text-red-400'
                        }`}
                      >
                        {reserveStatus.label}
                      </Badge>
                    </span>
                  }
                  tone={reserveStatus.tone}
                />
                {fuelPrice !== '' && (
                  <StatCard
                    label="Fuel Cost"
                    value={<span className="text-base font-bold">${fuelCost.toFixed(2)}</span>}
                  />
                )}
                {cruiseSpeed !== '' && Number(cruiseSpeed) > 0 && (
                  <StatCard
                    label="Range (with 1-hr reserve)"
                    value={<span className="text-base font-bold">{rangeNm.toFixed(0)} NM</span>}
                  />
                )}
              </StatGrid>
            </div>
          </div>
        </div>
      </div>
    </ToolShell>
  )
}
