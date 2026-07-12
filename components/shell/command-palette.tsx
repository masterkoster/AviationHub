'use client'

import { useEffect, useState } from 'react'
import { Command } from 'cmdk'
import { Search, CornerDownLeft } from 'lucide-react'

export interface PaletteCommand {
  id: string
  label: string
  group: string
  icon: React.ComponentType<{ className?: string }>
  hint?: string
  keywords?: string
  run: () => void
}

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  commands: PaletteCommand[]
}

/**
 * Shared command palette (Ctrl+K) for the unified shell. Commands are passed
 * in so web and desktop can feed it their own routes/actions while sharing
 * the same look and behavior.
 */
export function CommandPalette({ open, onOpenChange, commands }: CommandPaletteProps) {
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!open) setSearch('')
  }, [open])

  if (!open) return null

  const groups = [...new Set(commands.map((c) => c.group))]

  return (
    <div
      className="fixed inset-0 z-[1300] flex items-start justify-center bg-black/40 pt-[15vh] backdrop-blur-sm"
      onClick={() => onOpenChange(false)}
    >
      <Command
        loop
        className="w-[520px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-border bg-popover shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center border-b border-border px-3">
          <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
          <Command.Input
            autoFocus
            placeholder="Type a command or search..."
            value={search}
            onValueChange={setSearch}
            className="flex h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
            ESC
          </kbd>
        </div>
        <Command.List className="max-h-[360px] overflow-y-auto p-1.5">
          <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
            No results found.
          </Command.Empty>

          {groups.map((group) => (
            <Command.Group
              key={group}
              heading={group}
              className="text-xs text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-medium uppercase tracking-wide"
            >
              {commands
                .filter((c) => c.group === group)
                .map((command) => (
                  <Command.Item
                    key={command.id}
                    value={`${command.label} ${command.keywords ?? ''} ${command.hint ?? ''}`}
                    onSelect={() => command.run()}
                    className="flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-sm aria-selected:bg-primary/10 aria-selected:text-primary"
                  >
                    <command.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1">{command.label}</span>
                    {command.hint && (
                      <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                        {command.hint}
                      </kbd>
                    )}
                    <CornerDownLeft className="h-3 w-3 text-muted-foreground/40" />
                  </Command.Item>
                ))}
            </Command.Group>
          ))}
        </Command.List>
      </Command>
    </div>
  )
}
