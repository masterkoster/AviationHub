import type { ComponentType } from 'react'
import {
  LayoutDashboard,
  List,
  Plus,
  BarChart3,
  ShieldCheck,
  Plane,
  Fuel,
  TowerControl,
  Calculator,
  Users,
  Activity,
  Wrench,
  ClipboardList,
  Receipt,
  Settings2,
  Store,
  Hammer,
  History,
  User,
  Settings,
} from 'lucide-react'

export type ShellNavItem = {
  label: string
  href: string
  icon: ComponentType<{ className?: string }>
  /** Global shortcut combo, e.g. "ctrl+1". Also shown as a hint in the sidebar/palette. */
  shortcut?: string
  /** Extra search terms for the command palette. */
  keywords?: string
}

export type ShellNavSection = {
  id: 'fly' | 'club' | 'market'
  label: string
  items: ShellNavItem[]
}

/**
 * Single source of truth for the unified app shell navigation.
 * Persona-split: Fly (personal flying), Club (flying club / partnership),
 * Market (web-only buy/sell surfaces).
 *
 * The sidebar, the command palette, and the global shortcuts all derive
 * from this list — add an entry here and all three pick it up.
 */
export const SHELL_NAV: ShellNavSection[] = [
  {
    id: 'fly',
    label: 'Fly',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, shortcut: 'ctrl+1' },
      { label: 'Logbook', href: '/logbook', icon: List, shortcut: 'ctrl+2', keywords: 'flights entries' },
      { label: 'Add Flight', href: '/logbook?tab=add', icon: Plus, shortcut: 'ctrl+n', keywords: 'new log' },
      { label: 'Totals', href: '/logbook?tab=totals', icon: BarChart3, shortcut: 'ctrl+3', keywords: 'hours summary' },
      { label: 'Currency', href: '/logbook?tab=currency', icon: ShieldCheck, shortcut: 'ctrl+4', keywords: 'bfr ipc night' },
      { label: 'My Aircraft', href: '/logbook/aircraft', icon: Plane, shortcut: 'ctrl+5' },
      { label: 'Plan Flight', href: '/fuel-saver', icon: Fuel, shortcut: 'ctrl+7', keywords: 'fuel saver route map' },
      { label: 'Airports', href: '/airports', icon: TowerControl, keywords: 'fbo fees' },
      { label: 'E6B', href: '/modules/e6b', icon: Calculator, keywords: 'calculator wind' },
    ],
  },
  {
    id: 'club',
    label: 'Club',
    items: [
      { label: 'Overview', href: '/flying-club', icon: Users, shortcut: 'ctrl+8', keywords: 'flying club group' },
      { label: 'Active Flights', href: '/flying-club/active', icon: Activity, keywords: 'checked out' },
      { label: 'Squawks', href: '/flying-club/squawks', icon: Wrench, keywords: 'report issue' },
      { label: 'Maintenance', href: '/flying-club/maintenance-requests', icon: ClipboardList, keywords: 'requests queue' },
      { label: 'Billing', href: '/flying-club/billing', icon: Receipt, keywords: 'statement invoice hobbs' },
      { label: 'Club Admin', href: '/flying-club/admin', icon: Settings2, keywords: 'members fleet invites' },
    ],
  },
  {
    id: 'market',
    label: 'Market',
    items: [
      { label: 'Marketplace', href: '/marketplace', icon: Store, keywords: 'buy sell aircraft listings' },
      { label: 'Find a Mechanic', href: '/mechanics', icon: Hammer, keywords: 'a&p shop' },
      { label: 'Plane History', href: '/modules/plane-carfax', icon: History, keywords: 'carfax tail records' },
    ],
  },
]

/** Bottom-of-sidebar items (not part of a persona section). */
export const SHELL_FOOTER_NAV: ShellNavItem[] = [
  { label: 'Profile', href: '/profile', icon: User, shortcut: 'ctrl+6' },
  { label: 'Settings', href: '/settings', icon: Settings, shortcut: 'ctrl+,' },
]

/** Path prefixes that render inside the unified app shell (web). */
export const SHELL_PATH_PREFIXES = [
  '/dashboard',
  '/logbook',
  '/flying-club',
  '/fuel-saver',
  '/airports',
  '/aircraft',
  '/marketplace',
  '/profile',
  '/settings',
  '/training',
  '/modules',
  '/scheduler',
]

/** Paths under shell prefixes that must stay chrome-free (public/embedded). */
export const SHELL_EXCLUDED_PREFIXES = [
  '/logbook/public', // public share links
  '/logbook/print', // print view
]

export function isShellPath(pathname: string): boolean {
  if (SHELL_EXCLUDED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return false
  }
  return SHELL_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/**
 * Returns the href of the nav item that best matches the current location,
 * or null. Tab-qualified hrefs (`/logbook?tab=totals`) match only their tab;
 * plain hrefs match their path and subtree. When several plain hrefs match,
 * the longest path wins (so `/logbook/aircraft` beats `/logbook`).
 */
export function getActiveHref(
  items: ShellNavItem[],
  pathname: string,
  tab: string | null
): string | null {
  let best: { href: string; pathLen: number; exactTab: boolean } | null = null
  for (const item of items) {
    const [itemPath, itemQuery] = item.href.split('?')
    const itemTab = itemQuery ? new URLSearchParams(itemQuery).get('tab') : null
    if (itemTab) {
      if (pathname === itemPath && tab === itemTab) {
        return item.href // tab match is always the most specific
      }
      continue
    }
    const matches = pathname === itemPath || pathname.startsWith(`${itemPath}/`)
    if (!matches) continue
    // A plain href on a tabbed page shouldn't claim tabs owned by siblings
    if (pathname === itemPath && tab && items.some((s) => s.href === `${itemPath}?tab=${tab}`)) {
      continue
    }
    if (!best || itemPath.length > best.pathLen) {
      best = { href: item.href, pathLen: itemPath.length, exactTab: false }
    }
  }
  return best?.href ?? null
}
