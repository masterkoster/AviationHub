'use client'

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { RecoveryPinDisplay } from '@/desktop/components/recovery-pin-display'

interface RecoveryPinRevealDialogProps {
  open: boolean
  recoveryPin: string | null
  onAcknowledge: () => void
}

/**
 * Non-dismissible dialog wrapper around `RecoveryPinDisplay`, used for the
 * "existing profile" migration path (recovery PIN generated on next unlock)
 * and for manual generation from Settings. There is deliberately no cancel /
 * close affordance — the user must tick "I wrote it down" to proceed, since
 * this is the only time the recovery PIN will ever be shown.
 */
export function RecoveryPinRevealDialog({
  open,
  recoveryPin,
  onAcknowledge,
}: RecoveryPinRevealDialogProps) {
  if (!recoveryPin) return null
  return (
    <AlertDialog open={open}>
      <AlertDialogContent onEscapeKeyDown={(e) => e.preventDefault()}>
        {/* Visually-hidden title for a11y; the real heading lives in RecoveryPinDisplay */}
        <AlertDialogHeader className="sr-only">
          <AlertDialogTitle>Your recovery PIN</AlertDialogTitle>
        </AlertDialogHeader>
        <RecoveryPinDisplay recoveryPin={recoveryPin} onContinue={onAcknowledge} />
      </AlertDialogContent>
    </AlertDialog>
  )
}
