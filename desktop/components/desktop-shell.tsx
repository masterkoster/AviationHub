'use client'

import { useState, useMemo, useEffect, ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { TitleBar } from './title-bar'
import { DesktopSidebar } from './desktop-sidebar'
import { CommandPalette } from './command-palette'
import { Toaster } from '@/components/ui/toaster'
import { UpdateBanner } from './update-banner'
import { AnalyticsConsentModal } from './analytics-consent-modal'
import { useAnalytics } from '@/desktop/hooks/use-analytics'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import { clearActiveUserOnStartup } from '@/desktop/lib/setup'
import { useShortcuts, type ShortcutEntry } from '@/desktop/hooks/use-shortcuts'
import { useOnlineStatus } from '@/desktop/hooks/use-online-status'
import { WifiOff } from 'lucide-react'
import { OnboardingTour, isTutorialCompleted, getHighlightedHref } from '@/desktop/components/onboarding-tour'
import { WhatsNewModal } from '@/desktop/components/whats-new-modal'
import { resolveLocalLogbookUserId } from '@/apps/desktop/src/lib/local-logbook'
import { initSyncEngine, setActiveSyncUserId, pullCloudChanges, useSyncStatus, syncNow } from '@/apps/desktop/src/lib/sync-engine'

const PUBLIC_PATHS = ['/desktop/login', '/desktop/signup', '/desktop/setup', '/desktop/accounts', '/desktop/forgot-password', '/desktop/reset-password']

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
  const { status, mode, needsSetup, initializing, localUser, cloudUser } = useDesktopAuth()
  const syncSnapshot = useSyncStatus()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('desktop.sidebar.collapsed') === '1' } catch { return false }
  })

  useEffect(() => {
    try { localStorage.setItem('desktop.sidebar.collapsed', sidebarCollapsed ? '1' : '0') } catch {}
  }, [sidebarCollapsed])

  // ── Tutorial ──
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const [tutorialStep, setTutorialStep] = useState<number | null>(null)

  useEffect(() => {
    if (
      !initializing &&
      status === 'authenticated' &&
      pathname === '/desktop/dashboard' &&
      !isTutorialCompleted() &&
      !tutorialOpen
    ) {
      setTutorialOpen(true)
    }
  }, [initializing, status, pathname, tutorialOpen])

  const isPublic = PUBLIC_PATHS.includes(pathname)

  const shortcuts = useMemo<ShortcutEntry[]>(() => {
    const nav = (href: string) => () => router.push(href)
    return [
      { combo: 'ctrl+k', handler: () => setPaletteOpen((o) => !o), scope: 'global' },
      { combo: 'ctrl+b', handler: () => setSidebarCollapsed((c) => !c), scope: 'global' },
      { combo: 'ctrl+1', handler: nav('/desktop/dashboard'), scope: 'global' },
      { combo: 'ctrl+2', handler: nav('/desktop/logbook'), scope: 'global' },
      { combo: 'ctrl+n', handler: nav('/desktop/logbook/new'), scope: 'global' },
      { combo: 'ctrl+3', handler: nav('/desktop/logbook/totals'), scope: 'global' },
      { combo: 'ctrl+4', handler: nav('/desktop/logbook/currency'), scope: 'global' },
      { combo: 'ctrl+5', handler: nav('/desktop/aircraft'), scope: 'global' },
      { combo: 'ctrl+6', handler: nav('/desktop/profile'), scope: 'global' },
      { combo: 'ctrl+7', handler: nav('/desktop/map'), scope: 'global' },
      { combo: 'ctrl+8', handler: nav('/desktop/weather'), scope: 'global' },
      { combo: 'ctrl+9', handler: nav('/desktop/calendar'), scope: 'global' },
      { combo: 'ctrl+,', handler: nav('/desktop/settings'), scope: 'global' },
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

  const isOnline = useOnlineStatus()

  // Anonymous opt-in analytics (Tauri only, consent-based)
  useAnalytics()

  const handleTutorialComplete = useMemo(() => () => {
    setTutorialOpen(false)
    setTutorialStep(null)
  }, [])

  const handleTutorialStepChange = useMemo(() => (step: number | null) => {
    setTutorialStep(step)
  }, [])

  // Clear active user on first mount so users always see account selection
  // (PS4/Xbox style — no auto-login from previous session)
  useEffect(() => {
    clearActiveUserOnStartup()
  }, [])

  // Sync engine: wire up global triggers (online event, debounced drain
  // after writes, 5-minute interval) once for the app's lifetime.
  useEffect(() => {
    const cleanup = initSyncEngine()
    return cleanup
  }, [])

  // Resolve the active profile's cloud-linked local id and tell the sync
  // engine about it, pulling any changes made from other devices.
  useEffect(() => {
    if (initializing) return
    if (status !== 'authenticated') {
      setActiveSyncUserId(null)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const resolvedId = await resolveLocalLogbookUserId({
          mode,
          localUserId: localUser?.id,
          cloudUser,
        })
        if (cancelled) return
        setActiveSyncUserId(resolvedId)
        void pullCloudChanges(resolvedId)
      } catch {
        // Best-effort — sync simply stays idle for this session if resolution fails.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [initializing, status, mode, localUser, cloudUser])

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
        <div className="print:hidden">
          <TitleBar syncStatus="offline" />
        </div>
        <main role="main" className="flex-1 overflow-y-auto">{children}</main>
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
        <Toaster />
      </div>
    )
  }

  // Login/signup pages: minimal chrome
  if (isPublic) {
    return (
      <div className="flex h-screen flex-col bg-background">
        <div className="print:hidden">
          <TitleBar syncStatus={mode === 'local' ? 'offline' : 'synced'} />
        </div>
        {/* Offline banner */}
        {!isOnline && mode === 'cloud' && (
          <div className="print:hidden flex items-center justify-center gap-2 bg-amber-500/10 border-b border-amber-500/20 px-4 py-1.5 text-xs text-amber-700">
            <WifiOff className="h-3.5 w-3.5" />
            You are offline. Cloud data may not be available.
          </div>
        )}
        <main role="main" className="flex-1 overflow-y-auto">{children}</main>
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
        <Toaster />
        <UpdateBanner />
        <AnalyticsConsentModal />
      </div>
    )
  }

  // While initializing (first auth check running) we don't render chrome yet
  if (initializing) {
    return (
      <div className="flex h-screen flex-col bg-background">
        <div className="print:hidden">
          <TitleBar syncStatus="offline" />
        </div>
        <main role="main" className="flex-1" />
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-background overflow-hidden">
      <div className="print:hidden">
        <TitleBar
          onTogglePalette={() => setPaletteOpen((o) => !o)}
          syncStatus={mode === 'local' ? 'offline' : syncSnapshot.status}
          pendingCount={syncSnapshot.pendingCount}
          onSyncClick={mode === 'local' ? undefined : () => { void syncNow() }}
        />
      </div>
      {/* Offline banner */}
      {!isOnline && mode === 'cloud' && (
        <div className="print:hidden flex items-center justify-center gap-2 bg-amber-500/10 border-b border-amber-500/20 px-4 py-1.5 text-xs text-amber-700">
          <WifiOff className="h-3.5 w-3.5" />
          You are offline. Cloud data may not be available.
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
        <div className="relative z-[1200] h-full shrink-0 print:hidden">
          <DesktopSidebar
            collapsed={tutorialOpen ? false : sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
            highlightedHref={getHighlightedHref(tutorialStep)}
          />
        </div>
        <main role="main" className="relative z-0 flex-1 overflow-y-auto bg-background animate-in fade-in duration-200">{children}</main>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <Toaster />
      <UpdateBanner />
      <AnalyticsConsentModal />
      {tutorialOpen && (
        <OnboardingTour
          onComplete={handleTutorialComplete}
          onStepChange={handleTutorialStepChange}
          navigate={(href) => router.push(href)}
        />
      )}
      <WhatsNewModal authenticated={status === 'authenticated'} />
    </div>
  )
}
