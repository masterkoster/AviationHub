'use client'

import { Monitor, Search, Minus, Square, X, Copy } from 'lucide-react'
import { useWindowControls } from '@/desktop/hooks/use-window-controls'
import { cn } from '@/lib/utils'

interface TitleBarProps {
  onTogglePalette?: () => void
  syncStatus?: 'synced' | 'syncing' | 'offline' | 'error'
}

/**
 * Custom desktop title bar.
 * Replaces OS chrome with our own branded bar:
 * - Drag region (click anywhere to drag the window)
 * - App logo + name (left)
 * - Command palette trigger (center)
 * - Sync status + window controls (right)
 */
export function TitleBar({ onTogglePalette, syncStatus = 'synced' }: TitleBarProps) {
  const { isTauri, isMaximized, minimize, toggleMaximize, close, startDrag } = useWindowControls()

  const handleMouseDown = (e: React.MouseEvent) => {
    // The data-tauri-drag-region attribute handles dragging automatically in Tauri v2.
    // But we also support a fallback for non-Tauri environments.
    if (isTauri && e.button === 0) {
      // The attribute handles it; nothing more to do.
      return
    }
  }

  return (
    <div
      data-tauri-drag-region
      onMouseDown={handleMouseDown}
      className="flex h-9 shrink-0 items-center justify-between border-b border-border bg-card px-2 select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Left: Logo + App Name */}
      <div className="flex items-center gap-2 pl-1" data-tauri-drag-region>
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary">
          <Monitor className="h-3.5 w-3.5 text-primary-foreground" />
        </div>
        <span className="text-xs font-semibold tracking-tight">AviationHub</span>
      </div>

      {/* Center: Command Palette Trigger (only show if handler provided) */}
      {onTogglePalette ? (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onTogglePalette()
          }}
          className="flex items-center gap-2 rounded-md border border-border bg-background/60 px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-muted transition-colors"
          data-tauri-drag-region={false}
          title="Open command palette (Ctrl+K)"
        >
          <Search className="h-3 w-3" />
          <span>Search...</span>
          <kbd className="ml-1 rounded border border-border bg-muted px-1 text-[10px] font-mono">
            Ctrl K
          </kbd>
        </button>
      ) : (
        <div />
      )}

      {/* Right: Sync status + Window Controls */}
      <div className="flex items-center gap-1">
        <SyncBadge status={syncStatus} />
        {/* Window controls */}
        <div className="flex items-center">
          <TitleBarButton onClick={minimize} title="Minimize" disabled={!isTauri}>
            <Minus className="h-3.5 w-3.5" />
          </TitleBarButton>
          <TitleBarButton onClick={toggleMaximize} title={isMaximized ? 'Restore' : 'Maximize'} disabled={!isTauri}>
            {isMaximized ? (
              <Copy className="h-3 w-3 -scale-x-100" />
            ) : (
              <Square className="h-3 w-3" />
            )}
          </TitleBarButton>
          <TitleBarButton onClick={close} title="Close" disabled={!isTauri} danger>
            <X className="h-3.5 w-3.5" />
          </TitleBarButton>
        </div>
      </div>
    </div>
  )
}

function TitleBarButton({
  children,
  onClick,
  title,
  disabled,
  danger,
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        if (!disabled) onClick()
      }}
      disabled={disabled}
      title={title}
      className={cn(
        'flex h-7 w-9 items-center justify-center text-muted-foreground transition-colors',
        disabled && 'opacity-40 cursor-not-allowed',
        !disabled && 'hover:bg-muted',
        danger && !disabled && 'hover:bg-destructive hover:text-destructive-foreground'
      )}
    >
      {children}
    </button>
  )
}

function SyncBadge({ status }: { status: NonNullable<TitleBarProps['syncStatus']> }) {
  const map = {
    synced: { label: 'Synced', color: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
    syncing: { label: 'Syncing', color: 'bg-amber-500 animate-pulse', text: 'text-amber-600 dark:text-amber-400' },
    offline: { label: 'Offline', color: 'bg-muted-foreground', text: 'text-muted-foreground' },
    error: { label: 'Sync error', color: 'bg-destructive', text: 'text-destructive' },
  }
  const s = map[status]
  return (
    <div className="mr-1 flex items-center gap-1.5 px-2 py-1 text-[10px] font-medium" title={s.label}>
      <span className={cn('h-1.5 w-1.5 rounded-full', s.color)} />
      <span className={s.text}>{s.label}</span>
    </div>
  )
}