'use client'

import { useState } from 'react'
import { KeyRound, ShieldAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

interface RecoveryPinDisplayProps {
  recoveryPin: string
  onContinue: () => void
  continueLabel?: string
  busy?: boolean
}

/**
 * Shows a freshly-generated recovery PIN exactly once, with a clear warning
 * and a mandatory "I wrote it down" acknowledgement before the caller lets
 * the user move on. This is pure presentational content (no dialog chrome)
 * so it can be embedded either inside the setup wizard's step card or inside
 * an AlertDialog (see `recovery-pin-reveal-dialog.tsx`).
 */
export function RecoveryPinDisplay({
  recoveryPin,
  onContinue,
  continueLabel = 'Continue',
  busy = false,
}: RecoveryPinDisplayProps) {
  const [ack, setAck] = useState(false)
  const digits = recoveryPin.split('')

  return (
    <div className="space-y-4">
      <div className="text-center">
        <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10">
          <KeyRound className="h-5 w-5 text-amber-500" />
        </div>
        <h2 className="text-lg font-bold">Your recovery PIN</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Write this down and keep it somewhere safe. This recovery PIN never
          changes and is the only way to restore a backup if you forget your
          PIN.
        </p>
      </div>

      <div className="flex justify-center gap-1.5 rounded-md border border-border bg-muted/30 py-4">
        {digits.map((d, i) => (
          <span
            key={i}
            className="flex h-10 w-8 items-center justify-center rounded-md border border-border bg-background text-lg font-bold tabular-nums"
          >
            {d}
          </span>
        ))}
      </div>

      <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-left">
        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
        <p className="text-[11px] text-muted-foreground">
          Nobody at AviationHub can recover or reset this PIN for you. If you
          lose both your PIN and this recovery PIN, your local backups cannot
          be restored.
        </p>
      </div>

      <label className="flex cursor-pointer items-start gap-2 text-xs">
        <input
          type="checkbox"
          checked={ack}
          onChange={(e) => setAck(e.target.checked)}
          className="mt-0.5 h-3.5 w-3.5 rounded border-input"
        />
        <span>I&apos;ve written down my recovery PIN</span>
      </label>

      <button
        onClick={onContinue}
        disabled={!ack || busy}
        className={cn(
          'w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors',
          'hover:bg-primary/90 disabled:opacity-50'
        )}
      >
        {continueLabel}
      </button>
    </div>
  )
}
