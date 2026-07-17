'use client'

import { useCallback, useEffect, useState } from 'react'
import { Calculator, Loader2, RefreshCw, Unlink } from 'lucide-react'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import { notifyError } from '@/desktop/lib/toast-helpers'
import { toast } from '@/components/ui/use-toast'
import { SectionHeading, SettingsCard } from '@/desktop/components/settings-ui'

interface QuickBooksStatus {
  connected: boolean
  status: string
  companyName?: string | null
  lastSync?: string | null
  lastSyncStatus?: string | null
  lastSyncError?: string | null
  syncedCount?: number
}

/**
 * Personal QuickBooks connection - syncs the signed-in user's own aviation
 * expenses (personal maintenance/fuel costs) to their own QuickBooks Online
 * company, for tax time. Distinct from the club's QuickBooks connection
 * (which pushes club invoices/payments) - see app/desktop/flying-club
 * _components/quickbooks-card.tsx and docs/QUICKBOOKS.md.
 */
export default function AccountingSettingsPage() {
  const { mode, cloudUser } = useDesktopAuth()
  // The QuickBooks routes are session-cookie-gated (app/api/me/quickbooks/*
  // calls auth()), which only exists in cloud mode - a local (offline PIN
  // kiosk) profile has no server session to attach OAuth tokens to.
  const cloudReady = mode === 'cloud' && !!cloudUser

  const [status, setStatus] = useState<QuickBooksStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadStatus = useCallback(async () => {
    if (!cloudReady) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/me/quickbooks/status')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to load QuickBooks status')
      setStatus(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load QuickBooks status')
    } finally {
      setLoading(false)
    }
  }, [cloudReady])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  // Pick up ?success=quickbooks_connected / ?error=... from the OAuth
  // callback redirect and refresh status.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const success = params.get('success')
    const err = params.get('error')
    if (success === 'quickbooks_connected') {
      toast({ title: 'QuickBooks connected', description: 'Your QuickBooks company is now connected.' })
      loadStatus()
    } else if (err) {
      notifyError('QuickBooks', err.replace(/_/g, ' '))
    }
    if (success || err) {
      window.history.replaceState({}, '', window.location.pathname)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleConnect() {
    setConnecting(true)
    setError(null)
    try {
      const res = await fetch('/api/me/quickbooks/connect')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Failed to start QuickBooks connection')
        return
      }
      if (data.authUrl) {
        window.location.href = data.authUrl
      }
    } catch {
      setError('Network error')
    } finally {
      setConnecting(false)
    }
  }

  async function handleSync() {
    setSyncing(true)
    setError(null)
    try {
      const res = await fetch('/api/me/quickbooks/sync', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Sync failed')
        return
      }
      toast({
        title: 'Sync complete',
        description: `${data.pushed} pushed, ${data.skipped} already synced${data.errors?.length ? `, ${data.errors.length} failed` : ''}.`,
      })
      await loadStatus()
    } catch {
      setError('Network error')
    } finally {
      setSyncing(false)
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true)
    setError(null)
    try {
      const res = await fetch('/api/me/quickbooks/disconnect', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Failed to disconnect')
        return
      }
      await loadStatus()
    } catch {
      setError('Network error')
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <div className="space-y-4">
      <SectionHeading
        icon={<Calculator className="h-4 w-4" />}
        title="Accounting"
        description="Sync your aircraft expenses to QuickBooks for tax time."
      />

      {!cloudReady ? (
        <SettingsCard>
          <p className="text-xs text-muted-foreground">
            QuickBooks sync requires a signed-in cloud account (it connects to your own QuickBooks
            company over the internet). Sign in to a cloud account to use it.
          </p>
        </SettingsCard>
      ) : (
        <SettingsCard>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-3">
                <div>
                  <p className="text-xs font-medium">QuickBooks Online</p>
                  <p className="text-[11px] text-muted-foreground">
                    {status?.connected
                      ? status.companyName
                        ? `Connected to ${status.companyName}`
                        : 'Connected'
                      : 'Not connected'}
                  </p>
                  {status?.connected && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {status.lastSync
                        ? `Last synced ${new Date(status.lastSync).toLocaleString()}`
                        : 'Never synced'}
                      {typeof status.syncedCount === 'number' ? ` · ${status.syncedCount} expenses synced` : ''}
                    </p>
                  )}
                  {status?.lastSyncError && (
                    <p className="mt-1 text-[11px] text-destructive">{status.lastSyncError}</p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {!status?.connected ? (
                    <button
                      type="button"
                      onClick={handleConnect}
                      disabled={connecting}
                      className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      {connecting ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      Connect
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={handleSync}
                        disabled={syncing}
                        className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
                      >
                        {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                        Sync now
                      </button>
                      <button
                        type="button"
                        onClick={handleDisconnect}
                        disabled={disconnecting}
                        className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                      >
                        {disconnecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unlink className="h-3 w-3" />}
                        Disconnect
                      </button>
                    </>
                  )}
                </div>
              </div>

              {error && <p className="text-[11px] text-destructive">{error}</p>}

              <p className="text-[11px] text-muted-foreground">
                Pushes your personal aircraft maintenance and fuel costs to QuickBooks as expenses.
                This is separate from any flying club billing - it&apos;s only your own out-of-pocket costs.
              </p>
            </div>
          )}
        </SettingsCard>
      )}
    </div>
  )
}
