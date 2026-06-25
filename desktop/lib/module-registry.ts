/**
 * Module Registry — single source of truth for all AviationHub modules.
 *
 * A "module" is a feature group (Fuel Saver, Flying Club, E6B Tools, etc.)
 * that users can enable/disable in the desktop app via the [+ Add Module]
 * button in the sidebar. Core items (Dashboard, Flights, etc.) are always
 * visible; modules are opt-in.
 *
 * Architecture (Phase 6):
 *  - Each module has a folder: app/desktop/modules/<id>/ with own pages
 *  - The sidebar shows a collapsible "Modules" section listing enabled modules
 *  - [+ Add Module] opens a browser modal where users toggle modules on/off
 *  - enabled_modules is stored in the Tauri store (array of module IDs)
 *  - Modules are lazy-loaded (dynamic imports) so bundle stays small
 *  - Tier gating: free / pro / proplus — locked modules show a lock icon
 *
 * To add a new module:
 *   1. Add it to MODULES below
 *   2. Create app/desktop/modules/<id>/ with page(s)
 *   3. Add it to the sidebar renderer (reads from enabled_modules in store)
 *   4. Add it to the module browser modal toggle UI
 */

import {
  Globe,
  Route,
  Users,
  ShoppingBag,
  Calculator,
  GraduationCap,
  Gauge,
  CloudRain,
  CalendarDays,
  Plane,
  type LucideIcon,
} from 'lucide-react'

export type ModuleTier = 'free' | 'pro' | 'proplus'

export interface ModuleDef {
  /** Unique identifier — matches the folder name under app/desktop/modules/ */
  id: string
  /** Display name shown in the sidebar + module browser */
  name: string
  /** Short description (shown in the module browser when browsing) */
  description: string
  /** Icon component (lucide-react) */
  icon: LucideIcon
  /** Pricing tier — 'free' = always available, 'pro' = pro subscribers only, etc. */
  tier: ModuleTier
  /** Whether this module is enabled by default for new users */
  defaultEnabled: boolean
  /** Status — 'available' means it's ready to use, 'coming-soon' means it's a placeholder */
  status: 'available' | 'coming-soon'
}

/**
 * All AviationHub modules.
 * Core features (Dashboard, Logbook, Currency, Aircraft, Profile) are NOT
 * modules — they're always in the sidebar's Core section.
 */
export const MODULES: ModuleDef[] = [
  // ── Available modules ──
  {
    id: 'fuel-saver',
    name: 'Fuel Saver',
    description: 'Find the cheapest fuel stops along your route. Compare FBO prices, plan multi-stop routes, and save on every flight.',
    icon: Globe,
    tier: 'free',
    defaultEnabled: true,
    status: 'available',
  },
  {
    id: 'route-planner',
    name: 'Route Planner',
    description: 'Plan routes with waypoint management, airport filters, and import/export tools.',
    icon: Route,
    tier: 'free',
    defaultEnabled: true,
    status: 'available',
  },
  // ── Coming soon modules ──
  {
    id: 'flying-club',
    name: 'Flying Club',
    description: 'Manage club members, aircraft bookings, billing, and maintenance requests for your flying club.',
    icon: Users,
    tier: 'free',
    defaultEnabled: false,
    status: 'coming-soon',
  },
  {
    id: 'marketplace',
    name: 'Aircraft Marketplace',
    description: 'Browse and list aircraft for sale, lease shares, and partnership offers.',
    icon: ShoppingBag,
    tier: 'free',
    defaultEnabled: false,
    status: 'coming-soon',
  },
  {
    id: 'tools',
    name: 'E6B & Tools',
    description: 'Weight & balance, fuel burn calculator, density altitude, crosswind, and other aviation utilities.',
    icon: Calculator,
    tier: 'free',
    defaultEnabled: false,
    status: 'coming-soon',
  },
  {
    id: 'training',
    name: 'Training Tracker',
    description: 'Track your training progress, milestones, and costs toward your PPL, IR, CPL, or CFI.',
    icon: GraduationCap,
    tier: 'pro',
    defaultEnabled: false,
    status: 'coming-soon',
  },
  {
    id: 'engine-health',
    name: 'Engine Health',
    description: 'Upload engine data files (JPI, Garmin, Avidyne) and monitor CHT/EGT trends, fuel flow, and oil temps.',
    icon: Gauge,
    tier: 'pro',
    defaultEnabled: false,
    status: 'coming-soon',
  },
  {
    id: 'weather',
    name: 'Weather Radar',
    description: 'Animated NEXRAD/MRMS precipitation radar overlay on the map. METARs, TAFs, and PIREPs.',
    icon: CloudRain,
    tier: 'pro',
    defaultEnabled: false,
    status: 'coming-soon',
  },
  {
    id: 'ship-management',
    name: 'Ship Management',
    description: 'Aircraft management tools — squawks, maintenance tracking, hobbs/tach logging, annual reminders.',
    icon: Plane,
    tier: 'proplus',
    defaultEnabled: false,
    status: 'coming-soon',
  },
  {
    id: 'calendar',
    name: 'Calendar Sync',
    description: 'Sync your flight schedule to Google Calendar, Apple Calendar, or Outlook.',
    icon: CalendarDays,
    tier: 'pro',
    defaultEnabled: false,
    status: 'coming-soon',
  },
]

/** Core sidebar items — always visible (not toggleable). */
export const CORE_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', href: '/desktop/dashboard', shortcut: '1' },
  { id: 'logbook', label: 'Flights', href: '/desktop/logbook', shortcut: '2' },
  { id: 'logbook-new', label: 'Add Flight', href: '/desktop/logbook/new', shortcut: 'N' },
  { id: 'totals', label: 'Totals', href: '/desktop/logbook/totals', shortcut: '3' },
  { id: 'currency', label: 'Currency', href: '/desktop/logbook/currency', shortcut: '4' },
  { id: 'aircraft', label: 'Aircraft', href: '/desktop/aircraft', shortcut: '5' },
  { id: 'map', label: 'Map', href: '/desktop/map', shortcut: '7' },
  { id: 'calendar', label: 'Calendar', href: '/desktop/calendar', shortcut: '8' },
  { id: 'profile', label: 'Profile', href: '/desktop/profile', shortcut: '6' },
] as const

/** Get a module definition by id. */
export function getModule(id: string): ModuleDef | undefined {
  return MODULES.find((m) => m.id === id)
}

/** Default enabled module IDs (for new users). */
export const DEFAULT_ENABLED_MODULES = MODULES
  .filter((m) => m.defaultEnabled && m.status === 'available')
  .map((m) => m.id)

/** All available (non-coming-soon) modules. */
export const AVAILABLE_MODULES = MODULES.filter((m) => m.status === 'available')

/** All coming-soon modules. */
export const COMING_SOON_MODULES = MODULES.filter((m) => m.status === 'coming-soon')
