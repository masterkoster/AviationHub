'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Monitor,
  Plus,
  Loader2,
  Lock,
  ArrowLeft,
  Cloud,
  HardDrive,
  X,
  Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  getAllLocalUsers,
  verifyPin,
  deleteLocalUser,
  hasRecoveryPinProvisioned,
  provisionRecoveryPin,
  type LocalUser,
} from '@/desktop/lib/local-auth'
import { setActiveUser, completeSetup } from '@/desktop/lib/setup'
import { PinConfirmDialog } from '@/desktop/components/pin-confirm-dialog'
import { SimpleAlert } from '@/desktop/components/alert-dialog'
import { RecoveryPinRevealDialog } from '@/desktop/components/recovery-pin-reveal-dialog'
import { notifyDeleted } from '@/desktop/lib/toast-helpers'

const AVATAR_COLORS: Record<string, string> = {
  emerald: 'from-emerald-500 to-emerald-600',
  blue: 'from-blue-500 to-blue-600',
  violet: 'from-violet-500 to-violet-600',
  amber: 'from-amber-500 to-amber-600',
  rose: 'from-rose-500 to-rose-600',
  cyan: 'from-cyan-500 to-cyan-600',
  orange: 'from-orange-500 to-orange-600',
  pink: 'from-pink-500 to-pink-600',
}

export default function DesktopAccountsPage() {
  const router = useRouter()
  const [users, setUsers] = useState<LocalUser[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedUser, setSelectedUser] = useState<LocalUser | null>(null)
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<LocalUser | null>(null)
  const [alertOpen, setAlertOpen] = useState(false)
  const [alertTitle, setAlertTitle] = useState('')
  const [alertDescription, setAlertDescription] = useState('')

  // Recovery-PIN migration: shown once after unlocking a profile that
  // predates the recovery PIN feature and doesn't have one yet.
  const [recoveryPinReveal, setRecoveryPinReveal] = useState<string | null>(null)
  const pendingLoginUserIdRef = useRef<string | null>(null)

  async function loadUsers() {
    setLoading(true)
    const all = await getAllLocalUsers()
    setUsers(all)
    setLoading(false)
  }

  function handleDelete(user: LocalUser) {
    setDeleteTarget(user)
  }

  async function handleDeleteConfirm(pin: string) {
    const user = deleteTarget
    if (!user) return

    // Verify PIN if the user has one
    if (user.pin) {
      const ok = await verifyPin(user.id, pin)
      if (!ok) {
        throw new Error('Incorrect PIN')
      }
    }

    // PIN verified (or no PIN set) — proceed with deletion
    setDeletingId(user.id)
    try {
      await deleteLocalUser(user.id)
      notifyDeleted('Account')
      await loadUsers()
      setDeleteTarget(null)
    } catch (err) {
      // Delete failed — close the PIN dialog and show error alert
      setDeleteTarget(null)
      setAlertTitle('Failed to Delete User')
      setAlertDescription(
        'Failed to delete user: ' +
          (err instanceof Error ? err.message : String(err))
      )
      setAlertOpen(true)
    } finally {
      setDeletingId(null)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  /**
   * Finish logging a local user in. If this profile predates the recovery
   * PIN feature and doesn't have one yet, generate it now and show it once
   * before navigating away — this is the "next successful unlock" migration
   * path for pre-existing profiles.
   */
  async function finishLogin(userId: string) {
    const alreadyHasRecoveryPin = await hasRecoveryPinProvisioned(userId)
    if (!alreadyHasRecoveryPin) {
      try {
        const rp = await provisionRecoveryPin(userId)
        pendingLoginUserIdRef.current = userId
        setRecoveryPinReveal(rp)
        return
      } catch (err) {
        // Don't block login if recovery-PIN provisioning fails for some
        // reason — it can still be generated later from Settings.
        console.error('[accounts] provisionRecoveryPin failed:', err)
      }
    }
    await setActiveUser(userId)
    await completeSetup({ mode: 'local', localUserId: userId })
    router.replace('/desktop/dashboard')
    router.refresh()
  }

  async function handleRecoveryPinAcknowledge() {
    const userId = pendingLoginUserIdRef.current
    setRecoveryPinReveal(null)
    pendingLoginUserIdRef.current = null
    if (!userId) return
    await setActiveUser(userId)
    await completeSetup({ mode: 'local', localUserId: userId })
    router.replace('/desktop/dashboard')
    router.refresh()
  }

  async function handlePinSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedUser || pinInput.length < 4) return
    setVerifying(true)
    setPinError('')
    const ok = await verifyPin(selectedUser.id, pinInput)
    setVerifying(false)
    if (ok) {
      await finishLogin(selectedUser.id)
    } else {
      setPinError('Incorrect PIN')
      setPinInput('')
    }
  }

  function handleTileClick(user: LocalUser) {
    // If user has no PIN, log in directly
    if (!user.pin) {
      finishLogin(user.id)
      return
    }
    setSelectedUser(user)
    setPinInput('')
    setPinError('')
  }

  // PIN entry screen (PS4-style)
  if (selectedUser) {
    // Visual indicator: only show when >=4 digits typed
    const pinReady = pinInput.length >= 4
    return (
      <div className="flex min-h-full flex-col items-center justify-center bg-background p-6">
        <button
          onClick={() => setSelectedUser(null)}
          className="absolute top-4 left-4 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> All accounts
        </button>

        {/* Avatar */}
        <div
          className={cn(
            'mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg',
            AVATAR_COLORS[selectedUser.avatarColor] || AVATAR_COLORS.emerald
          )}
        >
          <span className="text-2xl font-bold">
            {selectedUser.name.charAt(0).toUpperCase()}
          </span>
        </div>
        <h1 className="mb-1 text-lg font-bold">{selectedUser.name}</h1>
        <p className="mb-6 text-xs text-muted-foreground">Enter your PIN to continue</p>

        <div className="relative w-full max-w-xs">
          <form onSubmit={handlePinSubmit}>
            <input
              type="password"
              inputMode="numeric"
              value={pinInput}
              onChange={(e) => {
                setPinInput(e.target.value.replace(/\D/g, '').slice(0, 8))
                setPinError('')
              }}
              autoFocus
              className={cn(
                'w-full rounded-md border bg-background px-3 py-3 pr-10 text-center text-2xl tracking-[0.4em] outline-none focus:ring-2 focus:ring-ring',
                pinError ? 'border-destructive' : 'border-input'
              )}
              placeholder="••••"
            />
            {/* Live check indicator */}
            {pinReady && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {pinError ? (
                  <X className="h-5 w-5 text-destructive" />
                ) : (
                  <Check className="h-5 w-5 text-emerald-500" />
                )}
              </div>
            )}
          </form>
          {pinError && <p className="mt-2 text-center text-sm text-destructive">{pinError}</p>}
          <button
            onClick={handlePinSubmit as unknown as () => void}
            disabled={pinInput.length < 4 || verifying}
            className="mt-4 w-full flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {verifying ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Lock className="h-4 w-4" /> Unlock
              </>
            )}
          </button>
        </div>
      </div>
    )
  }

  // Account selection tiles (PS4-style)
  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-gradient-to-b from-background to-muted/20 p-6">
      {/* Header */}
      <div className="mb-8 flex flex-col items-center gap-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
          <Monitor className="h-6 w-6 text-primary-foreground" />
        </div>
        <h1 className="text-xl font-bold">Who&apos;s flying today?</h1>
        <p className="text-sm text-muted-foreground">Select an account to continue</p>
      </div>

      {/* Empty state */}
      {!loading && users.length === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 p-8 text-center mb-4">
          <Monitor className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-2 text-sm text-muted-foreground">No accounts yet. Create your first account to get started.</p>
        </div>
      )}

      {/* User tiles */}
      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading accounts...
        </div>
      ) : (
        <div className="flex flex-wrap items-start justify-center gap-4">
          {/* Existing users */}
          {users.map((user) => (
            <div key={user.id} className="group relative flex flex-col items-center gap-2">
              <button
                onClick={() => handleTileClick(user)}
                className="flex flex-col items-center gap-2"
              >
                <div
                  className={cn(
                    'relative flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-md transition-all group-hover:shadow-xl',
                    AVATAR_COLORS[user.avatarColor] || AVATAR_COLORS.emerald
                  )}
                >
                  <span className="text-2xl font-bold">
                    {user.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium">{user.name}</p>
                  <p className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                    <HardDrive className="h-2.5 w-2.5" /> Local
                  </p>
                </div>
              </button>
              {/* Delete button */}
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(user) }}
                disabled={deletingId === user.id}
                className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground opacity-0 shadow-sm transition-all hover:bg-destructive hover:text-destructive-foreground group-hover:opacity-100 disabled:opacity-50"
                title="Delete this account"
              >
                {deletingId === user.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <X className="h-3 w-3" />
                )}
              </button>
            </div>
          ))}

          {/* Create new local account tile */}
          <button
            onClick={() => router.push('/desktop/signup')}
            className="group flex flex-col items-center gap-2 transition-transform hover:scale-105"
          >
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-dashed border-border text-muted-foreground transition-all group-hover:border-primary group-hover:text-primary">
              <Plus className="h-8 w-8" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">Add Pilot</p>
              <p className="text-[10px] text-muted-foreground">Create an account</p>
            </div>
          </button>
        </div>
      )}

      {/* Cloud sign in (separate option) */}
      {!loading && users.length > 0 && (
        <div className="mt-8 flex items-center gap-3">
          <span className="text-xs text-muted-foreground">— or —</span>
        </div>
      )}

      <div className="mt-4">
        <button
          onClick={() => router.push('/desktop/login')}
          className="flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          <Cloud className="h-4 w-4" />
          Sign in with your account
        </button>
      </div>

      {/* Delete hint */}
      {!loading && users.length > 0 && (
        <p className="mt-8 text-center text-[10px] text-muted-foreground">
          Profiles are stored on this computer. Each pilot unlocks theirs with their own PIN.
        </p>
      )}

      {/* PinConfirmDialog — replaces confirm() + prompt() flow */}
      <PinConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="Delete Account"
        description={`Delete "${deleteTarget?.name ?? ''}" and ALL their data? This cannot be undone.`}
        hasPin={!!deleteTarget?.pin}
        onConfirm={handleDeleteConfirm}
      />

      {/* SimpleAlert — replaces alert() for delete errors */}
      <SimpleAlert
        open={alertOpen}
        onOpenChange={setAlertOpen}
        title={alertTitle}
        description={alertDescription}
      />

      {/* Recovery-PIN migration reveal — shown once for pre-existing profiles */}
      <RecoveryPinRevealDialog
        open={recoveryPinReveal !== null}
        recoveryPin={recoveryPinReveal}
        onAcknowledge={handleRecoveryPinAcknowledge}
      />
    </div>
  )
}
