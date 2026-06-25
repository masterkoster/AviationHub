'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { signOut, useSession } from 'next-auth/react'
import {
  LayoutDashboard,
  BookOpen,
  Plus,
  List,
  BarChart3,
  ShieldCheck,
  Plane,
  User,
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV = [
  { label: 'Dashboard', href: '/v1/dashboard', icon: LayoutDashboard },
  { label: 'Flights', href: '/v1/logbook', icon: List },
  { label: 'Add Flight', href: '/v1/logbook/new', icon: Plus },
  { label: 'Totals', href: '/v1/logbook/totals', icon: BarChart3 },
  { label: 'Currency', href: '/v1/logbook/currency', icon: ShieldCheck },
  { label: 'Aircraft', href: '/v1/aircraft', icon: Plane },
  { label: 'Profile', href: '/v1/profile', icon: User },
]

export default function V1Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { data: session } = useSession()

  if (pathname === '/v1/login' || pathname === '/v1/signup') {
    return <>{children}</>
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="flex w-56 flex-col border-r border-border bg-card">
        {/* Logo */}
        <div className="flex h-12 items-center border-b border-border px-4">
          <Link href="/v1/dashboard" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
              <BookOpen className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-sm font-bold tracking-tight">V1</span>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          <ul className="space-y-0.5">
            {NAV.map((item) => {
              const active = pathname === item.href || (item.href !== '/v1/dashboard' && pathname.startsWith(item.href))
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      active
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* User / Sign out */}
        <div className="border-t border-border px-3 py-3">
          {session?.user && (
            <div className="mb-2 px-1">
              <p className="text-xs font-medium truncate">{session.user.name || session.user.email}</p>
              <p className="text-[11px] text-muted-foreground truncate">{session.user.email}</p>
            </div>
          )}
          <button
            onClick={() => signOut({ callbackUrl: '/v1/login' })}
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
