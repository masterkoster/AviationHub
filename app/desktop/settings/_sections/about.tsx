'use client'

import { useState, useEffect } from 'react'
import { Info, Download, Loader2, RefreshCw, BookOpen } from 'lucide-react'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import { check } from '@tauri-apps/plugin-updater'
import { resetTutorial } from '@/desktop/components/onboarding-tour'
import { notifySaved } from '@/desktop/lib/toast-helpers'
import { SectionHeading, SettingsCard } from '@/desktop/components/settings-ui'

export function AboutSection() {
  const { mode } = useDesktopAuth()
  const [appVersion, setAppVersion] = useState('...')
  const [updateState, setUpdateState] = useState<{
    checking: boolean
    available: boolean
    version?: string
    downloading: boolean
    error?: string
  }>({ checking: false, available: false, downloading: false })

  useEffect(() => {
    async function loadVersion() {
      try {
        if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
          const { getVersion } = await import('@tauri-apps/api/app')
          const v = await getVersion()
          setAppVersion(v)
        } else {
          setAppVersion('1.0.0')
        }
      } catch {
        setAppVersion('1.0.0')
      }
    }
    loadVersion()
  }, [])

  async function handleCheckUpdates() {
    setUpdateState({ checking: true, available: false, downloading: false, error: undefined })
    try {
      if (typeof window !== 'undefined' && !('__TAURI_INTERNALS__' in window)) {
        setUpdateState({ checking: false, available: false, downloading: false, error: 'Not running in desktop app' })
        return
      }
      const update = await check()
      if (update?.available) {
        setUpdateState({ checking: false, available: true, version: update.version, downloading: false })
      } else {
        setUpdateState({ checking: false, available: false, version: undefined, downloading: false })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const isNoRelease = /404|not found|no release/i.test(msg)
      setUpdateState({
        checking: false,
        available: false,
        downloading: false,
        error: isNoRelease ? 'No release published yet. Push a git tag to create a release.' : msg,
      })
    }
  }

  async function handleInstallUpdate() {
    setUpdateState((prev) => ({ ...prev, downloading: true, error: undefined }))
    try {
      const update = await check()
      if (!update?.available) {
        setUpdateState((prev) => ({ ...prev, downloading: false }))
        return
      }
      await update.downloadAndInstall()
      const { relaunch } = await import('@tauri-apps/plugin-process')
      await relaunch()
    } catch (err) {
      setUpdateState((prev) => ({
        ...prev,
        downloading: false,
        error: err instanceof Error ? err.message : 'Update failed',
      }))
    }
  }

  return (
    <div className="space-y-4">
      <SectionHeading
        icon={<Info className="h-4 w-4" />}
        title="About"
        description="Application information and updates."
      />

      {/* Version + mode */}
      <SettingsCard>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Version</p>
            <p className="text-sm font-medium">AviationHub v{appVersion}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Mode</p>
            <p className="text-sm font-medium">{mode === 'cloud' ? 'Cloud Sync' : 'Local'}</p>
          </div>
        </div>
      </SettingsCard>

      {/* Updates */}
      <SettingsCard>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium">Updates</p>
            {updateState.checking && (
              <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Checking for updates...
              </p>
            )}
            {!updateState.checking && updateState.available && (
              <div className="mt-1 space-y-1">
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                  Update available: v{updateState.version}
                </p>
                <button
                  onClick={handleInstallUpdate}
                  disabled={updateState.downloading}
                  className="flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {updateState.downloading ? (
                    <><Loader2 className="h-3 w-3 animate-spin" /> Installing...</>
                  ) : (
                    <><Download className="h-3 w-3" /> Install Update</>
                  )}
                </button>
              </div>
            )}
            {!updateState.checking && !updateState.available && !updateState.error && (
              <p className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400">You&apos;re up to date!</p>
            )}
            {updateState.error && (
              <p className="mt-1 text-[11px] text-destructive">{updateState.error}</p>
            )}
          </div>
          <button
            onClick={handleCheckUpdates}
            disabled={updateState.checking || updateState.downloading}
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${updateState.checking ? 'animate-spin' : ''}`} />
            Check
          </button>
        </div>
      </SettingsCard>

      {/* Help & Resources */}
      <SettingsCard>
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Help &amp; Resources</p>

          <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-3">
            <div>
              <p className="text-xs font-medium">Show Tutorial Again</p>
              <p className="text-[11px] text-muted-foreground">Replay the onboarding walkthrough.</p>
            </div>
            <button
              onClick={() => { resetTutorial(); notifySaved('Tutorial reset') }}
              className="flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
            >
              <RefreshCw className="h-3 w-3" /> Reset
            </button>
          </div>

          <a
            href="/desktop/glossary"
            className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-3 hover:bg-muted/50 transition-colors"
          >
            <div>
              <p className="text-xs font-medium">Aviation Glossary</p>
              <p className="text-[11px] text-muted-foreground">Browse aviation terms and feature descriptions.</p>
            </div>
            <span className="flex items-center gap-1 text-xs text-primary">
              <BookOpen className="h-3 w-3" /> Open
            </span>
          </a>
        </div>
      </SettingsCard>
    </div>
  )
}
