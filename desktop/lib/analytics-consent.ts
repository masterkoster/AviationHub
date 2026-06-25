'use client'

const CONSENT_KEY = 'aviationhub:analytics-consent'
const SESSION_KEY = 'aviationhub:analytics-session'

export type AnalyticsConsent = 'granted' | 'denied' | 'undecided'

export function getConsent(): AnalyticsConsent {
  if (typeof window === 'undefined') return 'undecided'
  return (localStorage.getItem(CONSENT_KEY) as AnalyticsConsent) || 'undecided'
}

export function setConsent(value: AnalyticsConsent): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(CONSENT_KEY, value)
}

export function getSessionId(): string {
  if (typeof window === 'undefined') return ''

  const today = new Date().toISOString().slice(0, 10)
  const stored = localStorage.getItem(SESSION_KEY)

  if (stored) {
    try {
      const parsed = JSON.parse(stored) as { id: string; date: string }
      if (parsed.date === today) return parsed.id
    } catch {
      // Corrupted — generate new
    }
  }

  // Generate new daily session ID (anonymous, no user linkage)
  const id = `s_${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 10)}`
  localStorage.setItem(SESSION_KEY, JSON.stringify({ id, date: today }))
  return id
}
