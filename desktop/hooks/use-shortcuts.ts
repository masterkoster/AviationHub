'use client'

import { useEffect } from 'react'

interface ShortcutEntry {
  combo: string // e.g. "ctrl+n"
  handler: () => void
  description?: string
  /** If true, do not preventDefault (e.g. text inputs that need Ctrl+S native behavior). */
  allowDefault?: boolean
  /** Only fire when this CSS selector matches the active element. Defaults to body. */
  scope?: 'global' | 'input'
}

function normalize(e: KeyboardEvent): string {
  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('ctrl')
  if (e.altKey) parts.push('alt')
  if (e.shiftKey) parts.push('shift')
  // Normalize key — a / A → A, ArrowDown stays, 1 stays
  const key = e.key.length === 1 ? e.key.toUpperCase() : e.key
  // Map special keys for keyboard-1 etc.
  parts.push(key)
  return parts.join('+').toLowerCase()
}

/**
 * Global keyboard shortcut registry.
 * Use <ShortcutProvider> at the desktop root, then register shortcuts
 * via the `useShortcut` hook OR pass an array to the provider directly.
 */
export function useShortcuts(shortcuts: ShortcutEntry[]) {
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      const combo = normalize(e)
      for (const s of shortcuts) {
        if (s.combo.toLowerCase() !== combo) continue
        const inInput =
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement ||
          (e.target as HTMLElement)?.isContentEditable
        if (s.scope === 'global' && inInput) {
          // Allow Ctrl+K to work even in inputs; ignore most others
          if (s.combo.toLowerCase() !== 'ctrl+k') continue
        }
        if (!s.allowDefault) e.preventDefault()
        s.handler()
        return
      }
    }
    window.addEventListener('keydown', listener, true)
    return () => window.removeEventListener('keydown', listener, true)
  }, [shortcuts])
}

export { type ShortcutEntry }