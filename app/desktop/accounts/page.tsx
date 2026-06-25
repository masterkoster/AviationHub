'use client'

import { useState, useEffect } from 'react'
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
  type LocalUser,
} from '@/desktop/lib/local-auth'
import { setActiveUser, completeSetup } from '@/desktop/lib/setup'

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

  async function loadUsers() {
    setLoading(true)
    const all = await getAllLocalUsers()
    setUsers(all)
    setLoading(false)
  }

  useEffect(() => {
    loadUsers()
  }, [])

  async function handlePinSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedUser || pinInput.length < 4) return
    setVerifying(true)
    setPinError('')
    const ok = await verifyPin(selectedUser.id, pinInput)
    setVerifying(false)
    if (ok) {
      await setActiveUser(selectedUser.id)
      await completeSetup({ mode: 'local', localUserId: selectedUser.id })
      router.replace('/desktop/dashboard')
      router.refresh()
    } else {
      setPinError('Incorrect PIN')
      setPinInput('')
    }
  }

  function handleTileClick(user: LocalUser) {
    // If user has no PIN, log in directly
    if (!user.pin) {
      setActiveUser(user.id).then(() => {
        completeSetup({ mode: 'local', localUserId: user.id }).then(() => {
          router.replace('/desktop/dashboard')
          router.refresh()
        })
      })
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

      {/* User tiles */}
      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading accounts...
        </div>
      ) : (
        <div className="flex flex-wrap items-start justify-center gap-4">
          {/* Existing users */}
          {users.map((user) => (
            <button
              key={user.id}
              onClick={() => handleTileClick(user)}
              className="group flex flex-col items-center gap-2 transition-transform hover:scale-105"
            >
              <div
                className={cn(
                  'flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-md transition-all group-hover:shadow-xl',
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
              <p className="text-sm font-medium">New Account</p>
              <p className="text-[10px] text-muted-foreground">Local or cloud</p>
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
          Sign in with Cloud Account
        </button>
      </div>

      {/* Delete hint */}
      {!loading && users.length > 0 && (
        <p className="mt-8 text-center text-[10px] text-muted-foreground">
          Local accounts are stored on this device. Each has its own PIN.
        </p>
      )}
    </div>
  )
}
