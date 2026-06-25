'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Download,
  RefreshCw,
  HardDrive,
  Loader2,
  Wifi,
  Trash2,
  AlertTriangle,
} from 'lucide-react'
import {
  getCacheMeta,
  clearCache,
  countCachedTiles,
  type TileProvider,
  type CacheMeta,
} from '@/desktop/lib/tile-cache'
import { cn } from '@/lib/utils'

interface TileCacheBannerProps {
  provider: TileProvider
  onRefresh?: () => void
}

const STALE_DAYS = 14
const MAX_DAYS = 60

function daysAgo(iso: string): number {
  const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z')
  return Math.floor((Date.now() - d.getTime()) / 86_400_000)
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z')
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

export function TileCacheBanner({ provider, onRefresh }: TileCacheBannerProps) {
  const [meta, setMeta] = useState<CacheMeta | null>(null)
  const [totalTiles, setTotalTiles] = useState(0)
  const [busy, setBusy] = useState(false)
  const [isTauri, setIsTauri] = useState(false)

  const refresh = useCallback(async () => {
    const m = await getCacheMeta(provider)
    const total = await countCachedTiles()
    setMeta(m)
    setTotalTiles(total)
  }, [provider])

  useEffect(() => {
    setIsTauri(typeof window !== 'undefined' && Boolean((window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ || (window as unknown as Record<string, unknown>).__TAURI__))
    refresh()
  }, [refresh])

  const handleClear = async () => {
    setBusy(true)
    await clearCache(provider)
    setBusy(false)
    refresh()
    onRefresh?.()
  }

  if (!isTauri) {
    return (
      <div className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-[11px] text-muted-foreground shadow-sm">
        <Wifi className="h-3.5 w-3.5" /> Online (web)
      </div>
    )
  }

  if (!meta || !meta.downloadedAt) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-[11px] shadow-sm">
        <Wifi className="h-3.5 w-3.5 text-emerald-500" />
        <span className="text-muted-foreground">Online — live tiles</span>
        <span className="text-muted-foreground/40">·</span>
        <span className="text-muted-foreground">Caching as you pan</span>
        <button
          disabled={busy}
          onClick={handleClear}
          className="flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/20 disabled:opacity-50"
          title="Reset cache"
        >
          {busy ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Download className="h-2.5 w-2.5" />}
          Reset
        </button>
      </div>
    )
  }

  const age = daysAgo(meta.downloadedAt)
  const stale = age >= STALE_DAYS
  const outdated = age >= MAX_DAYS

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-[11px] shadow-sm',
        outdated
          ? 'border-destructive/30 text-destructive'
          : stale
          ? 'border-amber-500/30 text-amber-700 dark:text-amber-400'
          : 'border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
      )}
    >
      {outdated ? <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> : <HardDrive className="h-3.5 w-3.5 shrink-0" />}
      <span className="font-medium">Downloaded {formatDate(meta.downloadedAt)}</span>
      <span className="text-muted-foreground/60">·</span>
      <span>{age === 0 ? 'today' : `${age} days old`}</span>
      {totalTiles > 0 && (
        <>
          <span className="text-muted-foreground/60">·</span>
          <span className="text-muted-foreground">{totalTiles.toLocaleString()} tiles</span>
        </>
      )}
      <div className="ml-1 flex items-center gap-1">
        <button
          disabled={busy}
          onClick={handleClear}
          className={cn(
            'flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium disabled:opacity-50',
            stale
              ? 'bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-400'
              : 'bg-primary/10 text-primary hover:bg-primary/20'
          )}
          title="Clear cache — tiles will re-fill as you pan"
        >
          {busy ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <RefreshCw className="h-2.5 w-2.5" />}
          Update
        </button>
        <button
          disabled={busy}
          onClick={handleClear}
          className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted/80 disabled:opacity-50"
          title="Clear all cached tiles"
        >
          {busy ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Trash2 className="h-2.5 w-2.5" />}
        </button>
      </div>
    </div>
  )
}