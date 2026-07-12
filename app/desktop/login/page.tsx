'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Monitor, Loader2, Users, ArrowRight, Lock, LogIn } from 'lucide-react'
import { PinInputDialog } from '@/desktop/components/pin-input-dialog'
import { RecoveryPinDisplay } from '@/desktop/components/recovery-pin-display'
import { completeSetup, setActiveUser } from '@/desktop/lib/setup'
import { importUserData } from '@/desktop/lib/backup'
import {
  cloudLinkedUserId,
  createCloudLinkedLocalUser,
  getLocalUser,
  hasRecoveryPinProvisioned,
  provisionRecoveryPin,
} from '@/desktop/lib/local-auth'
import { cloudSignIn, getCloudSession, type CloudSessionUser } from '@/apps/desktop/src/lib/cloud-session'
import { notifySignedIn } from '@/desktop/lib/toast-helpers'

type Step = 'form' | 'devicePin' | 'recoveryPin'

export default function DesktopLoginPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('form')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // First sign-in on this computer → set a device PIN
  const [cloudUser, setCloudUser] = useState<CloudSessionUser | null>(null)
  const [pin, setPin] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [pinError, setPinError] = useState('')
  const [creatingProfile, setCreatingProfile] = useState(false)
  const [recoveryPin, setRecoveryPin] = useState<string | null>(null)

  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [pinDialogOpen, setPinDialogOpen] = useState(false)
  const pendingBackupBytes = useRef<Uint8Array | null>(null)
  const [isTauri] = useState(() =>
    typeof window !== 'undefined' &&
    Boolean((window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ ||
            (window as unknown as Record<string, unknown>).__TAURI__)
  )

  // Recent account (saved in localStorage after sign-in)
  const [lastUser, setLastUser] = useState<{ username: string; name?: string } | null>(null)

  useEffect(() => {
    try {
      const stored = localStorage.getItem('lastSignedInUser')
      if (stored) setLastUser(JSON.parse(stored))
    } catch { /* ignore */ }
  }, [])

  function saveLastUser(username: string) {
    const entry = { username }
    try { localStorage.setItem('lastSignedInUser', JSON.stringify(entry)) } catch { /* ignore */ }
    setLastUser(entry)
  }

  function goToDashboard() {
    notifySignedIn()
    router.push('/desktop/dashboard')
    router.refresh()
  }

  async function handleCloudSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const res = await cloudSignIn(username, password)

    if (!res.ok) {
      setLoading(false)
      setError(res.error || 'Invalid username or password')
      return
    }

    // Remember this account for quick sign-in next time
    saveLastUser(username)

    if (!isTauri) {
      // Web preview of the desktop pages — no local profile layer.
      try {
        await completeSetup({ mode: 'cloud' })
      } catch {
        // store may not exist in web
      }
      setLoading(false)
      goToDashboard()
      return
    }

    try {
      const session = await getCloudSession()
      setCloudUser(session.user)
      const localId = cloudLinkedUserId(session.user)
      const existing = await getLocalUser(localId)

      if (existing?.pin) {
        // This account already has a profile on this computer — sign straight in.
        saveLastUser(username)
        await completeSetup({ mode: 'cloud', localUserId: localId })
        await setActiveUser(localId)
        // Recovery PIN provisioning is best-effort — don't block login if the
        // database column is missing (pre-migration profile).
        try {
          if (!(await hasRecoveryPinProvisioned(localId))) {
            const rp = await provisionRecoveryPin(localId)
            setRecoveryPin(rp)
            setStep('recoveryPin')
          } else {
            goToDashboard()
          }
        } catch (recoveryErr) {
          console.error('[login] recovery pin provisioning failed (non-fatal):', recoveryErr)
          goToDashboard()
        }
      } else {
        // First time on this computer — set a device PIN so the profile
        // shows up on the "Who's flying today" screen and works offline.
        setStep('devicePin')
      }
    } catch (err) {
      console.error('[login] device profile setup failed', err)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleSetDevicePin() {
    if (pin.length < 4) {
      setPinError('PIN must be at least 4 digits')
      return
    }
    if (pin !== pinConfirm) {
      setPinError('PINs do not match')
      return
    }
    if (!cloudUser) {
      setPinError('Session expired — sign in again.')
      setStep('form')
      return
    }
    setPinError('')
    setCreatingProfile(true)
    try {
      const user = await createCloudLinkedLocalUser(cloudUser, pin)
      await completeSetup({ mode: 'cloud', localUserId: user.id })
      await setActiveUser(user.id)
      const rp = await provisionRecoveryPin(user.id)
      setRecoveryPin(rp)
      setStep('recoveryPin')
    } catch (err) {
      console.error(err)
      setPinError(err instanceof Error ? err.message : String(err))
    } finally {
      setCreatingProfile(false)
    }
  }

  async function handleImportBackup() {
    if (importing) return
    setImportError('')
    try {
      setImporting(true)
      const { open } = await import('@tauri-apps/plugin-dialog')
      const filePath = await open({
        multiple: false,
        filters: [{ name: 'AviationHub Backup', extensions: ['ahb'] }],
      })
      if (!filePath) {
        setImporting(false)
        return
      }
      const { readFile } = await import('@tauri-apps/plugin-fs')
      const fileBytes = await readFile(filePath as string, { encoding: 'binary' }) as Uint8Array
      pendingBackupBytes.current = fileBytes
      // importing stays true while PIN dialog is open
      setPinDialogOpen(true)
    } catch (err) {
      console.error('[login] import failed', err)
      setImportError(err instanceof Error ? err.message : String(err))
      setImporting(false)
    }
  }

  async function handlePinSubmit(backupPin: string) {
    const fileBytes = pendingBackupBytes.current
    pendingBackupBytes.current = null
    if (!fileBytes) return

    const result = await importUserData(fileBytes, backupPin)
    if (!result.success) {
      throw new Error(result.error || 'Import failed')
    }
    await completeSetup({ mode: 'local', localUserId: result.userId })
    router.replace('/desktop/dashboard')
    router.refresh()
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-background to-background p-4">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-border bg-card p-8 shadow-sm">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Monitor className="h-6 w-6 text-primary-foreground" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold">AviationHub</h1>
            <p className="text-sm text-muted-foreground">
              {step === 'devicePin' ? 'Set up this computer' : 'Sign in'}
            </p>
          </div>
        </div>

        {step === 'form' && (
          <>
            {/* Recent account quick-select */}
            {lastUser && (
              <button
                type="button"
                onClick={() => {
                  setUsername(lastUser.username)
                  setError('')
                  // Focus the password field after a tick
                  setTimeout(() => {
                    const pw = document.getElementById('password')
                    if (pw) pw.focus()
                  }, 50)
                }}
                className="flex w-full items-center gap-3 rounded-lg border border-primary/20 bg-primary/[0.03] p-3 text-left transition-all hover:border-primary/40 hover:bg-primary/[0.06] group"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
                  <LogIn className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{lastUser.username}</p>
                  <p className="text-[11px] text-muted-foreground">Click to sign in</p>
                </div>
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation()
                    localStorage.removeItem('lastSignedInUser')
                    setLastUser(null)
                  }}
                  className="rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted opacity-0 group-hover:opacity-100 transition-all shrink-0"
                  title="Remove"
                >
                  Clear
                </button>
              </button>
            )}

            <form onSubmit={handleCloudSubmit} className="space-y-4">
              <div>
                <label htmlFor="username" className="block text-sm font-medium mb-1.5">
                  Username or Email
                </label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoFocus
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Username or email"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium mb-1.5">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Password"
                />
                <div className="mt-1.5 text-right">
                  <Link href="/desktop/forgot-password" className="text-xs text-muted-foreground hover:text-foreground underline">
                    Forgot password?
                  </Link>
                </div>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Sign In
              </button>
            </form>

            <button
              onClick={() => router.push('/desktop/accounts')}
              className="flex w-full items-center gap-3 rounded-md border border-border p-3 text-left transition-all hover:border-foreground/20 hover:bg-muted/50"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                <Users className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">Pilots on this computer</p>
                <p className="text-xs text-muted-foreground">Unlock your profile with your PIN.</p>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            </button>

            <p className="text-center text-xs text-muted-foreground">
              Don&apos;t have an account?{' '}
              <Link href="/desktop/signup" className="underline hover:text-foreground">
                Create one
              </Link>
            </p>

            {isTauri && (
              <>
                <div className="text-center">
                  <button
                    onClick={handleImportBackup}
                    disabled={importing}
                    className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
                  >
                    {importing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Lock className="h-3.5 w-3.5" />
                    )}
                    Restore from backup (.ahb)
                  </button>
                  {importError && (
                    <p className="mt-2 text-xs text-destructive whitespace-pre-line">{importError}</p>
                  )}
                </div>

                <div className="rounded-md border border-border bg-muted/30 p-3 text-[11px] text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">Demo account</p>
                  <p className="font-mono">koster / Password123!</p>
                </div>
              </>
            )}
          </>
        )}

        {step === 'devicePin' && (
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                First time on this computer{cloudUser?.name ? `, ${String(cloudUser.name).split(' ')[0]}` : ''}.
                Set a PIN to unlock your profile here — even when offline.
              </p>
            </div>
            <div>
              <label htmlFor="pin" className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
                <Lock className="h-3.5 w-3.5 text-muted-foreground" /> PIN (4-8 digits)
              </label>
              <input
                id="pin"
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                required
                autoFocus
                minLength={4}
                maxLength={8}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-lg tracking-[0.3em] outline-none focus:ring-2 focus:ring-ring text-center"
                placeholder="••••"
              />
            </div>
            <div>
              <label htmlFor="pinConfirm" className="mb-1.5 block text-sm font-medium">
                Confirm PIN
              </label>
              <input
                id="pinConfirm"
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                value={pinConfirm}
                onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 8))}
                required
                minLength={4}
                maxLength={8}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-lg tracking-[0.3em] outline-none focus:ring-2 focus:ring-ring text-center"
                placeholder="••••"
              />
            </div>
            {pinError && <p className="text-sm text-destructive whitespace-pre-line">{pinError}</p>}
            <button
              disabled={pin.length < 4 || pin !== pinConfirm || creatingProfile}
              onClick={handleSetDevicePin}
              className="w-full flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {creatingProfile ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Setting up...</>
              ) : (
                'Continue'
              )}
            </button>
          </div>
        )}

        {step === 'recoveryPin' && recoveryPin && (
          <RecoveryPinDisplay
            recoveryPin={recoveryPin}
            onContinue={goToDashboard}
          />
        )}
      </div>

      <PinInputDialog
        open={pinDialogOpen}
        onOpenChange={(open) => {
          setPinDialogOpen(open)
          if (!open) setImporting(false)
        }}
        title="Backup PIN"
        description="Enter the PIN for this backup file"
        onSubmit={handlePinSubmit}
      />
    </div>
  )
}
