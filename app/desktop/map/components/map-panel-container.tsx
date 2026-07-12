'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

interface MapPanelContainerProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}

/**
 * Slide-out panel container for the map page.
 * Renders a 350px panel docked to the right, over the map.
 * Handles Escape-to-close and click-outside.
 */
export function MapPanelContainer({ open, onClose, title, children }: MapPanelContainerProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  return (
    <div
      className={cn(
        'absolute right-11 top-0 z-[1150] h-full w-[350px] border-l border-border bg-card/95 shadow-xl backdrop-blur transition-transform duration-200 ease-out',
        open ? 'translate-x-0' : 'translate-x-full',
      )}
      ref={panelRef}
    >
      {/* Panel header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h3 className="text-sm font-semibold">{title}</h3>
        <button
          onClick={onClose}
          aria-label="Close panel"
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          ✕
        </button>
      </div>

      {/* Panel content — scrollable */}
      <div className="h-[calc(100%-44px)] overflow-y-auto p-3">
        {children}
      </div>
    </div>
  )
}
