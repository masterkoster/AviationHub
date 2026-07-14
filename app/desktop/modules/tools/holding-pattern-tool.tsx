'use client'

/**
 * Holding Pattern Calculator — replicates e6bx.com/holding-pattern.
 *
 * Features:
 *  - SVG racetrack holding pattern with compass rose
 *  - Automatic entry procedure determination (Direct / Teardrop / Parallel)
 *  - Color-coded entry sector overlays on the compass
 *  - Dashed blue entry path with direction arrows
 *  - Optional wind correction (WCA on inbound/outbound, longer/shorter leg)
 *  - Wind arrow on the SVG when wind is enabled
 *  - North-Up / Heading-Up toggle
 *  - Step-by-step entry + hold instructions (toggleable)
 *  - Leg timer (start / stop / reset) with mm:ss display
 */
import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ToolShell } from '@/components/ui/e6b'
import { logToolUse } from '@/desktop/lib/e6b-store'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'

// ── constants & helpers ──────────────────────────────────────────────────────

const RAD = Math.PI / 180
const DEG = 180 / Math.PI
const norm360 = (d: number): number => ((d % 360) + 360) % 360

interface WindResult {
  wca: number
  heading: number
  gs: number
}

function windCorrection(course: number, tas: number, wd: number, ws: number): WindResult | null {
  if (tas <= 0) return null
  const angle = (wd - course) * RAD
  const ratio = Math.max(-1, Math.min(1, (ws / tas) * Math.sin(angle)))
  const wca = Math.asin(ratio) * DEG
  const heading = norm360(course + wca)
  const toBearing = norm360(wd + 180)
  const gEast = tas * Math.sin(heading * RAD) + ws * Math.sin(toBearing * RAD)
  const gNorth = tas * Math.cos(heading * RAD) + ws * Math.cos(toBearing * RAD)
  const gs = Math.hypot(gEast, gNorth)
  return { wca, heading, gs }
}

function pad3(n: number): string {
  return ('00' + (Math.round(norm360(n)) || 360)).slice(-3)
}

// ── types ─────────────────────────────────────────────────────────────────────

type EntryType = 'direct' | 'teardrop' | 'parallel'
type TurnDir = 'left' | 'right'

interface HoldGeometry {
  holdPath: string
  entryPath: string
  directArea: string
  teardropArea: string
  parallelArea: string
  aircraftX: number
  aircraftY: number
  aircraftRot: number
  windX: number
  windY: number
  windRot: number
  showWind: boolean
  invalid: boolean
}

// ── compute ───────────────────────────────────────────────────────────────────

function computeGeometry(input: {
  heading: number
  inbound: number
  outbound: number
  direction: TurnDir
  aircraftSpeed: number
  windSpeed: number
  windDirection: number
  showEntryPath: boolean
}): { geo: HoldGeometry; entry: EntryType; holdSteps: string[]; entrySteps: string[] } {
  const t = input.heading
  const o = input.outbound
  const g = input.inbound
  const d = input.direction === 'right'
  const S = input.aircraftSpeed
  const A = input.windSpeed
  const s = input.windDirection
  const a = { x: 200, y: 200 }

  // Wind correction
  let wcInbound: string | null = null
  let wcOutbound: string | null = null
  let showWind = false
  let longerShorter: string | null = null
  let wcaInbound = 0
  let wcaOutbound = 0

  if (A > 0 && S > 0) {
    const m = windCorrection(g, S, s, A)
    const R = windCorrection(o, S, s, A)
    if (m && R) {
      wcaInbound = m.wca
      wcaOutbound = R.wca
      wcInbound = pad3(g + m.wca)
      wcOutbound = pad3(o + R.wca)
      showWind = true
      if (Math.abs(m.gs - R.gs) > 0) {
        longerShorter = m.gs - R.gs > 0 ? 'Longer' : 'Shorter'
      }
    }
  }

  // Hold instructions
  const inboundStr = pad3(g)
  const outboundStr = pad3(o)
  const hdgInbound = wcInbound ?? inboundStr
  const hdgOutbound = wcOutbound ?? outboundStr
  const outboundWcaHdg = pad3(o + wcaOutbound)

  const holdSteps = [
    `Fly to the fix on CRS ${inboundStr} with HDG ${hdgInbound}.`,
    `Turn ${d ? 'Right' : 'Left'} to HDG ${hdgOutbound}.`,
    `Fly HDG ${hdgOutbound} ${longerShorter ?? 'Equal'} time ${longerShorter ? 'than' : 'to'} the inbound time.`,
    `Turn ${d ? 'Right' : 'Left'} and intercept CRS ${inboundStr}.`,
    `Repeat`,
  ]

  // Racetrack geometry
  const D = 80 // half leg length
  const it = 75 // base turn radius
  const dt = Math.pow(Math.abs(wcaInbound), 0.35) * 4 * (wcaInbound < 0 ? -1 : 1)
  const U = it * (d ? -1 : 1) + dt
  const W = it * (d ? -1 : 1) - dt
  const ut = Math.abs(U / 2)
  const ft = Math.abs(W / 2)

  const q = { x: 200 + Math.sin(o * RAD) * D, y: 200 - Math.cos(o * RAD) * D }
  const yt = { x: 200 + Math.cos(o * RAD) * U, y: 200 + Math.sin(o * RAD) * U }
  const ct = { x: q.x + Math.cos(o * RAD) * W, y: q.y + Math.sin(o * RAD) * W }

  const holdPath = `M ${a.x},${a.y} A ${ut} ${ut} 0 0 ${d ? 1 : 0} ${yt.x},${yt.y} L ${ct.x},${ct.y} A ${ft} ${ft} 0 0 ${d ? 1 : 0} ${q.x},${q.y} L ${a.x},${a.y}`

  // Entry determination
  const B = norm360(360 + t - o) || 360
  const Q = d ? 110 : 70
  const tt = d ? 290 : 250
  const pt = d ? 290 : 0
  const mt = d ? 360 : 70
  const et = d ? 0 : 250
  const nt = d ? 110 : 360

  // Entry path reference points
  const Y = 6
  const ht = Y * (d ? 1 : -1)
  const Z = (Math.abs(U) - Y * 2) * (d ? -1 : 1)
  const K = (Math.abs(W) - Y * 2) * (d ? -1 : 1)
  const xt = Math.abs(Z / 2)
  const G = Math.abs(K / 2)

  const p = { x: 200 - Math.cos(o * RAD) * ht, y: 200 - Math.sin(o * RAD) * ht }
  const v = { x: p.x + Math.sin(o * RAD) * D, y: p.y - Math.cos(o * RAD) * D }
  const V = { x: p.x + Math.cos(o * RAD) * Z, y: p.y + Math.sin(o * RAD) * Z }
  const M = { x: v.x + Math.cos(o * RAD) * K, y: v.y + Math.sin(o * RAD) * K }

  const z = { x: 200 - Math.sin(t * RAD) * 120, y: 200 + Math.cos(t * RAD) * 120 }
  const acX = 200 - Math.sin(t * RAD) * 140
  const acY = 200 + Math.cos(t * RAD) * 140
  const acRot = t + 270

  let entry: EntryType = 'direct'
  let entryPath = ''
  let entrySteps: string[] = []

  if (B >= Q && B <= tt) {
    // Direct entry
    entry = 'direct'
    const m = { x: (V.x * 3 + M.x) / 4, y: (V.y * 3 + M.y) / 4 }
    if (input.showEntryPath) {
      entryPath = `M ${z.x},${z.y} L ${(a.x + p.x) / 2},${(a.y + p.y) / 2} A ${xt} ${xt} 0 0 ${d ? 1 : 0} ${V.x},${V.y} L ${m.x},${m.y}`
    }
    entrySteps = [
      'Fly to the fix and cross it.',
      'Go to Hold Instructions: Step 2.',
    ]
  } else if (B >= et && B <= nt) {
    // Parallel entry
    entry = 'parallel'
    const m = { x: (p.x + v.x + V.x + M.x) / 4, y: (p.y + v.y + V.y + M.y) / 4 }
    if (input.showEntryPath) {
      entryPath = `M ${z.x},${z.y} L ${(a.x + p.x) / 2},${(a.y + p.y) / 2} L ${v.x},${v.y} A ${G} ${G} 0 0 ${d ? 0 : 1} ${M.x},${M.y} L ${m.x},${m.y}`
    }
    entrySteps = [
      'Fly to the fix and cross it.',
      `Turn CRS ${outboundStr} with HDG ${outboundWcaHdg} and fly equal time to the inbound time.`,
      `Turn ${d ? 'Left' : 'Right'} Past HDG ${inboundStr}.`,
      `Intercept the inbound CRS ${inboundStr} and fly HDG ${hdgInbound} to the fix.`,
      'Go to Hold Instructions: Step 2.',
    ]
  } else {
    // Teardrop entry
    entry = 'teardrop'
    const m = { x: (p.x + v.x * 3) / 4, y: (p.y + v.y * 3) / 4 }
    const teardropHdg = pad3(o + (d ? -30 : 30))
    if (input.showEntryPath) {
      entryPath = `M ${z.x},${z.y} L ${(a.x + p.x) / 2},${(a.y + p.y) / 2} L ${M.x},${M.y} A ${G} ${G} 0 0 ${d ? 1 : 0} ${v.x},${v.y} L ${m.x},${m.y}`
    }
    entrySteps = [
      'Fly to the fix and cross it.',
      `Turn HDG ${teardropHdg} and fly equal time to the inbound time.`,
      `Turn ${d ? 'Right' : 'Left'} and intercept the inbound CRS ${inboundStr}.`,
      `Fly to the fix on CRS ${inboundStr} with HDG ${hdgInbound}.`,
      'Go to Hold Instructions: Step 2.',
    ]
  }

  // Entry sector areas
  const c = 150
  const polar = (deg: number): { x: number; y: number } => ({
    x: 200 - Math.sin((o + deg) * RAD) * c,
    y: 200 + Math.cos((o + deg) * RAD) * c,
  })
  const bt = polar(Q)
  const wt = polar(tt)
  const gt = polar(pt)
  const $t = polar(mt)
  const vt = polar(et)
  const Mt = polar(nt)

  const directArea = `M ${a.x},${a.y} L ${bt.x},${bt.y} A ${c} ${c} 0 0 1 ${wt.x},${wt.y} L ${a.x},${a.y}`
  const teardropArea = `M ${a.x},${a.y} L ${gt.x},${gt.y} A ${c} ${c} 0 0 1 ${$t.x},${$t.y} L ${a.x},${a.y}`
  const parallelArea = `M ${a.x},${a.y} L ${vt.x},${vt.y} A ${c} ${c} 0 0 1 ${Mt.x},${Mt.y} L ${a.x},${a.y}`

  // Wind arrow
  const windX = 200 - Math.sin((s + 180) * RAD) * 160
  const windY = 200 + Math.cos((s + 180) * RAD) * 160
  const windRot = s + 90

  const geo: HoldGeometry = {
    holdPath,
    entryPath,
    directArea,
    teardropArea,
    parallelArea,
    aircraftX: acX,
    aircraftY: acY,
    aircraftRot: acRot,
    windX,
    windY,
    windRot,
    showWind,
    invalid: false,
  }

  return { geo, entry, holdSteps, entrySteps }
}

// ── SVG visualization ─────────────────────────────────────────────────────────

function HoldingSVG({
  geo,
  showEntryPath,
  isNorthUp,
  heading,
  outbound,
  inbound,
  wcInbound,
  wcOutbound,
  showWind,
}: {
  geo: HoldGeometry
  showEntryPath: boolean
  isNorthUp: boolean
  heading: number
  outbound: number
  inbound: number
  wcInbound: string | null
  wcOutbound: string | null
  showWind: boolean
}) {
  const rotateTransform = isNorthUp ? '' : `rotate(${-heading},200,200)`

  return (
    <svg
      viewBox="0 0 400 400"
      className="w-full h-full"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Holding pattern diagram"
    >
      {/* Compass background */}
      <circle cx={200} cy={200} r={170} fill="none" stroke="currentColor" strokeOpacity={0.15} strokeWidth={2} />
      <circle cx={200} cy={200} r={150} fill="none" stroke="currentColor" strokeOpacity={0.12} strokeWidth={1} className="text-muted-foreground" />

      {/* Corner labels — course info */}
      <g>
        <rect x={5} y={25} width={80} height={40} fill="none" stroke="currentColor" strokeOpacity={0.08} strokeWidth={1} rx={3} />
        <text x={7} y={20} fontSize={11} fill="currentColor" fillOpacity={0.5} fontFamily="ui-monospace,monospace">Course:</text>
        <text x={12} y={40} fontSize={13} fill="currentColor" fontFamily="ui-monospace,monospace">In : {pad3(inbound)}</text>
        <text x={12} y={58} fontSize={13} fill="currentColor" fontFamily="ui-monospace,monospace">Out: {pad3(outbound)}</text>
      </g>

      {showWind && wcInbound && wcOutbound && (
        <g>
          <rect x={310} y={25} width={80} height={40} fill="none" stroke="currentColor" strokeOpacity={0.08} strokeWidth={1} rx={3} />
          <text x={312} y={20} fontSize={11} fill="currentColor" fillOpacity={0.5} fontFamily="ui-monospace,monospace">Heading:</text>
          <text x={317} y={40} fontSize={13} fill="currentColor" fontFamily="ui-monospace,monospace">In : {wcInbound}</text>
          <text x={317} y={58} fontSize={13} fill="currentColor" fontFamily="ui-monospace,monospace">Out: {wcOutbound}</text>
        </g>
      )}

      {/* Legend */}
      <g>
        <rect x={5} y={320} width={13} height={13} fill="#defbde" stroke="#aecbae" strokeWidth={1} rx={1} />
        <text x={25} y={331} fontSize={12} fill="currentColor" fontFamily="ui-monospace,monospace">Direct</text>
        <rect x={5} y={340} width={13} height={13} fill="#daddfb" stroke="#aaadcb" strokeWidth={1} rx={1} />
        <text x={25} y={351} fontSize={12} fill="currentColor" fontFamily="ui-monospace,monospace">Parallel</text>
        <rect x={5} y={360} width={13} height={13} fill="#fcdbdd" stroke="#ccabad" strokeWidth={1} rx={1} />
        <text x={25} y={371} fontSize={12} fill="currentColor" fontFamily="ui-monospace,monospace">Teardrop</text>
      </g>

      {/* Hold / Entry legend */}
      <g>
        <path d="M 315,347 L 335,347" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
        <text x={345} y={351} fontSize={12} fill="currentColor" fontFamily="ui-monospace,monospace">Hold</text>
        {showEntryPath && (
          <>
            <path d="M 315,367 L 335,367" fill="none" stroke="#007fff" strokeWidth={3} strokeLinecap="round" strokeDasharray="2 6" />
            <text x={345} y={371} fontSize={12} fill="#007fff" fontFamily="ui-monospace,monospace">Entry</text>
          </>
        )}
      </g>

      {/* Rotatable content (heading-up or north-up) */}
      <g transform={rotateTransform}>
        {/* Cardinal labels */}
        <text x={40} y={200} fontSize={22} fill="currentColor" fillOpacity={0.4} fontFamily="ui-monospace,monospace" textAnchor="middle" dominantBaseline="central" transform="rotate(270,40,200)">W</text>
        <text x={200} y={40} fontSize={22} fill="currentColor" fillOpacity={0.4} fontFamily="ui-monospace,monospace" textAnchor="middle" dominantBaseline="central">N</text>
        <text x={360} y={200} fontSize={22} fill="currentColor" fillOpacity={0.4} fontFamily="ui-monospace,monospace" textAnchor="middle" dominantBaseline="central" transform="rotate(90,360,200)">E</text>
        <text x={200} y={360} fontSize={22} fill="currentColor" fillOpacity={0.4} fontFamily="ui-monospace,monospace" textAnchor="middle" dominantBaseline="central" transform="rotate(180,200,360)">S</text>

        {/* Entry sector areas */}
        {showEntryPath && (
          <g>
            <path d={geo.directArea} fill="#defbde" fillOpacity={0.5} stroke="none" />
            <path d={geo.teardropArea} fill="#fcdbdd" fillOpacity={0.5} stroke="none" />
            <path d={geo.parallelArea} fill="#daddfb" fillOpacity={0.5} stroke="none" />
          </g>
        )}

        {/* Wind arrow */}
        {showWind && (
          <text
            x={geo.windX}
            y={geo.windY}
            fontSize={36}
            fill="#007fff"
            fontFamily="ui-monospace,monospace"
            textAnchor="middle"
            dominantBaseline="central"
            transform={`rotate(${geo.windRot},${geo.windX},${geo.windY})`}
            style={{ filter: 'drop-shadow(2px 2px 4px rgba(255,255,255,0.7))' }}
          >
            ⇉
          </text>
        )}

        {/* Aircraft icon */}
        {showEntryPath && (
          <g
            transform={`translate(${geo.aircraftX},${geo.aircraftY}) rotate(${geo.aircraftRot})`}
            fill="currentColor"
            className="text-foreground"
          >
            <g transform="rotate(45)">
              <path d="M0 -14 L3 -8 L3 2 L11 4 L11 6 L3 6 L3 10 L-3 10 L-3 6 L-11 6 L-11 4 L-3 2 L-3 -8 Z" />
            </g>
          </g>
        )}

        {/* Holding pattern racetrack */}
        <path
          d={geo.holdPath}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-foreground"
        />
        {/* Direction arrows on hold path */}
        <path d={geo.holdPath} fill="none" stroke="none" id="hold-path" />
        <text fontSize={18} fill="currentColor" className="text-foreground">
          <textPath href="#hold-path" startOffset="37%" dominantBaseline="central">➤</textPath>
        </text>
        <text fontSize={18} fill="currentColor" className="text-foreground">
          <textPath href="#hold-path" startOffset="87%" dominantBaseline="central">➤</textPath>
        </text>

        {/* Entry path */}
        {showEntryPath && geo.entryPath && (
          <g>
            <defs>
              <marker id="entry-end" markerUnits="strokeWidth" orient="auto" viewBox="0 0 100 100" markerWidth={5} markerHeight={5} refX={50} refY={50}>
                <path d="m50,0 l40,100 l-40,-30 l-40,30 l40,-100 z" fill="#007fff" stroke="#007fff" strokeWidth={5} transform="rotate(90,50,50)" />
              </marker>
            </defs>
            <path
              d={geo.entryPath}
              fill="none"
              stroke="#007fff"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="2 8"
            />
            <path d={geo.entryPath} fill="none" stroke="none" id="entry-path" />
            <text fontSize={16} fill="#007fff">
              <textPath href="#entry-path" startOffset="12%" dominantBaseline="central">➤</textPath>
            </text>
            <text fontSize={16} fill="#007fff">
              <textPath href="#entry-path" startOffset="65%" dominantBaseline="central">➤</textPath>
            </text>
          </g>
        )}

        {/* Holding fix marker */}
        <circle cx={200} cy={200} r={4} fill="white" stroke="black" strokeWidth={1} />
      </g>
    </svg>
  )
}

// ── timer hook ────────────────────────────────────────────────────────────────

function useHoldTimer() {
  const [elapsed, setElapsed] = useState(0)
  const [running, setRunning] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const start = useCallback(() => {
    setRunning(true)
    intervalRef.current = setInterval(() => {
      setElapsed((e) => e + 1)
    }, 1000)
  }, [])

  const stop = useCallback(() => {
    setRunning(false)
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const reset = useCallback(() => {
    stop()
    setElapsed(0)
  }, [stop])

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  const mm = String(Math.min(59, Math.floor(elapsed / 60))).padStart(2, '0')
  const ss = String(elapsed % 60).padStart(2, '0')
  const display = `${mm}:${ss}`

  return { display, running, start, stop, reset }
}

// ── main component ────────────────────────────────────────────────────────────

export default function HoldingPatternTool() {
  const auth = useDesktopAuth()
  const userId = auth.localUser?.id ?? auth.cloudUser?.id ?? auth.cloudUser?.email ?? 'anonymous'

  const [heading, setHeading] = useState(30)
  const [showInbound, setShowInbound] = useState(false)
  const [inbound, setInbound] = useState(270)
  const [outbound, setOutbound] = useState(90)
  const [direction, setDirection] = useState<TurnDir>('right')
  const [aircraftSpeed, setAircraftSpeed] = useState(120)
  const [windSpeed, setWindSpeed] = useState(10)
  const [windDirection, setWindDirection] = useState(30)
  const [showEntryPath, setShowEntryPath] = useState(true)
  const [showInstructions, setShowInstructions] = useState(false)
  const [isNorthUp, setIsNorthUp] = useState(false)

  const timer = useHoldTimer()

  // Sync inbound/outbound (they're reciprocals)
  const handleInboundChange = (v: number) => {
    setInbound(v)
    setOutbound(norm360(v + 180) || 360)
  }
  const handleOutboundChange = (v: number) => {
    setOutbound(v)
    setInbound(norm360(v + 180) || 360)
  }

  const effectiveOutbound = outbound
  const effectiveInbound = inbound

  const { geo, entry, holdSteps, entrySteps } = useMemo(
    () =>
      computeGeometry({
        heading,
        inbound: effectiveInbound,
        outbound: effectiveOutbound,
        direction,
        aircraftSpeed,
        windSpeed,
        windDirection,
        showEntryPath,
      }),
    [heading, effectiveInbound, effectiveOutbound, direction, aircraftSpeed, windSpeed, windDirection, showEntryPath],
  )

  // Wind-corrected headings for display
  const wc = useMemo(() => {
    if (windSpeed <= 0 || aircraftSpeed <= 0) return { in: null, out: null }
    const m = windCorrection(effectiveInbound, aircraftSpeed, windDirection, windSpeed)
    const r = windCorrection(effectiveOutbound, aircraftSpeed, windDirection, windSpeed)
    return {
      in: m ? pad3(m.heading) : null,
      out: r ? pad3(r.heading) : null,
    }
  }, [effectiveInbound, effectiveOutbound, aircraftSpeed, windSpeed, windDirection])

  // Debounced history logging
  const sig = JSON.stringify({ heading, inbound: effectiveInbound, outbound: effectiveOutbound, direction, aircraftSpeed, windSpeed, windDirection, entry, uid: userId })
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        void logToolUse(userId, 'holding-pattern', { heading, inbound: effectiveInbound, outbound: effectiveOutbound, direction, aircraftSpeed, windSpeed, windDirection }, { entry, holdSteps, entrySteps })
      } catch { /* best-effort */ }
    }, 1000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig])

  const entryBadge: Record<EntryType, { label: string; className: string }> = {
    direct: { label: 'Direct Entry', className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' },
    parallel: { label: 'Parallel Entry', className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30' },
    teardrop: { label: 'Teardrop Entry', className: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30' },
  }

  return (
    <ToolShell
      title="Holding Pattern"
      description="Visualize a holding pattern, determine the correct entry procedure (Direct / Teardrop / Parallel), and get step-by-step instructions with optional wind correction."
      notesUserId={userId}
      notesTool="holding-pattern"
    >
      <div className="h-full flex flex-col gap-3 min-h-0">
        {/* Timer bar */}
        <div className="shrink-0 flex items-center justify-center gap-3 py-1">
          <Button variant="outline" size="sm" onClick={timer.reset} className="h-7 text-xs">
            Reset
          </Button>
          <span className="font-mono text-lg font-bold tabular-nums w-16 text-center">{timer.display}</span>
          {timer.running ? (
            <Button variant="destructive" size="sm" onClick={timer.stop} className="h-7 text-xs">
              Stop
            </Button>
          ) : (
            <Button variant="default" size="sm" onClick={timer.start} className="h-7 text-xs">
              Start
            </Button>
          )}
        </div>

        {/* Main two-column layout */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-4 overflow-y-auto">
          {/* Left: SVG */}
          <div className="w-full lg:w-1/2 shrink-0 flex flex-col min-h-0">
            <div className="flex-1 min-h-[300px] flex items-center justify-center bg-muted/20 rounded-lg overflow-hidden">
              <HoldingSVG
                geo={geo}
                showEntryPath={showEntryPath}
                isNorthUp={isNorthUp}
                heading={heading}
                outbound={effectiveOutbound}
                inbound={effectiveInbound}
                wcInbound={wc.in}
                wcOutbound={wc.out}
                showWind={windSpeed > 0 && aircraftSpeed > 0}
              />
            </div>

            {/* Toggle buttons */}
            <div className="shrink-0 flex items-center justify-center gap-2 py-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowEntryPath((s) => !s)}
                className="h-7 text-xs"
              >
                {showEntryPath ? 'Hide' : 'Show'} Entry Path
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowInstructions((s) => !s)}
                className="h-7 text-xs"
              >
                {showInstructions ? 'Hide' : 'Show'} Instructions
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsNorthUp((n) => !n)}
                className={`h-7 text-xs ${isNorthUp ? 'bg-primary text-primary-foreground' : ''}`}
              >
                North Up
              </Button>
            </div>

            {/* Entry type badge */}
            <div className="shrink-0 flex justify-center">
              <Badge variant="outline" className={`text-xs font-semibold ${entryBadge[entry].className}`}>
                {entryBadge[entry].label}
              </Badge>
            </div>
          </div>

          {/* Right: inputs + instructions */}
          <div className="flex-1 min-w-0 flex flex-col gap-3">
            {/* Inputs */}
            <div className="shrink-0 space-y-2">
              {/* Aircraft heading */}
              <div className="grid grid-cols-3 items-center gap-2">
                <Label className="text-xs text-muted-foreground">Aircraft Heading</Label>
                <div className="col-span-2 flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={360}
                    value={heading}
                    onChange={(e) => setHeading(Number(e.target.value) || 0)}
                    className="h-8 text-sm font-mono"
                  />
                  <span className="text-xs text-muted-foreground">°</span>
                </div>
              </div>

              {/* Hold course (inbound/outbound toggle) */}
              <div className="grid grid-cols-3 items-center gap-2">
                <Label className="text-xs text-muted-foreground">Hold</Label>
                <div className="col-span-2 flex items-center gap-2">
                  <div className="flex rounded-md border border-border overflow-hidden">
                    <button
                      onClick={() => setShowInbound(true)}
                      className={`px-3 py-1 text-xs ${showInbound ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground'}`}
                    >
                      Inbound
                    </button>
                    <button
                      onClick={() => setShowInbound(false)}
                      className={`px-3 py-1 text-xs ${!showInbound ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground'}`}
                    >
                      Outbound
                    </button>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    max={360}
                    value={showInbound ? inbound : outbound}
                    onChange={(e) => {
                      const v = Number(e.target.value) || 0
                      if (showInbound) handleInboundChange(v)
                      else handleOutboundChange(v)
                    }}
                    className="h-8 w-20 text-sm font-mono"
                  />
                  <span className="text-xs text-muted-foreground">°</span>
                </div>
              </div>

              {/* Turn direction */}
              <div className="grid grid-cols-3 items-center gap-2">
                <Label className="text-xs text-muted-foreground">Hold Turns</Label>
                <div className="col-span-2 flex rounded-md border border-border overflow-hidden">
                  <button
                    onClick={() => setDirection('left')}
                    className={`flex-1 px-3 py-1 text-xs ${direction === 'left' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground'}`}
                  >
                    Left
                  </button>
                  <button
                    onClick={() => setDirection('right')}
                    className={`flex-1 px-3 py-1 text-xs ${direction === 'right' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground'}`}
                  >
                    Right
                  </button>
                </div>
              </div>
            </div>

            {/* Wind correction section */}
            <div className="shrink-0 border-t border-border pt-2">
              <p className="text-xs font-semibold text-muted-foreground mb-2">Wind Correction</p>
              <div className="space-y-2">
                <div className="grid grid-cols-3 items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Aircraft Speed</Label>
                  <div className="col-span-2 flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      value={aircraftSpeed}
                      onChange={(e) => setAircraftSpeed(Number(e.target.value) || 0)}
                      className="h-8 text-sm font-mono"
                    />
                    <span className="text-xs text-muted-foreground">kts</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Wind Speed</Label>
                  <div className="col-span-2 flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      value={windSpeed}
                      onChange={(e) => setWindSpeed(Number(e.target.value) || 0)}
                      className="h-8 text-sm font-mono"
                    />
                    <span className="text-xs text-muted-foreground">kts</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Wind Direction</Label>
                  <div className="col-span-2 flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      max={360}
                      value={windDirection}
                      onChange={(e) => setWindDirection(Number(e.target.value) || 0)}
                      className="h-8 text-sm font-mono"
                    />
                    <span className="text-xs text-muted-foreground">°</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Instructions */}
            {showInstructions && (
              <div className="flex-1 min-h-0 overflow-y-auto border-t border-border pt-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-xs font-semibold text-center mb-2">Entry Instructions:</h4>
                    <ol className="text-xs space-y-1 list-decimal list-inside">
                      {entrySteps.map((step, i) => (
                        <li
                          key={i}
                          dangerouslySetInnerHTML={{
                            __html: step.replace(
                              /\b(CRS|HDG) (\d{3})\b/g,
                              '<b>$1 $2</b>',
                            ).replace(/\b(Right|Left)\b/g, '<b>$1</b>'),
                          }}
                        />
                      ))}
                    </ol>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-center mb-2">Hold Instructions:</h4>
                    <ol className="text-xs space-y-1 list-decimal list-inside">
                      {holdSteps.map((step, i) => (
                        <li
                          key={i}
                          dangerouslySetInnerHTML={{
                            __html: step.replace(
                              /\b(CRS|HDG) (\d{3})\b/g,
                              '<b>$1 $2</b>',
                            ).replace(/\b(Right|Left|Repeat|Longer|Shorter|Equal)\b/g, '<b>$1</b>'),
                          }}
                        />
                      ))}
                    </ol>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </ToolShell>
  )
}
