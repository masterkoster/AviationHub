import type { ReactNode } from 'react'

export const COLOR_MAP: Record<string, string> = {
  amber: 'text-amber-500',
  blue: 'text-blue-500',
  green: 'text-emerald-500',
  red: 'text-red-500',
  primary: 'text-primary',
}

export type ResultColor = 'amber' | 'blue' | 'green' | 'red' | 'primary'

/**
 * ResultGrid — muted rounded container for E6B result rows.
 * Extracted from app/desktop/modules/tools/page.tsx.
 */
export function ResultGrid({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`mt-4 bg-muted rounded-lg p-4 space-y-2 max-w-md ${className}`}>
      {children}
    </div>
  )
}

/**
 * ResultRow — label/value pair with optional color.
 * Extracted from app/desktop/modules/tools/page.tsx.
 */
export function ResultRow({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color?: ResultColor
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`font-semibold ${color ? COLOR_MAP[color] : ''}`}>{value}</span>
    </div>
  )
}