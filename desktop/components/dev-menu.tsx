'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Store } from '@tauri-apps/plugin-store'
import {
  X,
  Loader2,
  RotateCcw,
  Database,
  Eye,
  Terminal,
} from 'lucide-react'

const DEV_CODE = '123'

interface DevState {
  open: boolean
  unlockFailed: boolean
  busy: boolean
  storeData: Record<string, unknown>
  storeLoaded: boolean
}

const INITIAL_STATE: DevState = {
  open: false,
  unlockFailed: false,
  busy: false,
  storeData: {},
  storeLoaded: false,
}

/**
 * Modal that opens when the user proves they know the unlock code ("123").
 * Shows dev actions:
 *   - Rerun first-time setup (clears the Tauri store + redirects to /desktop/setup)
 *   - View Tauri store entries
 */
export function DevMenuModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter()
  const [state, setState] = useState<DevState>(INITIAL_STATE)
  const [unlockInput, setUnlockInput] = useState('')
  const [isTauri, setIsTauri] = useState(false)

  useEffect(() => {
    setIsTauri(typeof window !== 'undefined' && Boolean((window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ || (window as unknown as Record<string, unknown>).__TAURI__))
  }, [])

  useEffect(() => {
    if (open && !state.storeLoaded) {
      loadStoreData()
    }
    if (!open) {
      setUnlockInput('')
      setState((s) => ({ ...s, unlockFailed: false }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function loadStoreData() {
    try {
      if (!isTauri) {
        setState((s) => ({ ...s, storeLoaded: true }))
        return
      }
      const store = await Store.load('setup.json')
      const entries = await store.entries()
      const data: Record<string, unknown> = {}
      for (const [key, value] of entries) data[key as string] = value
      setState((s) => ({ ...s, storeData: data, storeLoaded: true }))
    } catch (err) {
      console.error('store load failed', err)
      setState((s) => ({ ...s, storeLoaded: true }))
    }
  }

  function handleUnlock(e: React.FormEvent) {
    e.preventDefault()
    if (unlockInput === DEV_CODE) {
      setState((s) => ({ ...s, unlockFailed: false }))
      setUnlockInput('')
    } else {
      setState((s) => ({ ...s, unlockFailed: true }))
      setUnlockInput('')
    }
  }

  async function handleRerunSetup() {
    setState((s) => ({ ...s, busy: true }))
    try {
      if (isTauri) {
        const store = await Store.load('setup.json')
        await store.delete('setup_complete')
        await store.delete('mode')
        await store.save()
      }
      onOpenChange(false)
      router.replace('/desktop/setup')
    } catch (err) {
      console.error(err)
    } finally {
      setState((s) => ({ ...s, busy: false }))
    }
  }

  // Until unlocked, ask for code
  const isUnlocked = state.unlockFailed === false && (open ? state.open : false) === false && state.storeLoaded
  const showUnlock = !isUnlocked

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40"
      onClick={() => onOpenChange(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-72 rounded-lg border border-border bg-card shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold">
            <Terminal className="h-3.5 w-3.5 text-primary" />
            Dev Tools
          </span>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Unlock prompt */}
        {showUnlock ? (
          <form onSubmit={handleUnlock} className="p-4">
            <p className="mb-2 text-xs text-muted-foreground">Enter dev code to unlock</p>
            <input
              type="password"
              value={unlockInput}
              onChange={(e) => setUnlockInput(e.target.value)}
              autoFocus
              placeholder="Code"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            {state.unlockFailed && (
              <p className="mt-1 text-xs text-destructive">Invalid code</p>
            )}
            <button
              type="submit"
              className="mt-3 w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Unlock
            </button>
          </form>
        ) : (
          <div className="p-2">
            {/* Actions */}
            <button
              disabled={state.busy}
              onClick={handleRerunSetup}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-medium hover:bg-muted disabled:opacity-50"
            >
              {state.busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5 text-amber-500" />
              )}
              Rerun first-time setup
            </button>
            <button
              onClick={loadStoreData}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-medium hover:bg-muted"
            >
              <Eye className="h-3.5 w-3.5 text-blue-500" />
              Refresh store data
            </button>

            {/* Store viewer */}
            <div className="mt-2 border-t border-border pt-2">
              <div className="mb-1 flex items-center gap-1 px-1 text-[10px] font-medium uppercase text-muted-foreground">
                <Database className="h-2.5 w-2.5" />
                Tauri Store
              </div>
              {Object.keys(state.storeData).length === 0 ? (
                <p className="px-1 text-[10px] text-muted-foreground">
                  {isTauri ? 'No entries' : 'Not in Tauri'}
                </p>
              ) : (
                <ul className="max-h-32 space-y-0.5 overflow-y-auto px-1">
                  {Object.entries(state.storeData).map(([key, value]) => (
                    <li key={key} className="text-[11px]">
                      <span className="font-mono text-blue-500">{key}</span>
                      <span className="text-muted-foreground"> = </span>
                      <span className="font-mono">{String(value)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}