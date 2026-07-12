/**
 * Feature tip system — lightweight tips shown on first visit to each surface.
 * Uses localStorage to track which tips have been seen.
 */

const STORAGE_PREFIX = 'tip.seen.'

export function hasSeenTip(tipId: string): boolean {
  if (typeof window === 'undefined') return true
  try {
    return localStorage.getItem(STORAGE_PREFIX + tipId) === '1'
  } catch {
    return true
  }
}

export function markTipSeen(tipId: string): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + tipId, '1')
  } catch {
    // ignore
  }
}

export function dismissTip(tipId: string): void {
  markTipSeen(tipId)
}
