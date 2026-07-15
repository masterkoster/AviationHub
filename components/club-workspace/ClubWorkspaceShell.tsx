'use client'

import { useState, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Building2,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronDown,
  ClipboardList,
  FolderOpen,
  Landmark,
  LayoutDashboard,
  Menu,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plane,
  Settings,
  Users,
  Wrench,
  X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const CLUB_WORKSPACE_VIEWS = [
  'overview',
  'dispatch',
  'bookings',
  'aircraft',
  'maintenance',
  'members',
  'finances',
  'reports',
  'messages',
  'documents',
  'settings',
] as const

export type ClubWorkspaceView = (typeof CLUB_WORKSPACE_VIEWS)[number]

type ClubWorkspaceNavItem = {
  view: ClubWorkspaceView
  label: string
  icon: LucideIcon
}

const navigation: ClubWorkspaceNavItem[] = [
  { view: 'overview', label: 'Overview', icon: LayoutDashboard },
  { view: 'dispatch', label: 'Dispatch Board', icon: ClipboardList },
  { view: 'bookings', label: 'Bookings', icon: CalendarDays },
  { view: 'aircraft', label: 'Aircraft', icon: Plane },
  { view: 'maintenance', label: 'Maintenance', icon: Wrench },
  { view: 'members', label: 'Members', icon: Users },
  { view: 'finances', label: 'Finances', icon: Landmark },
  { view: 'reports', label: 'Reports', icon: ChartNoAxesCombined },
  { view: 'messages', label: 'Messages', icon: MessageSquare },
  { view: 'documents', label: 'Documents', icon: FolderOpen },
  { view: 'settings', label: 'Settings', icon: Settings },
]

export interface ClubWorkspaceShellProps {
  activeView: ClubWorkspaceView
  onViewChange: (view: ClubWorkspaceView) => void
  clubName: string
  children: ReactNode
}

interface ClubSidebarProps {
  activeView: ClubWorkspaceView
  collapsed?: boolean
  onViewChange: (view: ClubWorkspaceView) => void
}

function ClubSidebar({ activeView, collapsed = false, onViewChange }: ClubSidebarProps) {
  return (
    <nav aria-label="Club workspace navigation" className="flex h-full flex-col gap-1 p-2">
      {navigation.map((item) => {
        const Icon = item.icon
        const isActive = item.view === activeView

        return (
          <Button
            key={item.view}
            type="button"
            variant="ghost"
            size={collapsed ? 'icon' : 'sm'}
            onClick={() => onViewChange(item.view)}
            title={collapsed ? item.label : undefined}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'w-full justify-start text-muted-foreground hover:bg-muted hover:text-foreground',
              collapsed && 'justify-center px-0',
              isActive && 'bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary'
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </Button>
        )
      })}
    </nav>
  )
}

/**
 * Contextual navigation for a flying-club workspace. It is designed to sit
 * beside the global AviationHub navigation, not replace it.
 */
export function ClubWorkspaceShell({
  activeView,
  onViewChange,
  clubName,
  children,
}: ClubWorkspaceShellProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const selectView = (view: ClubWorkspaceView) => {
    onViewChange(view)
    setIsMobileMenuOpen(false)
  }

  return (
    <section className="relative flex min-h-full w-full overflow-hidden bg-background text-foreground">
      <aside
        className={cn(
          'hidden shrink-0 border-r border-border bg-card transition-[width] duration-200 md:flex md:flex-col',
          isCollapsed ? 'w-16' : 'w-60'
        )}
      >
        <ClubSidebar
          activeView={activeView}
          collapsed={isCollapsed}
          onViewChange={selectView}
        />
      </aside>

      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close club workspace navigation"
            className="absolute inset-0 bg-background/70 backdrop-blur-sm"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <aside className="relative h-full w-72 max-w-[calc(100%-3rem)] border-r border-border bg-card shadow-2xl">
            <div className="flex h-14 items-center justify-between border-b border-border px-3">
              <span className="text-sm font-semibold">Club workspace</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setIsMobileMenuOpen(false)}
                aria-label="Close club workspace navigation"
              >
                <X aria-hidden="true" />
              </Button>
            </div>
            <ClubSidebar activeView={activeView} onViewChange={selectView} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-4">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="md:hidden"
            onClick={() => setIsMobileMenuOpen(true)}
            aria-label="Open club workspace navigation"
          >
            <Menu aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="hidden md:inline-flex"
            onClick={() => setIsCollapsed((collapsed) => !collapsed)}
            aria-label={isCollapsed ? 'Expand club workspace navigation' : 'Collapse club workspace navigation'}
          >
            {isCollapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
          </Button>

          <div className="h-5 w-px bg-border" aria-hidden="true" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-w-0 justify-start px-2 font-semibold hover:bg-muted"
            aria-label={`Current club: ${clubName}`}
          >
            <Building2 className="size-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="max-w-44 truncate sm:max-w-72">{clubName}</span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Button>
          <span className="hidden text-xs text-muted-foreground sm:inline">Club workspace</span>
        </header>

        <main className="min-h-0 min-w-0 flex-1 overflow-auto">{children}</main>
      </div>
    </section>
  )
}
