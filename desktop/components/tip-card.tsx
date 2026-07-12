'use client'

import { X, Lightbulb } from 'lucide-react'

interface TipCardProps {
  /** Unique tip ID for dismissal persistence */
  tipId: string
  /** The tip message */
  message: string
  /** Optional action label (e.g. "Try it") */
  actionLabel?: string
  /** Optional action callback */
  onAction?: () => void
  /** Called when the tip is dismissed */
  onDismiss: () => void
}

/**
 * A small, dismissable tip card with a lightbulb icon.
 * Shown contextually on first visit to each surface.
 */
export function TipCard({ tipId, message, actionLabel, onAction, onDismiss }: TipCardProps) {
  return (
    <div
      role="status"
      className="mb-4 flex items-start gap-3 rounded-lg border border-border bg-card/80 p-3 text-sm shadow-sm"
    >
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/10">
        <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
      </div>
      <div className="flex-1">
        <p className="text-xs leading-relaxed text-muted-foreground">{message}</p>
        {actionLabel && onAction && (
          <button
            onClick={onAction}
            className="mt-1.5 text-xs font-medium text-primary hover:underline"
          >
            {actionLabel}
          </button>
        )}
      </div>
      <button
        onClick={onDismiss}
        aria-label="Dismiss tip"
        className="shrink-0 rounded p-0.5 text-muted-foreground/50 hover:bg-muted hover:text-foreground transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
