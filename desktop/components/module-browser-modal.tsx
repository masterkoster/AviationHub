'use client'

import { useEffect, useState } from 'react'
import { X, Check, Lock, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MODULES, type ModuleDef } from '@/desktop/lib/module-registry'
import { getEnabledModules, installModule } from '@/apps/desktop/src/lib/module-settings'

/**
 * Module browser modal — shown when user clicks [+ Add Module] in the sidebar.
 * Lists all available + coming-soon modules with enable/disable toggles.
 * Coming-soon modules are greyed out with a "Coming Soon" badge.
 *
 * Phase 6 stub: toggling is visual only right now (doesn't persist to the
 * Tauri store yet — that's wired in Phase 6.2). The modal just shows what
 * modules exist + their descriptions so you can visualize the architecture.
 */
export function ModuleBrowserModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [enabled, setEnabled] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')

  async function refreshEnabled() {
    const ids = await getEnabledModules()
    setEnabled(new Set(ids))
  }

  useEffect(() => {
    if (!open) return
    refreshEnabled()
  }, [open])

  if (!open) return null

  const filtered = MODULES.filter(
    (m) =>
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.description.toLowerCase().includes(search.toLowerCase())
  )

  async function addModule(id: string, module: ModuleDef) {
    if (module.status === 'coming-soon') return
    await installModule(id)
    await refreshEnabled()
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40"
      onClick={() => onOpenChange(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[640px] max-h-[80vh] overflow-hidden rounded-lg border border-border bg-card shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-bold">Add Modules</h2>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="border-b border-border p-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search modules..."
              autoFocus
              className="w-full rounded-md border border-input bg-background py-2 pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        {/* Module list */}
        <div className="max-h-[calc(80vh-110px)] overflow-y-auto p-3">
          <div className="grid gap-2.5">
            {filtered.map((m) => {
              const isEnabled = enabled.has(m.id)
              const isComingSoon = m.status === 'coming-soon'
              return (
                <button
                  key={m.id}
                  onClick={() => addModule(m.id, m)}
                  disabled={isComingSoon}
                  className={cn(
                    'flex items-start gap-3 rounded-md border p-3 text-left transition-all',
                    isComingSoon
                      ? 'border-border opacity-60 cursor-not-allowed'
                      : isEnabled
                      ? 'border-primary bg-primary/5 ring-1 ring-primary cursor-pointer'
                      : 'border-border hover:bg-muted/50 cursor-pointer'
                  )}
                >
                  <div
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-md',
                      isEnabled ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                    )}
                  >
                    <m.icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">{m.name}</p>
                      {isComingSoon && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium uppercase text-muted-foreground">
                          Coming Soon
                        </span>
                      )}
                      {!isComingSoon && isEnabled && (
                        <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-medium uppercase text-emerald-600">
                          Installed
                        </span>
                      )}
                      {m.tier !== 'free' && !isComingSoon && (
                        <span className="flex items-center gap-0.5 rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium uppercase text-amber-600">
                          <Lock className="h-2 w-2" /> {m.tier}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{m.description}</p>
                  </div>
                  {isEnabled && !isComingSoon && (
                    <Check className="h-4 w-4 text-primary shrink-0" />
                  )}
                </button>
              )
            })}
          </div>

          {filtered.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No modules match &ldquo;{search}&rdquo;
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-4 py-2.5">
          <button
            onClick={() => onOpenChange(false)}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
