'use client'

/**
 * True Airspeed & Density Altitude — TAS/DA calculator with atmosphere diagram.
 *
 * Live-computes TAS, Mach number, density altitude, and ISA temperature
 * deviation with a visual atmosphere diagram showing temperature profiles
 * and density-altitude reference.
 */

import { useState, useMemo, useEffect, useRef } from 'react'
import { Gauge, ArrowUp, HelpCircle, Copy } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import {
  ToolShell, Field, ResultGrid, ResultRow,
  StatCard, StatGrid,
  COLOR_MAP, type ResultColor,
} from '@/components/ui/e6b'
import { logToolUse } from '@/desktop/lib/e6b-store'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'

// ── Helpers ──────────────────────────────────────────────────────────────────

function ResultRowWithCopy({
  label, value, color,
}: { label: string; value: string; color?: ResultColor }) {
  const copy = () => {
    navigator.clipboard?.writeText(value).then(
      () => toast.success(`${value} copied`),
      () => {},
    )
  }
  return (
    <div className="flex justify-between items-center gap-2">
      <span className="text-sm text-muted-foreground flex-1">{label}</span>
      <span className={`font-semibold ${color ? COLOR_MAP[color] : ''}`}>{value}</span>
      <button
        onClick={copy}
        className="text-muted-foreground/40 hover:text-muted-foreground transition-colors"
        aria-label={`Copy ${value}`}
      >
        <Copy className="w-3 h-3" />
      </button>
    </div>
  )
}

// ── Atmosphere Diagram ─────────────────────────────────────────────────────

/**
 * Inline SVG atmosphere diagram showing ISA vs. actual temperature profile
 * and density altitude reference.
 */
function AtmosphereDiagram({
  pressureAltitude,
  isaTemp,
  actualTemp,
  useIsa,
  da,
}: {
  pressureAltitude: number
  isaTemp: number
  actualTemp: number
  useIsa: boolean
  da: number
}) {
  // Layout constants
  const W = 400
  const H = 500
  const PAD_TOP = 20
  const PAD_BOT = 40
  const ALT_MIN = 0
  const ALT_MAX = Math.max(pressureAltitude, 5000)
  const ALT_RANGE = ALT_MAX - ALT_MIN
  const tempMin = -30
  const tempMax = 25
  const tempRange = tempMax - tempMin

  // Temperature → x pixel
  const tempToX = (t: number) => 80 + ((t - tempMin) / tempRange) * 260

  // Altitude → y pixel (0 at bottom, ALT_MAX at top)
  const altToY = (alt: number) => {
    const frac = (alt - ALT_MIN) / ALT_RANGE
    return H - PAD_BOT - frac * (H - PAD_TOP - PAD_BOT)
  }

  // Key points
  const isaX_SL = tempToX(15)
  const isaX_top = tempToX(isaTemp)
  const y_SL = altToY(0)
  const y_top = altToY(pressureAltitude)

  // Actual temp line (only when not ISA-only)
  const actX_SL = tempToX(15) // approximate SL temp
  const actX_top = tempToX(actualTemp)

  // Deviation
  const deviation = actualTemp - isaTemp
  const isWarm = deviation > 0

  // DA position
  const y_da = altToY(da)
  const daAbovePA = da > pressureAltitude

  // Temperature ticks
  const tempTicks = [-20, -10, 0, 10, 20]

  return (
    <div className="h-96 w-full rounded-lg bg-muted/30 p-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" role="img" aria-label="Atmosphere temperature diagram">
        {/* Background */}
        <rect width={W} height={H} fill="transparent" />

        {/* Altitude grid lines + labels */}
        {Array.from({ length: Math.floor(ALT_RANGE / 1000) + 1 }, (_, i) => {
          const alt = i * 1000
          if (alt > ALT_MAX) return null
          const y = altToY(alt)
          return (
            <g key={`alt-${alt}`}>
              <line x1={30} y1={y} x2={W - 10} y2={y} stroke="currentColor" strokeOpacity={0.08} strokeWidth={1.5} />
              <text x={26} y={y + 3} textAnchor="end" className="fill-muted-foreground text-[12px]">
                {(alt / 1000).toFixed(0)}k
              </text>
            </g>
          )
        })}

        {/* Temperature scale ticks */}
        {tempTicks.map((t) => {
          const x = tempToX(t)
          return (
            <g key={`temp-${t}`}>
              <line x1={x} y1={y_SL} x2={x} y2={y_SL + 4} stroke="currentColor" strokeOpacity={0.2} strokeWidth={1.5} />
              <text x={x} y={y_SL + 14} textAnchor="middle" className="fill-muted-foreground text-[12px]">
                {t}°
              </text>
            </g>
          )
        })}

        {/* ISA temperature line */}
        <line
          x1={isaX_SL} y1={y_SL}
          x2={isaX_top} y2={y_top}
          stroke="#60a5fa"
          strokeWidth={3}
          strokeDasharray="4 2"
        />
        <text
          x={isaX_top - 4} y={y_top - 6}
          textAnchor="end"
          className="fill-blue-400 text-[13px] font-medium"
        >
          ISA {isaTemp.toFixed(0)}°C
        </text>

        {/* Actual temperature line (when not ISA-only) */}
        {!useIsa && (
          <>
            {/* Deviation shading */}
            <polygon
              points={`${isaX_SL},${y_SL} ${isaX_top},${y_top} ${actX_top},${y_top} ${actX_SL},${y_SL}`}
              fill={isWarm ? '#f59e0b' : '#60a5fa'}
              fillOpacity={0.1}
            />
            <line
              x1={actX_SL} y1={y_SL}
              x2={actX_top} y2={y_top}
              stroke="#f59e0b"
              strokeWidth={3}
            />
            <text
              x={actX_top + 4} y={y_top - 6}
              textAnchor="start"
              className="fill-amber-500 text-[13px] font-medium"
            >
              OAT {actualTemp.toFixed(0)}°C
            </text>
            {/* Deviation label */}
            <rect
              x={(isaX_top + actX_top) / 2 - 36}
              y={(y_top + y_SL) / 2 - 14}
              width={72}
              height={24}
              rx={4}
              fill="currentColor"
              fillOpacity={0.06}
            />
            <text
              x={(isaX_top + actX_top) / 2}
              y={(y_top + y_SL) / 2 + 4}
              textAnchor="middle"
              className={`text-[15px] font-semibold ${isWarm ? 'fill-amber-500' : 'fill-blue-400'}`}
            >
              {isWarm ? 'ISA+' : 'ISA'}{Math.abs(deviation).toFixed(0)}°C
            </text>
          </>
        )}

        {/* Flight altitude dashed line */}
        <line
          x1={30} y1={y_top}
          x2={W - 10} y2={y_top}
          stroke="currentColor"
          strokeOpacity={0.3}
          strokeDasharray="6 3"
          strokeWidth={2}
        />
        <text
          x={W - 12} y={y_top + 3}
          textAnchor="end"
          className="fill-foreground text-[13px] font-semibold"
        >
          {pressureAltitude.toLocaleString()} ft
        </text>

        {/* Airplane glyph at flight altitude */}
        <g transform={`translate(30, ${y_top - 10}) scale(1.5)`}>
          <text className="fill-foreground text-[12px]">✈</text>
        </g>

        {/* Density altitude reference (right side) */}
        <line
          x1={W - 24} y1={y_SL}
          x2={W - 24} y2={y_da}
          stroke={daAbovePA ? '#ef4444' : '#10b981'}
          strokeWidth={3}
          strokeDasharray="4 2"
        />
        <circle
          cx={W - 24} cy={y_da}
          r={3}
          fill={daAbovePA ? '#ef4444' : '#10b981'}
        />
        <text
          x={W - 30} y={y_da + (daAbovePA ? -10 : 14)}
          textAnchor="end"
          className={`text-[13px] font-semibold ${daAbovePA ? 'fill-red-500' : 'fill-emerald-500'}`}
        >
          DA: {da.toLocaleString()} ft
        </text>

        {/* "Sea Level" label */}
        <text
          x={32} y={y_SL + 14}
          className="fill-muted-foreground text-[12px]"
        >
          SL
        </text>
      </svg>
    </div>
  )
}

// ── Component ────────────────────────────────────────────────────────────────

export default function TASDensityTool() {
  const { localUser, cloudUser } = useDesktopAuth()
  const userId = localUser?.id ?? cloudUser?.id ?? 'local-anon'

  // ── Input state ──────────────────────────────────────────────────────────
  const [ias, setIas] = useState(100)
  const [altitude, setAltitude] = useState(6500)
  const [oat, setOat] = useState<number | string>('')
  const [useIsa, setUseIsa] = useState(true)

  // ── Live computation ─────────────────────────────────────────────────────
  const {
    isaTemp, temp, tas, mach, machPct, da, tempDeviation, speedOfSound,
  } = useMemo(() => {
    const isa = 15 - (altitude / 1000) * 2
    const t = useIsa ? isa : (oat !== '' ? Number(oat) : isa)
    const altFt = altitude
    const oatK = t + 273.15
    const rhoRatio = Math.pow(1 - 0.000006875 * altFt, 4.256) * (288.15 / oatK)
    const tasVal = Math.round(ias / Math.sqrt(rhoRatio))
    const sos = 38.967854 * Math.sqrt(oatK / 288.15)
    const machVal = tasVal / sos
    const machPctVal = (machVal * 100).toFixed(0)
    const daVal = Math.round(altitude + 118.8 * (t - isa))
    const tempDev = t - isa
    return {
      isaTemp: Math.round(isa),
      temp: t,
      tas: tasVal,
      mach: machVal,
      machPct: machPctVal,
      da: daVal,
      tempDeviation: tempDev,
      speedOfSound: sos,
    }
  }, [ias, altitude, oat, useIsa])

  // ── Debounced history logging ────────────────────────────────────────────
  const logTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (logTimer.current) clearTimeout(logTimer.current)
    logTimer.current = setTimeout(async () => {
      try {
        await logToolUse(
          userId,
          'tas',
          { ias, altitude, oat, useIsa },
          { tas, mach, da, isaTemp, tempDeviation },
        )
      } catch (err) {
        console.error('logToolUse failed', err)
      }
    }, 1000)
    return () => {
      if (logTimer.current) clearTimeout(logTimer.current)
    }
  }, [userId, ias, altitude, oat, useIsa, tas, mach, da, isaTemp, tempDeviation])

  // ── Derived display values ───────────────────────────────────────────────
  const deviationSign = tempDeviation > 0 ? '+' : ''

  return (
    <ToolShell
      title="True Airspeed & Density Altitude"
      description="Calculate TAS, Mach number, and density altitude with a visual atmosphere diagram."
      notesUserId={userId}
      notesTool="tas"
    >
      <div className="h-full flex flex-col gap-4 min-h-0">
        {/* ── Formula hint ───────────────────────────────────────────────── */}
        <div className="shrink-0 flex items-center gap-1 text-xs text-muted-foreground">
          <HelpCircle className="w-3 h-3" />
          <span>
            TAS = IAS / √(ρ/ρ₀) &nbsp;|&nbsp;
            DA = PA + 118.8 × (OAT − ISA) &nbsp;|&nbsp;
            ρ/ρ₀ = (1 − 6.875×10⁻⁶ · alt)^4.256 × (288.15 / OAT_K)
          </span>
        </div>

        {/* ── Two-column grid ────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0">
          {/* ── Left column: inputs + atmosphere diagram ─────────────────── */}
          <div className="flex flex-col min-h-0 overflow-y-auto space-y-3 pr-1">
            <Field
              label="Indicated Airspeed (kts)"
              value={ias}
              onChange={(v) => setIas(Number(v) || 0)}
            />
            <Field
              label="Pressure Altitude (ft)"
              value={altitude}
              onChange={(v) => setAltitude(Number(v) || 0)}
              step={500}
            />

            {/* ISA toggle + OAT input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Use ISA temperature</Label>
                <Switch
                  checked={useIsa}
                  onCheckedChange={setUseIsa}
                  aria-label="Use ISA standard temperature"
                />
              </div>
              {!useIsa && (
                <Field
                  label="Outside Air Temperature (°C)"
                  value={oat}
                  onChange={(v) => setOat(v)}
                  placeholder={`ISA: ${isaTemp}°C`}
                />
              )}
              {useIsa && (
                <p className="text-xs text-muted-foreground/60">
                  ISA standard: {isaTemp}°C at {altitude.toLocaleString()} ft
                </p>
              )}
            </div>

            {/* Atmosphere diagram — fills remaining space in left column */}
            <div className="flex-1 min-h-0 min-h-[200px]">
              <AtmosphereDiagram
                pressureAltitude={altitude}
                isaTemp={isaTemp}
                actualTemp={temp}
                useIsa={useIsa}
                da={da}
              />
            </div>
          </div>

          {/* ── Right column: results (scrollable) ───────────────────────── */}
          <div className="flex flex-col min-h-0 overflow-y-auto space-y-3 pr-1">
            <StatGrid cols={2}>
              <StatCard
                label="True Airspeed"
                value={`${tas} kts`}
                tone="good"
              />
              <StatCard
                label="Mach Number"
                value={
                  <span className="text-blue-500">
                    M {mach.toFixed(2)}
                  </span>
                }
              />
              <StatCard
                label="Density Altitude"
                value={`${da.toLocaleString()} ft`}
                tone={da > 10000 ? 'bad' : da > 7500 ? 'warn' : 'default'}
              />
              <StatCard
                label="ISA Temperature"
                value={`${isaTemp}°C`}
              />
              <StatCard
                label="Temp Deviation"
                value={`${deviationSign}${tempDeviation.toFixed(0)}°C`}
                tone={
                  tempDeviation > 5
                    ? 'warn'
                    : tempDeviation < -5
                      ? 'default'
                      : 'good'
                }
              />
              {da > 25000 && (
                <StatCard
                  label="Service Ceiling"
                  value={
                    <Badge variant="outline" className="border-red-500/40 text-red-600 dark:text-red-400 text-[13px]">
                      <span className="mr-1">⚠</span>
                      Above typical ceiling
                    </Badge>
                  }
                  tone="bad"
                />
              )}
            </StatGrid>

            {/* TAS detail sub-line */}
            <div className="rounded-md border border-border bg-card px-2.5 py-1.5">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                TAS above IAS
              </p>
              <p className="text-base font-bold tabular-nums">
                +{(tas - ias).toFixed(0)} kts
                <span className="text-muted-foreground font-normal ml-1">
                  ({((tas / Math.max(ias, 1) - 1) * 100).toFixed(1)}% increase)
                </span>
              </p>
            </div>

            {/* Mach detail */}
            <div className="rounded-md border border-border bg-card px-2.5 py-1.5">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Mach Percentage
              </p>
              <p className="text-base font-bold tabular-nums">
                {machPct}% of Mach 1
                <span className="text-muted-foreground font-normal ml-1">
                  (Speed of sound: {speedOfSound.toFixed(0)} kts)
                </span>
              </p>
            </div>

            {/* DA vs PA detail */}
            <div className="rounded-md border border-border bg-card px-2.5 py-1.5">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Density Altitude vs Pressure Altitude
              </p>
              <p className="text-base font-bold tabular-nums">
                {da > altitude ? '+' : ''}{(da - altitude).toLocaleString()} ft
                <span className="text-muted-foreground font-normal ml-1">
                  ({da > altitude ? 'above' : da < altitude ? 'below' : 'same as'} pressure altitude)
                </span>
              </p>
            </div>

            {/* Advisory — conditionally shown when DA > 10 000 ft */}
            {da > 10000 && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-600 dark:text-amber-400">
                <ArrowUp className="w-4 h-4 mt-0.5 shrink-0" />
                <span>
                  Density altitude of {da.toLocaleString()} ft significantly exceeds pressure
                  altitude. Expect reduced engine performance, longer takeoff rolls, and
                  decreased climb rates. Consult POH performance charts.
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </ToolShell>
  )
}
