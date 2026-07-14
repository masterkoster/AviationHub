import * as React from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * Field — labeled numeric Input for E6B tools.
 * Extracted from app/desktop/modules/tools/page.tsx.
 */
export function Field({
  label,
  value,
  onChange,
  step,
  placeholder,
}: {
  label: string
  value: number | string
  onChange: (v: number | string) => void
  step?: number
  placeholder?: string
}) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type={typeof value === 'number' ? 'number' : 'text'}
        step={step}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          const raw = e.target.value
          if (raw === '') {
            onChange('')
            return
          }
          const n = Number(raw)
          if (Number.isNaN(n)) {
            onChange(raw)
            return
          }
          onChange(n)
        }}
        className="mt-1"
      />
    </div>
  )
}

/**
 * UnitField — Field with an inline unit toggle supporting
 * kts/mph/km-h or NM/SM/km conversions via Radix ToggleGroup.
 */
export const UnitField = React.forwardRef<
  HTMLInputElement,
  {
    label: string
    value: number
    onChange: (v: number) => void
    units: { label: string; factor: number }[] // factor from base unit
    baseUnit: string
    step?: number
  }
>(function UnitField({ label, value, onChange, units, baseUnit, step }, _ref) {
  const [unitIdx, setUnitIdx] = React.useState(0)
  const unit = units[unitIdx]
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1 flex gap-1">
        <Input
          type="number"
          step={step}
          value={(value / unit.factor).toString()}
          onChange={(e) => onChange(Number(e.target.value || 0) * unit.factor)}
          className="flex-1"
        />
        <select
          value={unitIdx}
          onChange={(e) => setUnitIdx(Number(e.target.value))}
          className="h-10 rounded-md border border-input bg-background px-2 text-xs"
          aria-label={`${label} unit`}
        >
          {units.map((u, i) => (
            <option key={u.label} value={i}>
              {u.label}
            </option>
          ))}
        </select>
      </div>
      <input type="hidden" value={value} readOnly aria-hidden data-base-unit={baseUnit} />
    </div>
  )
})