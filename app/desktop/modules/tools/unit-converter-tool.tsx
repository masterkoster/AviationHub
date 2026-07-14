'use client'

/**
 * Unit Converter — polished aviation unit converter.
 *
 * 14 aviation categories with live conversion on every keystroke.
 * Two-column layout: left = category picker + input, right = results.
 * Each result card shows conversion factor, value, and copy button.
 */
import { useState, useMemo } from 'react'
import { ArrowRightLeft, Copy, Ruler, Gauge, Fuel, Weight, Thermometer, Cloud, Wind, ArrowDown } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { ToolShell } from '@/components/ui/e6b'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'

// ── Copy button ───────────────────────────────────────────────────────────────

function CopyBtn({ value }: { value: string }) {
  return (
    <button
      type="button"
      aria-label="Copy value"
      className="text-muted-foreground/40 hover:text-muted-foreground transition-colors p-0.5 shrink-0"
      onClick={() => {
        try {
          navigator.clipboard.writeText(value)
        } catch {
          /* clipboard unavailable */
        }
        toast.success(`${value} copied`)
      }}
    >
      <Copy className="w-3 h-3" />
    </button>
  )
}

// ── Category icon mapping ─────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  nm: <Ruler className="w-4 h-4" />,
  sm: <Ruler className="w-4 h-4" />,
  ft: <Ruler className="w-4 h-4" />,
  kts: <Gauge className="w-4 h-4" />,
  gal: <Fuel className="w-4 h-4" />,
  lbs: <Weight className="w-4 h-4" />,
  c: <Thermometer className="w-4 h-4" />,
  f: <Thermometer className="w-4 h-4" />,
  inhg: <Cloud className="w-4 h-4" />,
  mach: <Wind className="w-4 h-4" />,
  fpm: <ArrowDown className="w-4 h-4" />,
  gph: <Fuel className="w-4 h-4" />,
  psi: <Gauge className="w-4 h-4" />,
  'density-alt': <Cloud className="w-4 h-4" />,
}

// ── Conversion definitions ────────────────────────────────────────────────────

interface ConversionDef {
  id: string
  label: string
  shortLabel: string
  placeholder: string
  convert: (v: number) => ConversionResult[]
  /** Which result index should be visually highlighted */
  highlightIndex?: number
  /** Static quick-reference lines */
  reference: string[]
}

interface ConversionResult {
  unit: string
  value: number | string
  factor: string  // e.g. "×1.151" or "= ÷ 0.869"
}

const CONVERSIONS: ConversionDef[] = [
  {
    id: 'nm',
    label: 'Nautical Miles',
    shortLabel: 'NM',
    placeholder: 'Enter nautical miles',
    highlightIndex: 1,
    convert: (v) => [
      { unit: 'NM', value: v, factor: 'input' },
      { unit: 'SM', value: +(v * 1.15078).toFixed(3), factor: '×1.151' },
      { unit: 'km', value: +(v * 1.852).toFixed(3), factor: '×1.852' },
      { unit: 'ft', value: +(v * 6076.12).toFixed(1), factor: '×6,076' },
    ],
    reference: ['1 NM = 1.151 SM = 1.852 km = 6,076 ft'],
  },
  {
    id: 'sm',
    label: 'Statute Miles',
    shortLabel: 'SM',
    placeholder: 'Enter statute miles',
    highlightIndex: 1,
    convert: (v) => [
      { unit: 'SM', value: v, factor: 'input' },
      { unit: 'NM', value: +(v * 0.868976).toFixed(3), factor: '×0.869' },
      { unit: 'km', value: +(v * 1.60934).toFixed(3), factor: '×1.609' },
      { unit: 'm', value: +(v * 1609.34).toFixed(1), factor: '×1,609' },
    ],
    reference: ['1 SM = 0.869 NM = 1.609 km'],
  },
  {
    id: 'ft',
    label: 'Feet',
    shortLabel: 'FT',
    placeholder: 'Enter feet',
    highlightIndex: 1,
    convert: (v) => [
      { unit: 'ft', value: v, factor: 'input' },
      { unit: 'm', value: +(v * 0.3048).toFixed(1), factor: '×0.305' },
      { unit: 'FL', value: Math.round(v / 100), factor: '÷100' },
    ],
    reference: ['1 ft = 0.305 m', 'FL = ft ÷ 100 (flight level)'],
  },
  {
    id: 'kts',
    label: 'Knots',
    shortLabel: 'KTS',
    placeholder: 'Enter knots',
    highlightIndex: 1,
    convert: (v) => [
      { unit: 'kts', value: v, factor: 'input' },
      { unit: 'mph', value: +(v * 1.15078).toFixed(2), factor: '×1.151' },
      { unit: 'km/h', value: +(v * 1.852).toFixed(2), factor: '×1.852' },
      { unit: 'm/s', value: +(v * 0.514444).toFixed(3), factor: '×0.514' },
    ],
    reference: ['1 kt = 1.151 mph = 1.852 km/h = 0.514 m/s'],
  },
  {
    id: 'gal',
    label: 'Gallons (100LL)',
    shortLabel: 'GAL',
    placeholder: 'Enter gallons',
    highlightIndex: 2,
    convert: (v) => [
      { unit: 'gal', value: v, factor: 'input' },
      { unit: 'L', value: +(v * 3.78541).toFixed(2), factor: '×3.785' },
      { unit: 'lbs', value: +(v * 6).toFixed(1), factor: '×6.00' },
    ],
    reference: ['1 gal 100LL = 6.0 lbs = 3.785 L', 'Density: 6.00 lb/gal (avgas)'],
  },
  {
    id: 'lbs',
    label: 'Pounds',
    shortLabel: 'LBS',
    placeholder: 'Enter pounds',
    highlightIndex: 1,
    convert: (v) => [
      { unit: 'lbs', value: v, factor: 'input' },
      { unit: 'kg', value: +(v * 0.453592).toFixed(2), factor: '×0.454' },
      { unit: 'gal', value: +(v / 6).toFixed(2), factor: '÷6.00' },
    ],
    reference: ['1 lb = 0.454 kg', '1 lb fuel (100LL) ≈ 0.167 gal'],
  },
  {
    id: 'c',
    label: 'Celsius',
    shortLabel: '°C',
    placeholder: 'Enter °C',
    highlightIndex: 1,
    convert: (v) => [
      { unit: '°C', value: v, factor: 'input' },
      { unit: '°F', value: +(v * 9 / 5 + 32).toFixed(1), factor: '×9/5+32' },
      { unit: 'K', value: +(v + 273.15).toFixed(2), factor: '+273.15' },
    ],
    reference: ['°F = °C × 9/5 + 32', 'K = °C + 273.15'],
  },
  {
    id: 'f',
    label: 'Fahrenheit',
    shortLabel: '°F',
    placeholder: 'Enter °F',
    highlightIndex: 1,
    convert: (v) => [
      { unit: '°F', value: v, factor: 'input' },
      { unit: '°C', value: +((v - 32) * 5 / 9).toFixed(1), factor: '(−32)×5/9' },
      { unit: 'K', value: +((v - 32) * 5 / 9 + 273.15).toFixed(2), factor: '+273.15' },
    ],
    reference: ['°C = (°F − 32) × 5/9', 'ISA standard: 15°C / 59°F at sea level'],
  },
  {
    id: 'inhg',
    label: 'Inches of Mercury',
    shortLabel: 'inHg',
    placeholder: 'Enter inHg',
    highlightIndex: 1,
    convert: (v) => [
      { unit: 'inHg', value: v, factor: 'input' },
      { unit: 'hPa', value: +(v * 33.8639).toFixed(1), factor: '×33.86' },
      { unit: 'bar', value: +(v * 0.0338639).toFixed(4), factor: '×0.034' },
      { unit: 'psi', value: +(v * 0.491154).toFixed(3), factor: '×0.491' },
    ],
    reference: ['1 inHg = 33.86 hPa = 0.491 psi', 'Std sea level: 29.92 inHg / 1013.25 hPa'],
  },
  {
    id: 'mach',
    label: 'Mach Number',
    shortLabel: 'Mach',
    placeholder: 'Enter Mach (e.g. 0.78)',
    highlightIndex: 1,
    convert: (v) => {
      const sosKts = 661.5
      const kts = +(v * sosKts).toFixed(1)
      return [
        { unit: 'Mach', value: +v.toFixed(3), factor: 'input' },
        { unit: 'kts', value: kts, factor: '×661.5' },
        { unit: 'mph', value: +(kts * 1.15078).toFixed(1), factor: '×767' },
        { unit: 'km/h', value: +(kts * 1.852).toFixed(1), factor: '×1,235' },
      ]
    },
    reference: ['Mach 1 ≈ 661.5 kts at sea-level ISA', 'Mach 1 ≈ 767 mph ≈ 1,235 km/h'],
  },
  {
    id: 'fpm',
    label: 'Feet per Minute',
    shortLabel: 'FPM',
    placeholder: 'Enter fpm (vertical speed)',
    highlightIndex: 1,
    convert: (v) => [
      { unit: 'fpm', value: v, factor: 'input' },
      { unit: 'm/s', value: +(v * 0.00508).toFixed(3), factor: '×0.00508' },
      { unit: 'ft/s', value: +(v / 60).toFixed(2), factor: '÷60' },
    ],
    reference: ['1 fpm = 0.00508 m/s', 'Standard climb: 500–1000 fpm (GA)'],
  },
  {
    id: 'gph',
    label: 'Gallons per Hour',
    shortLabel: 'GPH',
    placeholder: 'Enter gph (fuel flow)',
    highlightIndex: 2,
    convert: (v) => [
      { unit: 'GPH', value: v, factor: 'input' },
      { unit: 'L/hr', value: +(v * 3.78541).toFixed(2), factor: '×3.785' },
      { unit: 'lbs/hr', value: +(v * 6).toFixed(1), factor: '×6.00' },
    ],
    reference: ['1 GPH 100LL = 6.0 lbs/hr = 3.785 L/hr', 'Density: 6.00 lb/gal (avgas)'],
  },
  {
    id: 'psi',
    label: 'PSI',
    shortLabel: 'PSI',
    placeholder: 'Enter psi',
    highlightIndex: 1,
    convert: (v) => [
      { unit: 'psi', value: v, factor: 'input' },
      { unit: 'inHg', value: +(v * 2.03625).toFixed(2), factor: '×2.036' },
      { unit: 'hPa', value: +(v * 68.9476).toFixed(1), factor: '×68.95' },
      { unit: 'bar', value: +(v * 0.0689476).toFixed(4), factor: '×0.069' },
    ],
    reference: ['1 psi = 2.036 inHg = 68.95 hPa', 'Std sea level: 14.696 psi'],
  },
  {
    id: 'density-alt',
    label: 'Density Altitude',
    shortLabel: 'DA',
    placeholder: 'Enter density altitude (ft)',
    highlightIndex: 1,
    convert: (v) => {
      const isaDev = +(v / 118.8).toFixed(1)
      return [
        { unit: 'DA (ft)', value: v, factor: 'input' },
        { unit: 'ISA dev °C', value: isaDev, factor: '÷118.8' },
        { unit: 'ISA dev °F', value: +(isaDev * 9 / 5).toFixed(1), factor: '×9/5' },
        { unit: 'OAT offset', value: isaDev >= 0 ? `+${isaDev}°C from ISA` : `${isaDev}°C from ISA`, factor: 'approx' },
      ]
    },
    reference: [
      'DA = PA + 118.8 × (OAT − ISA_temp)',
      'Positive DA = performance degraded',
      'Negative DA = performance improved',
    ],
  },
]

// ── Category groups for the picker ────────────────────────────────────────────

const CATEGORY_GROUPS = [
  { label: 'Distance', ids: ['nm', 'sm', 'ft'] },
  { label: 'Speed', ids: ['kts', 'mach', 'fpm'] },
  { label: 'Fuel & Weight', ids: ['gal', 'lbs', 'gph'] },
  { label: 'Temp & Pressure', ids: ['c', 'f', 'inhg', 'psi'] },
  { label: 'Altitude', ids: ['density-alt'] },
]

// ── Component ─────────────────────────────────────────────────────────────────

export default function UnitConverterTool() {
  const auth = useDesktopAuth()
  const userId = auth.localUser?.id ?? auth.cloudUser?.id ?? null
  const [selectedId, setSelectedId] = useState('kts')
  const [inputValue, setInputValue] = useState<number | ''>(100)

  const current = CONVERSIONS.find((c) => c.id === selectedId) ?? CONVERSIONS[0]

  const results = useMemo(() => {
    const v = typeof inputValue === 'number' && !Number.isNaN(inputValue) ? inputValue : 0
    return current.convert(v)
  }, [current, inputValue])

  const copyValue = (val: number | string) => {
    const str = String(val)
    try {
      navigator.clipboard.writeText(str)
    } catch {
      /* clipboard unavailable */
    }
    toast.success(`${str} copied`)
  }

  const copyAll = () => {
    const text = results
      .filter((r) => r.factor !== 'input')
      .map((r) => `${r.value} ${r.unit}`)
      .join('\n')
    try {
      navigator.clipboard.writeText(text)
    } catch {
      /* clipboard unavailable */
    }
    toast.success('All values copied')
  }

  return (
    <ToolShell
      title="Unit Converter"
      description="14 aviation categories: distance, speed, altitude, fuel, weight, temperature, pressure, Mach number, vertical speed, fuel flow, and density altitude."
      notesUserId={userId}
      notesTool="convert"
    >
      <div className="h-full flex flex-col gap-4 min-h-0">
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 flex-1 min-h-0">
        {/* ── Left column: category picker + input ──────────────────────────── */}
        <div className="flex flex-col min-h-0 overflow-y-auto space-y-4 pr-1">
          {/* Category groups */}
          {CATEGORY_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold mb-1.5 px-1">
                {group.label}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {group.ids.map((id) => {
                  const conv = CONVERSIONS.find((c) => c.id === id)!
                  const isActive = selectedId === id
                  return (
                    <button
                      key={id}
                      onClick={() => setSelectedId(id)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                        isActive
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      {CATEGORY_ICONS[id]}
                      {conv.shortLabel}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          {/* Input field */}
          <div className="pt-2 border-t border-border/40">
            <Label className="text-xs text-muted-foreground">{current.label}</Label>
            <Input
              type="number"
              value={inputValue}
              onChange={(e) => {
                const raw = e.target.value
                setInputValue(raw === '' ? '' : Number(raw))
              }}
              placeholder={current.placeholder}
              className="mt-1 text-2xl font-mono h-14"
              autoFocus
            />
            <p className="text-[10px] text-muted-foreground/50 mt-1.5 font-mono">
              Enter a value to convert instantly
            </p>
          </div>
        </div>

        {/* ── Right column: results + reference ────────────────────────────── */}
        <div className="flex flex-col min-h-0 overflow-y-auto space-y-4 pr-1">
          {/* Copy all button */}
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Converting <span className="font-semibold text-foreground">{current.label}</span>
            </div>
            <button
              onClick={copyAll}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              <Copy className="w-3 h-3" />
              Copy all
            </button>
          </div>

          {/* Result cards */}
          <div className="grid grid-cols-2 gap-3">
            {results.map((r, i) => {
              const isInput = r.factor === 'input'
              const isHighlighted = current.highlightIndex === i
              return (
                <button
                  key={r.unit}
                  type="button"
                  onClick={() => !isInput && copyValue(r.value)}
                  className={`relative border rounded-xl px-4 py-4 text-left transition-all ${
                    isInput
                      ? 'bg-primary/5 border-primary/20 cursor-default'
                      : isHighlighted
                        ? 'bg-primary/5 border-primary/20 hover:border-primary/40 cursor-pointer hover:shadow-sm'
                        : 'bg-card border-border hover:border-primary/20 cursor-pointer hover:shadow-sm'
                  }`}
                >
                  {/* Unit label */}
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-medium">
                    {r.unit}
                  </div>

                  {/* Value */}
                  <div className="flex items-baseline gap-2">
                    <span
                      className={`text-xl font-mono font-bold tabular-nums ${
                        isInput ? 'text-primary' : isHighlighted ? 'text-primary' : ''
                      }`}
                    >
                      {typeof r.value === 'number'
                        ? r.value.toLocaleString(undefined, { maximumFractionDigits: 4 })
                        : r.value}
                    </span>
                    {!isInput && <CopyBtn value={String(r.value)} />}
                  </div>

                  {/* Conversion factor */}
                  {!isInput && (
                    <div className="text-[10px] text-muted-foreground/60 mt-1 font-mono">
                      {r.factor}
                    </div>
                  )}

                  {/* Input indicator */}
                  {isInput && (
                    <div className="absolute top-3 right-3">
                      <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">
                        INPUT
                      </span>
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          {/* Quick reference */}
          {current.reference.length > 0 && (
            <div className="bg-muted/40 rounded-xl p-4">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold mb-2">
                Quick Reference
              </div>
              <div className="space-y-1.5">
                {current.reference.map((ref, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="text-sm text-muted-foreground font-mono">{ref}</span>
                    <CopyBtn value={ref} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        </div>
      </div>
    </ToolShell>
  )
}
