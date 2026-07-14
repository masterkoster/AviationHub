'use client'

/**
 * Pressure Altitude + ISA + Density Altitude calculator.
 * Two-column layout with a vertical altitude thermometer SVG.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Copy, HelpCircle } from 'lucide-react'
import { toast } from 'sonner'
import { ToolShell, Field, ResultRow } from '@/components/ui/e6b'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import { logToolUse } from '@/desktop/lib/e6b-store'

const TOOL_NAME = 'pressure-altitude'

function useReducedMotion() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  )
}

function CopyBtn({ value }: { value: string }) {
  return (
    <button
      type="button"
      aria-label="Copy value"
      className="text-muted-foreground hover:text-foreground transition-colors p-0.5 shrink-0"
      onClick={() => {
        try { navigator.clipboard.writeText(value) } catch { /* noop */ }
        try { toast.success('Copied') } catch { console.log('Copied:', value) }
      }}
    >
      <Copy className="w-3 h-3" />
    </button>
  )
}

function RowWithCopy({
  label, value, color, valueToCopy,
}: {
  label: string; value: string
  color?: 'amber' | 'blue' | 'green' | 'red' | 'primary'
  valueToCopy?: string
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1"><ResultRow label={label} value={value} color={color} /></div>
      <CopyBtn value={valueToCopy ?? value} />
    </div>
  )
}

/* ── SVG constants ─────────────────────────────────────────────────────────── */
const MAX_ALT = 15_000
const TX = 82, TW = 28, TTOP = 28, TBOT = 468
const TH = TBOT - TTOP, TCX = TX + TW / 2
const SCALE_MARKS = [0, 3_000, 6_000, 9_000, 12_000, 15_000] as const
const yForAlt = (alt: number) => TBOT - Math.max(0, Math.min(1, alt / MAX_ALT)) * TH
const PTR_COLOR = (pa: number) => pa > 14_000 ? '#ef4444' : pa >= 8_000 ? '#f59e0b' : '#10b981'

export default function PressureAltitudeTool() {
  const auth = useDesktopAuth()
  const userId = auth.localUser?.id ?? auth.cloudUser?.id ?? null
  const reduced = useReducedMotion()

  const [fieldElevation, setFieldElevation] = useState<number | ''>(5_000)
  const [altimeter, setAltimeter] = useState<number | ''>(29.92)
  const [oat, setOat] = useState<number | ''>('')

  const compute = useMemo(() => {
    const elev = typeof fieldElevation === 'number' ? fieldElevation : 0
    const alt = typeof altimeter === 'number' ? altimeter : 29.92
    const rawPa = (29.92 - alt) * 1000 + elev
    const pa = Math.round(rawPa / 10) * 10
    const isaTemp = +(15 - (pa / 1000) * 2).toFixed(1)
    const oatC = typeof oat === 'number' ? oat : isaTemp
    const da = Math.round(pa + 120 * (oatC - isaTemp))
    return { pressureAltitude: pa, isaTemp, oat: oatC, densityAltitude: da }
  }, [fieldElevation, altimeter, oat])

  useEffect(() => {
    const t = setTimeout(() => {
      try { void logToolUse(userId ?? '', TOOL_NAME, { fieldElevation, altimeter, oat }, compute) }
      catch (e) { console.error('logToolUse failed', e) }
    }, 1000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compute])

  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const tr = reduced ? 'none' : 'all 0.8s cubic-bezier(0.34,1.56,0.64,1)'
  const fadeTr = reduced ? 'none' : 'opacity 0.5s ease'
  const paY = mounted ? yForAlt(compute.pressureAltitude) : TBOT
  const daY = mounted ? yForAlt(compute.densityAltitude) : TBOT
  const fillH = mounted ? TBOT - yForAlt(compute.pressureAltitude) : 0
  const pColor = PTR_COLOR(compute.pressureAltitude)

  const paStr = `${compute.pressureAltitude.toLocaleString()} ft`
  const isaStr = `${compute.isaTemp.toFixed(1)} °C`
  const daStr = `${compute.densityAltitude.toLocaleString()} ft`
  const oatStr = `${compute.oat.toFixed(1)} °C`

  return (
    <ToolShell
      title="Pressure Altitude"
      description="Convert a field elevation and altimeter setting into pressure altitude, ISA temperature, and density altitude."
      notesUserId={userId}
      notesTool="pressure-altitude"
    >
      <div className="h-full flex flex-col md:flex-row gap-3 md:gap-4">
        {/* ── Left: inputs + results ──────────────────────────────────── */}
        <div className="w-full md:w-72 lg:w-80 shrink-0 flex flex-col gap-2.5 md:overflow-y-auto">
          <Field
            label="Field Elevation (ft)"
            value={fieldElevation}
            onChange={(v) => setFieldElevation(typeof v === 'number' ? v : '')}
            step={100}
          />
          <Field
            label="Altimeter (inHg)"
            value={altimeter}
            onChange={(v) => setAltimeter(typeof v === 'number' ? v : '')}
            step={0.01}
          />
          <div>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              OAT (°C, optional)
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" aria-label="Pressure altitude formula" className="text-muted-foreground hover:text-foreground">
                    <HelpCircle className="w-3 h-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  PA = (29.92 − altimeter) × 1000 + field elev. ISA = 15 − PA/1000 × 2.
                  Density alt ≈ PA + 120 × (OAT − ISA). Leave OAT blank to use ISA.
                </TooltipContent>
              </Tooltip>
            </span>
            <input
              type="number"
              step={1}
              value={oat === '' ? '' : String(oat)}
              placeholder="ISA"
              onChange={(e) => setOat(e.target.value === '' ? '' : Number(e.target.value))}
              className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:ring-2 focus-visible:outline-none"
            />
          </div>

          <div className="bg-muted/60 rounded-lg p-3 space-y-1.5">
            <RowWithCopy label="Pressure Altitude" value={paStr} valueToCopy={paStr} />
            <RowWithCopy label="ISA Temperature" value={isaStr} color="blue" valueToCopy={isaStr} />
            <RowWithCopy label="OAT (used)" value={oatStr} valueToCopy={oatStr} />
            <RowWithCopy
              label="Density Altitude" value={daStr}
              color={compute.densityAltitude > 1_000 ? 'red' : 'green'}
              valueToCopy={daStr}
            />
          </div>

          <div className="flex gap-2 flex-wrap">
            <Badge variant="outline" className="font-mono tabular-nums">PA {compute.pressureAltitude.toLocaleString()} ft</Badge>
            <Badge variant="outline" className="font-mono tabular-nums">DA {compute.densityAltitude.toLocaleString()} ft</Badge>
          </div>
        </div>

        {/* ── Right: altitude thermometer ─────────────────────────────── */}
        <div
          className="flex-1 min-h-[280px] md:min-h-0 flex items-stretch"
          style={{ opacity: mounted ? 1 : 0, transition: fadeTr }}
        >
          <svg viewBox="0 0 160 500" className="w-full h-full" aria-label="Altitude thermometer">
            <title>Altitude Thermometer</title>
            <defs>
              <linearGradient id="paGrad" x1="0" y1={TBOT} x2="0" y2={TTOP} gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#10b981" />
                <stop offset="53%" stopColor="#10b981" />
                <stop offset="55%" stopColor="#f59e0b" />
                <stop offset="80%" stopColor="#f59e0b" />
                <stop offset="82%" stopColor="#ef4444" />
                <stop offset="100%" stopColor="#ef4444" />
              </linearGradient>
              <clipPath id="paClip">
                <rect x={TX} y={TTOP} width={TW} height={TH} rx={TW / 2} />
              </clipPath>
              <filter id="tShadow" x="-20%" y="-2%" width="140%" height="104%">
                <feDropShadow dx="2" dy="1" stdDeviation="3" floodColor="#000" floodOpacity="0.12" />
              </filter>
            </defs>

            {/* Scale marks */}
            {SCALE_MARKS.map((alt) => {
              const y = yForAlt(alt)
              return (
                <g key={alt}>
                  <line x1={TX - 14} y1={y} x2={TX - 3} y2={y} stroke="currentColor" strokeOpacity={0.25} strokeWidth={1} />
                  <text x={TX - 18} y={y + 4} textAnchor="end" fontSize={11} fontFamily="ui-monospace,monospace" fontWeight={600} fill="currentColor" fillOpacity={0.5}>
                    {alt === 0 ? '0' : `${alt / 1000}k`}
                  </text>
                </g>
              )
            })}

            {/* Tube background */}
            <rect x={TX} y={TTOP} width={TW} height={TH} rx={TW / 2} fill="currentColor" fillOpacity={0.06} filter="url(#tShadow)" />
            {/* Glass highlight */}
            <rect x={TX + 3} y={TTOP + 8} width={4} height={TH - 16} rx={2} fill="white" fillOpacity={0.12} aria-hidden />

            {/* Fill */}
            <rect x={TX} width={TW} fill="url(#paGrad)" clipPath="url(#paClip)"
              style={{ y: paY, height: fillH, transition: tr }} />
            {/* Meniscus */}
            <ellipse cx={TCX} rx={TW / 2 - 1} ry={3} fill="white" fillOpacity={0.25} clipPath="url(#paClip)"
              style={{ cy: paY, transition: tr }} />

            {/* DA dashed line (animated via group transform) */}
            <g style={{ transform: `translateY(${daY - TBOT}px)`, transition: tr }}>
              <line x1={TX - 16} y1={TBOT} x2={TX + TW + 16} y2={TBOT} stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="4 3" />
              <text x={TX + TW + 20} y={TBOT + 3} fontSize={9} fontFamily="ui-monospace,monospace" fontWeight={700} fill="#3b82f6">DA</text>
            </g>

            {/* PA pointer */}
            <polygon
              points={`${TX - 2},${paY - 5} ${TX - 11},${paY} ${TX - 2},${paY + 5}`}
              fill={pColor} style={{ transition: tr }}
            />

            {/* PA label */}
            <text x={TX + TW + 20} fontSize={10} fontFamily="ui-monospace,monospace" fontWeight={700} fill="currentColor" fillOpacity={0.7}
              style={{ y: paY - 6, transition: tr }}>PA</text>
            <text x={TX + TW + 20} fontSize={12} fontFamily="ui-monospace,monospace" fontWeight={800} fill="currentColor"
              style={{ y: paY + 8, transition: tr }}>{compute.pressureAltitude.toLocaleString()}</text>

            {/* ISA annotation */}
            <text x={TX + TW + 20} fontSize={9} fontFamily="ui-monospace,monospace" fill="#94a3b8" fillOpacity={0.8}
              style={{ y: paY + 22, transition: tr }}>ISA {compute.isaTemp.toFixed(1)}°C</text>

            {/* Top label */}
            <text x={TCX} y={TTOP - 8} textAnchor="middle" fontSize={10} fontFamily="ui-monospace,monospace" fontWeight={700} fill="currentColor" fillOpacity={0.4}>ALT ft</text>
          </svg>
        </div>
      </div>
    </ToolShell>
  )
}
