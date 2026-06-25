'use client'

/**
 * Robust Tauri detection.
 *
 * Tauri v2 injects `__TAURI_INTERNALS__` into the webview unconditionally
 * (required for IPC). The `__TAURI__` global is only present when
 * `withGlobalTauri: true` is set in tauri.conf.json — which we now enable.
 *
 * This helper checks both for maximum reliability.
 */
export function isTauriWebview(): boolean {
  if (typeof window === 'undefined') return false
  const w = window as unknown as Record<string, unknown>
  return Boolean(w.__TAURI_INTERNALS__ || w.__TAURI__)
}