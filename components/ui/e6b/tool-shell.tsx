import type { ReactNode } from 'react'
import { ToolNotes } from './tool-notes'

/**
 * ToolShell — title + description wrapper for E6B tools.
 * Supports fillHeight mode for zero-scroll viewport-fitted tools.
 * Optionally renders a per-tool notes pad when notesUserId + notesTool are set.
 */
export function ToolShell({
  title,
  description,
  children,
  fillHeight = true,
  className = '',
  notesUserId,
  notesTool,
}: {
  title: string
  description: string
  children: ReactNode
  fillHeight?: boolean
  className?: string
  /** Pass the user id to enable the notes pad. */
  notesUserId?: string | null
  /** Tool key for notes, e.g. 'wind-triangle', 'fuel'. */
  notesTool?: string
}) {
  const showNotes = fillHeight && notesUserId && notesTool

  return (
    <div className={`w-full ${fillHeight ? 'h-full flex flex-col' : ''} ${className}`}>
      <div className="shrink-0 mb-3">
        <h1 className="text-lg font-semibold leading-tight">{title}</h1>
        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{description}</p>
      </div>
      {fillHeight ? (
        <div className="flex-1 min-h-0 overflow-y-auto">
          {children}
          {showNotes && (
            <div className="mt-3">
              <ToolNotes userId={notesUserId!} tool={notesTool!} />
            </div>
          )}
        </div>
      ) : (
        children
      )}
    </div>
  )
}
