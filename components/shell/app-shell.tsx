'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Keyboard } from 'lucide-react'
import { AppSidebar } from './app-sidebar'
import { CommandPalette, type PaletteCommand } from './command-palette'
import { SHELL_NAV, SHELL_FOOTER_NAV } from './shell-nav'
import { useShortcuts, type ShortcutEntry } from '@/desktop/hooks/use-shortcuts'

/**
 * Unified app shell (web variant): persona sidebar + content area +
 * command palette (Ctrl+K) + global shortcuts. The desktop (Tauri) shell
 * composes the same sidebar/palette pieces with its own title bar and
 * offline auth; this variant relies on browser chrome and NextAuth.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [paletteOpen, setPaletteOpen] = useState(false)

  const navItems = useMemo(
    () => [...SHELL_NAV.flatMap((s) => s.items), ...SHELL_FOOTER_NAV],
    []
  )

  const shortcuts = useMemo<ShortcutEntry[]>(() => {
    const entries: ShortcutEntry[] = [
      { combo: 'ctrl+k', handler: () => setPaletteOpen((o) => !o), scope: 'global' },
      {
        combo: 'escape',
        handler: () => setPaletteOpen(false),
        allowDefault: true,
        scope: 'global',
      },
    ]
    for (const item of navItems) {
      if (!item.shortcut) continue
      entries.push({
        combo: item.shortcut,
        handler: () => router.push(item.href),
        scope: 'global',
      })
    }
    return entries
  }, [navItems, router])

  useShortcuts(shortcuts)

  const commands = useMemo<PaletteCommand[]>(() => {
    const navigate = (href: string) => () => {
      router.push(href)
      setPaletteOpen(false)
    }
    const sectionCommands = SHELL_NAV.flatMap((section) =>
      section.items.map<PaletteCommand>((item) => ({
        id: `nav-${item.href}`,
        label: item.label,
        group: section.label,
        icon: item.icon,
        hint: item.shortcut
          ? item.shortcut.replace('ctrl', 'Ctrl').replace(/\+(\w)/, (_, c: string) => `+${c.toUpperCase()}`)
          : undefined,
        keywords: item.keywords,
        run: navigate(item.href),
      }))
    )
    const footerCommands = SHELL_FOOTER_NAV.map<PaletteCommand>((item) => ({
      id: `nav-${item.href}`,
      label: item.label,
      group: 'Account',
      icon: item.icon,
      keywords: item.keywords,
      run: navigate(item.href),
    }))
    const actions: PaletteCommand[] = [
      {
        id: 'act-search-flights',
        label: 'Search Flights...',
        group: 'Actions',
        icon: Search,
        keywords: 'find logbook',
        run: navigate('/logbook?tab=search'),
      },
      {
        id: 'act-shortcuts',
        label: 'Keyboard Shortcuts',
        group: 'Actions',
        icon: Keyboard,
        run: () => {
          setPaletteOpen(false)
          const lines = navItems
            .filter((i) => i.shortcut)
            .map((i) => `${i.shortcut!.replace('ctrl', 'Ctrl')}: ${i.label}`)
          window.alert(`Ctrl+K: Command palette\n${lines.join('\n')}`)
        },
      },
    ]
    return [...sectionCommands, ...footerCommands, ...actions]
  }, [navItems, router])

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <div className="flex flex-1 overflow-hidden">
        <div className="relative z-[1200] h-full shrink-0">
          <AppSidebar />
        </div>
        <main className="relative z-0 flex-1 overflow-y-auto bg-background">{children}</main>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} commands={commands} />
    </div>
  )
}
