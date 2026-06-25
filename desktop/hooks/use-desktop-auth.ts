'use client'

import { useEffect, useState } from 'react'
import {
  isSetupComplete,
  getDesktopMode,
  getLocalUserId,
  type DesktopMode,
} from '@/desktop/lib/setup'
import { getLocalUser, type LocalUser } from '@/desktop/lib/local-auth'
import { getCloudSession, type CloudSessionUser } from '@/apps/desktop/src/lib/cloud-session'

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

interface DesktopAuth {
  status: AuthStatus
  mode: DesktopMode | null
  localUser: LocalUser | null
  cloudUser: CloudSessionUser | null
  needsSetup: boolean
  initializing: boolean
}

const INITIAL: DesktopAuth = {
  status: 'loading',
  mode: null,
  localUser: null,
  cloudUser: null,
  needsSetup: false,
  initializing: true,
}

/**
 * Unified auth hook for the desktop shell.
 */
export function useDesktopAuth(): DesktopAuth {
  const [state, setState] = useState<DesktopAuth>(INITIAL)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const isTauri =
        typeof window !== 'undefined' &&
        Boolean(
          (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ ||
            (window as unknown as Record<string, unknown>).__TAURI__
        )

      if (!isTauri) {
        const cloud = await getCloudSession()
        if (cancelled) return
        setState({
          status: cloud.authenticated ? 'authenticated' : 'unauthenticated',
          mode: 'cloud',
          localUser: null,
          cloudUser: cloud.user,
          needsSetup: false,
          initializing: false,
        })
        return
      }

      try {
        const setupDone = await isSetupComplete()
        if (cancelled) return

        if (!setupDone) {
          setState({
            status: 'unauthenticated',
            mode: null,
            localUser: null,
            cloudUser: null,
            needsSetup: true,
            initializing: false,
          })
          return
        }

        const mode = await getDesktopMode()
        if (cancelled) return

        if (mode === 'local') {
          const localUserId = await getLocalUserId()
          if (cancelled) return
          if (localUserId) {
            const user = await getLocalUser(localUserId)
            if (cancelled) return
            setState({
              status: user ? 'authenticated' : 'unauthenticated',
              mode,
              localUser: user,
              cloudUser: null,
              needsSetup: false,
              initializing: false,
            })
          } else {
            setState({
              status: 'unauthenticated',
              mode,
              localUser: null,
              cloudUser: null,
              needsSetup: false,
              initializing: false,
            })
          }
          return
        }

        // Cloud mode
        const cloud = await getCloudSession()
        if (cancelled) return
        setState({
          status: cloud.authenticated ? 'authenticated' : 'unauthenticated',
          mode: 'cloud',
          localUser: null,
          cloudUser: cloud.user,
          needsSetup: false,
          initializing: false,
        })
      } catch (err) {
        console.error('[useDesktopAuth] load failed:', err)
        setState({
          status: 'unauthenticated',
          mode: null,
          localUser: null,
          cloudUser: null,
          needsSetup: false,
          initializing: false,
        })
      }
    }

    load()
    const handleAuthChange = () => {
      if (cancelled) return
      load()
    }
    window.addEventListener('desktop-auth-changed', handleAuthChange)
    return () => {
      cancelled = true
      window.removeEventListener('desktop-auth-changed', handleAuthChange)
    }
  }, [])

  // Single return — no conditional early returns
  return state
}
