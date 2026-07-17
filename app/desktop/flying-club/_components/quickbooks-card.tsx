'use client'

// ---- QuickBooksCard ----
// Finance-only (ADMIN/TREASURER) QuickBooks Online connect/status/sync card
// for the club's Invoice/Payment sync, shown in the Billing tab next to
// PaymentsCard. Distinct from the personal QuickBooks connection at
// app/desktop/settings/accounting (which syncs an individual's own
// out-of-pocket expenses) - this connects the CLUB's QuickBooks company via
// app/api/integrations/quickbooks/*.
//
// The club QuickBooks routes existed before this card did (they were built
// for a "Manage -> Add-ons" page that no longer exists after the app-shell
// consolidation) - this is the first place they're actually reachable from
// the UI. See docs/QUICKBOOKS.md.

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, Calculator, RefreshCw, Unlink } from 'lucide-react'

interface QuickBooksStatus {
  connected: boolean
  status: string
  companyName?: string | null
  lastSync?: string | null
  lastSyncError?: string | null
}

export function QuickBooksCard({ groupId }: { groupId: string }) {
  const [status, setStatus] = useState<QuickBooksStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadStatus = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/integrations/quickbooks/status?groupId=${groupId}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to load QuickBooks status')
      setStatus(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load QuickBooks status')
    } finally {
      setLoading(false)
    }
  }, [groupId])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  async function handleConnect() {
    setConnecting(true)
    setError(null)
    try {
      const res = await fetch(`/api/integrations/quickbooks/connect?groupId=${groupId}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'Failed to start QuickBooks connection'); return }
      if (data.authUrl) {
        const popup = window.open(data.authUrl, '_blank')
        if (!popup) window.location.href = data.authUrl
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
      const res = await fetch('/api/integrations/quickbooks/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'Sync failed'); return }
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
      const res = await fetch('/api/integrations/quickbooks/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'Failed to disconnect'); return }
      await loadStatus()
    } catch {
      setError('Network error')
    } finally {
      setDisconnecting(false)
    }
  }

  const label = !status?.connected ? 'Not connected' : status.companyName ? `Connected — ${status.companyName}` : 'Connected'

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Calculator className="h-5 w-5" />Accounting (QuickBooks)</CardTitle>
        <CardDescription>Push club invoices and payments into your QuickBooks Online books.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Status</span>
              <Badge variant={status?.connected ? 'default' : 'secondary'}>{label}</Badge>
            </div>

            {status?.connected && (
              <p className="text-xs text-muted-foreground">
                {status.lastSync ? `Last synced ${new Date(status.lastSync).toLocaleString()}` : 'Never synced'}
              </p>
            )}
            {status?.lastSyncError && <p className="text-xs text-destructive">{status.lastSyncError}</p>}
            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex items-center justify-between gap-4">
              <p className="text-xs text-muted-foreground">
                One-way push (app → QBO); re-running sync is safe, already-pushed invoices are skipped.
              </p>
              <div className="flex shrink-0 gap-2">
                {!status?.connected ? (
                  <Button onClick={handleConnect} disabled={connecting} size="sm">
                    {connecting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Connecting…</> : 'Connect'}
                  </Button>
                ) : (
                  <>
                    <Button onClick={handleSync} disabled={syncing} size="sm" variant="outline">
                      {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                      Sync now
                    </Button>
                    <Button onClick={handleDisconnect} disabled={disconnecting} size="sm" variant="outline">
                      {disconnecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Unlink className="mr-2 h-4 w-4" />}
                      Disconnect
                    </Button>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
