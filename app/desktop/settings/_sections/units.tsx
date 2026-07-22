'use client'

import { useState, useEffect } from 'react'
import { Loader2, Eye } from 'lucide-react'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import { usePreferences } from '@/desktop/hooks/use-preferences'
import {
  SettingsCard,
  SectionHeading,
  PreferenceSelect,
  ROLE_OPTIONS,
  DURATION_OPTIONS,
  AIRPORT_OPTIONS,
  TIMEZONE_OPTIONS,
  DISTANCE_OPTIONS,
  TEMP_OPTIONS,
} from '@/desktop/components/settings-ui'

type Aircraft = { id: string; nNumber: string; nickname?: string | null }

export function UnitsSection() {
  const { mode, localUser } = useDesktopAuth()
  const userId = localUser?.id ?? null
  const { preferences, loading: prefsLoading, update: updatePref } = usePreferences(userId)

  const [aircraftList, setAircraftList] = useState<Aircraft[]>([])

  // ── Load aircraft list ──
  useEffect(() => {
    let cancelled = false

    async function loadAircraft() {
      const rows: Aircraft[] = []

      // Local aircraft
      if (mode === 'local' && localUser?.id) {
        try {
          const { listLocalAircraftOptions } = await import('@/apps/desktop/src/lib/local-logbook')
          const local = await listLocalAircraftOptions(localUser.id)
          rows.push(...local.map((a) => ({ id: a.id, nNumber: a.nNumber, nickname: a.nickname })))
        } catch {
          // ignore
        }
      }

      // Cloud aircraft
      try {
        const { getCloudSession } = await import('@/apps/desktop/src/lib/cloud-session')
        const { cloudApi } = await import('@/apps/desktop/src/lib/cloud-api')
        const session = await getCloudSession()
        if (session.authenticated) {
          const cloud = await cloudApi.getAircraft()
          rows.push(...cloud)
        }
      } catch {
        // ignore
      }

      // Dedupe by tail number
      const deduped = new Map<string, Aircraft>()
      for (const a of rows) {
        deduped.set(a.nNumber.toUpperCase(), a)
      }

      if (!cancelled) setAircraftList(Array.from(deduped.values()))
    }

    loadAircraft()
    return () => {
      cancelled = true
    }
  }, [mode, localUser?.id])

  return (
    <SettingsCard>
      <SectionHeading
        icon={<Eye className="h-4 w-4" />}
        title="Display Preferences"
        description="Configure how time, location, and units are displayed."
      />

      {prefsLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <PreferenceSelect
            label="Duration format"
            description="How flight times are displayed"
            value={preferences?.durationFormat ?? 'decimal'}
            options={DURATION_OPTIONS}
            onChange={(v) => updatePref('durationFormat', v)}
            disabled={prefsLoading}
          />

          <PreferenceSelect
            label="Airport code format"
            description="ICAO (4-letter) or IATA (3-letter) codes"
            value={preferences?.airportFormat ?? 'icao'}
            options={AIRPORT_OPTIONS}
            onChange={(v) => updatePref('airportFormat', v)}
            disabled={prefsLoading}
          />

          <PreferenceSelect
            label="Timezone"
            description="Display times in UTC or local time"
            value={preferences?.timezone ?? 'utc'}
            options={TIMEZONE_OPTIONS}
            onChange={(v) => updatePref('timezone', v)}
            disabled={prefsLoading}
          />

          <PreferenceSelect
            label="Distance Unit"
            description="Unit for distance measurements"
            value={preferences?.distanceUnit ?? 'nm'}
            options={DISTANCE_OPTIONS}
            onChange={(v) => updatePref('distanceUnit', v)}
            disabled={prefsLoading}
          />

          <PreferenceSelect
            label="Temperature"
            description="Unit for temperature readings"
            value={preferences?.temperatureUnit ?? 'c'}
            options={TEMP_OPTIONS}
            onChange={(v) => updatePref('temperatureUnit', v)}
            disabled={prefsLoading}
          />

          <PreferenceSelect
            label="Default Pilot Role"
            description="Pre-selected pilot in command role"
            value={preferences?.defaultRole ?? ''}
            options={ROLE_OPTIONS}
            onChange={(v) => updatePref('defaultRole', v || null)}
            disabled={prefsLoading}
          />

          <PreferenceSelect
            label="Default Aircraft"
            description="Pre-selected aircraft for new entries"
            value={preferences?.defaultAircraft ?? ''}
            options={[
              { value: '', label: 'None' },
              ...aircraftList.map((a) => ({
                value: a.id,
                label: a.nickname ? `${a.nNumber} — ${a.nickname}` : a.nNumber,
              })),
            ]}
            onChange={(v) => updatePref('defaultAircraft', v || null)}
            disabled={prefsLoading}
          />
        </div>
      )}
    </SettingsCard>
  )
}
