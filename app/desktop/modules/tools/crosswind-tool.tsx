'use client'

import { useState, useMemo, useEffect } from 'react'
import { HelpCircle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ToolShell, Field, StatCard } from '@/components/ui/e6b'
import { logToolUse } from '@/desktop/lib/e6b-store'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'

// ── constants ──────────────────────────────────────────────────────────────────

const RAD = Math.PI / 180

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
      <text x={x} y={y} textAnchor={anchor as 'start' | 'middle' | 'end'}
            className={`fill-foreground text-sm font-medium ${className}`}>
        {text}
      </text>
    </g>
  )
}

// ── runway diagram SVG ─────────────────────────────────────────────────────────

function RunwayDiagram({
  rwyHdg,
  windDir,
  windSpeed,
  xw,
  hw,
  gustXw,
  hasGusts,
}: {
  rwyHdg: number
  windDir: number
  windSpeed: number
  xw: number
  hw: number
  gustXw: number
  hasGusts: boolean
}) {
  const rwyNumber = Math.round(rwyHdg / 10) % 100
  const reciprocalHdg = (rwyHdg + 180) % 360
  const reciprocalNumber = Math.round(reciprocalHdg / 10) % 100

  // Layout constants
  const CX = 400
  const CY = 140
  const RWY_L = 100
  const RWY_R = 700

  const windAngleRad = (windDir - rwyHdg) * RAD
  const windArrowLen = Math.min(windSpeed * 3, 120)

  // Wind arrow start: outside the runway in the direction the wind comes FROM
  const windStartX = CX - windArrowLen * Math.cos(windAngleRad)
  const windStartY = CY - windArrowLen * Math.sin(windAngleRad)

  // Crosswind arrow: perpendicular to runway
  const xwArrowLen = Math.min(Math.abs(xw) * 3, 100)
  const xwSign = xw >= 0 ? -1 : 1 // positive xw = from right = up in SVG
  const xwEndY = CY + xwArrowLen * xwSign

  // Headwind / tailwind arrow: parallel to runway, above it
  const hwArrowLen = Math.min(Math.abs(hw) * 3, 100)
  const hwDir = hw >= 0 ? 1 : -1
  const hwEndX = CX + hwArrowLen * hwDir
  const hwY = CY - 45

  // Gust crosswind extension
  const gustXwArrowLen = hasGusts ? Math.min(gustXw * 3, 100) : 0
  const gustXwEndY = CY + gustXwArrowLen * xwSign

  // Windsock direction (where wind blows TO)
  const sockLen = Math.min(windSpeed * 1.2, 28)
  const sockDx = -Math.sin(windDir * RAD) * sockLen
  const sockDy = Math.cos(windDir * RAD) * sockLen

  return (
    <svg
      viewBox="0 0 800 280"
      className="w-full h-full"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Runway crosswind diagram"
    >
      <defs>
        <marker id="cw-b" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,1 L8,5 L0,9 L2,5 Z" fill="context-stroke" />
        </marker>
        <marker id="cw-a" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,1 L8,5 L0,9 L2,5 Z" fill="context-stroke" />
        </marker>
        <marker id="cw-g" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,1 L8,5 L0,9 L2,5 Z" fill="context-stroke" />
        </marker>
      </defs>

      {/* ── Compass rose (top-left) ──────────────────────────────── */}
      <g transform="translate(50,35)">
        <circle r={18} fill="none" stroke="currentColor" strokeOpacity={0.15} strokeWidth={1} />
        <text y={-21} textAnchor="middle" fontSize={8} className="fill-foreground" fillOpacity={0.35}>N</text>
        <text y={26} textAnchor="middle" fontSize={8} className="fill-foreground" fillOpacity={0.35}>S</text>
        <text x={-23} y={3} textAnchor="middle" fontSize={8} className="fill-foreground" fillOpacity={0.35}>W</text>
        <text x={23} y={3} textAnchor="middle" fontSize={8} className="fill-foreground" fillOpacity={0.35}>E</text>
        <line x1={0} y1={-15} x2={0} y2={15} stroke="currentColor" strokeOpacity={0.15} strokeWidth={0.5} />
        <line x1={-15} y1={0} x2={15} y2={0} stroke="currentColor" strokeOpacity={0.15} strokeWidth={0.5} />
        {/* Wind direction needle */}
        {windSpeed > 0 && (
          <line
            x1={0} y1={0}
            x2={-Math.sin(windDir * RAD) * 14}
            y2={Math.cos(windDir * RAD) * 14}
            stroke="currentColor" className="text-blue-500" strokeWidth={2} strokeLinecap="round"
          />
        )}
      </g>

      {/* ── Control tower (left side) ───────────────────────────── */}
      <g fill="currentColor" className="text-muted-foreground">
        {/* Tower base */}
        <rect x={25} y={95} width={30} height={80} rx={2} fillOpacity={0.12} />
        {/* Cabin (wider) */}
        <rect x={15} y={80} width={50} height={16} rx={2} fillOpacity={0.18} />
        {/* Windows */}
        <rect x={20} y={83} width={10} height={7} rx={1} fillOpacity={0.1} />
        <rect x={35} y={83} width={10} height={7} rx={1} fillOpacity={0.1} />
        <rect x={50} y={83} width={10} height={7} rx={1} fillOpacity={0.1} />
        {/* Antenna */}
        <line x1={40} y1={80} x2={40} y2={65} stroke="currentColor" strokeWidth={2} strokeOpacity={0.2} />
        <circle cx={40} cy={63} r={3} fill="currentColor" className="text-red-500" fillOpacity={0.4} />
      </g>
      <LabelBg x={40} y={188} text="Tower" className="text-muted-foreground" />

      {/* ── Windsock (right side) ───────────────────────────────── */}
      <g>
        <line x1={755} y1={175} x2={755} y2={85} stroke="currentColor" strokeWidth={2} strokeOpacity={0.3} />
        <circle cx={755} cy={85} r={2.5} fill="currentColor" fillOpacity={0.3} />
        {windSpeed > 0 && (
          <polygon
            points={`755,81 755,89 ${755 + sockDx},${85 + sockDy}`}
            fill="currentColor" className="text-orange-500" fillOpacity={0.5}
          />
        )}
      </g>
      <LabelBg x={755} y={188} text="Windsock" className="text-muted-foreground" />

      {/* ── Runway bar ──────────────────────────────────────────── */}
      <line
        x1={RWY_L} y1={CY} x2={RWY_R} y2={CY}
        stroke="currentColor" className="text-muted-foreground/30"
        strokeWidth={26} strokeLinecap="round"
      />
      {/* Center dashes */}
      <line
        x1={RWY_L + 20} y1={CY} x2={RWY_R - 20} y2={CY}
        stroke="currentColor" className="text-muted-foreground"
        strokeWidth={6} strokeDasharray="14 10"
      />

      {/* ── Threshold markings (piano keys) ─────────────────────── */}
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={`th-${i}`}>
          <line
            x1={RWY_L + 10} y1={CY - 12 + i * 6}
            x2={RWY_L + 28} y2={CY - 12 + i * 6}
            stroke="currentColor" className="text-muted-foreground"
            strokeWidth={2} strokeOpacity={0.4}
          />
          <line
            x1={RWY_R - 28} y1={CY - 12 + i * 6}
            x2={RWY_R - 10} y2={CY - 12 + i * 6}
            stroke="currentColor" className="text-muted-foreground"
            strokeWidth={2} strokeOpacity={0.4}
          />
        </g>
      ))}

      {/* ── Runway designation numbers ──────────────────────────── */}
      <LabelBg x={RWY_L + 45} y={CY - 22} text={`${rwyNumber}`}
               className="text-muted-foreground font-bold" />
      <LabelBg x={RWY_R - 45} y={CY - 22} text={`${reciprocalNumber}`}
               className="text-muted-foreground font-bold" />

      {/* ── Wind arrow (blue) ───────────────────────────────────── */}
      {windSpeed > 0 && (
        <>
          <line
            x1={windStartX} y1={windStartY} x2={CX} y2={CY}
            stroke="currentColor" className="text-blue-500" strokeWidth="3"
            strokeLinecap="round" markerEnd="url(#cw-b)"
          />
          <LabelBg
            x={windStartX + (Math.cos(windAngleRad) > 0 ? 12 : -12)}
            y={windStartY + (Math.sin(windAngleRad) > 0 ? -8 : 16)}
            text={`${windSpeed}kt FROM ${windDir}°`}
            anchor={Math.cos(windAngleRad) > 0 ? 'start' : 'end'}
            className="text-blue-500"
          />
        </>
      )}

      {/* ── Crosswind arrow (amber) ─────────────────────────────── */}
      {Math.abs(xw) >= 0.5 && (
        <>
          <line
            x1={CX} y1={CY} x2={CX} y2={xwEndY}
            stroke="currentColor" className="text-amber-500" strokeWidth="3"
            strokeLinecap="round" markerEnd="url(#cw-a)"
          />
          <LabelBg
            x={CX + 14} y={xwEndY + (xwSign < 0 ? -4 : 16)}
            text={`${Math.abs(xw).toFixed(1)} kt XW`}
            anchor="start"
            className="text-amber-500"
          />
        </>
      )}

      {/* ── Gust crosswind extension (dashed amber) ─────────────── */}
      {hasGusts && gustXw > Math.abs(xw) + 0.5 && (
        <>
          <line
            x1={CX} y1={xwEndY} x2={CX} y2={gustXwEndY}
            stroke="currentColor" className="text-amber-500"
            strokeWidth="2" strokeDasharray="5 4"
            markerEnd="url(#cw-a)"
          />
          <LabelBg
            x={CX + 14} y={gustXwEndY + (xwSign < 0 ? -4 : 16)}
            text={`G ${gustXw.toFixed(1)} kt`}
            anchor="start"
            className="text-amber-500"
          />
        </>
      )}

      {/* ── Headwind / tailwind arrow (emerald) — above runway ──── */}
      {Math.abs(hw) >= 0.5 && (
        <>
          <line
            x1={CX} y1={hwY} x2={hwEndX} y2={hwY}
            stroke="currentColor" className="text-emerald-500" strokeWidth="3"
            strokeLinecap="round" markerEnd="url(#cw-g)"
          />
          {/* Label centered above the arrow — never overlaps runway labels */}
          <LabelBg
            x={(CX + hwEndX) / 2} y={hwY - 12}
            text={`${Math.abs(hw).toFixed(1)} kt ${hw >= 0 ? 'HW' : 'TW'}`}
            anchor="middle"
            className="text-emerald-500"
          />
        </>
      )}

      {/* ── Airplane at right threshold ─────────────────────────── */}
      <g
        fill="currentColor" className="text-muted-foreground"
        transform={`translate(${RWY_R - 25}, ${CY}) rotate(-90) scale(1.8)`}
      >
        <polygon points="0,-7 1.2,-2.5 1.2,1.5 5,3 5,4.5 1.2,4.5 1.2,6 -1.2,6 -1.2,4.5 -5,4.5 -5,3 -1.2,1.5 -1.2,-2.5" />
      </g>
    </svg>
  )
}

// ── main component ─────────────────────────────────────────────────────────────

export default function CrosswindTool() {
  const [rwyHdg, setRwyHdg] = useState(180)
  const [windDir, setWindDir] = useState(220)
  const [windSpeed, setWindSpeed] = useState(15)
  const [gusts, setGusts] = useState<number | ''>('')
  const [xwLimit, setXwLimit] = useState(15)

  const auth = useDesktopAuth()

  // Live computation — no Calculate button needed
  const result = useMemo(() => {
    const angleRad = (windDir - rwyHdg) * RAD
    const xw = windSpeed * Math.sin(angleRad) // + = from the right
    const hw = windSpeed * Math.cos(angleRad) // + = headwind, − = tailwind

    let gustXw = 0
    let gustHw = 0
    if (gusts !== '') {
      const g = Number(gusts)
      gustXw = Math.abs(g * Math.sin(angleRad))
      gustHw = g * Math.cos(angleRad)
    }

    const side: 'left' | 'right' | 'none' =
      Math.abs(xw) < 0.5 ? 'none' : xw >= 0 ? 'right' : 'left'

    return {
      xw: +Math.abs(xw).toFixed(1),
      xwSigned: +xw.toFixed(1),
      hw: +hw.toFixed(1),
      gustXw: +gustXw.toFixed(1),
      gustHw: +gustHw.toFixed(1),
      side,
      tailwind: hw < -0.5,
      headwind: hw > 0.5,
    }
  }, [rwyHdg, windDir, windSpeed, gusts])

  const { xw, xwSigned, hw, gustXw, side, tailwind, headwind } = result
  const hasGusts = gusts !== '' && Number(gusts) > 0
  const effectiveXw = hasGusts ? gustXw : xw

  // Debounced history logging
  const userId =
    auth.localUser?.id ?? auth.cloudUser?.id ?? auth.cloudUser?.email ?? 'anonymous'
  const signature = JSON.stringify({
    rwyHdg, windDir, windSpeed, gusts, xw, hw, gustXw, uid: userId,
  })
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        void logToolUse(
          userId,
          'crosswind',
          { rwyHdg, windFrom: windDir, windSpeed, gusts },
          { xw, hw, gustXw, resultant: windSpeed },
        )
      } catch { /* best-effort local-only */ }
    }, 1000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])

  const xwTone: 'good' | 'warn' | 'bad' =
    xw < 10 ? 'good' : xw <= 15 ? 'warn' : 'bad'
  const gustXwTone: 'good' | 'warn' | 'bad' =
    gustXw < 10 ? 'good' : gustXw <= 15 ? 'warn' : 'bad'

  return (
    <ToolShell
      title="Crosswind Calculator"
      description="Runway crosswind and headwind/tailwind components from reported winds. Includes live runway diagram."
      notesUserId={userId}
      notesTool="crosswind"
    >
      <div className="flex flex-col h-full gap-2">
        {/* ── Formula hint ──────────────────────────────────────────── */}
        <div className="shrink-0 flex items-center gap-1 text-[10px] text-muted-foreground px-1">
          <HelpCircle className="w-3 h-3 shrink-0" />
          <span>XW = wind × sin(wind − rwy) &nbsp;|&nbsp; HW = wind × cos(wind − rwy)</span>
        </div>

        {/* ── Runway diagram SVG — hero element ────────────────────── */}
        <div className="flex-1 min-h-0 bg-muted/30 rounded-lg flex items-center justify-center px-2 py-1 overflow-hidden">
          <RunwayDiagram
            rwyHdg={rwyHdg}
            windDir={windDir}
            windSpeed={windSpeed}
            xw={xwSigned}
            hw={hw}
            gustXw={gustXw}
            hasGusts={hasGusts}
          />
        </div>

        {/* ── Inputs strip ─────────────────────────────────────────── */}
        <div className="shrink-0 grid grid-cols-2 lg:grid-cols-4 gap-x-3 gap-y-1 px-1">
          <div>
            <Label className="text-[10px] text-muted-foreground">
              Rwy {Math.round(rwyHdg / 10) % 100} → {rwyHdg}°
            </Label>
            <Input
              type="number"
              value={rwyHdg}
              onChange={(e) => setRwyHdg(Number(e.target.value) || 0)}
              className="mt-0.5"
            />
          </div>
          <Field
            label="Wind From (°)"
            value={windDir}
            onChange={(v) => setWindDir(Number(v))}
          />
          <Field
            label="Wind Speed (kts)"
            value={windSpeed}
            onChange={(v) => setWindSpeed(Number(v))}
          />
          <div>
            <Label className="text-[10px] text-muted-foreground">Gusts (kts, opt)</Label>
            <Input
              type="number"
              value={gusts}
              placeholder="—"
              className="mt-0.5"
              onChange={(e) =>
                setGusts(e.target.value === '' ? '' : Number(e.target.value))
              }
            />
          </div>
        </div>

        {/* ── Results strip ────────────────────────────────────────── */}
        <div className="shrink-0 grid grid-cols-2 lg:grid-cols-4 gap-2 px-1">
          {/* Crosswind */}
          <StatCard
            label="Crosswind"
            tone={xwTone}
            value={
              <>
                {xw} kts
                <span className="text-[10px] text-muted-foreground block font-normal">
                  {side === 'none'
                    ? 'No significant crosswind'
                    : `from the ${side}`}
                </span>
              </>
            }
          />

          {/* Headwind / Tailwind */}
          <StatCard
            label={headwind ? 'Headwind' : tailwind ? 'Tailwind' : 'Along Runway'}
            value={
              <>
                {Math.abs(hw)} kts{' '}
                <Badge
                  variant={headwind ? 'default' : 'secondary'}
                  className={`text-[10px] ${
                    tailwind
                      ? 'text-amber-500 border-amber-500/30'
                      : ''
                  }`}
                >
                  {headwind ? 'Headwind' : tailwind ? 'Tailwind' : 'Direct'}
                </Badge>
              </>
            }
          />

          {/* Gust crosswind (conditional) */}
          {hasGusts && (
            <StatCard
              label="Peak XW w/ gusts"
              tone={gustXwTone}
              value={`${gustXw} kts`}
            />
          )}

          {/* Crosswind limit check */}
          <StatCard
            label="Limit Check"
            tone={effectiveXw <= xwLimit ? 'good' : 'bad'}
            value={
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    value={xwLimit}
                    onChange={(e) =>
                      setXwLimit(Number(e.target.value) || 15)
                    }
                    className="h-6 w-14 text-xs px-1.5"
                  />
                  <span className="text-[10px] text-muted-foreground">kts</span>
                </div>
                <Badge
                  variant={effectiveXw <= xwLimit ? 'default' : 'destructive'}
                  className={`text-[10px] ${
                    effectiveXw <= xwLimit
                      ? 'bg-emerald-500/20 text-emerald-600 border-emerald-500/30'
                      : ''
                  }`}
                >
                  {effectiveXw <= xwLimit
                    ? '✓ Within limits'
                    : '⚠ EXCEEDS LIMIT'}
                </Badge>
              </div>
            }
          />
        </div>
      </div>
    </ToolShell>
  )
}
