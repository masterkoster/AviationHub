'use client'

import { useState } from 'react'
import { Shield } from 'lucide-react'
import { getConsent, setConsent, type AnalyticsConsent } from '@/desktop/lib/analytics-consent'
import { SettingsCard, SectionHeading } from '@/desktop/components/settings-ui'
import { cn } from '@/lib/utils'

export default function PrivacySettingsPage() {
  const [analyticsConsent, setAnalyticsConsent] = useState<AnalyticsConsent>(getConsent())

  function toggleAnalytics() {
    const next: AnalyticsConsent = analyticsConsent === 'granted' ? 'denied' : 'granted'
    setConsent(next)
    setAnalyticsConsent(next)
  }

  return (
    <SettingsCard>
      <SectionHeading
        icon={<Shield className="h-4 w-4" />}
        title="Privacy"
        description="Control anonymous usage analytics. This only applies to the desktop app."
      />

      <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-3">
        <div>
          <p className="text-xs font-medium">Analytics</p>
          <p className="text-[11px] text-muted-foreground">
            {analyticsConsent === 'granted'
              ? 'Anonymous usage data is being collected'
              : analyticsConsent === 'denied'
                ? 'Anonymous usage data is disabled'
                : "You haven't chosen yet"}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={analyticsConsent === 'granted'}
          onClick={toggleAnalytics}
          className={cn(
            'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
            analyticsConsent === 'granted' ? 'bg-primary' : 'bg-muted-foreground/30',
          )}
        >
          <span
            className={cn(
              'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
              analyticsConsent === 'granted' ? 'translate-x-6' : 'translate-x-1',
            )}
          />
        </button>
      </div>
    </SettingsCard>
  )
}
