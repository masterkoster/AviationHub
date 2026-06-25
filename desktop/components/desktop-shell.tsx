'use client'

import { useState, useMemo, useEffect, ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { TitleBar } from './title-bar'
import { DesktopSidebar } from './desktop-sidebar'
import { CommandPalette } from './command-palette'
import { Toaster } from '@/components/ui/toaster'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import { clearActiveUserOnStartup } from '@/desktop/lib/setup'
import { useShortcuts, type ShortcutEntry } from '@/desktop/hooks/use-shortcuts'

const PUBLIC_PATHS = ['/desktop/login', '/desktop/signup', '/desktop/setup', '/desktop/accounts']

/**
 * Desktop shell — the outermost frame of the desktop app.
 * Composes:
 *  - Custom title bar (drag region + window controls + palette trigger + sync badge)
 *  - Persistent sidebar (left, 208px) — shown only when authenticated
 *  - Content area (children, scrollable)
 *  - Command palette overlay (Ctrl+K)
 *  - Global keyboard shortcuts
 *
 * Auth gating logic:
 *  - If running in Tauri AND setup_complete=false → redirect to /desktop/setup
 *  - If mode === 'local' → authenticated via local SQLite user
 *  - If mode === 'cloud' → authenticated via NextAuth
 *  - If unauthenticated → redirect to /desktop/login
 */
export function DesktopShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { status, mode, needsSetup, initializing } = useDesktopAuth()
  const [paletteOpen, setPaletteOpen] = useState(false)

  const isPublic = PUBLIC_PATHS.includes(pathname)

  const shortcuts = useMemo<ShortcutEntry[]>(() => {
    const nav = (href: string) => () => router.push(href)
    return [
      { combo: 'ctrl+k', handler: () => setPaletteOpen((o) => !o), scope: 'global' },
      { combo: 'ctrl+1', handler: nav('/desktop/dashboard'), scope: 'global' },
      { combo: 'ctrl+2', handler: nav('/desktop/logbook'), scope: 'global' },
      { combo: 'ctrl+n', handler: nav('/desktop/logbook/new'), scope: 'global' },
      { combo: 'ctrl+3', handler: nav('/desktop/logbook/totals'), scope: 'global' },
      { combo: 'ctrl+4', handler: nav('/desktop/logbook/currency'), scope: 'global' },
      { combo: 'ctrl+5', handler: nav('/desktop/aircraft'), scope: 'global' },
      { combo: 'ctrl+6', handler: nav('/desktop/profile'), scope: 'global' },
      { combo: 'ctrl+7', handler: nav('/desktop/map'), scope: 'global' },
      { combo: 'ctrl+8', handler: nav('/desktop/calendar'), scope: 'global' },
      { combo: 'ctrl+,', handler: nav('/desktop/profile'), scope: 'global' },
      {
        combo: 'escape',
        handler: () => {
          if (paletteOpen) setPaletteOpen(false)
          else window.history.back()
        },
        scope: 'global',
      },
    ]
  }, [router, paletteOpen])

  useShortcuts(shortcuts)

  // Clear active user on first mount so users always see account selection
  // (PS4/Xbox style — no auto-login from previous session)
  useEffect(() => {
    clearActiveUserOnStartup()
  }, [])

  // Block mouse back button and browser back navigation —
  // desktop apps don't have "back"; only our sidebar + shortcuts navigate.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (e.button === 3 || e.button === 4) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    window.addEventListener('mouseup', handler, true)
    // Also intercept popstate (browser back) and re-push current path
    window.history.pushState = window.history.pushState.bind(window.history)
    const onPopState = () => {
      // Re-push so browser back does nothing in desktop app
      window.history.pushState(null, '', window.location.href)
    }
    window.addEventListener('popstate', onPopState)
    return () => {
      window.removeEventListener('mouseup', handler, true)
      window.removeEventListener('popstate', onPopState)
    }
  }, [])

  // Auth redirects — must run in useEffect, not during render
  useEffect(() => {
    if (initializing || isPublic) return
    if (needsSetup && pathname !== '/desktop/setup') {
      router.replace('/desktop/setup')
    } else if (!needsSetup && status === 'unauthenticated') {
      router.replace('/desktop/accounts')
    }
  }, [initializing, isPublic, needsSetup, status, pathname, router])

  // Setup + accounts pages: minimal chrome (title bar + content only)
  if (pathname === '/desktop/setup' || pathname === '/desktop/accounts') {
    return (
      <div className="flex h-screen flex-col bg-background">
        <TitleBar syncStatus="offline" />
        <main className="flex-1 overflow-y-auto">{children}</main>
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
        <Toaster />
      </div>
    )
  }

  // Login/signup pages: minimal chrome
  if (isPublic) {
    return (
      <div className="flex h-screen flex-col bg-background">
        <TitleBar syncStatus={mode === 'local' ? 'offline' : 'synced'} />
        <main className="flex-1 overflow-y-auto">{children}</main>
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
        <Toaster />
      </div>
    )
  }

  // While initializing (first auth check running) we don't render chrome yet
  if (initializing) {
    return (
      <div className="flex h-screen flex-col bg-background">
        <TitleBar syncStatus="offline" />
        <main className="flex-1" />
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-background overflow-hidden">
      <TitleBar
        onTogglePalette={() => setPaletteOpen((o) => !o)}
        syncStatus={mode === 'local' ? 'offline' : 'synced'}
      />
      <div className="flex flex-1 overflow-hidden">
        <div className="relative z-[1200] h-full shrink-0">
          <DesktopSidebar />
        </div>
        <main className="relative z-0 flex-1 overflow-y-auto bg-background">{children}</main>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <Toaster />
    </div>
  )
}
