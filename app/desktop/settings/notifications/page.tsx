'use client'

import { Loader2, Bell } from 'lucide-react'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import { usePreferences } from '@/desktop/hooks/use-preferences'
import { SettingsCard, SectionHeading, ToggleSwitch } from '@/desktop/components/settings-ui'

export default function NotificationsSettingsPage() {
  const { localUser, cloudUser } = useDesktopAuth()
  const userId = localUser?.id ?? cloudUser?.id ?? null
  const { preferences, loading: prefsLoading, update: updatePref } = usePreferences(userId)

  return (
    <SettingsCard>
      <SectionHeading
        icon={<Bell className="h-4 w-4" />}
        title="Notifications"
        description="Control which alerts and checks are shown."
      />

      {prefsLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-2">
          <ToggleSwitch
            label="Currency expiry alerts"
            description="Warn when a currency or certification is about to expire"
            checked={preferences?.notificationCurrencyAlerts === 1}
            onChange={(checked) => updatePref('notificationCurrencyAlerts', checked ? 1 : 0)}
            disabled={prefsLoading}
          />

          <ToggleSwitch
            label="Check for updates on startup"
            description="Automatically check for app updates when the app launches"
            checked={preferences?.notificationUpdateCheck === 1}
            onChange={(checked) => updatePref('notificationUpdateCheck', checked ? 1 : 0)}
            disabled={prefsLoading}
          />
        </div>
      )}
    </SettingsCard>
  )
}
