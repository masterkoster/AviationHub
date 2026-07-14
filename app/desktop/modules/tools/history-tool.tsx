'use client'

import { useEffect, useState, useCallback } from 'react'
import { History, Trash2, RotateCw, Calculator } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ToolShell } from '@/components/ui/e6b'
import {
  listRecentTools,
  clearToolHistory,
  ensureE6bSchema,
  type E6bHistoryEntry,
} from '@/desktop/lib/e6b-store'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import { toast } from 'sonner'

// ── Config ────────────────────────────────────────────────────────────────────

const LIMIT = 20

const TOOL_LABELS: Record<string, string> = {
  'wind': 'Wind Correction',
  'crosswind': 'Crosswind',
  'fuel': 'Fuel Burn',
  'tas': 'TAS & Density',
  'convert': 'Unit Converter',
  'sun': 'Sunrise / Sunset',
  'weight-balance': 'Weight & Balance',
  'wind-triangle': 'Wind Triangle',
  'pressure-altitude': 'Pressure Altitude',
  'cloud-base': 'Cloud Base',
  'tsd': 'Time-Speed-Distance',
  'standard-rate': 'Standard-Rate Turn',
}

function toolLabel(id: string): string {
  return TOOL_LABELS[id] ?? id
}

// ── Time-ago helper ────────────────────────────────────────────────────────────

function formatTimeAgo(iso: string): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const now = Date.now()
  const diffMs = now - then
  if (diffMs < 0) return 'just now'

  const sec = Math.floor(diffMs / 1000)
  if (sec < 60) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day === 1) return 'yesterday'
  if (day < 7) return `${day}d ago`
  const week = Math.floor(day / 7)
  if (week < 5) return `${week}w ago`
  const month = Math.floor(day / 30)
  if (month < 12) return `${month}mo ago`
  const year = Math.floor(day / 365)
  return `${year}y ago`
}

// ── Toast helper (graceful degradation if sonner isn't mounted) ────────────────

function notify(message: string): void {
  try {
    toast.success(message)
  } catch {
    // sonner not mounted or unavailable — degrade silently to console.
    if (typeof console !== 'undefined') console.log(message)
  }
}

// ── Component ───────────────────────────────────────────────────────────────────

export default function HistoryTool() {
  const auth = useDesktopAuth()
  const userId = auth.localUser?.id ?? auth.cloudUser?.id ?? null

  const [entries, setEntries] = useState<E6bHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [clearing, setClearing] = useState(false)

  const refresh = useCallback(async () => {
    if (!userId) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const result = await listRecentTools(userId, LIMIT)
      setEntries(result)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    ensureE6bSchema().catch(() => {})
    refresh()
  }, [refresh])

  const handleClearAll = useCallback(async () => {
    if (!userId) return
    setClearing(true)
    try {
      const ok = await clearToolHistory(userId)
      notify(ok ? 'History cleared.' : 'Could not clear history.')
      await refresh()
    } finally {
      setClearing(false)
    }
  }, [userId, refresh])

  const hasEntries = entries.length > 0

  return (
    <ToolShell
      title="History"
      description="Recent E6B calculations stored locally on this device."
      notesUserId={userId}
      notesTool="history"
    >
      {/* Top bar */}
      <div className="shrink-0 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <History className="w-3.5 h-3.5" />
          <span>
            Showing last {LIMIT} entries
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={loading || !userId}
          >
            <RotateCw className="w-3.5 h-3.5 mr-1" />
            Refresh
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleClearAll}
            disabled={clearing || loading || !hasEntries || !userId}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" />
            Clear All
          </Button>
        </div>
      </div>

      <Separator className="shrink-0 mb-4" />

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto">
      {!userId ? (
        <div className="text-center py-16">
          <Calculator className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-medium">Sign in to view history</p>
          <p className="text-xs text-muted-foreground mt-1">
            Complete setup or sign in to start saving your E6B calculations.
          </p>
        </div>
      ) : loading ? (
        <p className="text-sm text-muted-foreground animate-pulse">Loading…</p>
      ) : !hasEntries ? (
        <div className="text-center py-16">
          <Calculator className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-medium">No history yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Use any tool on the left and your calculations will be saved here
            automatically.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="border border-border rounded-lg bg-card p-4 hover:border-primary/30 transition-colors"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{toolLabel(entry.tool)}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatTimeAgo(entry.createdAt)}
                  </span>
                </div>
                <Button variant="ghost" size="sm">
                  <RotateCw className="w-3.5 h-3.5 mr-1" /> View
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground mb-1 font-semibold tracking-wide">
                    Inputs
                  </p>
                  <div className="bg-muted/50 rounded-md p-2.5 space-y-1">
                    {Object.entries(entry.input as Record<string, unknown>).map(([k, v]) => (
                      <div key={k} className="flex justify-between text-xs">
                        <span className="text-muted-foreground font-mono">{k}</span>
                        <span className="font-mono text-foreground font-medium">{String(v ?? '—')}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground mb-1 font-semibold tracking-wide">
                    Outputs
                  </p>
                  <div className="bg-muted/50 rounded-md p-2.5 space-y-1">
                    {Object.entries(entry.output as Record<string, unknown>).map(([k, v]) => (
                      <div key={k} className="flex justify-between text-xs">
                        <span className="text-muted-foreground font-mono">{k}</span>
                        <span className="font-mono text-foreground font-medium">{String(v ?? '—')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      </div>
    </ToolShell>
  )
}