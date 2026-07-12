'use client'

import {
  Route as RouteIcon,
  ClipboardList,
  Scale,
  CloudSun,
  Fuel,
  Layers,
  Save,
  Download,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export type PanelId = 'route' | 'plan' | 'wb' | 'weather' | 'fuel' | 'layers' | 'saved' | 'export'

interface MapToolbarProps {
  activePanel: PanelId | null
  onTogglePanel: (panel: PanelId) => void
  hasWaypoints: boolean
  hasRoute: boolean
}

const TOOLS: { id: PanelId; icon: typeof RouteIcon; label: string; requires?: 'waypoints' | 'route' }[] = [
  { id: 'route', icon: RouteIcon, label: 'Route' },
  { id: 'plan', icon: ClipboardList, label: 'Flight Plan' },
  { id: 'wb', icon: Scale, label: 'Weight & Balance' },
  { id: 'weather', icon: CloudSun, label: 'Weather' },
  { id: 'fuel', icon: Fuel, label: 'Fuel' },
  { id: 'layers', icon: Layers, label: 'Layers & Filters' },
  { id: 'saved', icon: Save, label: 'Saved Routes' },
  { id: 'export', icon: Download, label: 'Export & File' },
]

export function MapToolbar({ activePanel, onTogglePanel, hasWaypoints, hasRoute }: MapToolbarProps) {
  return (
    <div className="z-[1200] flex w-11 shrink-0 flex-col items-center gap-1 border-l border-border bg-card/95 py-2 backdrop-blur">
      {TOOLS.map((tool) => {
        const isActive = activePanel === tool.id
        const disabled =
          (tool.requires === 'waypoints' && !hasWaypoints) ||
          (tool.requires === 'route' && !hasRoute)

        return (
          <button
            key={tool.id}
            onClick={() => onTogglePanel(tool.id)}
            disabled={disabled}
            title={tool.label + (disabled ? ' (add waypoints first)' : '')}
            aria-label={tool.label}
            aria-pressed={isActive}
            className={cn(
              'group relative flex h-9 w-9 items-center justify-center rounded-md transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground'
                : disabled
                ? 'text-muted-foreground/30 cursor-not-allowed'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <tool.icon className="h-4 w-4 shrink-0" />
            {/* Tooltip on hover */}
            <span className="pointer-events-none absolute right-full mr-2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-[11px] font-medium text-popover-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100">
              {tool.label}
            </span>
          </button>
        )
      })}

      {activePanel && (
        <div className="mt-auto pt-2">
          <button
            onClick={() => onTogglePanel(activePanel)}
            title="Close panel"
            aria-label="Close panel"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/60 hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
