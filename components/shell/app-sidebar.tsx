'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { LogOut, Plane } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  SHELL_NAV,
  SHELL_FOOTER_NAV,
  getActiveHref,
  type ShellNavItem,
} from './shell-nav'

function shortcutHint(shortcut?: string): string | null {
  if (!shortcut) return null
  return shortcut
    .split('+')
    .map((part) => (part === 'ctrl' ? 'Ctrl' : part.toUpperCase()))
    .join('+')
}

function NavRow({ item, active }: { item: ShellNavItem; active: boolean }) {
  const hint = shortcutHint(item.shortcut)
  return (
    <li>
      <Link
        href={item.href}
        className={cn(
          'group flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors',
          active
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        )}
      >
        <item.icon className="h-4 w-4 shrink-0" />
        <span className="flex-1">{item.label}</span>
        {!active && hint && (
          <kbd className="hidden text-[10px] font-mono text-muted-foreground/50 group-hover:inline">
            {hint}
          </kbd>
        )}
      </Link>
    </li>
  )
}

/**
 * Unified app sidebar — persona-split sections (Fly / Club / Market) driven
 * by SHELL_NAV. Web variant: NextAuth session for the user block.
 */
export function AppSidebar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { data: session } = useSession()
  const tab = searchParams.get('tab')

  const allItems = [...SHELL_NAV.flatMap((s) => s.items), ...SHELL_FOOTER_NAV]
  const activeHref = getActiveHref(allItems, pathname, tab)

  const userName = session?.user?.name || (session?.user as { username?: string })?.username || null
  const userEmail = session?.user?.email || null

  return (
    <aside className="flex h-full w-52 shrink-0 flex-col border-r border-border bg-card">
      {/* Brand */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <Plane className="h-4 w-4 text-primary" />
        <span className="text-[13px] font-semibold tracking-tight">AviationHub</span>
      </div>

      {/* Persona sections */}
      <nav className="flex-1 overflow-y-auto px-1.5 py-2">
        {SHELL_NAV.map((section) => (
          <div key={section.id} className="mb-4">
            <div className="mb-1 px-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
              {section.label}
            </div>
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <NavRow key={item.href} item={item} active={activeHref === item.href} />
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* User + footer nav + sign out */}
      <div className="border-t border-border px-2 py-2">
        {(userName || userEmail) && (
          <div className="mb-1.5 px-1.5">
            {userName && <p className="truncate text-xs font-medium">{userName}</p>}
            {userEmail && (
              <p className="truncate text-[11px] text-muted-foreground">{userEmail}</p>
            )}
          </div>
        )}
        <ul className="space-y-0.5">
          {SHELL_FOOTER_NAV.map((item) => (
            <NavRow key={item.href} item={item} active={activeHref === item.href} />
          ))}
        </ul>
        <button
          onClick={() => signOut({ callbackUrl: '/' })}
          className="mt-0.5 flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </aside>
  )
}
