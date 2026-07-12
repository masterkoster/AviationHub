'use client'

import { useState, useEffect, useCallback } from 'react'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import {
  getUserPreferences,
  updateUserPreference,
  type UserPreferences,
} from '@/desktop/lib/user-preferences'

export function usePreferences() {
  const { mode, localUser, cloudUser, status } = useDesktopAuth()
  const [prefs, setPrefs] = useState<UserPreferences | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)

      if (mode === 'local' && localUser) {
        const p = await getUserPreferences(localUser.id)
        if (!cancelled) { setPrefs(p); setLoading(false) }
        return
      }

      if (mode === 'cloud' && status === 'authenticated' && cloudUser?.id) {
        // Cloud mode — try API, fallback to local SQLite (mirror user)
        try {
          const { cloudApi } = await import('@/apps/desktop/src/lib/cloud-api')
          const data = await cloudApi.getUserPreferences()
          if (!cancelled && data) {
            setPrefs(data as unknown as UserPreferences)
            setLoading(false)
            return
          }
        } catch {
          // Fallback to local mirror
          const p = await getUserPreferences(`cloud-${cloudUser.id}`)
          if (!cancelled) { setPrefs(p); setLoading(false) }
          return
        }
      }

      if (!cancelled) { setPrefs(null); setLoading(false) }
    }
    load()
    return () => { cancelled = true }
  }, [mode, localUser?.id, cloudUser?.id, status])

  const update = useCallback(async (key: keyof UserPreferences, value: string | number | null) => {
    const userId = mode === 'local' ? localUser?.id : cloudUser?.id ? `cloud-${cloudUser.id}` : null
    if (!userId) return
    await updateUserPreference(userId, key, value)
    setPrefs((prev) => prev ? { ...prev, [key]: value } : prev)
  }, [mode, localUser?.id, cloudUser?.id])

  return { preferences: prefs, loading, update }
}
