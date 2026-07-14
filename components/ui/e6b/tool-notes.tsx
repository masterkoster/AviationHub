'use client'

/**
 * ToolNotes — collapsible per-tool note pad.
 *
 * Loads/saves notes via the e6b-notes SQLite table. Compact by default
 * (just a small trigger button); expands to a textarea on click. Auto-saves
 * 500 ms after the user stops typing.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { FileText, ChevronDown, ChevronUp } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { getToolNote, saveToolNote } from '@/desktop/lib/e6b-store'

interface ToolNotesProps {
  /** User id — pass from useDesktopAuth().localUser?.id ?? cloudUser?.id */
  userId: string
  /** Tool key, e.g. 'wind-triangle', 'fuel', 'tas' */
  tool: string
}

export function ToolNotes({ userId, tool }: ToolNotesProps) {
  const [open, setOpen] = useState(false)
  const [body, setBody] = useState('')
  const [loaded, setLoaded] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Load note on mount (once) ──────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const note = await getToolNote(userId, tool)
        if (!cancelled) {
          setBody(note)
          setLoaded(true)
        }
      } catch {
        if (!cancelled) setLoaded(true)
      }
    })()
    return () => { cancelled = true }
  }, [userId, tool])

  // ── Debounced save ──────────────────────────────────────────────────────────
  const scheduleSave = useCallback(
    (next: string) => {
      setBody(next)
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        void saveToolNote(userId, tool, next)
      }, 500)
    },
    [userId, tool],
  )

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current)
        void saveToolNote(userId, tool, body)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!loaded) return null

  const hasNote = body.trim().length > 0

  return (
    <div className="shrink-0 rounded-lg border border-border bg-muted/20">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <FileText className="w-3.5 h-3.5 shrink-0" />
        <span className="font-medium">Notes</span>
        {hasNote && !open && (
          <span className="ml-1 truncate max-w-[180px] text-muted-foreground/60 italic">
            {body.length > 40 ? body.slice(0, 40) + '…' : body}
          </span>
        )}
        <span className="ml-auto shrink-0">
          {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </span>
      </button>

      {/* Expanded textarea */}
      {open && (
        <div className="px-3 pb-3">
          <Textarea
            value={body}
            onChange={(e) => scheduleSave(e.target.value)}
            placeholder="Quick notes for this tool — saved automatically…"
            className="min-h-[80px] max-h-[160px] text-xs resize-y"
            autoFocus
          />
        </div>
      )}
    </div>
  )
}
