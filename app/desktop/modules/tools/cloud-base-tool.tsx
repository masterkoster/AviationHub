'use client'

/**
 * Cloud Base calculator.
 * Two-column layout with a sky/cloud SVG visual.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { ToolShell, Field, ResultRow, type ResultColor } from '@/components/ui/e6b'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import { logToolUse } from '@/desktop/lib/e6b-store'

const TOOL_NAME = 'cloud-base'

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
  label: string; value: string; color?: ResultColor; valueToCopy?: string
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1"><ResultRow label={label} value={value} color={color} /></div>
      <CopyBtn value={valueToCopy ?? value} />
    </div>
  )
}

/* ── SVG cloud shape helper ────────────────────────────────────────────────── */
function Cloud({ cx, cy, scale = 1 }: { cx: number; cy: number; scale?: number }) {
  return (
    <g transform={`translate(${cx},${cy}) scale(${scale})`} aria-hidden>
      <ellipse cx={0} cy={0} rx={28} ry={14} fill="white" fillOpacity={0.92} />
      <ellipse cx={-18} cy={4} rx={20} ry={11} fill="white" fillOpacity={0.88} />
      <ellipse cx={18} cy={4} rx={20} ry={11} fill="white" fillOpacity={0.88} />
      <ellipse cx={0} cy={7} rx={32} ry={9} fill="white" fillOpacity={0.9} />
    </g>
  )
}

/* ── SVG airplane side-view ────────────────────────────────────────────────── */
function PlaneSilhouette({ x, y, flip = false }: { x: number; y: number; flip?: boolean }) {
  return (
    <g transform={`translate(${x},${y}) scale(${flip ? -0.7 : 0.7})`} fill="currentColor" fillOpacity={0.55} aria-hidden>
      <ellipse cx={0} cy={0} rx={16} ry={4} />
      <path d="M -4,-4 L 8,-4 L 12,-11 L -2,-11 Z" />
      <path d="M -16,-2 L -22,-8 L -14,-2 Z" />
      <path d="M 12,-1 L 14,-6 L 16,-1 Z" />
    </g>
  )
}

/* ── SVG constants ─────────────────────────────────────────────────────────── */
const GROUND_Y = 465
const SKY_TOP = 25
const SKY_H = GROUND_Y - SKY_TOP
const MAX_SCALE_FT = 6000

const yForFt = (ft: number) => GROUND_Y - Math.max(0, Math.min(1, ft / MAX_SCALE_FT)) * SKY_H
const ALT_MARKS = [0, 1000, 2000, 3000, 4000, 5000, 6000] as const

export default function CloudBaseTool() {
  const auth = useDesktopAuth()
  const userId = auth.localUser?.id ?? auth.cloudUser?.id ?? null
  const reduced = useReducedMotion()

  const [useFahrenheit, setUseFahrenheit] = useState(false)
  const [tempC, setTempC] = useState<number | ''>(20)
  const [dewC, setDewC] = useState<number | ''>(10)
  const [fieldElev, setFieldElev] = useState<number | ''>(0)

  const displayUnit = useFahrenheit ? '°F' : '°C'
  const toDisplay = (c: number | ''): string =>
    c === '' ? '' : String(useFahrenheit ? +(c * 9 / 5 + 32).toFixed(1) : c)
  const fromDisplay = (raw: string): number | '' => {
    if (raw === '') return ''
    const n = Number(raw)
    if (Number.isNaN(n)) return ''
    return useFahrenheit ? +(((n - 32) * 5) / 9).toFixed(2) : n
  }

  const compute = useMemo(() => {
    const t = typeof tempC === 'number' ? tempC : 0
    const d = typeof dewC === 'number' ? dewC : 0
    const elev = typeof fieldElev === 'number' ? fieldElev : 0
    const spread = t - d
    const cloudBaseAgl = Math.max(0, Math.round(spread * 400))
    const cloudBaseMsl = cloudBaseAgl + elev
    let category: 'VFR' | 'MVFR' | 'IFR'
    let categoryColor: ResultColor
    if (cloudBaseAgl > 3000) { category = 'VFR'; categoryColor = 'green' }
    else if (cloudBaseAgl >= 1000) { category = 'MVFR'; categoryColor = 'amber' }
    else { category = 'IFR'; categoryColor = 'red' }
    return { spread: +spread.toFixed(1), cloudBaseAgl, cloudBaseMsl, category, categoryColor }
  }, [tempC, dewC, fieldElev])

  useEffect(() => {
    const t = setTimeout(() => {
      try { void logToolUse(userId ?? '', TOOL_NAME, { tempC, dewC, fieldElev }, compute) }
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

  const tr = reduced ? 'none' : 'all 0.7s cubic-bezier(0.34,1.56,0.64,1)'
  const fadeTr = reduced ? 'none' : 'opacity 0.5s ease'

  const cloudY = mounted ? yForFt(compute.cloudBaseAgl) : GROUND_Y
  const fieldY = mounted && typeof fieldElev === 'number' && fieldElev > 0 ? yForFt(fieldElev) : null
  const airplaneY = mounted ? Math.min(cloudY + 50, GROUND_Y - 30) : GROUND_Y

  const spreadStr = `${compute.spread.toFixed(1)} ${displayUnit}`
  const aglStr = `${compute.cloudBaseAgl.toLocaleString()} ft AGL`
  const mslStr = `${compute.cloudBaseMsl.toLocaleString()} ft MSL`
  const catStr = compute.category

  return (
    <ToolShell
      title="Cloud Base"
      description="Estimate cumulus cloud base height from the temperature–dewpoint spread and classify the resulting ceiling category."
      notesUserId={userId}
      notesTool="cloud-base"
    >
      <div className="h-full flex flex-col md:flex-row gap-3 md:gap-4">
        {/* ── Left: inputs + results ──────────────────────────────────── */}
        <div className="w-full md:w-72 lg:w-80 shrink-0 flex flex-col gap-2.5 md:overflow-y-auto">
          {/* Unit toggle */}
          <div className="flex items-center gap-2">
            <Label htmlFor="cb-cf" className="text-xs text-muted-foreground">°C</Label>
            <Switch id="cb-cf" checked={useFahrenheit} onCheckedChange={setUseFahrenheit} />
            <Label htmlFor="cb-cf" className="text-xs text-muted-foreground">°F</Label>
          </div>

          {/* Inputs */}
          <div>
            <Label className="text-xs text-muted-foreground">Temperature ({displayUnit})</Label>
            <input
              type="number"
              value={toDisplay(tempC)}
              step={1}
              onChange={(e) => setTempC(fromDisplay(e.target.value))}
              className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:ring-2 focus-visible:outline-none"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Dewpoint ({displayUnit})</Label>
            <input
              type="number"
              value={toDisplay(dewC)}
              step={1}
              onChange={(e) => setDewC(fromDisplay(e.target.value))}
              className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:ring-2 focus-visible:outline-none"
            />
          </div>
          <Field
            label="Field Elevation (ft)"
            value={fieldElev === '' ? 0 : fieldElev}
            onChange={(v) => setFieldElev(typeof v === 'number' ? v : '')}
            step={100}
          />

          {/* Spread indicator */}
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Temp–Dewpoint Spread</span>
              <span className="font-mono font-bold">{spreadStr}</span>
            </div>
            <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  compute.spread > 15 ? 'bg-emerald-500' : compute.spread > 8 ? 'bg-amber-500' : 'bg-red-500'
                }`}
                style={{ width: `${Math.min(100, (compute.spread / 25) * 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground/60 mt-0.5 font-mono">
              <span>0° Fog</span>
              <span>15° Clear</span>
            </div>
          </div>

          {/* Results */}
          <div className="bg-muted/60 rounded-lg p-3 space-y-1.5">
            <RowWithCopy label="Temp–Dewpoint Spread" value={spreadStr} valueToCopy={spreadStr} />
            <RowWithCopy label="Cloud Base AGL" value={aglStr} valueToCopy={aglStr} />
            <RowWithCopy label="Cloud Base MSL" value={mslStr} valueToCopy={mslStr} />
            <RowWithCopy label="Ceiling Status" value={catStr} color={compute.categoryColor} valueToCopy={catStr} />
          </div>

          {/* Category badge */}
          <Badge
            variant="outline"
            className={
              compute.category === 'IFR' ? 'text-red-500 border-red-500/60'
                : compute.category === 'MVFR' ? 'text-amber-500 border-amber-500/60'
                  : 'text-emerald-500 border-emerald-500/60'
            }
          >
            {compute.category}
          </Badge>
        </div>

        {/* ── Right: sky visual ───────────────────────────────────────── */}
        <div
          className="flex-1 min-h-[280px] md:min-h-0 flex items-stretch"
          style={{ opacity: mounted ? 1 : 0, transition: fadeTr }}
        >
          <svg viewBox="0 0 200 500" className="w-full h-full" aria-label="Sky visual showing cloud base">
            <title>Cloud Base Sky Visual</title>
            <defs>
              <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0ea5e9" />
                <stop offset="50%" stopColor="#7dd3fc" />
                <stop offset="85%" stopColor="#bae6fd" />
                <stop offset="100%" stopColor="#e0f2fe" />
              </linearGradient>
            </defs>

            {/* Sky */}
            <rect x={0} y={0} width={200} height={GROUND_Y} fill="url(#skyGrad)" />

            {/* Sun glow */}
            <circle cx={170} cy={45} r={28} fill="#fde68a" fillOpacity={0.25} aria-hidden />
            <circle cx={170} cy={45} r={14} fill="#fde68a" fillOpacity={0.4} aria-hidden />

            {/* Altitude markers on right */}
            {ALT_MARKS.map((ft) => {
              const y = yForFt(ft)
              return (
                <g key={ft}>
                  <line x1={185} y1={y} x2={198} y2={y} stroke="currentColor" strokeOpacity={0.15} strokeWidth={1} />
                  <text x={183} y={y + 4} textAnchor="end" fontSize={8} fontFamily="ui-monospace,monospace" fill="currentColor" fillOpacity={0.3}>
                    {ft >= 1000 ? `${ft / 1000}k` : '0'}
                  </text>
                </g>
              )
            })}

            {/* Cloud area above cloud base */}
            <rect x={0} y={0} width={200} height={Math.max(0, cloudY)} fill="white" fillOpacity={0.55} />

            {/* Clouds at cloud base level */}
            <g style={{ transform: `translateY(${cloudY - GROUND_Y}px)`, transition: tr }}>
              <Cloud cx={50} cy={GROUND_Y - 8} scale={1.1} />
              <Cloud cx={110} cy={GROUND_Y - 3} scale={0.85} />
              <Cloud cx={160} cy={GROUND_Y - 6} scale={0.95} />
            </g>

            {/* Cloud base dashed line */}
            <g style={{ transform: `translateY(${cloudY - GROUND_Y}px)`, transition: tr }}>
              <line x1={5} y1={GROUND_Y + 10} x2={195} y2={GROUND_Y + 10} stroke="#475569" strokeWidth={1.5} strokeDasharray="5 3" />
              <text x={10} y={GROUND_Y + 24} fontSize={9} fontFamily="ui-monospace,monospace" fontWeight={700} fill="#475569">
                CLOUD BASE {compute.cloudBaseAgl.toLocaleString()} ft AGL
              </text>
            </g>

            {/* Field elevation line */}
            {fieldY !== null && (
              <g style={{ transform: `translateY(${fieldY - GROUND_Y}px)`, transition: tr }}>
                <line x1={5} y1={GROUND_Y + 10} x2={195} y2={GROUND_Y + 10} stroke="#d97706" strokeWidth={1} strokeDasharray="3 3" />
                <text x={10} y={GROUND_Y + 24} fontSize={8} fontFamily="ui-monospace,monospace" fontWeight={600} fill="#d97706">
                  FIELD {(typeof fieldElev === 'number' ? fieldElev : 0).toLocaleString()} ft
                </text>
              </g>
            )}

            {/* Airplane below clouds */}
            <g style={{ opacity: mounted ? 1 : 0, transition: 'opacity 0.6s ease 0.3s' }}>
              <PlaneSilhouette x={100} y={airplaneY} />
            </g>

            {/* Ground */}
            <rect x={0} y={GROUND_Y} width={200} height={35} fill="#86efac" />
            <rect x={0} y={GROUND_Y} width={200} height={6} fill="#22c55e" fillOpacity={0.4} />
            {/* Grass blades */}
            {[20, 45, 75, 105, 135, 165, 190].map((gx) => (
              <line key={gx} x1={gx} y1={GROUND_Y} x2={gx - 2} y2={GROUND_Y - 6} stroke="#16a34a" strokeWidth={1.5} strokeLinecap="round" opacity={0.5} />
            ))}

            {/* Ground label */}
            <text x={10} y={GROUND_Y + 30} fontSize={9} fontFamily="ui-monospace,monospace" fontWeight={700} fill="#166534" fillOpacity={0.6}>0 ft (Ground)</text>

            {/* Scale top label */}
            <text x={10} y={SKY_TOP + 14} fontSize={9} fontFamily="ui-monospace,monospace" fontWeight={700} fill="white" fillOpacity={0.7}>6000 ft</text>
          </svg>
        </div>
      </div>
    </ToolShell>
  )
}
