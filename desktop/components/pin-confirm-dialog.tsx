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
import { Loader2, Lock, X, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PinConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  hasPin: boolean
  onConfirm: (pin: string) => Promise<void>
}

export function PinConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  hasPin,
  onConfirm,
}: PinConfirmDialogProps) {
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState('')
  const [busy, setBusy] = useState(false)

  const pinReady = pinInput.length >= 4

  async function handleConfirm() {
    setBusy(true)
    setPinError('')
    try {
      await onConfirm(pinInput)
      setPinInput('')
      onOpenChange(false)
    } catch (err) {
      setPinError(err instanceof Error ? err.message : 'Verification failed')
      setPinInput('')
    } finally {
      setBusy(false)
    }
  }

  function handleClose(open: boolean) {
    if (!busy) {
      setPinInput('')
      setPinError('')
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

        {hasPin && (
          <div className="relative w-full">
            <input
              type="password"
              inputMode="numeric"
              value={pinInput}
              onChange={(e) => {
                setPinInput(e.target.value.replace(/\D/g, '').slice(0, 8))
                setPinError('')
              }}
              autoFocus
              placeholder="Enter PIN"
              disabled={busy}
              className={cn(
                'w-full rounded-md border bg-background px-3 py-2.5 pr-10 text-center text-lg tracking-[0.3em] outline-none focus:ring-2 focus:ring-ring',
                pinError ? 'border-destructive' : 'border-input'
              )}
            />
            {pinInput.length > 0 && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {pinError ? (
                  <X className="h-4 w-4 text-destructive" />
                ) : pinReady ? (
                  <Check className="h-4 w-4 text-emerald-500" />
                ) : null}
              </div>
            )}
          </div>
        )}
        {pinError && <p className="text-sm text-destructive">{pinError}</p>}

        <AlertDialogFooter className="gap-2">
          <button
            onClick={() => handleClose(false)}
            disabled={busy}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={(hasPin && !pinReady) || busy}
            className="inline-flex items-center gap-1.5 rounded-md bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Lock className="h-4 w-4" />
            )}
            {busy ? 'Deleting...' : 'Delete'}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
