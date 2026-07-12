'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Sparkles,
  Sidebar,
  Keyboard,
  Map,
  Settings,
  Compass,
  X,
} from 'lucide-react'
import { APP_VERSION } from '@/desktop/lib/app-version'

// ── Persistence ──

const STORAGE_KEY_PREFIX = 'whatsnew.seen.'

function hasSeenWhatsNew(version: string): boolean {
  if (typeof window === 'undefined') return true
  try {
    return localStorage.getItem(STORAGE_KEY_PREFIX + version) === '1'
  } catch {
    return true
  }
}

function markWhatsNewSeen(version: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_PREFIX + version, '1')
  } catch {
    // ignore
  }
}

// ── What's New items ──

interface WhatsNewItem {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  /** Optional action: href to navigate to */
  actionHref?: string
  actionLabel?: string
}

const WHATS_NEW_ITEMS: WhatsNewItem[] = [
  {
    icon: Sidebar,
    title: 'Smart Sidebar',
    description: 'Collapsible navigation groups — Fly, Log, Manage, and Tools — keep your workflow organized. Groups remember their state.',
    actionHref: '/desktop/dashboard',
    actionLabel: 'Try it',
  },
  {
    icon: Keyboard,
    title: 'Command Palette',
    description: 'Press Ctrl+K to jump to any page, run actions, or use aviation tools. 50+ commands with recency tracking and contextual suggestions.',
    actionHref: '/desktop/dashboard',
    actionLabel: 'Open palette',
  },
  {
    icon: Map,
    title: 'Map Overhaul',
    description: 'Full-screen map with a vertical toolbar and slide-out panels for routes, flight plans, weight & balance, and weather.',
    actionHref: '/desktop/map',
    actionLabel: 'Open map',
  },
  {
    icon: Settings,
    title: 'Settings Redesigned',
    description: 'Section-based settings with sub-navigation. Appearance, units, data management, notifications, privacy, and account — all in one place.',
    actionHref: '/desktop/settings',
    actionLabel: 'Open settings',
  },
  {
    icon: Compass,
    title: 'Onboarding Tour',
    description: 'New guided tour walks you through the app. Some steps require you to click sidebar items — building muscle memory as you learn.',
    actionHref: '/desktop/dashboard',
    actionLabel: 'Restart tour',
  },
]

// ── Props ──

interface WhatsNewModalProps {
  /** Only show when the user is authenticated (avoids flash on login) */
  authenticated: boolean
}

// ── Component ──

export function WhatsNewModal({ authenticated }: WhatsNewModalProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!authenticated) return
    // Show on mount if this version hasn't been acknowledged
    if (!hasSeenWhatsNew(APP_VERSION)) {
      // Small delay so other UI settles first
      const timer = setTimeout(() => setOpen(true), 800)
      return () => clearTimeout(timer)
    }
  }, [authenticated])

  function handleDismiss() {
    setOpen(false)
    markWhatsNewSeen(APP_VERSION)
  }

  function handleAction(href?: string) {
    if (href) {
      router.push(href)
    }
    handleDismiss()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">What&apos;s New in v{APP_VERSION}</h2>
              <p className="text-[11px] text-muted-foreground">A quick look at recent improvements</p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Items */}
        <div className="max-h-[60vh] space-y-1 overflow-y-auto px-5 py-4">
          {WHATS_NEW_ITEMS.map((item) => {
            const ItemIcon = item.icon
            return (
              <div
                key={item.title}
                className="flex items-start gap-3 rounded-lg p-3 transition-colors hover:bg-muted/50"
              >
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/5">
                  <ItemIcon className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>
                </div>
                {item.actionHref && (
                  <button
                    onClick={() => handleAction(item.actionHref)}
                    className="shrink-0 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
                  >
                    {item.actionLabel || 'Try it'}
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-border px-5 py-3">
          <button
            onClick={handleDismiss}
            className="rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
