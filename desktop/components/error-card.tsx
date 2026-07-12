'use client'

import { AlertTriangle, RefreshCw } from 'lucide-react'

interface ErrorCardProps {
  message?: string
  onRetry?: () => void
}

export function ErrorCard({ message, onRetry }: ErrorCardProps) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/20 p-8 text-center">
      <AlertTriangle className="mx-auto h-10 w-10 text-destructive/70" />
      <h2 className="mt-4 text-base font-semibold">Something went wrong</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {message || 'Something went wrong'}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-5 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <RefreshCw className="h-4 w-4" />
          Try Again
        </button>
      )}
    </div>
  )
}
