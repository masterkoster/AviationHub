'use client'

import { useState, useEffect, useRef } from 'react'
import { Download, X, Loader2 } from 'lucide-react'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { Store } from '@tauri-apps/plugin-store'

export function UpdateBanner() {
  const [updateInfo, setUpdateInfo] = useState<{
    available: boolean
    version?: string
    downloading?: boolean
    error?: string
  }>({ available: false })
  const [dismissed, setDismissed] = useState(false)
  const storeLoaded = useRef(false)

  // On mount, check for persisted dismiss and check for updates
  useEffect(() => {
    let cancelled = false

    async function init() {
      // Check if a persisted dismiss is still active
      try {
        if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
          const store = await Store.load('setup.json')
          storeLoaded.current = true
          const dismissedUntil = await store.get<number>('update_dismissed_until')
          if (dismissedUntil && dismissedUntil > Date.now()) {
            if (!cancelled) setDismissed(true)
            return
          }
        }
      } catch {
        // Store not available — proceed with normal update check
      }

      // Check for updates
      try {
        if (typeof window !== 'undefined' && !('__TAURI_INTERNALS__' in window)) return
        const update = await check()
        if (!cancelled && update?.available) {
          setUpdateInfo({ available: true, version: update.version })
        }
      } catch {
        // Not in Tauri or updater not available — silent
      }
    }

    init()
    return () => { cancelled = true }
  }, [])

  async function persistDismiss() {
    try {
      if (storeLoaded.current || ('__TAURI_INTERNALS__' in window)) {
        const store = await Store.load('setup.json')
        await store.set('update_dismissed_until', Date.now() + 86_400_000) // 24 hours
        await store.save()
      }
    } catch {
      // Store not available — session-only dismiss is fine
    }
    setDismissed(true)
  }

  async function handleInstall() {
    try {
      setUpdateInfo((prev) => ({ ...prev, downloading: true, error: undefined }))
      const update = await check()
      if (!update?.available) {
        setUpdateInfo((prev) => ({ ...prev, downloading: false }))
        return
      }

      // Download and install
      await update.downloadAndInstall()
      await relaunch()
    } catch (err) {
      setUpdateInfo((prev) => ({
        ...prev,
        downloading: false,
        error: err instanceof Error ? err.message : 'Update failed',
      }))
    }
  }

  if (!updateInfo.available || dismissed) return null

  return (
    <div className="fixed bottom-4 right-4 z-[9999] max-w-sm animate-in slide-in-from-bottom-4 fade-in">
      <div className="rounded-lg border border-border bg-card shadow-lg p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Download className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">Update Available</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                AviationHub {updateInfo.version} is ready to install
              </p>
              {updateInfo.error && (
                <p className="text-xs text-destructive mt-1">{updateInfo.error}</p>
              )}
            </div>
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            onClick={handleInstall}
            disabled={updateInfo.downloading}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {updateInfo.downloading ? (
              <><Loader2 className="h-3 w-3 animate-spin" /> Updating...</>
            ) : (
              <><Download className="h-3 w-3" /> Install Update</>
            )}
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
          >
            Later
          </button>
          <button
            onClick={persistDismiss}
            className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
          >
            Remind Me Tomorrow
          </button>
        </div>
      </div>
    </div>
  )
}
