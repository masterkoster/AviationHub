'use client'

/**
 * Time / Speed / Distance (TSD) calculator.
 * One of the three values is the unknown; the other two are solved live.
 * Adds an optional fuel-burn input and a collapsible Top-of-Descent panel.
 */
import { useEffect, useMemo, useState } from 'react'
import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import {
  ToolShell,
  ResultGrid,
  ResultRow,
  Field,
  type ResultColor,
} from '@/components/ui/e6b'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible'
import { Button } from '@/components/ui/button'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import { logToolUse } from '@/desktop/lib/e6b-store'

const TOOL_NAME = 'tsd'

function CopyBtn({ value }: { value: string }) {
  return (
    <button
      type="button"
      aria-label="Copy value"
      className="text-muted-foreground hover:text-foreground transition-colors p-0.5 shrink-0"
      onClick={() => {
        try {
          navigator.clipboard.writeText(value)
        } catch {
          /* clipboard unavailable */
        }
        try {
          toast.success('Copied')
        } catch {
          console.log('Copied:', value)
        }
      }}
    >
      <Copy className="w-3 h-3" />
    </button>
  )
}

function RowWithCopy({
  label,
  value,
  color,
  valueToCopy,
}: {
  label: string
  value: string
  color?: ResultColor
  valueToCopy?: string
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1">
        <ResultRow label={label} value={value} color={color} />
      </div>
      <CopyBtn value={valueToCopy ?? value} />
    </div>
  )
}

type Unknown = 'distance' | 'gs' | 'time'

function fmtHhMm(totalMin: number): string {
  if (!isFinite(totalMin) || totalMin < 0) return '—'
  const h = Math.floor(totalMin / 60)
  const m = Math.round(totalMin % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function parseNum(v: number | '', fallback: number): number {
  return typeof v === 'number' && !Number.isNaN(v) ? v : fallback
}

export default function TsdTool() {
  const auth = useDesktopAuth()
  const userId = auth.localUser?.id ?? auth.cloudUser?.id ?? null

  const [unknown, setUnknown] = useState<Unknown>('time')
  const [distance, setDistance] = useState<number | ''>(100) // NM
  const [gs, setGs] = useState<number | ''>(120) // kts
  const [timeMin, setTimeMin] = useState<number | ''>(0) // minutes
  const [fuelBurn, setFuelBurn] = useState<number | ''>(10) // gph, optional

  // Top-of-descent panel
  const [todOpen, setTodOpen] = useState(false)
  const [curAlt, setCurAlt] = useState<number | ''>(10_000)
  const [tgtAlt, setTgtAlt] = useState<number | ''>(3_000)
  const [descentRate, setDescentRate] = useState<number | ''>(500) // fpm

  const compute = useMemo(() => {
    const d = parseNum(distance, 0)
    const s = parseNum(gs, 0)
    const t = parseNum(timeMin, 0)
    let solvedD = d
    let solvedS = s
    let solvedT = t
    if (unknown === 'distance') {
      // D = GS × (T/60)
      solvedD = s * (t / 60) || 0
    } else if (unknown === 'gs') {
      // GS = D / (T/60)
      solvedS = t > 0 ? d / (t / 60) : 0
    } else {
      // T = (D / GS) * 60
      solvedT = s > 0 ? (d / s) * 60 : 0
    }
    const fuel = (solvedT / 60) * parseNum(fuelBurn, 0)
    const todAltDiff = Math.max(0, parseNum(curAlt, 0) - parseNum(tgtAlt, 0))
    const dr = parseNum(descentRate, 1)
    const todTime = dr > 0 ? todAltDiff / dr : 0 // minutes
    const todDist = (solvedS / 60) * todTime // NM
    return {
      distance: +solvedD.toFixed(1),
      gs: +solvedS.toFixed(1),
      timeMin: +solvedT.toFixed(1),
      fuel: +fuel.toFixed(1),
      sm: +(solvedD * 1.15078).toFixed(1),
      mph: +(solvedS * 1.15078).toFixed(1),
      hours: +(solvedT / 60).toFixed(2),
      todDist: +todDist.toFixed(1),
      todTime: +todTime.toFixed(1),
    }
  }, [unknown, distance, gs, timeMin, fuelBurn, curAlt, tgtAlt, descentRate])

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        void logToolUse(userId ?? '', TOOL_NAME, { unknown, distance, gs, timeMin, fuelBurn }, compute)
      } catch (e) {
        console.error('logToolUse failed', e)
      }
    }, 1000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compute])

  const disabled: Record<Unknown, boolean> = {
    distance: unknown === 'distance',
    gs: unknown === 'gs',
    time: unknown === 'time',
  }

  const distStr = `${compute.distance} NM  ·  ${compute.sm} SM`
  const gsStr = `${compute.gs} kts  ·  ${compute.mph} mph`
  const timeStr = `${fmtHhMm(compute.timeMin)}  ·  ${compute.hours.toFixed(2)} h`
  const fuelStr = `${compute.fuel} gal`
  const todStr = `${compute.todDist} NM from destination`

  // SVG timeline (700 × 80)
  const total = compute.timeMin > 0 ? compute.timeMin : 1
  const midD = (compute.distance / 2).toFixed(1)
  const midT = (total / 2).toFixed(0)

  return (
    <ToolShell
      title="Time / Speed / Distance"
      description="Solve the third E6B value once you know two: distance, ground speed, or time — plus fuel and a top-of-descent estimate."
      notesUserId={userId}
      notesTool="tsd"
    >
      <div className="h-full flex flex-col gap-4 min-h-0">
        {/* Two-column grid - flex-1 min-h-0 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0">
          {/* Left: inputs */}
          <div className="flex flex-col min-h-0 overflow-y-auto space-y-3 pr-1">
            {/* Radio group */}
            <RadioGroup
              value={unknown}
              onValueChange={(v) => setUnknown(v as Unknown)}
              className="grid-cols-3 gap-2 shrink-0"
            >
              {(['distance', 'gs', 'time'] as const).map((k, i) => (
                <div key={k} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
                  <RadioGroupItem value={k} id={`tsd-${k}`} />
                  <Label htmlFor={`tsd-${k}`} className="text-xs cursor-pointer">
                    {['Solve Distance', 'Solve Ground Speed', 'Solve Time'][i]}
                  </Label>
                </div>
              ))}
            </RadioGroup>

            {/* Distance, GS, Time inputs */}
            <div className="space-y-2">
              <div className={disabled.distance ? 'opacity-50 pointer-events-none' : ''}>
                <Field
                  label="Distance (NM)"
                  value={unknown === 'distance' ? compute.distance : distance === '' ? '' : distance}
                  onChange={(v) => setDistance(typeof v === 'number' ? v : '')}
                  step={1}
                />
              </div>
              <div className={disabled.gs ? 'opacity-50 pointer-events-none' : ''}>
                <Field
                  label="Ground Speed (kts)"
                  value={unknown === 'gs' ? compute.gs : gs === '' ? '' : gs}
                  onChange={(v) => setGs(typeof v === 'number' ? v : '')}
                  step={1}
                />
              </div>
              <div className={disabled.time ? 'opacity-50 pointer-events-none' : ''}>
                <Field
                  label="Time (min)"
                  value={unknown === 'time' ? compute.timeMin : timeMin === '' ? '' : timeMin}
                  onChange={(v) => setTimeMin(typeof v === 'number' ? v : '')}
                  step={1}
                />
              </div>
            </div>

            {/* Fuel burn */}
            <Field
              label="Fuel Burn (gph, optional)"
              value={fuelBurn === '' ? 0 : fuelBurn}
              onChange={(v) => setFuelBurn(typeof v === 'number' ? v : '')}
              step={0.5}
            />
          </div>

          {/* Right: timeline + results + TOD */}
          <div className="flex flex-col min-h-0 overflow-y-auto space-y-3 pr-1">
            {/* Timeline SVG */}
            <div className="shrink-0">
              <svg
                width="100%"
                viewBox="0 0 700 80"
                aria-label="TSD timeline"
              >
                <line x1={30} y1={40} x2={670} y2={40} stroke="currentColor" strokeOpacity={0.4} strokeWidth={2} />
                {/* ticks */}
                {[
                  { x: 30, labelT: '0 min', labelD: '0 NM' },
                  { x: 350, labelT: `${midT} min`, labelD: `${midD} NM` },
                  { x: 670, labelT: `${Math.round(total)} min`, labelD: `${compute.distance} NM` },
                ].map((tick) => (
                  <g key={tick.x} stroke="currentColor" strokeOpacity={0.6}>
                    <line x1={tick.x} y1={30} x2={tick.x} y2={50} strokeWidth={2} />
                    <text
                      x={tick.x}
                      y={20}
                      fontSize={13}
                      fontFamily="ui-monospace, monospace"
                      textAnchor="middle"
                      fill="currentColor"
                      stroke="none"
                    >
                      {tick.labelT}
                    </text>
                    <text
                      x={tick.x}
                      y={72}
                      fontSize={13}
                      fontFamily="ui-monospace, monospace"
                      textAnchor="middle"
                      fill="currentColor"
                      stroke="none"
                    >
                      {tick.labelD}
                    </text>
                  </g>
                ))}
              </svg>
            </div>

            {/* Results */}
            <ResultGrid>
              <RowWithCopy label="Distance" value={distStr} valueToCopy={distStr} />
              <RowWithCopy label="Ground Speed" value={gsStr} valueToCopy={gsStr} />
              <RowWithCopy label="Time" value={timeStr} valueToCopy={timeStr} color="blue" />
              <RowWithCopy label="Fuel Burned" value={fuelStr} valueToCopy={fuelStr} />
            </ResultGrid>

            {/* Top of Descent collapsible sub-panel */}
            <Collapsible open={todOpen} onOpenChange={setTodOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm" className="w-full">
                  {todOpen ? 'Hide' : 'Show'} Top-of-Descent panel
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3 space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <Field
                    label="Current Alt (ft)"
                    value={curAlt === '' ? 0 : curAlt}
                    onChange={(v) => setCurAlt(typeof v === 'number' ? v : '')}
                    step={500}
                  />
                  <Field
                    label="Target Alt (ft)"
                    value={tgtAlt === '' ? 0 : tgtAlt}
                    onChange={(v) => setTgtAlt(typeof v === 'number' ? v : '')}
                    step={500}
                  />
                  <Field
                    label="Descent (fpm)"
                    value={descentRate === '' ? 0 : descentRate}
                    onChange={(v) => setDescentRate(typeof v === 'number' ? v : '')}
                    step={50}
                  />
                </div>
                <RowWithCopy label="Top of Descent" value={todStr} color="amber" valueToCopy={todStr} />
              </CollapsibleContent>
            </Collapsible>
          </div>
        </div>
      </div>
    </ToolShell>
  )
}