'use client'

import { useState, useEffect } from 'react'
import { useTheme } from 'next-themes'
import { Monitor } from 'lucide-react'
import { SettingsCard, SectionHeading } from '@/desktop/components/settings-ui'
import { cn } from '@/lib/utils'

export default function AppearanceSettingsPage() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <SettingsCard>
      <SectionHeading
        icon={<Monitor className="h-4 w-4" />}
        title="Appearance"
        description="Choose your preferred desktop theme."
      />

      <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-3">
        <div>
          <p className="text-xs font-medium">Dark mode</p>
          <p className="text-[11px] text-muted-foreground">
            {mounted
              ? `Current: ${resolvedTheme === 'dark' ? 'Dark' : 'Light'}${theme === 'system' ? ' (System)' : ''}`
              : 'Loading theme...'}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setTheme('light')}
            className={cn(
              'rounded-md border px-2.5 py-1.5 text-xs font-medium',
              theme === 'light'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-card hover:bg-muted',
            )}
            disabled={!mounted}
          >
            Light
          </button>
          <button
            type="button"
            onClick={() => setTheme('dark')}
            className={cn(
              'rounded-md border px-2.5 py-1.5 text-xs font-medium',
              theme === 'dark'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-card hover:bg-muted',
            )}
            disabled={!mounted}
          >
            Dark
          </button>
          <button
            type="button"
            onClick={() => setTheme('system')}
            className={cn(
              'rounded-md border px-2.5 py-1.5 text-xs font-medium',
              theme === 'system'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-card hover:bg-muted',
            )}
            disabled={!mounted}
          >
            System
          </button>
        </div>
      </div>
    </SettingsCard>
  )
}
