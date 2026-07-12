'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  getUserPreferences,
  updateUserPreference,
  type UserPreferences,
} from '@/desktop/lib/user-preferences'

export interface UsePreferencesReturn {
  preferences: UserPreferences | null
  loading: boolean
  update: (key: keyof UserPreferences, value: string | number | null) => Promise<void>
}

/**
 * Load and persist UserPreferences for the given userId.
 * Falls back gracefully (returns null for preferences / no-ops on update)
 * when userId is null or the SQLite store is unavailable.
 */
export function usePreferences(userId: string | null): UsePreferencesReturn {
  const [preferences, setPreferences] = useState<UserPreferences | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!userId) {
        if (!cancelled) setLoading(false)
        return
      }

      setLoading(true)
      try {
        const prefs = await getUserPreferences(userId)
        if (!cancelled) setPreferences(prefs)
      } catch (err) {
        console.error('[usePreferences] load failed:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [userId])

  const update = useCallback(
    async (key: keyof UserPreferences, value: string | number | null) => {
      if (!userId) return

      // Optimistic local update for immediate feedback
      setPreferences((prev) => (prev ? { ...prev, [key]: value } : prev))

      try {
        await updateUserPreference(userId, key, value)
      } catch (err) {
        console.error(`[usePreferences] failed to update ${String(key)}:`, err)
      }
    },
    [userId],
  )

  return { preferences, loading, update }
}
