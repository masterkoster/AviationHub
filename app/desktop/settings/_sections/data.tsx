'use client'

import { useState } from 'react'
import { Loader2, Database, Trash2, FileDown } from 'lucide-react'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import { usePreferences } from '@/desktop/hooks/use-preferences'
import { clearCache as clearTileCache } from '@/desktop/lib/tile-cache'
import { notifySaved, notifyExported, notifyError } from '@/desktop/lib/toast-helpers'
import { SettingsCard, SectionHeading, downloadJson } from '@/desktop/components/settings-ui'

export function DataSection() {
  const { mode, localUser, cloudUser } = useDesktopAuth()
  const userId = localUser?.id ?? cloudUser?.id ?? null
  const { preferences } = usePreferences(userId)

  const [clearingCache, setClearingCache] = useState(false)
  const [exportingPrefs, setExportingPrefs] = useState(false)
  const [exportingProfile, setExportingProfile] = useState(false)

  async function handleClearTileCache() {
    setClearingCache(true)
    try {
      await clearTileCache()
      notifySaved('Tile cache')
    } catch (err) {
      notifyError('Clear cache', err instanceof Error ? err.message : 'Failed to clear cache')
    } finally {
      setClearingCache(false)
    }
  }

  async function handleExportPreferences() {
    setExportingPrefs(true)
    try {
      if (preferences) {
        downloadJson(preferences, `aviationhub-preferences-${userId ?? 'default'}.json`)
        notifyExported('Preferences')
      }
    } catch (err) {
      notifyError('Export', err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExportingPrefs(false)
    }
  }

  async function handleExportProfile() {
    setExportingProfile(true)
    try {
      const profile = {
        exportedAt: new Date().toISOString(),
        mode,
        localUser: localUser
          ? {
              id: localUser.id,
              name: localUser.name,
              username: localUser.username,
              email: localUser.email,
              homeAirport: localUser.homeAirport,
              displayId: localUser.displayId,
              avatarColor: localUser.avatarColor,
            }
          : null,
        cloudUser: cloudUser
          ? {
              id: cloudUser.id,
              name: cloudUser.name,
              email: cloudUser.email,
            }
          : null,
        preferences: preferences ?? undefined,
      }
      downloadJson(profile, `aviationhub-profile-${new Date().toISOString().split('T')[0]}.json`)
      notifyExported('Profile data')
    } catch (err) {
      notifyError('Export', err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExportingProfile(false)
    }
  }

  return (
    <SettingsCard>
      <SectionHeading
        icon={<Database className="h-4 w-4" />}
        title="Data Management"
        description="Clear cached data or export your information."
      />

      <div className="space-y-2">
        {/* Clear Tile Cache */}
        <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-3">
          <div>
            <p className="text-xs font-medium">Clear Tile Cache</p>
            <p className="text-[11px] text-muted-foreground">
              Remove all cached map tiles to free up disk space.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClearTileCache}
            disabled={clearingCache}
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
          >
            {clearingCache ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Trash2 className="h-3 w-3" />
            )}
            Clear
          </button>
        </div>

        {/* Export Preferences */}
        <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-3">
          <div>
            <p className="text-xs font-medium">Export Preferences</p>
            <p className="text-[11px] text-muted-foreground">
              Download all preferences as a JSON file.
            </p>
          </div>
          <button
            type="button"
            onClick={handleExportPreferences}
            disabled={exportingPrefs || !preferences}
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
          >
            {exportingPrefs ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <FileDown className="h-3 w-3" />
            )}
            Export
          </button>
        </div>

        {/* Export Profile */}
        <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-3">
          <div>
            <p className="text-xs font-medium">Export Profile Data</p>
            <p className="text-[11px] text-muted-foreground">
              Download your profile and preferences as JSON.
            </p>
          </div>
          <button
            type="button"
            onClick={handleExportProfile}
            disabled={exportingProfile || (!localUser && !cloudUser)}
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
          >
            {exportingProfile ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <FileDown className="h-3 w-3" />
            )}
            Export
          </button>
        </div>
      </div>
    </SettingsCard>
  )
}
