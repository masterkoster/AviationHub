'use client'

import { useState, useEffect } from 'react'
import { BarChart3, X } from 'lucide-react'
import { getConsent, setConsent } from '@/desktop/lib/analytics-consent'

/**
 * Analytics consent modal — shown once on first Tauri launch.
 * Anonymous, opt-in tracking. Users can change preference in Settings.
 */
export function AnalyticsConsentModal() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Only show in Tauri and when undecided
    if (typeof window === 'undefined') return
    const isTauri = '__TAURI_INTERNALS__' in window || '__TAURI__' in window
    if (!isTauri) return
    if (getConsent() !== 'undecided') return
    setVisible(true)
  }, [])

  function handleAccept() {
    setConsent('granted')
    setVisible(false)
  }

  function handleDecline() {
    setConsent('denied')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="mx-4 max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl animate-in fade-in zoom-in-95">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Help improve AviationHub</h2>
              <p className="text-xs text-muted-foreground">Anonymous usage data</p>
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-3 text-sm text-muted-foreground">
          <p>
            We collect <strong className="text-foreground">anonymous</strong> usage data to understand
            which features are used and prioritize improvements.
          </p>

          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-xs font-medium text-foreground mb-2">What we track:</p>
            <ul className="space-y-1 text-xs">
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-emerald-500" />
                App opens and page views
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-emerald-500" />
                Feature usage (route planned, flight logged, etc.)
              </li>
            </ul>
          </div>

          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
            <p className="text-xs font-medium text-foreground mb-2">What we do NOT track:</p>
            <ul className="space-y-1 text-xs">
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-amber-500" />
                Email, name, or any personal data
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-amber-500" />
                IP addresses or location
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-amber-500" />
                Keystrokes, form input, or logbook content
              </li>
            </ul>
          </div>

          <p className="text-xs text-muted-foreground">
            You can change this anytime in Settings → Privacy.
          </p>
        </div>

        <div className="mt-5 flex gap-3">
          <button
            onClick={handleDecline}
            className="flex-1 rounded-md border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
          >
            No, thanks
          </button>
          <button
            onClick={handleAccept}
            className="flex-1 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  )
}
