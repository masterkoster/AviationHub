'use client'

import { useState } from 'react'
import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  LayoutDashboard,
  List,
  Plus,
  BarChart3,
  ShieldCheck,
  Plane,
  User,
  Globe,
  CalendarDays,
  LogOut,
  Terminal,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import { DevMenuModal } from '@/desktop/components/dev-menu'
import { ModuleBrowserModal } from '@/desktop/components/module-browser-modal'
import { clearActiveUser } from '@/desktop/lib/setup'
import { cloudSignOut } from '@/apps/desktop/src/lib/cloud-session'
// Module registry — for the Modules section
import { MODULES } from '@/desktop/lib/module-registry'
import { getEnabledModules } from '@/apps/desktop/src/lib/module-settings'

// Core navigation items — always visible
const CORE_NAV = [
  { label: 'Dashboard', href: '/desktop/dashboard', icon: LayoutDashboard, shortcut: '1' },
  { label: 'Flights', href: '/desktop/logbook', icon: List, shortcut: '2' },
  { label: 'Add Flight', href: '/desktop/logbook/new', icon: Plus, shortcut: 'N' },
  { label: 'Totals', href: '/desktop/logbook/totals', icon: BarChart3, shortcut: '3' },
  { label: 'Currency', href: '/desktop/logbook/currency', icon: ShieldCheck, shortcut: '4' },
  { label: 'Aircraft', href: '/desktop/aircraft', icon: Plane, shortcut: '5' },
  { label: 'Map', href: '/desktop/map', icon: Globe, shortcut: '7' },
  { label: 'Calendar', href: '/desktop/calendar', icon: CalendarDays, shortcut: '8' },
  { label: 'Profile', href: '/desktop/profile', icon: User, shortcut: '6' },
]

// For now — only show enabled modules. Phase 6.2 will read from Tauri store.
// For Phase 6 stub, "fuel-saver" is the only enabled module and links to /desktop/map
const ENABLED_MODULE_LINKS: Record<string, string> = {
  'fuel-saver': '/desktop/modules/fuel-saver',
  'route-planner': '/desktop/modules/route-planner',
}

interface DesktopSidebarProps {
  onNavigate?: () => void
}

export function DesktopSidebar({ onNavigate }: DesktopSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { mode, localUser, status, cloudUser } = useDesktopAuth()
  const [devOpen, setDevOpen] = useState(false)
  const [moduleBrowserOpen, setModuleBrowserOpen] = useState(false)
  const [modulesExpanded, setModulesExpanded] = useState(true)
  const [enabledModuleIds, setEnabledModuleIds] = useState<string[]>([])

  useEffect(() => {
    let active = true
    const load = async () => {
      const ids = await getEnabledModules()
      if (active) setEnabledModuleIds(ids)
    }
    load()
    const onChanged = () => load()
    window.addEventListener('desktop-modules-changed', onChanged)
    return () => {
      active = false
      window.removeEventListener('desktop-modules-changed', onChanged)
    }
  }, [])

  const moduleEntries = MODULES.filter((module) => module.status === 'available' && enabledModuleIds.includes(module.id)).map((module) => {
    const enabled = enabledModuleIds.includes(module.id) && module.status === 'available'
    return {
      module,
      enabled,
      href: ENABLED_MODULE_LINKS[module.id] || `/desktop/modules/${module.id}`,
      tooltip:
        module.status === 'coming-soon'
          ? 'Coming soon'
          : enabled
          ? undefined
          : 'Locked',
    }
  })

  async function handleSignOut() {
    if (mode === 'local') {
      await clearActiveUser()
    } else {
      await cloudSignOut()
      await clearActiveUser()
    }
    router.replace('/desktop/accounts')
    router.refresh()
  }

  // Resolve current user display name/email regardless of mode
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
    <aside className="flex h-full w-52 shrink-0 flex-col border-r border-border bg-card">
      {/* Mode badge */}
      <div className="border-b border-border px-3 py-2">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-medium',
            mode === 'local'
              ? 'bg-muted text-muted-foreground'
              : 'bg-primary/10 text-primary'
          )}
        >
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              mode === 'local' ? 'bg-muted-foreground' : 'bg-primary'
            )}
          />
          {mode === 'local' ? 'LOCAL MODE' : 'CLOUD SYNC'}
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-1.5 py-2">
        {/* Core section */}
        <div className="mb-1 px-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
          Core
        </div>
        <ul className="space-y-0.5">
          {CORE_NAV.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== '/desktop/dashboard' && pathname.startsWith(item.href))
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    'group flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors',
                    active
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {!active && (
                    <kbd className="hidden text-[10px] font-mono text-muted-foreground/50 group-hover:inline">
                      {item.shortcut}
                    </kbd>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>

        {/* Modules section */}
        <div className="mt-4 mb-1 px-1.5">
          <button
            onClick={() => setModulesExpanded((e) => !e)}
            className="flex w-full items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60 hover:text-muted-foreground"
          >
            {modulesExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            Modules
          </button>
        </div>
        {modulesExpanded && (
          <ul className="space-y-0.5">
            {moduleEntries.map((entry) => {
              const active =
                pathname === entry.href ||
                pathname.startsWith(`/desktop/modules/${entry.module.id}`)
              return (
                <li key={entry.module.id}>
                  <Link
                    href={entry.href}
                    onClick={(e) => {
                      if (!entry.enabled) {
                        e.preventDefault()
                      }
                      onNavigate?.()
                    }}
                    className={cn(
                      'group flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors',
                      active
                        ? 'bg-primary/10 text-primary'
                        : entry.enabled
                        ? 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        : 'text-muted-foreground/40 cursor-not-allowed'
                    )}
                    title={entry.tooltip}
                    aria-disabled={!entry.enabled}
                  >
                    <entry.module.icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1">
                      {entry.module.name}
                      {!entry.enabled && entry.tooltip && (
                        <span className="ml-1 text-[10px] text-muted-foreground/80">
                          {entry.tooltip}
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              )
            })}

            {/* + Add Module button */}
            <li>
              <button
                onClick={() => setModuleBrowserOpen(true)}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground/70 hover:bg-muted hover:text-foreground transition-colors"
              >
                <Plus className="h-4 w-4 shrink-0" />
                <span className="flex-1">Add Module</span>
              </button>
            </li>
          </ul>
        )}
      </nav>

      {/* User + Dev + Sign out */}
      <div className="border-t border-border px-2 py-2">
        {(userName || userEmail) && (
          <div className="mb-1.5 px-1.5">
            {userName && <p className="truncate text-xs font-medium">{userName}</p>}
            {userEmail && (
              <p className="truncate text-[11px] text-muted-foreground">{userEmail}</p>
            )}
          </div>
        )}
        <button
          onClick={() => setDevOpen(true)}
          className="mb-1 flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground/60 hover:bg-muted hover:text-foreground transition-colors"
          title="Developer tools"
        >
          <Terminal className="h-4 w-4" />
          Dev Tools
        </button>
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>

      {/* Modals */}
      <DevMenuModal open={devOpen} onOpenChange={setDevOpen} />
      <ModuleBrowserModal open={moduleBrowserOpen} onOpenChange={setModuleBrowserOpen} />
    </aside>
  )
}
