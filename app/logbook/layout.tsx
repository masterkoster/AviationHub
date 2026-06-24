'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BookOpen, Plus, Search, BarChart2, ShieldCheck, TrendingUp,
  Download, Upload, Settings, Clock, AlertCircle, Printer,
  Plane, Menu, X, ChevronRight
} from 'lucide-react'
import { useState } from 'react'

const NAV_ITEMS = [
  { href: '/logbook', label: 'Logbook', icon: BookOpen, exact: true },
  { href: '/logbook/flights/new', label: 'Add Flights', icon: Plus },
  { href: '/logbook/aircraft', label: 'My Aircraft', icon: Plane },
  { href: '/logbook/flights', label: 'Search', icon: Search },
  { href: '/logbook/totals', label: 'Totals', icon: BarChart2 },
  { href: '/logbook/currency', label: 'Currency', icon: ShieldCheck },
  { href: '/logbook/analysis', label: 'Analysis', icon: TrendingUp },
  { href: '/logbook/share', label: 'Share Logbook', icon: Upload },
  { href: '/logbook/download', label: 'Download', icon: Download },
  { href: '/logbook/import', label: 'Import', icon: Upload },
  { href: '/logbook/starting-totals', label: 'Starting Totals', icon: Clock },
  { href: '/logbook/check-flights', label: 'Check Flights', icon: AlertCircle },
  { href: '/logbook/print', label: 'Print View', icon: Printer },
  { href: '/logbook/pending', label: 'Pending Flights', icon: Plane },
  { href: '/logbook/preferences', label: 'Preferences', icon: Settings },
]

export default function LogbookLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  const isActive = (item: typeof NAV_ITEMS[0]) => {
    if (item.exact) return pathname === item.href
    return pathname.startsWith(item.href)
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className={`
        fixed lg:sticky top-[44px] left-0 h-[calc(100vh-44px)] z-40 
        flex flex-col bg-card border-r border-border
        transition-all duration-300
        ${mobileOpen ? 'w-64 translate-x-0' : 'w-64 -translate-x-full lg:translate-x-0'}
      `}>
        {/* Sidebar Header */}
        <div className="flex items-center justify-between px-4 py-5 border-b border-border flex-shrink-0">
          <Link href="/logbook" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-primary" />
            </div>
            <span className="font-bold text-foreground text-sm">Pilot Logbook</span>
          </Link>
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-1.5 hover:bg-secondary rounded-lg transition-colors"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 overflow-y-auto py-3 px-2">
          <ul className="space-y-0.5">
            {NAV_ITEMS.map((item) => {
              const active = isActive(item)
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`
                      flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                      ${active
                        ? 'bg-primary/15 text-primary'
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
                      }
                    `}
                  >
                    <item.icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-primary' : ''}`} />
                    {item.label}
                    {active && <ChevronRight className="w-3 h-3 ml-auto text-primary" />}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Footer */}
        <div className="px-4 py-4 border-t border-border flex-shrink-0">
          <Link href="/logbook/aircraft" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <Plane className="w-3.5 h-3.5" />
            Aircraft Manager
          </Link>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-0">
        {/* Mobile topbar */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 border-b border-border bg-card/50">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 hover:bg-secondary rounded-lg transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-bold text-foreground">Pilot Logbook</span>
        </div>

        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  )
}
