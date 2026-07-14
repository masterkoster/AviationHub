'use client'

/**
 * Wind Triangle — two-column zero-scroll layout.
 * Left:  SVG compass with vector triangle (no text labels on SVG).
 * Right: compact inputs + results + magnetic variation toggle.
 * Fits within the viewport with zero scrolling.
 */

import { useState, useMemo, useCallback, useEffect } from 'react'
import { Wind, Navigation, Compass, Copy, MapPin } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { ToolShell } from '@/components/ui/e6b'
import { logToolUse } from '@/desktop/lib/e6b-store'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import {
  calculateMagneticVariation,
  trueToMagnetic,
  getCardinalDirection,
} from '@/app/modules/fuel-saver/lib/magneticVariation'

// ── constants & helpers ────────────────────────────────────────────────────────

const RAD = Math.PI / 180
const DEG = 180 / Math.PI
const norm360 = (d: number): number => ((d % 360) + 360) % 360

function notify(message: string): void {
  try { toast.success(message) } catch { console.log(message) }
}

// ── SVG compass — rich vector triangle, no text labels ─────────────────────────

function CompassTriangle({
  trueHeading,
  track,
  gs,
  tas,
  windFromTrue,
  windSpeed,
  course,
}: {
  trueHeading: number
  track: number
  gs: number
  tas: number
  windFromTrue: number
  windSpeed: number
  course: number
}) {
  /* ── layout ──────────────────────────────────────────────────────────────────── */
  const CX = 200
  const CY = 200
  const R = 162
  const R_ARC = 44

  /* ── scale vectors ───────────────────────────────────────────────────────────── */
  const maxLen = Math.max(tas, gs, 1)
  const scale = 122 / maxLen
  const airLen = tas * scale
  const windLen = Math.min(windSpeed * scale, 68)

  /* ── bearing → pixel ─────────────────────────────────────────────────────────── */
  const pt = (bearing: number, r: number): [number, number] => [
    CX + r * Math.sin(bearing * RAD),
    CY - r * Math.cos(bearing * RAD),
  ]

  /* ── vector endpoints ────────────────────────────────────────────────────────── */
  const A = pt(trueHeading, airLen) // air endpoint
  const toBearing = norm360(windFromTrue + 180) // wind blows TO this bearing
  const wdx = windLen * Math.sin(toBearing * RAD)
  const wdy = -windLen * Math.cos(toBearing * RAD)
  const G: [number, number] = [A[0] + wdx, A[1] + wdy] // ground endpoint

  /* ── WCA arc ─────────────────────────────────────────────────────────────────── */
  const Ph = pt(trueHeading, R_ARC)
  const Pt = pt(track, R_ARC)
  let diff = norm360(track - trueHeading)
  if (diff > 180) diff -= 360
  const sweep = diff >= 0 ? 1 : 0
  const showArc = Math.abs(diff) > 0.5

  /* ── ticks ───────────────────────────────────────────────────────────────────── */
  const ticks = Array.from({ length: 36 }, (_, i) => i * 10)

  return (
    <svg
      viewBox="0 0 400 400"
      className="w-full h-full"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Wind triangle diagram"
    >
      <defs>
        {/* Radial background — card color fading to transparent */}
        <radialGradient id="wt-bg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="hsl(var(--card))" stopOpacity={1} />
          <stop offset="65%" stopColor="hsl(var(--card))" stopOpacity={0.35} />
          <stop offset="100%" stopColor="transparent" stopOpacity={0} />
        </radialGradient>

        {/* Arrowhead markers — context-stroke for color inheritance */}
        <marker id="wt-ah-air" viewBox="0 0 10 10" refX="9" refY="5"
                markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0.5,1.5 L9,5 L0.5,8.5 Z" fill="context-stroke" />
        </marker>
        <marker id="wt-ah-wind" viewBox="0 0 10 10" refX="9" refY="5"
                markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0.5,1.5 L9,5 L0.5,8.5 Z" fill="context-stroke" />
        </marker>
        <marker id="wt-ah-track" viewBox="0 0 10 10" refX="9" refY="5"
                markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0.5,1.5 L9,5 L0.5,8.5 Z" fill="context-stroke" />
        </marker>
      </defs>

      {/* ── background glow ─────────────────────────────────────────────────────── */}
      <circle cx={CX} cy={CY} r={R + 24} fill="url(#wt-bg)" />

      {/* ── compass circle ──────────────────────────────────────────────────────── */}
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="currentColor"
              className="text-muted-foreground" strokeWidth="1.5" opacity={0.35} />

      {/* inner guide ring */}
      <circle cx={CX} cy={CY} r={R * 0.33} fill="none" stroke="currentColor"
              className="text-muted-foreground" strokeWidth="0.5" opacity={0.07} />

      {/* ── tick marks ──────────────────────────────────────────────────────────── */}
      {ticks.map((d) => {
        const isMajor = d % 90 === 0
        const isMid = d % 30 === 0
        const len = isMajor ? 16 : isMid ? 10 : 5
        const a = pt(d, R)
        const b = pt(d, R - len)
        return (
          <line
            key={d}
            x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]}
            stroke="currentColor"
            className="text-muted-foreground"
            strokeWidth={isMajor ? 2.2 : isMid ? 1.2 : 0.5}
            strokeOpacity={isMajor ? 0.55 : isMid ? 0.3 : 0.12}
          />
        )
      })}

      {/* ── degree ticks at 45° intervals (tiny) ────────────────────────────────── */}
      {[45, 135, 225, 315].map((d) => {
        const a = pt(d, R)
        const b = pt(d, R - 3)
        return (
          <line key={`m${d}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]}
                stroke="currentColor" className="text-muted-foreground"
                strokeWidth={0.4} strokeOpacity={0.1} />
        )
      })}

      {/* ── cardinal labels ─────────────────────────────────────────────────────── */}
      <text x={CX} y={CY - R - 14} textAnchor="middle"
            className="fill-red-500 font-bold" fontSize="16">N</text>
      <text x={CX + R + 16} y={CY + 5.5} textAnchor="middle"
            className="fill-muted-foreground font-semibold" fontSize="14"
            opacity={0.7}>E</text>
      <text x={CX} y={CY + R + 20} textAnchor="middle"
            className="fill-muted-foreground font-semibold" fontSize="14"
            opacity={0.7}>S</text>
      <text x={CX - R - 16} y={CY + 5.5} textAnchor="middle"
            className="fill-muted-foreground font-semibold" fontSize="14"
            opacity={0.7}>W</text>

      {/* ── faint degree labels at 30° intervals ────────────────────────────────── */}
      {[30, 60, 120, 150, 210, 240, 300, 330].map((d) => {
        const lp = pt(d, R + 12)
        return (
          <text key={`d${d}`} x={lp[0]} y={lp[1] + 3.5} textAnchor="middle"
                className="fill-muted-foreground" fontSize="8" opacity={0.25}
                style={{ fontVariantNumeric: 'tabular-nums' }}>
            {d}
          </text>
        )
      })}

      {/* ── faint course ray (dashed) ───────────────────────────────────────────── */}
      <line x1={CX} y1={CY}
            x2={pt(course, R - 10)[0]} y2={pt(course, R - 10)[1]}
            stroke="currentColor" className="text-foreground" strokeWidth="1"
            strokeDasharray="5 4" opacity={0.13} />

      {/* ── subtle filled triangle ───────────────────────────────────────────────── */}
      <polygon
        points={`${CX},${CY} ${A[0]},${A[1]} ${G[0]},${G[1]}`}
        fill="currentColor" fillOpacity={0.03} stroke="none"
      />

      {/* ── AIR vector — solid, primary ─────────────────────────────────────────── */}
      <line x1={CX} y1={CY} x2={A[0]} y2={A[1]}
            stroke="currentColor" className="text-primary" strokeWidth="2.5"
            strokeLinecap="round" markerEnd="url(#wt-ah-air)" />

      {/* ── WIND vector — dashed, blue ──────────────────────────────────────────── */}
      <line x1={A[0]} y1={A[1]} x2={G[0]} y2={G[1]}
            stroke="currentColor" className="text-blue-500" strokeWidth="2"
            strokeLinecap="round" strokeDasharray="6 3"
            markerEnd="url(#wt-ah-wind)" />

      {/* ── TRACK vector — solid, amber ─────────────────────────────────────────── */}
      <line x1={CX} y1={CY} x2={G[0]} y2={G[1]}
            stroke="currentColor" className="text-amber-500" strokeWidth="2.5"
            strokeLinecap="round" markerEnd="url(#wt-ah-track)" />

      {/* ── WCA arc (near center) ───────────────────────────────────────────────── */}
      {showArc && (
        <path
          d={`M ${Ph[0]} ${Ph[1]} A ${R_ARC} ${R_ARC} 0 0 ${sweep} ${Pt[0]} ${Pt[1]}`}
          fill="none" stroke="currentColor" className="text-primary"
          strokeWidth="1.5" opacity={0.4}
        />
      )}

      {/* ── airplane glyph at center ────────────────────────────────────────────── */}
      <g fill="currentColor" className="text-primary"
         transform={`translate(${CX} ${CY}) rotate(${trueHeading})`}>
        <polygon points="0,-12 2,-4 2,2 7,4 7,6.5 2,6.5 2,11 -2,11 -2,6.5 -7,6.5 -7,4 -2,2 -2,-4" />
      </g>
    </svg>
  )
}

// ── copyable stat row ──────────────────────────────────────────────────────────

function Stat({
  label,
  value,
  color,
  icon,
}: {
  label: string
  value: string
  color?: string
  icon?: React.ReactNode
}) {
  const copy = () => {
    navigator.clipboard?.writeText(value).then(
      () => toast.success('Copied'),
      () => {},
    )
  }
  return (
    <div className="flex items-center justify-between py-[5px] group">
      <span className="text-xs text-muted-foreground flex items-center gap-1.5 select-none">
        {icon}
        {label}
      </span>
      <span className="flex items-center gap-1">
        <span className={`text-sm font-semibold font-mono tabular-nums ${color ?? ''}`}>
          {value}
        </span>
        <button
          onClick={copy}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
          aria-label={`Copy ${label}`}
        >
          <Copy className="w-3 h-3 text-muted-foreground/50 hover:text-foreground" />
        </button>
      </span>
    </div>
  )
}

// ── main component ─────────────────────────────────────────────────────────────

export default function WindTriangleTool() {
  const [tas, setTas] = useState(120)
  const [course, setCourse] = useState(360)
  const [windFrom, setWindFrom] = useState(270)
  const [windSpeed, setWindSpeed] = useState(15)
  const [applyMag, setApplyMag] = useState(false)
  const [lat, setLat] = useState(39.86)
  const [lng, setLng] = useState(-104.67)

  const auth = useDesktopAuth()

  const variation = useMemo(() => {
    if (!applyMag) return 0
    try {
      return calculateMagneticVariation(lat, lng, new Date().getFullYear())
    } catch {
      return 0
    }
  }, [applyMag, lat, lng])

  // ── wind triangle computation (unchanged) ────────────────────────────────────
  const result = useMemo(() => {
    const safeTas = tas > 0 ? tas : 1
    const trueCourse = applyMag ? norm360(course + variation) : norm360(course)
    const trueWindFrom = applyMag ? norm360(windFrom + variation) : norm360(windFrom)

    const angle = trueWindFrom - trueCourse
    const ratio = Math.max(-1, Math.min(1, (windSpeed / safeTas) * Math.sin(angle * RAD)))
    const wca = Math.asin(ratio) * DEG
    const trueHeading = norm360(trueCourse + wca)

    const toBearing = norm360(trueWindFrom + 180)
    const gEast = safeTas * Math.sin(trueHeading * RAD) + windSpeed * Math.sin(toBearing * RAD)
    const gNorth = safeTas * Math.cos(trueHeading * RAD) + windSpeed * Math.cos(toBearing * RAD)
    const gs = Math.hypot(gEast, gNorth)
    const track = norm360(Math.atan2(gEast, gNorth) * DEG)

    const crosswind = windSpeed * Math.sin(angle * RAD)
    const headwind = windSpeed * Math.cos(angle * RAD)

    const magneticHeading = applyMag
      ? norm360(trueToMagnetic(trueHeading, -variation))
      : norm360(trueHeading)

    return {
      wca,
      trueHeading,
      magneticHeading,
      gs,
      track,
      crosswind,
      headwind,
      trueCourse,
      trueWindFrom,
    }
  }, [tas, course, windFrom, windSpeed, applyMag, variation])

  const {
    wca,
    trueHeading,
    magneticHeading,
    gs,
    track,
    crosswind,
    headwind,
    trueCourse,
    trueWindFrom,
  } = result

  // ── geolocation ──────────────────────────────────────────────────────────────
  const getLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      notify('Geolocation unavailable')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(+pos.coords.latitude.toFixed(4))
        setLng(+pos.coords.longitude.toFixed(4))
      },
      () => notify('Location unavailable'),
    )
  }, [])

  // ── debounce history logging ─────────────────────────────────────────────────
  const userId =
    auth.localUser?.id ?? auth.cloudUser?.id ?? auth.cloudUser?.email ?? 'anonymous'
  const signature = JSON.stringify({
    tas, course, windFrom, windSpeed, applyMag, lat, lng, ...result, uid: userId,
  })
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        void logToolUse(
          userId,
          'wind-triangle',
          { tas, course, windFrom, windSpeed, magneticApplied: applyMag, lat, lng },
          { wca, trueHeading, magneticHeading, gs, track },
        )
      } catch { /* best-effort */ }
    }, 1000)
    return () => clearTimeout(t)
  }, [signature])

  // ── derived display values ───────────────────────────────────────────────────
  const wcaStr = `${wca >= 0 ? '+' : ''}${wca.toFixed(1)}°`
  const crosswindSide =
    Math.abs(crosswind) < 0.1 ? 'none' : crosswind >= 0 ? 'right' : 'left'
  const headingCard = getCardinalDirection(trueHeading)
  const trackCard = getCardinalDirection(track)

  return (
    <ToolShell
      title="Wind Triangle"
      description="TAS, course, and winds resolve into a live vector triangle — WCA, heading, ground speed, and track."
      notesUserId={userId}
      notesTool="wind-triangle"
    >
      {/* Zero-scroll two-column layout */}
      <div className="h-full flex flex-col lg:flex-row gap-4 min-h-0">
        {/* ── LEFT: SVG compass (hero) ──────────────────────────────────────── */}
        <div className="shrink-0 w-full lg:w-[45%] flex flex-col min-h-0">
          <div className="flex-1 min-h-0 flex items-center justify-center">
            <CompassTriangle
              tas={tas}
              trueHeading={trueHeading}
              track={track}
              gs={gs}
              windFromTrue={trueWindFrom}
              windSpeed={windSpeed}
              course={applyMag ? trueCourse : course}
            />
          </div>

          {/* Legend */}
          <div className="flex items-center justify-center gap-5 py-1.5 text-[11px] text-muted-foreground shrink-0">
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-0.5 bg-primary rounded-full inline-block" />
              Air (TAS)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-0 border-t-2 border-dashed border-blue-500 inline-block" />
              Wind
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-0.5 bg-amber-500 rounded-full inline-block" />
              Track (GS)
            </span>
          </div>
        </div>

        {/* ── RIGHT: inputs + results + mag var ─────────────────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col gap-3 min-h-0">
          {/* Input grid — 2×2 compact */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-2 shrink-0">
            <div>
              <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Navigation className="w-3 h-3" /> Course (°)
              </Label>
              <Input
                type="number"
                value={course}
                onChange={(e) => setCourse(e.target.value === '' ? 0 : Number(e.target.value))}
                className="mt-1 h-8 text-sm font-mono"
              />
              {applyMag && (
                <p className="text-[10px] text-blue-500 mt-0.5">
                  → True {Math.round(trueCourse)}°
                </p>
              )}
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Wind className="w-3 h-3" /> Wind From (°)
              </Label>
              <Input
                type="number"
                value={windFrom}
                onChange={(e) => setWindFrom(e.target.value === '' ? 0 : Number(e.target.value))}
                className="mt-1 h-8 text-sm font-mono"
              />
              {applyMag && (
                <p className="text-[10px] text-blue-500 mt-0.5">
                  → True {Math.round(trueWindFrom)}°
                </p>
              )}
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Compass className="w-3 h-3" /> TAS (kts)
              </Label>
              <Input
                type="number"
                value={tas}
                onChange={(e) => setTas(e.target.value === '' ? 0 : Number(e.target.value))}
                className="mt-1 h-8 text-sm font-mono"
              />
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Wind className="w-3 h-3" /> Wind Speed (kts)
              </Label>
              <Input
                type="number"
                value={windSpeed}
                onChange={(e) => setWindSpeed(e.target.value === '' ? 0 : Number(e.target.value))}
                className="mt-1 h-8 text-sm font-mono"
              />
            </div>
          </div>

          {/* Results — compact stat rows, flexes to fill remaining space */}
          <div className="bg-muted/30 rounded-xl px-4 py-2 shrink-0">
            <Stat
              label="WCA"
              value={wcaStr}
              color={
                wca > 0.1 ? 'text-amber-500' : wca < -0.1 ? 'text-blue-500' : ''
              }
            />
            <Stat
              label="True Heading"
              value={`${Math.round(trueHeading)}° ${headingCard}`}
              color="text-primary"
              icon={<Navigation className="w-3 h-3 text-primary" />}
            />
            <Stat
              label="Magnetic Heading"
              value={`${Math.round(magneticHeading)}°`}
            />
            <Stat
              label="Ground Speed"
              value={`${gs.toFixed(1)} kt`}
            />
            <Stat
              label="Track"
              value={`${Math.round(track)}° ${trackCard}`}
              color="text-amber-500"
              icon={<Compass className="w-3 h-3 text-amber-500" />}
            />
            <Stat
              label="Crosswind"
              value={`${Math.abs(crosswind).toFixed(1)} kt ${crosswindSide}`}
              color={crosswindSide !== 'none' ? 'text-blue-500' : ''}
            />
            <Stat
              label={headwind >= 0 ? 'Headwind' : 'Tailwind'}
              value={`${Math.abs(headwind).toFixed(1)} kt`}
              color={headwind < 0 ? 'text-red-500' : ''}
            />
          </div>

          {/* Magnetic variation toggle — always pinned to bottom */}
          <div className="flex items-center gap-3 shrink-0 flex-wrap mt-auto">
            <div className="flex items-center gap-2">
              <Switch checked={applyMag} onCheckedChange={setApplyMag} />
              <span className="text-xs text-muted-foreground">Magnetic variation</span>
            </div>
            {applyMag && (
              <>
                <span className="text-xs font-mono text-blue-500">
                  {variation >= 0 ? '+' : ''}
                  {variation.toFixed(1)}° {variation >= 0 ? 'E' : 'W'}
                </span>
                <Input
                  type="number"
                  step="0.0001"
                  value={lat}
                  onChange={(e) => setLat(Number(e.target.value) || 0)}
                  className="h-7 w-24 text-xs font-mono"
                  placeholder="Lat"
                />
                <Input
                  type="number"
                  step="0.0001"
                  value={lng}
                  onChange={(e) => setLng(Number(e.target.value) || 0)}
                  className="h-7 w-24 text-xs font-mono"
                  placeholder="Lon"
                />
                <Button variant="ghost" size="sm" onClick={getLocation} className="h-7 text-xs">
                  <MapPin className="w-3 h-3 mr-1" /> Use my location
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </ToolShell>
  )
}
