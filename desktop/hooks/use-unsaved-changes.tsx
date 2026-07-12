'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface UnsavedChangesOptions {
  isDirty: boolean
  message?: string
}

/**
 * Hook that warns users when they try to navigate away with unsaved changes.
 * Handles browser back/forward, tab close, and in-app route changes.
 *
 * Usage:
 *   const { isDirty, setIsDirty, DirtGuard } = useUnsavedChanges()
 *   // Set isDirty to true when form fields change
 *   // Render <DirtGuard /> inside the component
 */
export function useUnsavedChanges(options?: UnsavedChangesOptions) {
  const [isDirty, setIsDirty] = useState(options?.isDirty ?? false)
  const [showGuard, setShowGuard] = useState(false)
  const pendingNavigation = useRef<(() => void) | null>(null)
  const router = useRouter()
  const message = options?.message ?? 'You have unsaved changes. Are you sure you want to leave?'

  // beforeunload — tab close / browser back
  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  const attemptNavigate = useCallback((navigate: () => void) => {
    if (isDirty) {
      pendingNavigation.current = navigate
      setShowGuard(true)
    } else {
      navigate()
    }
  }, [isDirty])

  const confirmLeave = useCallback(() => {
    setShowGuard(false)
    setIsDirty(false)
    pendingNavigation.current?.()
    pendingNavigation.current = null
  }, [])

  const cancelLeave = useCallback(() => {
    setShowGuard(false)
    pendingNavigation.current = null
  }, [])

  const DirtGuard = showGuard ? (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40">
      <div className="w-80 rounded-lg border border-border bg-card p-4 shadow-xl">
        <h3 className="text-sm font-semibold">Unsaved Changes</h3>
        <p className="mt-1 text-xs text-muted-foreground">{message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={cancelLeave}
            className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
          >
            Stay
          </button>
          <button
            onClick={confirmLeave}
            className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:bg-destructive/90"
          >
            Leave
          </button>
        </div>
      </div>
    </div>
  ) : null

  return { isDirty, setIsDirty, attemptNavigate, confirmLeave, cancelLeave, DirtGuard }
}
