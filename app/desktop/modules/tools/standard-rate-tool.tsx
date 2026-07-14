'use client'

/**
 * Standard-rate turn calculator.
 * Two-column layout with a detailed turn coordinator SVG visual.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { ToolShell, Field, ResultRow, type ResultColor } from '@/components/ui/e6b'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import { logToolUse } from '@/desktop/lib/e6b-store'

const TOOL_NAME = 'standard-rate'

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

function fmtMmSs(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '—'
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/* ── SVG constants ─────────────────────────────────────────────────────────── */
const CX = 150, CY = 150, R = 105, CARDINAL_R = 128

export default function StandardRateTool() {
  const auth = useDesktopAuth()
  const userId = auth.localUser?.id ?? auth.cloudUser?.id ?? null
  const reduced = useReducedMotion()

  const [tas, setTas] = useState<number | ''>(120)
  const [bank, setBank] = useState(15)
  const [turnRate, setTurnRate] = useState<number | ''>(3)

  const compute = useMemo(() => {
    const v = typeof tas === 'number' ? tas : 0
    const tr = typeof turnRate === 'number' && turnRate > 0 ? turnRate : 3
    const bankRad = (bank * Math.PI) / 180
    const tan = Math.max(Math.tan(bankRad), 1e-6)
    const radiusFt = (v * v) / (11.26 * tan)
    const radiusNm = radiusFt / 6076
    const circumferenceFt = 2 * Math.PI * radiusFt
    const circumferenceNm = circumferenceFt / 6076
    const t180 = 180 / tr
    const t360 = 360 / tr
    const bankReqStd = (Math.atan(v / 364) * 180) / Math.PI
    const isStandard = Math.abs(bank - bankReqStd) < 1.0
    return {
      radiusFt: Math.round(radiusFt),
      radiusNm: +radiusNm.toFixed(3),
      circumferenceFt: Math.round(circumferenceFt),
      circumferenceNm: +circumferenceNm.toFixed(3),
      t180, t360,
      bankReqStd: +bankReqStd.toFixed(1),
      isStandard,
    }
  }, [tas, bank, turnRate])

  useEffect(() => {
    const t = setTimeout(() => {
      try { void logToolUse(userId ?? '', TOOL_NAME, { tas, bank, turnRate }, compute) }
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

  const tr = reduced ? 'none' : 'all 0.6s cubic-bezier(0.34,1.56,0.64,1)'
  const fadeTr = reduced ? 'none' : 'opacity 0.5s ease'
  const effectiveTurnRate = typeof turnRate === 'number' && turnRate > 0 ? turnRate : 3

  const radiusFtStr = `${compute.radiusFt.toLocaleString()} ft`
  const radiusNmStr = `${compute.radiusNm} NM`
  const circNmStr = `${compute.circumferenceNm} NM`
  const t180Str = fmtMmSs(compute.t180)
  const t360Str = fmtMmSs(compute.t360)
  const bankStdStr = `${compute.bankReqStd}°`

  /* ── Turn timing quick angles ──────────────────────────────────────────── */
  const QUICK_ANGLES = [90, 180, 360] as const

  /* ── SVG compass marks ─────────────────────────────────────────────────── */
  const CARDINALS = [
    { label: 'N', angle: -90 },
    { label: 'E', angle: 0 },
    { label: 'S', angle: 90 },
    { label: 'W', angle: 180 },
  ] as const

  return (
    <ToolShell
      title="Standard-Rate Turn"
      description="Compute turn radius, circumference, and timing for a rate-one turn from TAS and bank angle."
      notesUserId={userId}
      notesTool="standard-rate"
    >
      <div className="h-full flex flex-col md:flex-row gap-3 md:gap-4">
        {/* ── Left: inputs + results ──────────────────────────────────── */}
        <div className="w-full md:w-72 lg:w-80 shrink-0 flex flex-col gap-2.5 md:overflow-y-auto">
          <Field
            label="True Airspeed (kts)"
            value={tas === '' ? 0 : tas}
            onChange={(v) => setTas(typeof v === 'number' ? v : '')}
            step={1}
          />
          <Field
            label="Turn Rate (°/sec, optional)"
            value={turnRate === '' ? 3 : turnRate}
            onChange={(v) => setTurnRate(typeof v === 'number' ? v : '')}
            step={0.5}
          />

          {/* Bank slider */}
          <div>
            <Label className="text-xs text-muted-foreground">Bank Angle: {bank}°</Label>
            <div className="mt-1.5 flex items-center gap-3">
              <Slider
                value={[bank]}
                min={0}
                max={45}
                step={1}
                onValueChange={(vals) => setBank(vals[0] ?? 0)}
                className="flex-1"
              />
              <input
                type="number"
                min={0}
                max={45}
                value={bank}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  setBank(Math.max(0, Math.min(45, Number.isNaN(n) ? 0 : n)))
                }}
                className="h-9 w-16 rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-xs focus-visible:ring-2 focus-visible:outline-none text-center font-mono tabular-nums"
              />
            </div>
          </div>

          {/* Results */}
          <div className="bg-muted/60 rounded-lg p-3 space-y-1.5">
            <RowWithCopy label="Turn Radius (ft)" value={radiusFtStr} valueToCopy={radiusFtStr} />
            <RowWithCopy label="Turn Radius (NM)" value={radiusNmStr} valueToCopy={radiusNmStr} />
            <RowWithCopy label="Circumference (NM)" value={circNmStr} valueToCopy={circNmStr} />
            <RowWithCopy label="Time for 180°" value={t180Str} color="blue" valueToCopy={t180Str} />
            <RowWithCopy label="Time for 360°" value={t360Str} color="blue" valueToCopy={t360Str} />
            <RowWithCopy label="Bank for Std Rate" value={bankStdStr} color="green" valueToCopy={bankStdStr} />
          </div>

          {/* Turn timing */}
          <div className="bg-muted/60 rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 font-semibold">Turn Timing</p>
            <div className="grid grid-cols-3 gap-1.5">
              {QUICK_ANGLES.map((angle) => {
                const time = angle / effectiveTurnRate
                return (
                  <button
                    key={angle}
                    type="button"
                    onClick={() => {
                      try { navigator.clipboard.writeText(fmtMmSs(time)) } catch { /* noop */ }
                      try { toast.success(`Copied ${angle}° time`) } catch { /* noop */ }
                    }}
                    className="p-1.5 rounded-md bg-background border border-border hover:border-primary/50 transition-colors text-center cursor-pointer"
                  >
                    <span className="text-[10px] text-muted-foreground block">{angle}°</span>
                    <span className="font-mono font-bold text-xs block">{fmtMmSs(time)}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Badges */}
          <div className="flex flex-wrap gap-2">
            <Badge
              variant="outline"
              className={compute.isStandard ? 'text-emerald-500 border-emerald-500/60' : 'text-amber-500 border-amber-500/60'}
            >
              {compute.isStandard ? '✓ Standard rate' : 'Non-standard rate'}
            </Badge>
            <Badge variant="outline" className="font-mono tabular-nums">req bank {compute.bankReqStd}°</Badge>
          </div>
        </div>

        {/* ── Right: turn coordinator visual ───────────────────────────── */}
        <div
          className="flex-1 min-h-[280px] md:min-h-0 flex items-stretch"
          style={{ opacity: mounted ? 1 : 0, transition: fadeTr }}
        >
          <svg viewBox="0 0 300 300" className="w-full h-full" aria-label="Turn coordinator showing turn radius and bank angle">
            <title>Turn Coordinator</title>
            <defs>
              <filter id="stdGlow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur" />
                <feColorMatrix in="blur" type="matrix"
                  values="0 0 0 0 0.06  0 0 0 0 0.725  0 0 0 0 0.506  0 0 0 0.7 0"
                  result="glow" />
                <feMerge>
                  <feMergeNode in="glow" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="instrShadow" x="-5%" y="-5%" width="110%" height="110%">
                <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#000" floodOpacity="0.2" />
              </filter>
            </defs>

            {/* Instrument face */}
            <circle cx={CX} cy={CY} r={145} fill="#1e293b" filter="url(#instrShadow)" />
            <circle cx={CX} cy={CY} r={142} fill="none" stroke="#334155" strokeWidth={1} />

            {/* Cardinal reference ring */}
            <circle cx={CX} cy={CY} r={CARDINAL_R} fill="none" stroke="currentColor" strokeOpacity={0.1} strokeWidth={1} strokeDasharray="2 4" />

            {/* Cardinal tick marks and labels */}
            {CARDINALS.map(({ label, angle }) => {
              const rad = (angle * Math.PI) / 180
              const tx = CX + Math.cos(rad) * CARDINAL_R
              const ty = CY + Math.sin(rad) * CARDINAL_R
              const lx = CX + Math.cos(rad) * (CARDINAL_R + 12)
              const ly = CY + Math.sin(rad) * (CARDINAL_R + 12)
              return (
                <g key={label}>
                  <line x1={CX + Math.cos(rad) * (CARDINAL_R - 5)} y1={CY + Math.sin(rad) * (CARDINAL_R - 5)}
                    x2={tx} y2={ty} stroke="currentColor" strokeOpacity={0.3} strokeWidth={1.5} />
                  <text x={lx} y={ly + 4} textAnchor="middle" fontSize={11} fontFamily="ui-monospace,monospace"
                    fontWeight={700} fill="currentColor" fillOpacity={0.4}>{label}</text>
                </g>
              )
            })}

            {/* Intermediate tick marks (every 30°) */}
            {Array.from({ length: 12 }, (_, i) => i * 30).map((deg) => {
              const rad = ((deg - 90) * Math.PI) / 180
              return (
                <line key={deg}
                  x1={CX + Math.cos(rad) * (R + 14)} y1={CY + Math.sin(rad) * (R + 14)}
                  x2={CX + Math.cos(rad) * (R + 8)} y2={CY + Math.sin(rad) * (R + 8)}
                  stroke="currentColor" strokeOpacity={0.15} strokeWidth={1} />
              )
            })}

            {/* Main turn circle */}
            <circle
              cx={CX} cy={CY} r={R}
              fill="none" stroke="currentColor" strokeOpacity={0.4} strokeWidth={2}
              filter={compute.isStandard ? 'url(#stdGlow)' : undefined}
              style={{ transition: 'all 0.4s ease' }}
            />

            {/* Turn direction arrow (clockwise arc at top) */}
            <path
              d={`M ${CX - 18} ${CY - R} A ${R} ${R} 0 0 1 ${CX + 18} ${CY - R}`}
              fill="none" stroke="currentColor" strokeOpacity={0.7} strokeWidth={2}
              markerEnd="url(#turnArrow)"
            />
            <defs>
              <marker id="turnArrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8 z" fill="currentColor" fillOpacity={0.7} />
              </marker>
            </defs>

            {/* Banked airplane at top of circle */}
            <g transform={`translate(${CX},${CY - R}) rotate(${bank})`}
              style={{ transition: tr }}>
              {/* Fuselage */}
              <rect x={-2.5} y={-16} width={5} height={32} rx={2.5} fill="currentColor" />
              {/* Wings */}
              <path d="M -3,-2 L -26,2 L -26,5 L -3,3 Z" fill="currentColor" />
              <path d="M 3,-2 L 26,2 L 26,5 L 3,3 Z" fill="currentColor" />
              {/* Horizontal stabilizer */}
              <path d="M -3,10 L -12,12 L -12,14 L -3,12 Z" fill="currentColor" opacity={0.7} />
              <path d="M 3,10 L 12,12 L 12,14 L 3,12 Z" fill="currentColor" opacity={0.7} />
              {/* Nose */}
              <ellipse cx={0} cy={-16} rx={3} ry={3} fill="currentColor" />
            </g>

            {/* Center info */}
            <text x={CX} y={CY - 8} textAnchor="middle" fontSize={18} fontFamily="ui-monospace,monospace"
              fontWeight={800} fill="currentColor">{effectiveTurnRate.toFixed(1)}°/s</text>
            <text x={CX} y={CY + 8} textAnchor="middle" fontSize={9} fontFamily="ui-monospace,monospace"
              fontWeight={600} fill="currentColor" fillOpacity={0.45}>TURN RATE</text>

            {/* Radius label */}
            <text x={CX} y={CY + 28} textAnchor="middle" fontSize={11} fontFamily="ui-monospace,monospace"
              fontWeight={700} fill="currentColor" fillOpacity={0.55}>R = {compute.radiusFt.toLocaleString()} ft</text>

            {/* Standard rate indicator */}
            {compute.isStandard && (
              <circle cx={CX} cy={CY} r={R + 3} fill="none" stroke="#10b981" strokeWidth={2} strokeOpacity={0.5}
                style={{ transition: 'stroke-opacity 0.3s ease' }} />
            )}
          </svg>
        </div>
      </div>
    </ToolShell>
  )
}
