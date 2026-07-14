'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Monitor, Eye, Database, Bell, Shield, User, Info, Search, Gauge } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
}

const NAV_ITEMS: NavItem[] = [
  { href: '/desktop/settings/appearance', label: 'Appearance', icon: <Monitor className="h-3.5 w-3.5" /> },
  { href: '/desktop/settings/units', label: 'Units & Formats', icon: <Eye className="h-3.5 w-3.5" /> },
  { href: '/desktop/settings/performance', label: 'Performance', icon: <Gauge className="h-3.5 w-3.5" /> },
  { href: '/desktop/settings/data', label: 'Data Management', icon: <Database className="h-3.5 w-3.5" /> },
  { href: '/desktop/settings/notifications', label: 'Notifications', icon: <Bell className="h-3.5 w-3.5" /> },
  { href: '/desktop/settings/privacy', label: 'Privacy', icon: <Shield className="h-3.5 w-3.5" /> },
  { href: '/desktop/settings/account', label: 'Account', icon: <User className="h-3.5 w-3.5" /> },
  { href: '/desktop/settings/about', label: 'About', icon: <Info className="h-3.5 w-3.5" /> },
]

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [query, setQuery] = useState('')

  const filtered = query.trim()
    ? NAV_ITEMS.filter((item) => item.label.toLowerCase().includes(query.toLowerCase()))
    : NAV_ITEMS

  return (
    <div className="flex h-full min-h-0">
      {/* ── Left sub-nav ── */}
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
              const active = pathname === item.href
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                      active
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <span className={cn(active ? 'text-primary' : 'text-muted-foreground')}>
                      {item.icon}
                    </span>
                    {item.label}
                  </Link>
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
        <div className="mx-auto max-w-3xl p-6">{children}</div>
      </main>
    </div>
  )
}
