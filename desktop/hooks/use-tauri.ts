'use client'

import { useEffect, useState, useCallback } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { invoke } from '@tauri-apps/api/core'

/**
 * Detects whether we're running inside the Tauri desktop app.
 * Returns false in browser (website mode).
 */
export function useTauri() {
  const [isTauri, setIsTauri] = useState(false)
  const [windowReady, setWindowReady] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)) {
      setIsTauri(true)
      // Verify we have window access
      try {
        getCurrentWindow()
        setWindowReady(true)
      } catch {
        setWindowReady(false)
      }
    }
  }, [])

  /**
   * Invoke a Tauri Rust command (fallback to fetch in web mode).
   * Swallows errors gracefully and logs to console in dev.
   */
  const callRust = useCallback(async <T = unknown>(
    command: string,
    args?: Record<string, unknown>
  ): Promise<T | null> => {
    if (!isTauri) return null
    try {
      return await invoke<T>(command, args)
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.error(`[tauri] invoke "${command}" failed:`, err)
      }
      return null
    }
  }, [isTauri])

  return { isTauri, windowReady, callRust }
}