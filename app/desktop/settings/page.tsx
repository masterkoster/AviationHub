'use client'

import { Suspense, useEffect, useState, type ComponentType } from 'react'
import { useSearchParams } from 'next/navigation'
import { Monitor, Eye, Database, Bell, Shield, User, Info, Search, Gauge, Calculator } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AppearanceSection } from './_sections/appearance'
import { UnitsSection } from './_sections/units'
import { PerformanceSection } from './_sections/performance'
import { DataSection } from './_sections/data'
import { AccountingSection } from './_sections/accounting'
import { NotificationsSection } from './_sections/notifications'
import { PrivacySection } from './_sections/privacy'
import { AccountSection } from './_sections/account'
import { AboutSection } from './_sections/about'

interface TabItem {
  name: string
  label: string
  icon: React.ReactNode
}

// Same 9 tabs, same order/icons as the old route-based sub-nav
// (app/desktop/settings/layout.tsx used to render these as nav links).
const SETTINGS_TABS: TabItem[] = [
  { name: 'appearance', label: 'Appearance', icon: <Monitor className="h-3.5 w-3.5" /> },
  { name: 'units', label: 'Units & Formats', icon: <Eye className="h-3.5 w-3.5" /> },
  { name: 'performance', label: 'Performance', icon: <Gauge className="h-3.5 w-3.5" /> },
  { name: 'data', label: 'Data Management', icon: <Database className="h-3.5 w-3.5" /> },
  { name: 'accounting', label: 'Accounting', icon: <Calculator className="h-3.5 w-3.5" /> },
  { name: 'notifications', label: 'Notifications', icon: <Bell className="h-3.5 w-3.5" /> },
  { name: 'privacy', label: 'Privacy', icon: <Shield className="h-3.5 w-3.5" /> },
  { name: 'account', label: 'Account', icon: <User className="h-3.5 w-3.5" /> },
  { name: 'about', label: 'About', icon: <Info className="h-3.5 w-3.5" /> },
]

const TAB_NAMES = SETTINGS_TABS.map((t) => t.name)
const DEFAULT_TAB = 'appearance'

const SECTION_COMPONENTS: Record<string, ComponentType> = {
  appearance: AppearanceSection,
  units: UnitsSection,
  performance: PerformanceSection,
  data: DataSection,
  accounting: AccountingSection,
  notifications: NotificationsSection,
  privacy: PrivacySection,
  account: AccountSection,
  about: AboutSection,
}

function isValidTab(name: string | null): name is string {
  return !!name && TAB_NAMES.includes(name)
}

function SettingsTabs() {
  const searchParams = useSearchParams()
  const queryTab = searchParams.get('tab')

  // Initialize from ?tab= (server/client consistent via useSearchParams) so
  // there's no hydration mismatch. Fall back to a location.hash check once
  // mounted (client-only) for older-style hash deep links.
  const [activeTab, setActiveTab] = useState<string>(isValidTab(queryTab) ? queryTab : DEFAULT_TAB)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (isValidTab(queryTab)) return
    if (typeof window === 'undefined') return
    const fromHash = window.location.hash.replace('#', '')
    if (isValidTab(fromHash)) setActiveTab(fromHash)
    // Only run once on mount - after that, tab switches are driven by
    // selectTab() below, not by re-reading the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function selectTab(name: string) {
    if (name === activeTab) return
    setActiveTab(name)
    if (typeof window !== 'undefined') {
      // Update the URL for deep-linking WITHOUT navigating - replaceState
      // (not router.push/Link) so switching tabs stays instant.
      window.history.replaceState(null, '', `?tab=${name}`)
    }
  }

  const filtered = query.trim()
    ? SETTINGS_TABS.filter((item) => item.label.toLowerCase().includes(query.toLowerCase()))
    : SETTINGS_TABS

  const ActiveSection = SECTION_COMPONENTS[activeTab] ?? AppearanceSection

  return (
    <div className="flex h-full min-h-0">
      {/* ── Left tab list ── */}
      <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-card/50">
        <div className="border-b border-border p-3">
          {/* Section title */}
          <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Settings
          </p>
          {/* Search box */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search settings"
              className="w-full rounded-md border border-border bg-background py-1.5 pl-7 pr-2 text-xs text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-2">
          <ul className="space-y-0.5">
            {filtered.map((item) => {
              const active = activeTab === item.name
              return (
                <li key={item.name}>
                  <button
                    type="button"
                    onClick={() => selectTab(item.name)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition-colors',
                      active
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <span className={cn(active ? 'text-primary' : 'text-muted-foreground')}>
                      {item.icon}
                    </span>
                    {item.label}
                  </button>
                </li>
              )
            })}
            {filtered.length === 0 && (
              <li className="px-2.5 py-1.5 text-[11px] text-muted-foreground">No matches</li>
            )}
          </ul>
        </nav>
      </aside>

      {/* ── Right content panel ── */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl p-6">
          <ActiveSection />
        </div>
      </main>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsTabs />
    </Suspense>
  )
}
