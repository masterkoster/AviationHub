'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Command } from 'cmdk'
import {
  LayoutDashboard,
  List,
  Plus,
  BarChart3,
  ShieldCheck,
  Plane,
  User,
  Search,
  Download,
  Settings,
  FileText,
  CornerDownLeft,
  Globe,
  CalendarDays,
} from 'lucide-react'

interface CommandItem {
  id: string
  label: string
  group: 'navigate' | 'action'
  icon: React.ComponentType<{ className?: string }>
  hint?: string
  run: () => void
}

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter()
  const [search, setSearch] = useState('')

  const items = useMemo<CommandItem[]>(() => {
    const navigate = (href: string) => () => {
      router.push(href)
      onOpenChange(false)
    }
    return [
      { id: 'nav-dash', label: 'Dashboard', group: 'navigate', icon: LayoutDashboard, hint: 'Ctrl+1', run: navigate('/desktop/dashboard') },
      { id: 'nav-flights', label: 'Flights (Logbook)', group: 'navigate', icon: List, hint: 'Ctrl+2', run: navigate('/desktop/logbook') },
      { id: 'nav-add', label: 'Add Flight', group: 'navigate', icon: Plus, hint: 'Ctrl+N', run: navigate('/desktop/logbook/new') },
      { id: 'nav-totals', label: 'Totals', group: 'navigate', icon: BarChart3, hint: 'Ctrl+3', run: navigate('/desktop/logbook/totals') },
      { id: 'nav-currency', label: 'Currency Status', group: 'navigate', icon: ShieldCheck, hint: 'Ctrl+4', run: navigate('/desktop/logbook/currency') },
      { id: 'nav-aircraft', label: 'Aircraft Manager', group: 'navigate', icon: Plane, hint: 'Ctrl+5', run: navigate('/desktop/aircraft') },
      { id: 'nav-map', label: 'Map (Fuel Saver)', group: 'navigate', icon: Globe, hint: 'Ctrl+7', run: navigate('/desktop/map') },
      { id: 'nav-calendar', label: 'Calendar', group: 'navigate', icon: CalendarDays, hint: 'Ctrl+8', run: navigate('/desktop/calendar') },
      { id: 'nav-profile', label: 'Profile & Settings', group: 'navigate', icon: User, hint: 'Ctrl+6', run: navigate('/desktop/profile') },
      { id: 'act-search', label: 'Search Flights...', group: 'action', icon: Search, hint: 'Ctrl+F', run: navigate('/desktop/logbook') },
      { id: 'act-export', label: 'Export Logbook', group: 'action', icon: Download, hint: 'Ctrl+E', run: () => { router.push('/desktop/logbook/totals'); onOpenChange(false) } },
      { id: 'act-settings', label: 'Settings', group: 'action', icon: Settings, hint: 'Ctrl+,', run: navigate('/desktop/profile') },
      { id: 'act-help', label: 'Keyboard Shortcuts', group: 'action', icon: FileText, hint: '?', run: () => window.alert('Ctrl+N: New Flight\nCtrl+F: Search\nCtrl+S: Save\nCtrl+E: Export\nCtrl+K: Palette\nCtrl+1-6: Navigate\nEsc: Back') },
    ]
  }, [router, onOpenChange])

  // Reset search on close
  useEffect(() => {
    if (!open) setSearch('')
  }, [open])

  // Allow Escape key (cmdk handles this; just ensure focus returns to body)
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[15vh] backdrop-blur-sm"
      onClick={() => onOpenChange(false)}
    >
      <Command
        loop
        className="w-[520px] overflow-hidden rounded-lg border border-border bg-popover shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center border-b border-border px-3">
          <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
          <Command.Input
            autoFocus
            placeholder="Type a command or search..."
            value={search}
            onValueChange={setSearch}
            className="flex h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
            ESC
          </kbd>
        </div>
        <Command.List className="max-h-[360px] overflow-y-auto p-1.5">
          <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
            No results found.
          </Command.Empty>

          <Command.Group heading="Navigate" className="text-xs text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-medium uppercase tracking-wide">
            {items.filter((i) => i.group === 'navigate').map((item) => (
              <PaletteRow key={item.id} item={item} />
            ))}
          </Command.Group>

          <Command.Group heading="Actions" className="text-xs text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-medium uppercase tracking-wide">
            {items.filter((i) => i.group === 'action').map((item) => (
              <PaletteRow key={item.id} item={item} />
            ))}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  )
}

function PaletteRow({ item }: { item: CommandItem }) {
  return (
    <Command.Item
      value={`${item.label} ${item.hint ?? ''}`}
      onSelect={() => item.run()}
      className="flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-sm aria-selected:bg-primary/10 aria-selected:text-primary"
    >
      <item.icon className="h-4 w-4 shrink-0 text-muted-foreground aria-selected:text-primary" />
      <span className="flex-1">{item.label}</span>
      {item.hint && (
        <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
          {item.hint}
        </kbd>
      )}
      <CornerDownLeft className="h-3 w-3 text-muted-foreground/40" />
    </Command.Item>
  )
}
