'use client'

import { useEffect, useRef } from 'react'
import { getConsent, getSessionId, type AnalyticsConsent } from '@/desktop/lib/analytics-consent'

function isTauri(): boolean {
  return typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)
}

interface AnalyticsEvent {
  event: string
  page?: string
  feature?: string
}

const API_URL = '/api/analytics'

const pendingEvents: AnalyticsEvent[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null

async function flushEvents(consent: AnalyticsConsent) {
  if (pendingEvents.length === 0) return

  const batch = pendingEvents.splice(0)
  try {
    await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: batch.map((e) => ({
          ...e,
          timestamp: new Date().toISOString(),
          sessionId: getSessionId(),
        })),
        consent: consent === 'granted',
      }),
      keepalive: true,
    })
  } catch {
    // Non-blocking — analytics failure should never affect the app
  }
}

function scheduleFlush(consent: AnalyticsConsent) {
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = setTimeout(() => flushEvents(consent), 5000)
}

/**
 * Analytics hook — anonymous, opt-in usage tracking.
 *
 * What is tracked:
 * - App opens (one per session)
 * - Page views (which page, no PII)
 * - Feature usage (route planned, flight logged, etc.)
 *
 * What is NOT tracked:
 * - Email, name, user ID, or any personal data
 * - IP addresses
 * - Keystrokes or form input content
 *
 * Users can opt out at any time in Settings → Privacy.
 */
export function useAnalytics(consent?: AnalyticsConsent) {
  const effectiveConsent = consent ?? getConsent()
  const sentAppOpen = useRef(false)
  const inTauri = isTauri()

  // Track app open (once per session) — Tauri only, consent-gated
  useEffect(() => {
    if (!inTauri) return
    if (effectiveConsent !== 'granted' || sentAppOpen.current) return
    sentAppOpen.current = true
    track('app_open')
  }, [effectiveConsent, inTauri])

  // Track page view on route change — Tauri only, consent-gated
  useEffect(() => {
    if (!inTauri) return
    if (effectiveConsent !== 'granted') return
    track('page_view', { page: window.location.pathname })
  }, [effectiveConsent, inTauri])
}

/**
 * Track a feature usage event.
 * Call this from any component when a user performs an action.
 */
export function track(event: string, data?: { page?: string; feature?: string }) {
  // Only track in Tauri desktop app
  if (!isTauri()) return

  const consent = getConsent()
  if (consent !== 'granted') return

  pendingEvents.push({
    event,
    ...data,
  })

  scheduleFlush(consent)
}

/**
 * Force-flush any pending events immediately.
 * Useful before app close.
 */
export async function flushNow() {
  const consent = getConsent()
  await flushEvents(consent)
}
