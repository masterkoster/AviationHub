'use client'

import { useEffect, useState } from 'react'

/**
 * Window controls hook — manages minimize/maximize/close via Tauri window API.
 * In web mode, all actions are no-ops (the API isn't available).
 */
export function useWindowControls() {
  const [isTauri, setIsTauri] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)) {
      setIsTauri(true)
      // Dynamically import from Tauri APIs
      import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
        const win = getCurrentWindow()
        win.isMaximized().then(setIsMaximized).catch(() => {})
        // Listen for maximize/unmaximize events to keep state in sync
        const unlistenPromises = [
          win.onResized(() => {
            win.isMaximized().then(setIsMaximized).catch(() => {})
          }),
        ]
        return () => {
          Promise.all(unlistenPromises).then((unlistens) =>
            unlistens.forEach((u) => u())
          )
        }
      })
    }
  }, [])

  async function minimize() {
    if (!isTauri) return
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().minimize()
  }

  async function toggleMaximize() {
    if (!isTauri) return
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    const win = getCurrentWindow()
    await win.toggleMaximize()
    setIsMaximized(await win.isMaximized())
  }

  async function close() {
    if (!isTauri) return
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().close()
  }

  async function startDrag() {
    if (!isTauri) return
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().startDragging()
  }

  return { isTauri, isMaximized, minimize, toggleMaximize, close, startDrag }
}