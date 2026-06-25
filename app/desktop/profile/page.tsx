'use client'

import { useState } from 'react'
import { useEffect } from 'react'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import { exportUserData, importUserData } from '@/desktop/lib/backup'
import { completeSetup } from '@/desktop/lib/setup'
import { Lock, Download, Upload } from 'lucide-react'
import { LocalModePlaceholder } from '@/desktop/components/local-mode-placeholder'
import { useTheme } from 'next-themes'
import { getConsent, setConsent } from '@/desktop/lib/analytics-consent'

export default function DesktopProfilePage() {
  const { mode, localUser } = useDesktopAuth()
  const { theme, resolvedTheme, setTheme } = useTheme()
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [mounted, setMounted] = useState(false)
  const [analyticsConsent, setAnalyticsConsent] = useState(getConsent())

  useEffect(() => {
    setMounted(true)
  }, [])

  function toggleAnalytics() {
    const next = analyticsConsent === 'granted' ? 'denied' : 'granted'
    setConsent(next)
    setAnalyticsConsent(next)
  }

  const isTauri =
    typeof window !== 'undefined' &&
    Boolean(
      (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ ||
        (window as unknown as Record<string, unknown>).__TAURI__
    )

  async function handleExport() {
    if (!isTauri) {
      setError('Backup export is available in the desktop app only.')
      return
    }
    if (!localUser) {
      setError('No local user is active.')
      return
    }
    const pin = window.prompt('Enter your PIN to encrypt this backup file')
    if (!pin) return
    setExporting(true)
    setMessage('')
    setError('')
    try {
      const result = await exportUserData(localUser.id, pin)
      if (!result.success) {
        setError(result.error || 'Export failed')
      } else {
        setMessage(`Backup saved to ${result.fileName}`)
      }
    } catch (err) {
      console.error('[profile] export failed', err)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setExporting(false)
    }
  }

  async function handleImport() {
    if (!isTauri) {
      setError('Backup import is available in the desktop app only.')
      return
    }
    setImporting(true)
    setMessage('')
    setError('')
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const filePath = await open({
        multiple: false,
        filters: [{ name: 'AviationHub Backup', extensions: ['ahb'] }],
      })
      if (!filePath) {
        setImporting(false)
        return
      }
      const { readFile } = await import('@tauri-apps/plugin-fs')
      const bytes = (await readFile(filePath as string, { encoding: 'binary' })) as Uint8Array
      const pin = window.prompt('Enter the PIN for this backup file')
      if (!pin) {
        setImporting(false)
        return
      }
      const result = await importUserData(bytes, pin)
      if (!result.success) {
        setError(result.error || 'Import failed')
        setImporting(false)
        return
      }
      await completeSetup({ mode: 'local', localUserId: result.userId })
      setMessage(`Imported ${result.flightsImported} flights for ${result.userName}`)
    } catch (err) {
      console.error('[profile] import failed', err)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <h1 className="text-lg font-semibold">Pilot Profile</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Native desktop profile (separate from the web UI).
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Mode</p>
            <p className="text-sm font-medium">{mode === 'cloud' ? 'Cloud Sync' : 'Local'}</p>
          </div>
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Name</p>
            <p className="text-sm font-medium">{localUser?.name || 'Cloud user'}</p>
          </div>
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Username</p>
            <p className="text-sm font-medium">{localUser?.username || '—'}</p>
          </div>
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Home Airport</p>
            <p className="text-sm font-medium">{localUser?.homeAirport || '—'}</p>
          </div>
        </div>
      </div>

      {mode !== 'local' && (
        <LocalModePlaceholder
          title="Cloud profile editing is moving to desktop-native screens"
          description="You can still run cloud sync from desktop. Full cloud profile editor is being separated from web components now."
          cta={{ label: 'Jump to backup', href: '#backup' }}
        />
      )}

      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <h2 className="text-sm font-semibold">Appearance</h2>
        <p className="mt-1 text-xs text-muted-foreground">Choose your preferred desktop theme.</p>
        <div className="mt-3 flex items-center justify-between rounded-md border border-border bg-muted/30 p-3">
          <div>
            <p className="text-xs font-medium">Dark mode</p>
            <p className="text-[11px] text-muted-foreground">
              {mounted ? `Current: ${resolvedTheme === 'dark' ? 'Dark' : 'Light'}${theme === 'system' ? ' (System)' : ''}` : 'Loading theme...'}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setTheme('light')}
              className={`rounded-md border px-2.5 py-1.5 text-xs font-medium ${theme === 'light' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card hover:bg-muted'}`}
              disabled={!mounted}
            >
              Light
            </button>
            <button
              type="button"
              onClick={() => setTheme('dark')}
              className={`rounded-md border px-2.5 py-1.5 text-xs font-medium ${theme === 'dark' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card hover:bg-muted'}`}
              disabled={!mounted}
            >
              Dark
            </button>
            <button
              type="button"
              onClick={() => setTheme('system')}
              className={`rounded-md border px-2.5 py-1.5 text-xs font-medium ${theme === 'system' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card hover:bg-muted'}`}
              disabled={!mounted}
            >
              System
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <h2 className="text-sm font-semibold">Privacy</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Control anonymous usage analytics. This only applies to the desktop app.
        </p>
        <div className="mt-3 flex items-center justify-between rounded-md border border-border bg-muted/30 p-3">
          <div>
            <p className="text-xs font-medium">Analytics</p>
            <p className="text-[11px] text-muted-foreground">
              {analyticsConsent === 'granted'
                ? 'Anonymous usage data is being collected'
                : analyticsConsent === 'denied'
                  ? 'Anonymous usage data is disabled'
                  : 'You haven&apos;t chosen yet'}
            </p>
          </div>
          <button
            type="button"
            onClick={toggleAnalytics}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              analyticsConsent === 'granted' ? 'bg-primary' : 'bg-muted-foreground/30'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                analyticsConsent === 'granted' ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      <div id="backup" className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4" />
          <h2 className="text-sm font-semibold">Backup &amp; Restore</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Export your local logbook to an encrypted .ahb file or restore from a backup. Backups use your PIN for encryption.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={handleExport}
            disabled={exporting || mode !== 'local'}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {exporting ? <Download className="h-4 w-4 animate-bounce" /> : <Download className="h-4 w-4" />}
            Export backup
          </button>
          <button
            onClick={handleImport}
            disabled={importing}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            {importing ? <Upload className="h-4 w-4 animate-bounce" /> : <Upload className="h-4 w-4" />}
            Import backup
          </button>
        </div>
        {message && <p className="mt-2 text-xs text-emerald-500 whitespace-pre-line">{message}</p>}
        {error && <p className="mt-2 text-xs text-destructive whitespace-pre-line">{error}</p>}
        {mode !== 'local' && (
          <p className="mt-2 text-[10px] text-muted-foreground">
            Export is available when a local account is active. Cloud accounts are stored on AviationHub servers automatically.
          </p>
        )}
      </div>
    </div>
  )
}
