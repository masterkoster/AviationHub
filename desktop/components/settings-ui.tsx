'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

// ── Option constants ──────────────────────────────────────────
export const ROLE_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'PIC', label: 'PIC' },
  { value: 'SIC', label: 'SIC' },
  { value: 'Solo', label: 'Solo' },
  { value: 'Dual', label: 'Dual' },
  { value: 'Instructor', label: 'Instructor' },
] as const

export const DURATION_OPTIONS = [
  { value: 'decimal', label: 'Decimal (1.5)' },
  { value: 'hmm', label: 'Hours:Minutes (1:30)' },
] as const

export const AIRPORT_OPTIONS = [
  { value: 'icao', label: 'ICAO (KJFK)' },
  { value: 'iata', label: 'IATA (JFK)' },
] as const

export const TIMEZONE_OPTIONS = [
  { value: 'utc', label: 'UTC' },
  { value: 'local', label: 'Local' },
] as const

export const DISTANCE_OPTIONS = [
  { value: 'nm', label: 'Nautical Miles' },
  { value: 'km', label: 'Kilometers' },
  { value: 'sm', label: 'Statute Miles' },
] as const

export const TEMP_OPTIONS = [
  { value: 'c', label: 'Celsius' },
  { value: 'f', label: 'Fahrenheit' },
] as const

// ── Helpers ───────────────────────────────────────────────────
export function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ── Shared layout components ──────────────────────────────────

/**
 * Bordered card container that wraps a single settings section.
 * Mirrors the original `rounded-lg border border-border bg-card shadow-sm`
 * styling with an inner `p-5` content pad.
 */
export function SettingsCard({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('rounded-lg border border-border bg-card shadow-sm', className)}>
      <div className="p-5">{children}</div>
    </div>
  )
}

/**
 * Section heading: muted icon + bold title + muted description.
 * Preserves the original `mb-3 flex items-start gap-2.5` rhythm.
 */
export function SectionHeading({
  icon,
  title,
  description,
}: {
  icon: ReactNode
  title: string
  description: string
}) {
  return (
    <div className="mb-3 flex items-start gap-2.5">
      <div className="mt-0.5 text-muted-foreground">{icon}</div>
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

/**
 * Labeled select dropdown for preference fields.
 * Generic over the string union of allowed option values.
 */
export function PreferenceSelect<T extends string>({
  label,
  description,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string
  description?: string
  value: T | null | undefined
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-3">
      <div>
        <p className="text-xs font-medium">{label}</p>
        {description && <p className="text-[11px] text-muted-foreground">{description}</p>}
      </div>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value as T)}
        disabled={disabled}
        className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium disabled:opacity-50"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}

/**
 * Labeled toggle switch with role="switch" for accessibility.
 */
export function ToggleSwitch({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-3">
      <div>
        <p className="text-xs font-medium">{label}</p>
        {description && <p className="text-[11px] text-muted-foreground">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        disabled={disabled}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50',
          checked ? 'bg-primary' : 'bg-muted-foreground/30',
        )}
      >
        <span
          className={cn(
            'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
            checked ? 'translate-x-6' : 'translate-x-1',
          )}
        />
      </button>
    </div>
  )
}
