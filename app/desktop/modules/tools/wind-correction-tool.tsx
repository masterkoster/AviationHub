'use client'

import { useState, useMemo, useEffect } from 'react'
import { Wind, Navigation, HelpCircle, Compass, Copy } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { ToolShell, Field, ResultGrid } from '@/components/ui/e6b'
import { logToolUse } from '@/desktop/lib/e6b-store'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import {
  calculateMagneticVariation,
  trueToMagnetic,
} from '@/app/modules/fuel-saver/lib/magneticVariation'

// ── constants ──────────────────────────────────────────────────────────────────

const RAD = Math.PI / 180
const DEG = 180 / Math.PI
const norm360 = (d: number): number => ((d % 360) + 360) % 360

/** Reusable label with background rect for SVG readability. */
function LabelBg({ x, y, text, anchor = 'middle', className = '' }: {
  x: number; y: number; text: string; anchor?: string; className?: string
}) {
  const estimatedWidth = text.length * 7 + 12
  const tx = anchor === 'end' ? x - estimatedWidth : anchor === 'start' ? x : x - estimatedWidth / 2
  return (
    <g>
      <rect x={tx} y={y - 13} width={estimatedWidth} height={18} rx={4}
            className="fill-background/90 stroke-border" strokeWidth={0.5} />
      <text x={x} y={y} textAnchor={anchor as any}
            className={`fill-foreground text-sm font-medium ${className}`}>
        {text}
      </text>
    </g>
  )
}

// ── copyable result row ────────────────────────────────────────────────────────

function Row({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color?: 'amber' | 'blue' | 'green' | 'red' | 'primary'
}) {
  const copy = () => {
    navigator.clipboard?.writeText(value).then(
      () => toast.success(`${value} copied`),
      () => {},
    )
  }
  return (
    <div className="flex justify-between items-center gap-2">
      <span className="text-sm text-muted-foreground flex-1">{label}</span>
      <span
        className={`font-semibold font-mono tabular-nums ${
          color === 'amber'
            ? 'text-amber-500'
            : color === 'blue'
              ? 'text-blue-500'
              : color === 'green'
                ? 'text-emerald-500'
                : color === 'red'
                  ? 'text-red-500'
                  : color === 'primary'
                    ? 'text-primary'
                    : ''
        }`}
      >
        {value}
      </span>
      <button
        onClick={copy}
        className="text-muted-foreground/40 hover:text-muted-foreground transition-colors p-0.5"
        aria-label={`Copy ${label}`}
      >
        <Copy className="w-3 h-3" />
      </button>
    </div>
  )
}

// ── compass rose SVG ───────────────────────────────────────────────────────────

function CompassRose({
  course,
  heading,
  windFrom,
  windSpeed,
  track,
  gs,
}: {
  course: number
  heading: number
  windFrom: number
  windSpeed: number
  track: number
  gs: number
}) {
  const CX = 250
  const CY = 250
  const R = 200

  const pt = (bearing: number, r: number): [number, number] => [
    CX + r * Math.sin(bearing * RAD),
    CY - r * Math.cos(bearing * RAD),
  ]

  const courseEnd = pt(course, 150)
  const headingEnd = pt(heading, 150)

  // Wind arrow: from the rim toward the center (shows wind pushing inward)
  const windArrowLen = Math.min(windSpeed * 3, 112)
  const windStart = pt(windFrom, R - 2)
  const windEnd = pt(windFrom, R - 2 - windArrowLen)

  // Label placement: put TRK and HDG on opposite sides to avoid overlap
  const trkRight = course <= 180
  const hdgRight = heading > 180

  return (
    <svg
      viewBox="0 0 500 500"
      className="w-full h-auto"
      role="img"
      aria-label="Wind correction compass diagram"
    >
      <defs>
        <marker id="wc-ap" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,1 L8,5 L0,9 L2,5 Z" fill="context-stroke" />
        </marker>
        <marker id="wc-ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,1 L8,5 L0,9 L2,5 Z" fill="context-stroke" />
        </marker>
        <marker id="wc-aw" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,1 L8,5 L0,9 L2,5 Z" fill="context-stroke" />
        </marker>
      </defs>

      {/* Compass circle */}
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="currentColor" className="text-border" strokeWidth="2" />

      {/* Tick marks — every 10° */}
      {Array.from({ length: 36 }, (_, i) => i * 10).map((d) => {
        const isCard = d % 90 === 0
        const a = pt(d, R)
        const b = pt(d, R - (isCard ? 20 : 13))
        return (
          <line
            key={d}
            x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]}
            stroke="currentColor" className="text-muted-foreground"
            strokeWidth={isCard ? 1.5 : 0.75}
          />
        )
      })}

      {/* Cardinal labels */}
      <g fill="currentColor" fontSize="15" fontWeight={700}>
        <LabelBg x={CX} y={CY - R - 10} text="N" anchor="middle" className="text-muted-foreground" />
        <LabelBg x={CX + R + 13} y={CY + 4} text="E" anchor="start" className="text-muted-foreground" />
        <LabelBg x={CX} y={CY + R + 15} text="S" anchor="middle" className="text-muted-foreground" />
        <LabelBg x={CX - R - 13} y={CY + 4} text="W" anchor="end" className="text-muted-foreground" />
      </g>

      {/* Course arrow — solid, primary (emerald) */}
      <line
        x1={CX} y1={CY} x2={courseEnd[0]} y2={courseEnd[1]}
        stroke="currentColor" className="text-primary" strokeWidth="3"
        strokeLinecap="round" markerEnd="url(#wc-ap)"
      />

      {/* Heading arrow — dashed, amber */}
      <line
        x1={CX} y1={CY} x2={headingEnd[0]} y2={headingEnd[1]}
        stroke="currentColor" className="text-amber-500" strokeWidth="3"
        strokeLinecap="round" strokeDasharray="6 4" markerEnd="url(#wc-ah)"
      />

      {/* Wind arrow — blue, from rim toward center */}
      {windSpeed > 0 && (
        <line
          x1={windStart[0]} y1={windStart[1]} x2={windEnd[0]} y2={windEnd[1]}
          stroke="currentColor" className="text-blue-500" strokeWidth="3"
          strokeLinecap="round" markerEnd="url(#wc-aw)"
        />
      )}

      {/* Airplane glyph at heading tip — scaled up */}
      <g
        fill="currentColor" className="text-amber-500"
        transform={`translate(${headingEnd[0]} ${headingEnd[1]}) rotate(${heading}) scale(1.5)`}
      >
        <polygon points="0,-7 1.2,-2.5 1.2,1.5 5,3 5,4.5 1.2,4.5 1.2,6 -1.2,6 -1.2,4.5 -5,4.5 -5,3 -1.2,1.5 -1.2,-2.5" />
      </g>

      {/* TRK label: at end of course vector + 15px further along same angle */}
      {(() => {
        const trkAngle = Math.atan2(courseEnd[1] - CY, courseEnd[0] - CX)
        const trkLen = Math.hypot(courseEnd[0] - CX, courseEnd[1] - CY)
        const extLen = trkLen + 19
        const extX = CX + extLen * Math.cos(trkAngle)
        const extY = CY + extLen * Math.sin(trkAngle)
        const deg = (Math.atan2(Math.sin(trkAngle), Math.cos(trkAngle)) * DEG + 360) % 360
        return (
          <LabelBg x={extX} y={extY + 4} text={`TRK ${Math.round(track)}°`}
            anchor={deg > 0 && deg < 180 ? 'start' : 'end'} className="text-primary font-semibold" />
        )
      })()}

      {/* HDG label: if headings are close, offset perpendicular by 20px */}
      {(() => {
        const diff = Math.abs(norm360(heading - course))
        const close = Math.min(diff, 360 - diff) < 10
        const hdgAngle = Math.atan2(headingEnd[1] - CY, headingEnd[0] - CX)
        const hdgLen = Math.hypot(headingEnd[0] - CX, headingEnd[1] - CY)
        const extLen = hdgLen + (close ? 0 : 19)
        let lx = CX + extLen * Math.cos(hdgAngle)
        let ly = CY + extLen * Math.sin(hdgAngle)
        if (close) {
          // Offset perpendicular by 20px
          const perpAngle = hdgAngle + Math.PI / 2
          lx += 25 * Math.cos(perpAngle)
          ly += 25 * Math.sin(perpAngle)
        }
        const deg = (Math.atan2(Math.sin(hdgAngle), Math.cos(hdgAngle)) * DEG + 360) % 360
        return (
          <LabelBg x={lx} y={ly + 4} text={`HDG ${Math.round(heading)}°`}
            anchor={deg > 0 && deg < 180 ? 'start' : 'end'} className="text-amber-500 font-semibold" />
        )
      })()}

      {/* Ground speed badge at bottom center */}
      <LabelBg x={CX} y={CY + R + 25} text={`GS ${Math.round(gs)} kts`} anchor="middle" className="text-muted-foreground font-semibold" />
    </svg>
  )
}

// ── main component ─────────────────────────────────────────────────────────────

export default function WindCorrectionTool() {
  const [tas, setTas] = useState(120)
  const [course, setCourse] = useState(360)
  const [windFrom, setWindFrom] = useState(270)
  const [windSpeed, setWindSpeed] = useState(15)
  const [applyMag, setApplyMag] = useState(false)
  const [lat, setLat] = useState(39.86)
  const [lng, setLng] = useState(-104.67)

  const auth = useDesktopAuth()

  // Magnetic variation (cached; only meaningful when switch is on)
  const variation = useMemo(() => {
    if (!applyMag) return 0
    try {
      return calculateMagneticVariation(lat, lng, new Date().getFullYear())
    } catch {
      return 0
    }
  }, [applyMag, lat, lng])

  // Core wind-triangle computation — runs on every keystroke
  const result = useMemo(() => {
    const safeTas = tas > 0 ? tas : 1
    const trueCourse = applyMag ? norm360(course + variation) : norm360(course)
    const trueWindFrom = applyMag ? norm360(windFrom + variation) : norm360(windFrom)

    // WCA: positive ⇒ wind from the right ⇒ crab right ⇒ heading > course
    const angle = trueWindFrom - trueCourse
    const ratio = Math.max(-1, Math.min(1, (windSpeed / safeTas) * Math.sin(angle * RAD)))
    const wca = Math.asin(ratio) * DEG
    const trueHeading = norm360(trueCourse + wca)

    // Ground vector = air vector (along heading) + wind vector (TO direction)
    const toBearing = norm360(trueWindFrom + 180)
    const gEast = safeTas * Math.sin(trueHeading * RAD) + windSpeed * Math.sin(toBearing * RAD)
    const gNorth = safeTas * Math.cos(trueHeading * RAD) + windSpeed * Math.cos(toBearing * RAD)
    const gs = Math.hypot(gEast, gNorth)
    const track = norm360(Math.atan2(gEast, gNorth) * DEG)

    // Signed drift: track − course, normalized to [−180, 180]
    let drift = track - trueCourse
    if (drift > 180) drift -= 360
    if (drift < -180) drift += 360

    // Headwind: positive = headwind, negative = tailwind
    const headwind = windSpeed * Math.cos(angle * RAD)

    // Magnetic heading (when variation is applied)
    const magneticHeading = applyMag
      ? norm360(trueToMagnetic(trueHeading, -variation))
      : norm360(trueHeading)

    return {
      wca,
      trueHeading,
      magneticHeading,
      gs,
      track,
      drift,
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
    drift,
    headwind,
    trueCourse,
    trueWindFrom,
  } = result

  // Debounced history logging (~1 s after last keystroke)
  const userId =
    auth.localUser?.id ?? auth.cloudUser?.id ?? auth.cloudUser?.email ?? 'anonymous'
  const signature = JSON.stringify({
    tas, course, windFrom, windSpeed, applyMag, lat, lng,
    wca, trueHeading, gs, track, drift, headwind, uid: userId,
  })
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        void logToolUse(
          userId,
          'wind',
          { tas, course, windFrom, windSpeed },
          { heading: trueHeading, wca, gs, track, drift, headwind },
        )
      } catch { /* best-effort local-only */ }
    }, 1000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])

  const wcaStr = `${wca >= 0 ? '+' : ''}${wca.toFixed(1)}°`
  const wcaColor: 'amber' | 'blue' | undefined =
    wca > 0.1 ? 'amber' : wca < -0.1 ? 'blue' : undefined
  const isHeadwind = headwind >= 0

  const getLocation = () => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        setLat(+pos.coords.latitude.toFixed(4))
        setLng(+pos.coords.longitude.toFixed(4))
      },
      () => {},
    )
  }

  return (
    <ToolShell
      title="Wind Correction Angle"
      description="Calculate WCA, required heading, ground speed, and track from TAS and winds. Includes live compass visualization."
      notesUserId={userId}
      notesTool="wind"
    >
      <div className="h-full flex flex-col gap-4 min-h-0">
        {/* Two-column grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0">
          {/* ── inputs + compass (left) ─────────────────────────────── */}
          <div className="flex flex-col min-h-0 overflow-y-auto space-y-3 pr-1">
            {/* Formula hint */}
            <div className="shrink-0 mb-1 flex items-center gap-1 text-xs text-muted-foreground">
              <HelpCircle className="w-3 h-3" />
              <span>WCA = arcsin((ws/TAS) × sin(wind − course))</span>
            </div>

            {/* Input fields */}
            <Field label="TAS (kts)" value={tas} onChange={(v) => setTas(Number(v))} />
            <Field label="Course (true)" value={course} onChange={(v) => setCourse(Number(v))} />
            {applyMag && (
              <p className="text-[11px] text-blue-500 -mt-2 ml-1">
                → True: {Math.round(trueCourse)}°
              </p>
            )}
            <Field label="Wind From (°)" value={windFrom} onChange={(v) => setWindFrom(Number(v))} />
            {applyMag && (
              <p className="text-[11px] text-blue-500 -mt-2 ml-1">
                → True: {Math.round(trueWindFrom)}°
              </p>
            )}
            <Field label="Wind Speed (kts)" value={windSpeed} onChange={(v) => setWindSpeed(Number(v))} />

            <Separator />

            {/* Magnetic variation toggle */}
            <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">
                  Apply magnetic variation
                </Label>
                <Switch checked={applyMag} onCheckedChange={setApplyMag} />
              </div>

              {applyMag && (
                <>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      {variation >= 0 ? '+' : ''}{variation}°{' '}
                      {variation >= 0 ? 'E' : 'W'}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">
                      course &amp; wind converted true → magnetic output
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">Latitude</Label>
                      <Input
                        type="number"
                        step="0.0001"
                        value={lat}
                        onChange={(e) =>
                          setLat(e.target.value === '' ? 0 : Number(e.target.value))
                        }
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Longitude</Label>
                      <Input
                        type="number"
                        step="0.0001"
                        value={lng}
                        onChange={(e) =>
                          setLng(e.target.value === '' ? 0 : Number(e.target.value))
                        }
                        className="mt-1"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={getLocation}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
                  >
                    Use my location
                  </button>
                </>
              )}
            </div>

            {/* Compass rose */}
            <div className="shrink-0 w-full bg-muted/30 rounded-xl p-4">
              <CompassRose
                course={applyMag ? trueCourse : course}
                heading={trueHeading}
                windFrom={trueWindFrom}
                windSpeed={windSpeed}
                track={track}
                gs={gs}
              />
            </div>
          </div>

          {/* ── results (right) ─────────────────────────────────────── */}
          <div className="flex flex-col min-h-0 overflow-y-auto space-y-3 pr-1">
            <ResultGrid>
              <Row
                label="Required Heading"
                value={`${Math.round(applyMag ? magneticHeading : trueHeading)}°`}
                color="primary"
              />
              <Row label="WCA" value={wcaStr} color={wcaColor} />
              <Row label="Ground Speed" value={`${Math.round(gs)} kts`} />
              <Row label="Track (true)" value={`${Math.round(track)}°`} color="amber" />
              <Row
                label="Drift"
                value={`${drift >= 0 ? '+' : ''}${drift.toFixed(1)}°`}
                color={Math.abs(drift) > 0.5 ? 'blue' : undefined}
              />
              <Separator />
              <div className="flex justify-between items-center gap-2">
                <span className="text-sm text-muted-foreground flex-1">
                  {isHeadwind ? 'Headwind' : 'Tailwind'}
                </span>
                <span
                  className={`font-semibold font-mono tabular-nums ${
                    isHeadwind ? '' : 'text-amber-500'
                  }`}
                >
                  {Math.abs(headwind).toFixed(1)} kts
                </span>
                <Badge
                  variant={isHeadwind ? 'default' : 'secondary'}
                  className={`text-[10px] ${
                    !isHeadwind
                      ? 'text-amber-500 border-amber-500/30'
                      : ''
                  }`}
                >
                  {isHeadwind ? 'Headwind' : 'Tailwind'}
                </Badge>
              </div>
            </ResultGrid>

            {/* Cardinal direction summary */}
            <ResultGrid className="!mt-2">
              <Row
                label="Heading cardinal"
                value={`${Math.round(applyMag ? magneticHeading : trueHeading)}°`}
              />
              <Row label="Track cardinal" value={`${Math.round(track)}°`} />
              <Row label="Wind-from" value={`${Math.round(trueWindFrom)}°`} />
            </ResultGrid>
          </div>
        </div>
      </div>
    </ToolShell>
  )
}
