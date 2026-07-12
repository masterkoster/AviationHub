'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Monitor,
  Loader2,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  User,
  Mail,
  MapPin,
  Lock,
} from 'lucide-react'
import { PinInputDialog } from '@/desktop/components/pin-input-dialog'
import { RecoveryPinDisplay } from '@/desktop/components/recovery-pin-display'
import { completeSetup, setActiveUser } from '@/desktop/lib/setup'
import {
  createCloudLinkedLocalUser,
  provisionRecoveryPin,
  type LocalUser,
} from '@/desktop/lib/local-auth'
import { importUserData } from '@/desktop/lib/backup'
import { cloudApi } from '@/apps/desktop/src/lib/cloud-api'
import { cloudSignIn, getCloudSession, type CloudSessionUser } from '@/apps/desktop/src/lib/cloud-session'

type Step = 'account' | 'pin' | 'recoveryPin' | 'done'

export default function DesktopSignupPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('account')

  // Account
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [homeAirport, setHomeAirport] = useState('')
  const [accountError, setAccountError] = useState('')
  const [creatingAccount, setCreatingAccount] = useState(false)
  const [cloudUser, setCloudUser] = useState<CloudSessionUser | null>(null)

  // Device PIN
  const [pin, setPin] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [pinError, setPinError] = useState('')
  const [creatingProfile, setCreatingProfile] = useState(false)
  const [createdUser, setCreatedUser] = useState<LocalUser | null>(null)
  const [recoveryPin, setRecoveryPin] = useState<string | null>(null)

  // Import backup
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [pinDialogOpen, setPinDialogOpen] = useState(false)
  const pendingBackupBytes = useRef<Uint8Array | null>(null)
  const [isTauri] = useState(() =>
    typeof window !== 'undefined' &&
    Boolean((window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ ||
            (window as unknown as Record<string, unknown>).__TAURI__)
  )

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault()
    setAccountError('')
    setCreatingAccount(true)
    try {
      await cloudApi.signup({ name, email, password })

      // Sign in immediately — no separate login step after signup.
      const res = await cloudSignIn(email, password)
      if (!res.ok) {
        throw new Error(res.error || 'Account created but sign-in failed — try signing in manually.')
      }

      const session = await getCloudSession()
      setCloudUser(session.user)

      if (isTauri) {
        setStep('pin')
      } else {
        // Web preview of the desktop pages — no local profile to create.
        try {
          await completeSetup({ mode: 'cloud' })
        } catch {
          // store not available outside Tauri
        }
        router.replace('/desktop/dashboard')
        router.refresh()
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong'
      setAccountError(
        /fetch|network|Failed to fetch|timed? ?out/i.test(msg)
          ? 'Could not reach the server. An internet connection is required to create your account — your data will work offline afterwards.'
          : msg
      )
    } finally {
      setCreatingAccount(false)
    }
  }

  async function handleSetPin() {
    if (pin.length < 4) {
      setPinError('PIN must be at least 4 digits')
      return
    }
    if (pin !== pinConfirm) {
      setPinError('PINs do not match')
      return
    }
    if (!cloudUser) {
      setPinError('Session expired — go back and sign in again.')
      return
    }
    setPinError('')
    setCreatingProfile(true)
    try {
      const user = await createCloudLinkedLocalUser(cloudUser, pin, homeAirport)
      setCreatedUser(user)
      await completeSetup({ mode: 'cloud', localUserId: user.id })
      await setActiveUser(user.id)
      // Generate this profile's immutable recovery PIN now — it will only
      // ever be shown this once.
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

  function handleRecoveryPinContinue() {
    setStep('done')
  }

  async function handleImportBackup() {
    if (importing || !isTauri) return
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
      console.error('[signup] import failed', err)
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

  function handleDone() {
    router.replace('/desktop/dashboard')
    router.refresh()
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-background to-background p-6">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Monitor className="h-6 w-6 text-primary-foreground" />
          </div>
          <div className="text-center">
            <h1 className="text-lg font-bold">Create Account</h1>
            <p className="text-xs text-muted-foreground">
              One account — works offline on this computer, syncs when online.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          {/* Step: Account */}
          {step === 'account' && (
            <form onSubmit={handleCreateAccount} className="space-y-4">
              <div>
                <label htmlFor="name" className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
                  <User className="h-3.5 w-3.5 text-muted-foreground" /> Your Name
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoFocus
                  maxLength={80}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  placeholder="John Doe"
                />
              </div>
              <div>
                <label htmlFor="email" className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" /> Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  placeholder="you@email.com"
                />
              </div>
              <div>
                <label htmlFor="password" className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" /> Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Minimum 6 characters"
                />
              </div>
              <div>
                <label htmlFor="homeAirport" className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" /> Home Airport
                  <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                </label>
                <input
                  id="homeAirport"
                  type="text"
                  value={homeAirport}
                  onChange={(e) => setHomeAirport(e.target.value)}
                  maxLength={4}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm uppercase outline-none focus:ring-2 focus:ring-ring"
                  placeholder="KMIA"
                />
              </div>
              {accountError && <p className="text-sm text-destructive whitespace-pre-line">{accountError}</p>}
              <div className="flex items-center justify-between">
                <Link
                  href="/desktop/login"
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back to Sign In
                </Link>
                <button
                  type="submit"
                  disabled={creatingAccount || !name.trim()}
                  className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {creatingAccount ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Creating...</>
                  ) : (
                    <>Continue <ArrowRight className="h-3.5 w-3.5" /></>
                  )}
                </button>
              </div>

              {isTauri && (
                <div className="pt-3 text-center">
                  <button
                    type="button"
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
              )}
            </form>
          )}

          {/* Step: Device PIN */}
          {step === 'pin' && (
            <div className="space-y-4">
              <div className="text-center">
                <h2 className="text-lg font-bold">Set a PIN for this computer</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  You&apos;ll use this PIN to unlock your profile here{name.trim() ? `, ${name.split(' ')[0]}` : ''} —
                  even when offline. Other pilots on this computer can&apos;t see your data without it.
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
              <div className="flex items-center justify-end">
                <button
                  disabled={pin.length < 4 || pin !== pinConfirm || creatingProfile}
                  onClick={handleSetPin}
                  className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {creatingProfile ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Setting up...</>
                  ) : (
                    <>Continue <ArrowRight className="h-3.5 w-3.5" /></>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Step: Recovery PIN reveal (shown once, right after profile creation) */}
          {step === 'recoveryPin' && recoveryPin && (
            <RecoveryPinDisplay
              recoveryPin={recoveryPin}
              onContinue={handleRecoveryPinContinue}
            />
          )}

          {/* Step: Done */}
          {step === 'done' && (
            <div className="space-y-5 text-center">
              <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-full bg-emerald-500/10">
                <CheckCircle2 className="h-6 w-6 text-emerald-500" />
              </div>
              <div>
                <h2 className="text-lg font-bold">All set!</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  You&apos;re signed in{createdUser?.name && ` — welcome, ${createdUser.name.split(' ')[0]}`}.
                  Your logbook works offline and syncs automatically when you&apos;re online.
                </p>
              </div>
              <button
                onClick={handleDone}
                className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Open Dashboard
              </button>
            </div>
          )}
        </div>

        {/* Footer link back to login */}
        {step === 'account' && (
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Already have an account?{' '}
            <Link href="/desktop/login" className="underline hover:text-foreground">
              Sign in
            </Link>
          </p>
        )}

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
    </div>
  )
}
