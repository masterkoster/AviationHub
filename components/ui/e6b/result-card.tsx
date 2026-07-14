import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * StatCard — small bordered card showing a label + value.
 * Mirrors the `Stat` pattern in app/desktop/map/panels/wb-panel.tsx.
 */
export function StatCard({
  label,
  value,
  tone = 'default',
  className = '',
}: {
  label: string
  value: ReactNode
  tone?: 'default' | 'good' | 'warn' | 'bad'
  className?: string
}) {
  const toneClass =
    tone === 'good'
      ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400'
      : tone === 'warn'
        ? 'border-amber-500/30 bg-amber-500/5 text-amber-600 dark:text-amber-400'
        : tone === 'bad'
          ? 'border-red-500/30 bg-red-500/5 text-red-600 dark:text-red-400'
          : 'border-border bg-card'
  return (
    <div className={cn('rounded-md border px-2.5 py-1.5', toneClass, className)}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-base font-bold tabular-nums">{value}</p>
    </div>
  )
}

/**
 * StatGrid — responsive grid of StatCards.
 */
export function StatGrid({
  children,
  cols = 3,
}: {
  children: ReactNode
  cols?: 2 | 3 | 4
}) {
  const gridClass = {
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-2 sm:grid-cols-4',
  }[cols]
  return <div className={`grid ${gridClass} gap-2`}>{children}</div>
}