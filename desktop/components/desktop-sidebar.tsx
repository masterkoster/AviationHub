'use client'

import { useState, useEffect, type ComponentType } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import {
  LayoutDashboard,
  List,
  Plus,
  BarChart3,
  ShieldCheck,
  Plane,
  User,
  Settings,
  Globe,
  CalendarDays,
  CloudSun,
  LogOut,
  Terminal,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Users,
  ShoppingBag,
  Calculator,
  GraduationCap,
  Gauge,
  FileText,
  Lock,
  Compass,
  Shield,
  Receipt,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import { DevMenuModal } from '@/desktop/components/dev-menu'
import { clearActiveUser } from '@/desktop/lib/setup'
import { cloudSignOut } from '@/apps/desktop/src/lib/cloud-session'
import { notifySignedOut } from '@/desktop/lib/toast-helpers'
import { ConfirmDialog } from '@/desktop/components/confirm-dialog'

// ── Types ──────────────────────────────────────────────────────

interface NavItem {
  label: string
  href: string
  icon: ComponentType<{ className?: string }>
  shortcut?: string
  /** Pricing tier — when set, shows a lock badge for non-free items */
  tier?: 'pro' | 'proplus'
  /** 'coming-soon' items are greyed out and non-clickable */
  status?: 'available' | 'coming-soon'
  /** Sub-items rendered indented beneath this item (max 1 level deep) */
  children?: Omit<NavItem, 'children'>[]
}

interface NavGroup {
  id: string
  label: string
  items: NavItem[]
}

// ── Navigation structure ───────────────────────────────────────
// 4 groups based on pilot workflow. Max 2 levels (NN/g rule).
// The separate "Modules" section is dissolved — items fold into
// their natural groups. Fuel Saver / Route Planner / Weather Radar
// merge into the Map (Part 2 of the UX overhaul).

const DASHBOARD_ITEM: NavItem = {
  label: 'Dashboard',
  href: '/desktop/dashboard',
  icon: LayoutDashboard,
  shortcut: '1',
}

const NAV_GROUPS: NavGroup[] = [
  // ── FLY — plan, brief, compute, schedule around a flight ──
  {
    id: 'fly',
    label: 'Fly',
    items: [
      { label: 'Map', href: '/desktop/map', icon: Globe, shortcut: '7' },
      { label: 'Weather', href: '/desktop/weather', icon: CloudSun, shortcut: '8' },
      { label: 'Calendar', href: '/desktop/calendar', icon: CalendarDays, shortcut: '9' },
    ],
  },
  // ── LOG — record & track ──
  {
    id: 'log',
    label: 'Log',
    items: [
      {
        label: 'Flights',
        href: '/desktop/logbook',
        icon: List,
        shortcut: '2',
        children: [
          { label: 'Add Flight', href: '/desktop/logbook/new', icon: Plus, shortcut: 'N' },
          { label: 'Totals', href: '/desktop/logbook/totals', icon: BarChart3, shortcut: '3' },
          { label: 'Currency', href: '/desktop/logbook/currency', icon: ShieldCheck, shortcut: '4' },
        ],
      },
      { label: 'Reports', href: '/desktop/reports', icon: FileText },
      { label: 'Expenses', href: '/desktop/expenses', icon: Receipt },
    ],
  },
  // ── MANAGE — assets & people ──
  {
    id: 'manage',
    label: 'Manage',
    items: [
      { label: 'Aircraft', href: '/desktop/aircraft', icon: Plane, shortcut: '5' },
      { label: 'Flying Club', href: '/desktop/flying-club', icon: Users },
      { label: 'Marketplace', href: '/desktop/modules/marketplace', icon: ShoppingBag, status: 'coming-soon' },
      { label: 'Engine Health', href: '/desktop/modules/engine-health', icon: Gauge, tier: 'pro', status: 'coming-soon' },
    ],
  },
  // ── TOOLS — calculators & system ──
  {
    id: 'tools',
    label: 'Tools',
    items: [
      { label: 'E6B & Tools', href: '/desktop/modules/tools', icon: Calculator },
      { label: 'Training', href: '/desktop/modules/training', icon: GraduationCap },
      { label: 'Settings', href: '/desktop/settings', icon: Settings, shortcut: ',' },
    ],
  },
]

// ── Group expanded-state persistence ───────────────────────────

const STORAGE_PREFIX = 'desktop.sidebar.group.'

function loadGroupExpanded(groupId: string, defaultValue: boolean): boolean {
  try {
    const val = localStorage.getItem(STORAGE_PREFIX + groupId)
    if (val === '1') return true
    if (val === '0') return false
  } catch { /* ignore */ }
  return defaultValue
}

function saveGroupExpanded(groupId: string, expanded: boolean) {
  try {
    localStorage.setItem(STORAGE_PREFIX + groupId, expanded ? '1' : '0')
  } catch { /* ignore */ }
}

// ── Helpers ────────────────────────────────────────────────────

function isItemActive(pathname: string, item: NavItem): boolean {
  if (pathname === item.href) return true
  // For parent items like /desktop/logbook, also match children
  if (item.children) {
    return pathname.startsWith(item.href)
  }
  // Don't broad-match dashboard (it's the root)
  if (item.href === '/desktop/dashboard') return false
  return pathname.startsWith(item.href)
}

/** Check if a nav item (or any of its children) matches a highlighted href */
function itemMatchesHighlight(item: NavItem, highlightedHref?: string): boolean {
  if (!highlightedHref) return false
  if (item.href === highlightedHref) return true
  if (item.children) return item.children.some((c) => c.href === highlightedHref)
  return false
}

// ── Component ──────────────────────────────────────────────────

interface DesktopSidebarProps {
  onNavigate?: () => void
  collapsed?: boolean
  onToggleCollapse?: () => void
  highlightedHref?: string
}

export function DesktopSidebar({ onNavigate, collapsed, onToggleCollapse, highlightedHref }: DesktopSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { mode, localUser, status, cloudUser } = useDesktopAuth()
  const [devOpen, setDevOpen] = useState(false)
  const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false)

  // Each group's expanded state, persisted in localStorage.
  // Default: FLY + LOG expanded, MANAGE + TOOLS collapsed (calm default for new users).
  const [groupExpanded, setGroupExpanded] = useState<Record<string, boolean>>(() => ({
    fly: loadGroupExpanded('fly', true),
    log: loadGroupExpanded('log', true),
    manage: loadGroupExpanded('manage', false),
    tools: loadGroupExpanded('tools', false),
  }))

  useEffect(() => {
    // Re-load from storage on mount (in case localStorage wasn't ready during initial state)
    setGroupExpanded({
      fly: loadGroupExpanded('fly', true),
      log: loadGroupExpanded('log', true),
      manage: loadGroupExpanded('manage', false),
      tools: loadGroupExpanded('tools', false),
    })
  }, [])

  function toggleGroup(groupId: string) {
    setGroupExpanded((prev) => {
      const next = { ...prev, [groupId]: !prev[groupId] }
      saveGroupExpanded(groupId, next[groupId])
      return next
    })
  }

  // Auto-expand a group if the current path or highlighted item is inside it
  useEffect(() => {
    for (const group of NAV_GROUPS) {
      const isActive = group.items.some(
        (item) => isItemActive(pathname, item) || itemMatchesHighlight(item, highlightedHref),
      )
      if (isActive && !groupExpanded[group.id]) {
        setGroupExpanded((prev) => {
          const next = { ...prev, [group.id]: true }
          saveGroupExpanded(group.id, true)
          return next
        })
      }
    }
  }, [pathname, highlightedHref]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleSignOut() {
    setSignOutConfirmOpen(true)
  }

  async function doSignOut() {
    if (mode === 'local') {
      await clearActiveUser()
    } else {
      await cloudSignOut()
      await clearActiveUser()
    }
    // Clear the "recent account" shortcut on the login page
    try { localStorage.removeItem('lastSignedInUser') } catch { /* ignore */ }
    notifySignedOut()
    router.replace('/desktop/accounts')
    router.refresh()
  }

  // Resolve current user display name/email
  let userName: string | null = null
  let userEmail: string | null = null
  if (mode === 'local' && localUser) {
    userName = localUser.name
    userEmail = 'Local mode'
  } else if (status === 'authenticated') {
    userName = cloudUser?.name || null
    userEmail = cloudUser?.email || 'Cloud mode'
  }

  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col border-r border-border bg-card transition-all duration-200',
        collapsed ? 'w-12' : 'w-52',
      )}
    >
      {/* Mode badge */}
      <div className={cn('border-b border-border py-2', collapsed ? 'px-1.5 flex justify-center' : 'px-3')}>
        {collapsed ? (
          <span
            className={cn('h-2 w-2 rounded-full', mode === 'local' ? 'bg-muted-foreground' : 'bg-primary')}
            title={mode === 'local' ? 'Local mode' : 'Cloud sync'}
          />
        ) : (
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-medium',
              mode === 'local' ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary',
            )}
          >
            <span
              className={cn('h-1.5 w-1.5 rounded-full', mode === 'local' ? 'bg-muted-foreground' : 'bg-primary')}
            />
            {mode === 'local' ? 'LOCAL MODE' : 'CLOUD SYNC'}
          </span>
        )}
      </div>

      {/* Nav */}
      <nav role="navigation" aria-label="Main navigation" className="flex-1 overflow-y-auto px-1.5 py-2">
        {/* Dashboard — standalone at top */}
        <ul className="space-y-0.5">
          <li>
            <NavLink
              item={DASHBOARD_ITEM}
              active={isItemActive(pathname, DASHBOARD_ITEM)}
              collapsed={collapsed}
              onClick={onNavigate}
              highlighted={!!(highlightedHref && DASHBOARD_ITEM.href === highlightedHref)}
            />
          </li>
        </ul>

        {/* 4 collapsible groups */}
        {NAV_GROUPS.map((group) => {
          const hasActive = group.items.some((item) => isItemActive(pathname, item))
          const expanded = groupExpanded[group.id] ?? true

          if (collapsed) {
            // Collapsed mode: show just the group icons (first item's icon as representative)
            const GroupIcon = group.items[0].icon
            return (
              <div key={group.id} className="mt-2 space-y-0.5">
                <button
                  onClick={() => toggleGroup(group.id)}
                  title={group.label}
                  className={cn(
                    'flex w-full items-center justify-center rounded-md py-1.5 transition-colors',
                    hasActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <GroupIcon className="h-4 w-4 shrink-0" />
                </button>
              </div>
            )
          }

          return (
            <Collapsible key={group.id} open={expanded} onOpenChange={() => toggleGroup(group.id)}>
              <div className="mt-3">
                <CollapsibleTrigger
                  className={cn(
                    'flex w-full items-center gap-1 px-1.5 text-[10px] font-medium uppercase tracking-wide transition-colors',
                    hasActive ? 'text-foreground' : 'text-muted-foreground/60 hover:text-muted-foreground',
                  )}
                >
                  <ChevronDown className={cn('h-3 w-3 transition-transform', !expanded && '-rotate-90')} />
                  {group.label}
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent>
                <ul className="mt-0.5 space-y-0.5">
                  {group.items.map((item) => (
                    <NavTreeItem
                      key={item.href}
                      item={item}
                      pathname={pathname}
                      onNavigate={onNavigate}
                      highlightedHref={highlightedHref}
                    />
                  ))}
                </ul>
              </CollapsibleContent>
            </Collapsible>
          )
        })}

        {/* Admin — only visible to admin/owner users */}
        {(cloudUser?.role === 'admin' || cloudUser?.role === 'owner') && (
          <>
            {!collapsed ? (
              <div className="mt-4">
                <Link
                  href="/desktop/admin"
                  onClick={onNavigate}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors',
                    pathname === '/desktop/admin'
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground/70 hover:bg-muted hover:text-foreground',
                  )}
                >
                  <Shield className="h-4 w-4 shrink-0" />
                  <span className="flex-1">Admin</span>
                </Link>
              </div>
            ) : (
              <div className="mt-2">
                <Link
                  href="/desktop/admin"
                  onClick={onNavigate}
                  title="Admin"
                  className={cn(
                    'flex w-full items-center justify-center rounded-md py-1.5 transition-colors',
                    pathname === '/desktop/admin'
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground/70 hover:bg-muted hover:text-foreground',
                  )}
                >
                  <Shield className="h-4 w-4 shrink-0" />
                </Link>
              </div>
            )}
          </>
        )}

        {/* Discover — find new flights, explore states, community routes */}
        {!collapsed && (
          <div className="mt-4">
            <Link
              href="/desktop/discover"
              onClick={onNavigate}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors',
                pathname === '/desktop/discover'
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground/70 hover:bg-muted hover:text-foreground',
              )}
            >
              <Compass className="h-4 w-4 shrink-0" />
              <span className="flex-1">Discover</span>
            </Link>
          </div>
        )}

        {collapsed && (
          <div className="mt-2">
            <Link
              href="/desktop/discover"
              onClick={onNavigate}
              title="Discover flights & states"
              className={cn(
                'flex w-full items-center justify-center rounded-md py-1.5 transition-colors',
                pathname === '/desktop/discover'
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground/70 hover:bg-muted hover:text-foreground',
              )}
            >
              <Compass className="h-4 w-4 shrink-0" />
            </Link>
          </div>
        )}
      </nav>

      {/* Collapse toggle */}
      <div className={cn('border-t border-border py-1.5', collapsed ? 'px-1.5 flex justify-center' : 'px-2 flex justify-end')}>
        <button
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/60 hover:bg-muted hover:text-foreground transition-colors"
        >
          {collapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* User + Dev + Sign out */}
      <div className={cn('border-t border-border py-2', collapsed ? 'px-1.5' : 'px-2')}>
        {(userName || userEmail) && (
          <Link
            href="/desktop/profile"
            onClick={onNavigate}
            className={cn(
              'flex items-center rounded-md transition-colors hover:bg-muted',
              collapsed ? 'justify-center px-0 py-1.5 mb-1.5' : 'gap-2 px-2.5 py-1.5 mb-1.5',
            )}
          >
            <div className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary',
            )}>
              <User className="h-3.5 w-3.5" />
            </div>
            {!collapsed && (userName || userEmail) && (
              <div className="min-w-0 flex-1">
                {userName && <p className="truncate text-xs font-medium">{userName}</p>}
                {userEmail && <p className="truncate text-[10px] text-muted-foreground">{userEmail}</p>}
              </div>
            )}
          </Link>
        )}
        {process.env.NODE_ENV === 'development' && (
          <button
            onClick={() => setDevOpen(true)}
            className={cn(
              'mb-1 flex w-full items-center rounded-md py-1.5 text-[13px] font-medium text-muted-foreground/60 hover:bg-muted hover:text-foreground transition-colors',
              collapsed ? 'justify-center px-0' : 'gap-2 px-2.5',
            )}
            title="Developer tools"
          >
            <Terminal className="h-4 w-4" />
            {!collapsed && 'Dev Tools'}
          </button>
        )}
        <button
          onClick={handleSignOut}
          aria-label="Sign out"
          title="Sign out"
          className={cn(
            'flex w-full items-center rounded-md py-1.5 text-[13px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors',
            collapsed ? 'justify-center px-0' : 'gap-2 px-2.5',
          )}
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && 'Sign Out'}
        </button>
      </div>

      {/* Modals */}
      <DevMenuModal open={devOpen} onOpenChange={setDevOpen} />
      <ConfirmDialog
        open={signOutConfirmOpen}
        onOpenChange={setSignOutConfirmOpen}
        title="Sign Out"
        description="Are you sure you want to sign out? Any unsaved changes will be lost."
        confirmLabel="Sign Out"
        onConfirm={doSignOut}
        destructive={false}
      />
    </aside>
  )
}

// ── Sub-components ─────────────────────────────────────────────

/** A single nav link (no children) — handles active state, shortcuts, tier badges. */
function NavLink({
  item,
  active,
  collapsed,
  onClick,
  indent,
  highlighted,
}: {
  item: Omit<NavItem, 'children'>
  active: boolean
  collapsed?: boolean
  onClick?: () => void
  indent?: boolean
  highlighted?: boolean
}) {
  const isComingSoon = item.status === 'coming-soon'
  const isLocked = !!item.tier

  if (collapsed) {
    return (
      <Link
        href={isComingSoon || isLocked ? '#' : item.href}
        onClick={(e) => {
          if (isComingSoon || isLocked) e.preventDefault()
          onClick?.()
        }}
        aria-current={active ? 'page' : undefined}
        title={item.label + (isComingSoon ? ' (Coming soon)' : isLocked ? ` (${item.tier})` : '')}
        className={cn(
          'group flex items-center justify-center rounded-md py-1.5 transition-colors',
          active
            ? 'bg-primary/10 text-primary'
            : isComingSoon || isLocked
            ? 'text-muted-foreground/40 cursor-not-allowed'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          highlighted && !active && 'ring-2 ring-primary/60',
        )}
      >
        <item.icon className="h-4 w-4 shrink-0" />
      </Link>
    )
  }

  return (
    <Link
      href={isComingSoon || isLocked ? '#' : item.href}
      onClick={(e) => {
        if (isComingSoon || isLocked) e.preventDefault()
        onClick?.()
      }}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex items-center gap-2 rounded-md py-1.5 text-[13px] font-medium transition-colors',
        indent && 'pl-6',
        active
          ? 'bg-primary/10 text-primary'
          : isComingSoon || isLocked
          ? 'text-muted-foreground/40 cursor-not-allowed'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        highlighted && !active && 'ring-2 ring-primary/60',
      )}
    >
      <item.icon className="h-4 w-4 shrink-0" />
      <span className="flex-1">{item.label}</span>
      {/* Right-side badges */}
      {isComingSoon && (
        <span className="rounded bg-muted px-1 py-0.5 text-[9px] font-medium uppercase text-muted-foreground/60">
          Soon
        </span>
      )}
      {isLocked && !isComingSoon && (
        <Lock className="h-3 w-3 text-muted-foreground/50" />
      )}
      {!isComingSoon && !isLocked && !active && item.shortcut && (
        <kbd className="hidden text-[10px] font-mono text-muted-foreground/50 group-hover:inline">
          {item.shortcut}
        </kbd>
      )}
    </Link>
  )
}

/** A nav item that may have children (sub-items rendered indented). */
function NavTreeItem({
  item,
  pathname,
  onNavigate,
  highlightedHref,
}: {
  item: NavItem
  pathname: string
  onNavigate?: () => void
  highlightedHref?: string
}) {
  const active = isItemActive(pathname, item)
  const hasChildren = item.children && item.children.length > 0
  const isHighlighted = !!(highlightedHref && item.href === highlightedHref)
  const childHighlighted = !!(highlightedHref && item.children?.some((c) => c.href === highlightedHref))

  // Auto-expand children when parent is active or a child is highlighted
  const [childrenExpanded, setChildrenExpanded] = useState(active || isHighlighted || childHighlighted)

  useEffect(() => {
    if (active || isHighlighted || childHighlighted) setChildrenExpanded(true)
  }, [active, isHighlighted, childHighlighted])

  if (!hasChildren) {
    return (
      <li>
        <NavLink item={item} active={active} onClick={onNavigate} highlighted={isHighlighted} />
      </li>
    )
  }

  return (
    <li>
      <div className="flex items-center">
        <NavLink item={item} active={active} onClick={onNavigate} highlighted={isHighlighted} />
        {hasChildren && (
          <button
            onClick={() => setChildrenExpanded((e) => !e)}
            aria-label={childrenExpanded ? 'Collapse' : 'Expand'}
            className="ml-0.5 rounded p-0.5 text-muted-foreground/50 hover:bg-muted hover:text-foreground"
          >
            <ChevronDown className={cn('h-3 w-3 transition-transform', !childrenExpanded && '-rotate-90')} />
          </button>
        )}
      </div>
      {hasChildren && childrenExpanded && item.children && (
        <ul className="mt-0.5 space-y-0.5">
          {item.children.map((child) => {
            const childActive = isItemActive(pathname, child)
            const childHighlighted = !!(highlightedHref && child.href === highlightedHref)
            return (
              <li key={child.href}>
                <NavLink item={child} active={childActive} onClick={onNavigate} indent highlighted={childHighlighted} />
              </li>
            )
          })}
        </ul>
      )}
    </li>
  )
}
