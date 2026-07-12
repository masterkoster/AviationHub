import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a numeric value that may have arrived as a Prisma Decimal
 * (serialized to JSON as a string), a plain number, null, or undefined.
 * Returns a fixed-decimal string, or `fallback` when the value can't be
 * coerced to a finite number.
 */
export function fmtNum(value: unknown, digits = 1, fallback = '—'): string {
  if (value === null || value === undefined) return fallback
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return n.toFixed(digits)
}
