'use client'

import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Loader2, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PinInputDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  onSubmit: (pin: string) => Promise<void>
}

/**
 * A dialog that prompts the user for their PIN.
 * Used for backup encryption/decryption flows.
 */
export function PinInputDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Continue',
  onSubmit,
}: PinInputDialogProps) {
  const [pinInput, setPinInput] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const pinReady = pinInput.length >= 4

  async function handleSubmit() {
    if (!pinReady) return
    setBusy(true)
    setError('')
    try {
      await onSubmit(pinInput)
      setPinInput('')
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operation failed')
    } finally {
      setBusy(false)
    }
  }

  function handleClose(open: boolean) {
    if (!busy) {
      setPinInput('')
      setError('')
      onOpenChange(open)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={handleClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        <div className="relative w-full">
          <input
            type="password"
            inputMode="numeric"
            value={pinInput}
            onChange={(e) => {
              setPinInput(e.target.value.replace(/\D/g, '').slice(0, 8))
              setError('')
            }}
            autoFocus
            placeholder="Enter PIN"
            disabled={busy}
            className={cn(
              'w-full rounded-md border bg-background px-3 py-2.5 text-center text-lg tracking-[0.3em] outline-none focus:ring-2 focus:ring-ring',
              error ? 'border-destructive' : 'border-input'
            )}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}

        <AlertDialogFooter className="gap-2">
          <button
            onClick={() => handleClose(false)}
            disabled={busy}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!pinReady || busy}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Lock className="h-4 w-4" />
            )}
            {busy ? 'Processing...' : confirmLabel}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
