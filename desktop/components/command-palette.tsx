'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Command } from 'cmdk'
import { SimpleAlert } from '@/desktop/components/alert-dialog'
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
  CloudSun,
  Users,
  ShoppingBag,
  Calculator,
  GraduationCap,
  Gauge,
  Scale,
  Wind,
  Thermometer,
  Navigation,
  Fuel,
  Clock,
  Moon,
  Sun,
  PanelLeft,
  RefreshCw,
  Upload,
  Printer,
  TrendingUp,
  Compass,
  type LucideIcon,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────

interface CommandItem {
  id: string
  label: string
  group: 'navigate' | 'action' | 'tools'
  icon: LucideIcon
  hint?: string
  /** Aliases for fuzzy search — e.g. "METAR" finds weather */
  keywords?: string[]
  /** Only show when on this pathname prefix */
  context?: string
  run: () => void
}

// ── Recency tracking ───────────────────────────────────────────

const RECENT_KEY = 'desktop.palette.recent'
const MAX_RECENT = 8

interface RecentEntry { id: string; ts: number }

function loadRecent(): RecentEntry[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.slice(0, MAX_RECENT)
  } catch { return [] }
}

function saveRecent(entries: RecentEntry[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(entries.slice(0, MAX_RECENT)))
  } catch { /* ignore */ }
}

function pushRecent(id: string) {
  const existing = loadRecent().filter((e) => e.id !== id)
  existing.unshift({ id, ts: Date.now() })
  saveRecent(existing)
}

// ── Component ──────────────────────────────────────────────────

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [search, setSearch] = useState('')
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [recentIds, setRecentIds] = useState<string[]>([])

  // Load recent commands on open
  useEffect(() => {
    if (open) {
      setRecentIds(loadRecent().map((e) => e.id))
      setSearch('')
    }
  }, [open])

  const navigate = useCallback((href: string) => {
    router.push(href)
    onOpenChange(false)
  }, [router, onOpenChange])

  // ── All command items ──
  const allItems = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [
      // ── Navigate ──
      { id: 'nav-dash', label: 'Dashboard', group: 'navigate', icon: LayoutDashboard, hint: 'Ctrl+1', keywords: ['home', 'overview', 'main'], run: () => navigate('/desktop/dashboard') },
      { id: 'nav-map', label: 'Map', group: 'navigate', icon: Globe, hint: 'Ctrl+7', keywords: ['chart', 'sectional', 'route', 'waypoint', 'airport'], run: () => navigate('/desktop/map') },
      { id: 'nav-weather', label: 'Weather', group: 'navigate', icon: CloudSun, hint: 'Ctrl+8', keywords: ['metar', 'taf', 'briefing', 'awc', 'noaa', 'pirep', 'sigmet'], run: () => navigate('/desktop/weather') },
      { id: 'nav-calendar', label: 'Calendar', group: 'navigate', icon: CalendarDays, hint: 'Ctrl+9', keywords: ['schedule', 'events', 'flights'], run: () => navigate('/desktop/calendar') },
      { id: 'nav-flights', label: 'Flights (Logbook)', group: 'navigate', icon: List, hint: 'Ctrl+2', keywords: ['log', 'entries', 'history', 'logbook'], run: () => navigate('/desktop/logbook') },
      { id: 'nav-add', label: 'Add Flight', group: 'navigate', icon: Plus, hint: 'Ctrl+N', keywords: ['new', 'log', 'entry', 'create'], run: () => navigate('/desktop/logbook/new') },
      { id: 'nav-totals', label: 'Totals', group: 'navigate', icon: BarChart3, hint: 'Ctrl+3', keywords: ['summary', 'hours', 'statistics', 'stats'], run: () => navigate('/desktop/logbook/totals') },
      { id: 'nav-currency', label: 'Currency Status', group: 'navigate', icon: ShieldCheck, hint: 'Ctrl+4', keywords: ['bfr', 'flight review', 'instrument', 'ifr', 'night', 'landings', '90 day', 'medical', 'compliance'], run: () => navigate('/desktop/logbook/currency') },
      { id: 'nav-aircraft', label: 'Aircraft Manager', group: 'navigate', icon: Plane, hint: 'Ctrl+5', keywords: ['fleet', 'planes', 'n-number', 'registration', 'tail'], run: () => navigate('/desktop/aircraft') },
      { id: 'nav-profile', label: 'Profile', group: 'navigate', icon: User, hint: 'Ctrl+6', keywords: ['certificates', 'certs', 'medical', 'pilot', 'info', 'avatar'], run: () => navigate('/desktop/profile') },
      { id: 'nav-discover', label: 'Discover', group: 'navigate', icon: Compass, keywords: ['states', 'flights', 'explore', 'routes', 'attractions', 'community'], run: () => navigate('/desktop/discover') },
      { id: 'nav-settings', label: 'Settings', group: 'navigate', icon: Settings, hint: 'Ctrl+,', keywords: ['preferences', 'config', 'theme', 'units', 'display'], run: () => navigate('/desktop/settings') },
      { id: 'nav-e6b', label: 'E6B & Tools', group: 'navigate', icon: Calculator, keywords: ['calculator', 'density altitude', 'crosswind', 'conversions'], run: () => navigate('/desktop/modules/tools') },
      { id: 'nav-training', label: 'Training Dashboard', group: 'navigate', icon: GraduationCap, keywords: ['certificate', 'checkride', 'far', 'part 61', 'requirements', 'progress', 'ppl', 'instrument', 'commercial', 'cfi', 'atp'], run: () => navigate('/desktop/modules/training') },
      { id: 'nav-reports', label: 'Reports', group: 'navigate', icon: FileText, keywords: ['8710', 'iacra', 'pdf', 'print', 'export', 'experience'], run: () => navigate('/desktop/reports') },

      // ── Actions ──
      { id: 'act-new-flight', label: 'New Flight', group: 'action', icon: Plus, hint: 'Ctrl+N', keywords: ['add', 'log', 'create'], run: () => navigate('/desktop/logbook/new') },
      { id: 'act-export-csv', label: 'Export Logbook (CSV)', group: 'action', icon: Download, hint: 'Ctrl+E', keywords: ['csv', 'backup', 'save', 'spreadsheet'], run: () => navigate('/desktop/logbook/totals') },
      { id: 'act-import-csv', label: 'Import Flights (CSV)', group: 'action', icon: Upload, keywords: ['foreflight', 'logten', 'myflightbook', 'migrate', 'csv', 'restore'], run: () => navigate('/desktop/logbook') },
      { id: 'act-print', label: 'Print Logbook', group: 'action', icon: Printer, keywords: ['pdf', 'paper', 'faa', 'grid', 'easa'], run: () => navigate('/desktop/reports') },
      { id: 'act-8710', label: '8710 Experience Report', group: 'action', icon: FileText, keywords: ['iacra', 'checkride', 'rating', 'application', 'faa form'], run: () => navigate('/desktop/reports') },
      { id: 'act-search', label: 'Search Flights...', group: 'action', icon: Search, hint: 'Ctrl+F', keywords: ['filter', 'find', 'lookup'], run: () => navigate('/desktop/logbook') },
      { id: 'act-sidebar', label: 'Toggle Sidebar', group: 'action', icon: PanelLeft, hint: 'Ctrl+B', keywords: ['collapse', 'expand', 'hide'], run: () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true })); onOpenChange(false) } },
      { id: 'act-updates', label: 'Check for Updates', group: 'action', icon: RefreshCw, keywords: ['update', 'version', 'upgrade', 'release'], run: () => navigate('/desktop/settings') },
      { id: 'act-shortcuts', label: 'Keyboard Shortcuts', group: 'action', icon: FileText, hint: '?', keywords: ['help', 'keys', 'hotkeys'], run: () => setShortcutsOpen(true) },

      // ── Tools (E6B calculators) ──
      { id: 'tool-wb', label: 'Weight & Balance Calculator', group: 'tools', icon: Scale, keywords: ['cg', 'weight', 'balance', 'envelope', 'arm', 'moment', 'gross'], run: () => navigate('/desktop/modules/tools') },
      { id: 'tool-density', label: 'Density Altitude Calculator', group: 'tools', icon: Thermometer, keywords: ['da', 'pressure altitude', 'oat', 'performance'], run: () => navigate('/desktop/modules/tools') },
      { id: 'tool-crosswind', label: 'Crosswind Calculator', group: 'tools', icon: Wind, keywords: ['wind', 'component', 'headwind', 'tailwind'], run: () => navigate('/desktop/modules/tools') },
      { id: 'tool-fuel', label: 'Fuel Burn Calculator', group: 'tools', icon: Fuel, keywords: ['gph', 'gallons', 'range', 'endurance'], run: () => navigate('/desktop/modules/tools') },
      { id: 'tool-tas', label: 'True Airspeed Calculator', group: 'tools', icon: Gauge, keywords: ['tas', 'ias', 'airspeed', 'calibrated'], run: () => navigate('/desktop/modules/tools') },
      { id: 'tool-heading', label: 'Heading / Wind Correction', group: 'tools', icon: Navigation, keywords: ['crab', 'drift', 'compass', 'magnetic'], run: () => navigate('/desktop/modules/tools') },
      { id: 'tool-conversions', label: 'Unit Conversions', group: 'tools', icon: TrendingUp, keywords: ['convert', 'nm', 'sm', 'km', 'ft', 'm', 'gal', 'l', 'c', 'f', 'inhg', 'mb'], run: () => navigate('/desktop/modules/tools') },
    ]

    // ── Contextual actions (only shown on specific pages) ──
    const contextual: CommandItem[] = []

    if (pathname.startsWith('/desktop/logbook') && !pathname.includes('/new')) {
      contextual.push(
        { id: 'ctx-new-flight', label: 'New Flight', group: 'action', icon: Plus, hint: 'Ctrl+N', context: '/desktop/logbook', keywords: ['add'], run: () => navigate('/desktop/logbook/new') },
        { id: 'ctx-export', label: 'Export Flights', group: 'action', icon: Download, context: '/desktop/logbook', keywords: ['csv'], run: () => navigate('/desktop/logbook/totals') },
      )
    }

    if (pathname.startsWith('/desktop/map')) {
      contextual.push(
        { id: 'ctx-add-wp', label: 'Add Waypoint to Route', group: 'action', icon: Plus, context: '/desktop/map', keywords: ['airport', 'search'], run: () => navigate('/desktop/map') },
        { id: 'ctx-save-route', label: 'Save Current Route', group: 'action', icon: Globe, context: '/desktop/map', keywords: ['store', 'name'], run: () => navigate('/desktop/map') },
        { id: 'ctx-export-gpx', label: 'Export Route (GPX)', group: 'action', icon: Download, context: '/desktop/map', keywords: ['gpx', 'garmin'], run: () => navigate('/desktop/map') },
        { id: 'ctx-weather', label: 'Check Route Weather', group: 'action', icon: CloudSun, context: '/desktop/map', keywords: ['metar', 'taf'], run: () => navigate('/desktop/map') },
      )
    }

    if (pathname.startsWith('/desktop/aircraft')) {
      contextual.push(
        { id: 'ctx-add-ac', label: 'Add Aircraft', group: 'action', icon: Plus, context: '/desktop/aircraft', keywords: ['new', 'register'], run: () => navigate('/desktop/aircraft') },
        { id: 'ctx-wb', label: 'Weight & Balance', group: 'action', icon: Scale, context: '/desktop/aircraft', keywords: ['cg'], run: () => navigate('/desktop/modules/tools') },
      )
    }

    if (pathname.startsWith('/desktop/dashboard')) {
      contextual.push(
        { id: 'ctx-currency', label: 'View Currency Status', group: 'action', icon: ShieldCheck, context: '/desktop/dashboard', keywords: ['bfr', 'ifr'], run: () => navigate('/desktop/logbook/currency') },
        { id: 'ctx-add-dash', label: 'Add Flight', group: 'action', icon: Plus, context: '/desktop/dashboard', keywords: ['new'], run: () => navigate('/desktop/logbook/new') },
      )
    }

    return [...items, ...contextual]
  }, [navigate, pathname])

  // ── Recent items (only when search is empty) ──
  const recentItems = useMemo(() => {
    if (search.trim()) return []
    return recentIds
      .map((id) => allItems.find((item) => item.id === id))
      .filter((item): item is CommandItem => !!item)
      .slice(0, 5)
  }, [recentIds, allItems, search])

  const handleSelect = useCallback((item: CommandItem) => {
    pushRecent(item.id)
    item.run()
  }, [])

  // ── Grouped items for display ──
  const navigateItems = allItems.filter((i) => i.group === 'navigate')
  const actionItems = allItems.filter((i) => i.group === 'action' && !i.context)
  const contextualItems = allItems.filter((i) => i.group === 'action' && i.context)
  const toolItems = allItems.filter((i) => i.group === 'tools')

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[15vh] backdrop-blur-sm"
      onClick={() => onOpenChange(false)}
    >
      <Command
        loop
        aria-label="Command palette"
        className="w-[560px] overflow-hidden rounded-lg border border-border bg-popover shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center border-b border-border px-3">
          <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
          <Command.Input
            autoFocus
            placeholder="Type a command or search... (try: METAR, W&B, 8710, GPX)"
            value={search}
            onValueChange={setSearch}
            className="flex h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
            ESC
          </kbd>
        </div>
        <Command.List className="max-h-[400px] overflow-y-auto p-1.5">
          <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
            No results found.
          </Command.Empty>

          {/* Recent (only when no search) */}
          {recentItems.length > 0 && (
            <Command.Group heading="Recent" className="text-xs text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-medium uppercase tracking-wide">
              {recentItems.map((item) => (
                <PaletteRow key={`recent-${item.id}`} item={item} onSelect={handleSelect} />
              ))}
            </Command.Group>
          )}

          {/* Contextual actions (only on relevant pages, no search) */}
          {!search.trim() && contextualItems.length > 0 && (
            <Command.Group heading="Suggested" className="text-xs text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-medium uppercase tracking-wide">
              {contextualItems.map((item) => (
                <PaletteRow key={`ctx-${item.id}`} item={item} onSelect={handleSelect} />
              ))}
            </Command.Group>
          )}

          {/* Navigate */}
          <Command.Group heading="Navigate" className="text-xs text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-medium uppercase tracking-wide">
            {navigateItems.map((item) => (
              <PaletteRow key={item.id} item={item} onSelect={handleSelect} />
            ))}
          </Command.Group>

          {/* Actions */}
          <Command.Group heading="Actions" className="text-xs text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-medium uppercase tracking-wide">
            {actionItems.map((item) => (
              <PaletteRow key={item.id} item={item} onSelect={handleSelect} />
            ))}
          </Command.Group>

          {/* Tools */}
          <Command.Group heading="Tools" className="text-xs text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-medium uppercase tracking-wide">
            {toolItems.map((item) => (
              <PaletteRow key={item.id} item={item} onSelect={handleSelect} />
            ))}
          </Command.Group>
        </Command.List>

        {/* Footer hint */}
        <div className="flex items-center justify-between border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <CornerDownLeft className="h-3 w-3" /> to select
          </span>
          <span>Ctrl+K to toggle</span>
        </div>
      </Command>
      <SimpleAlert
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
        title="Keyboard Shortcuts"
        description={'Ctrl+N: New Flight\nCtrl+F: Search\nCtrl+S: Save\nCtrl+E: Export\nCtrl+K: Palette\nCtrl+B: Toggle Sidebar\nCtrl+1-9: Navigate\nCtrl+,: Settings\nEsc: Back / Close\n?: This help'}
      />
    </div>
  )
}

// ── Row renderer ───────────────────────────────────────────────

function PaletteRow({ item, onSelect }: { item: CommandItem; onSelect: (item: CommandItem) => void }) {
  return (
    <Command.Item
      value={`${item.label} ${(item.keywords || []).join(' ')}`}
      onSelect={() => onSelect(item)}
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
