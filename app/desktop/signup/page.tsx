'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Monitor,
  HardDrive,
  Cloud,
  Loader2,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  User,
  MapPin,
  Lock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { completeSetup, type DesktopMode } from '@/desktop/lib/setup'
import { createLocalUser, diagnoseTauri, type LocalUser } from '@/desktop/lib/local-auth'
import { importUserData } from '@/desktop/lib/backup'
import { cloudApi } from '@/apps/desktop/src/lib/cloud-api'

type Step = 'mode' | 'localProfile' | 'localPin' | 'cloudSignup' | 'done'

export default function DesktopSignupPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('mode')
  const [mode, setMode] = useState<DesktopMode | null>(null)

  // Local profile
  const [name, setName] = useState('')
  const [homeAirport, setHomeAirport] = useState('')
  const [pin, setPin] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [creatingLocal, setCreatingLocal] = useState(false)
  const [localError, setLocalError] = useState('')
  const [createdUser, setCreatedUser] = useState<LocalUser | null>(null)

  // Cloud signup
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [cloudName, setCloudName] = useState('')
  const [cloudError, setCloudError] = useState('')
  const [signingUp, setSigningUp] = useState(false)
  const [cloudCreated, setCloudCreated] = useState(false)

  // Import backup
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [isTauri] = useState(() =>
    typeof window !== 'undefined' &&
    Boolean((window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ ||
            (window as unknown as Record<string, unknown>).__TAURI__)
  )

  async function handleLocalCreate() {
    if (pin.length < 4) {
      setLocalError('PIN must be at least 4 digits')
      return
    }
    if (pin !== pinConfirm) {
      setLocalError('PINs do not match')
      return
    }
    setCreatingLocal(true)
    setLocalError('')
    try {
      const user = await createLocalUser(name, pin, homeAirport)
      setCreatedUser(user)
      await completeSetup({ mode: 'local', localUserId: user.id })
      setStep('done')
    } catch (err: unknown) {
      console.error(err)
      const msg = err instanceof Error ? err.message : String(err)
      const diag = await diagnoseTauri()
      setLocalError(`Error: ${msg}\n\nDiagnostics:\n${diag}`)
    } finally {
      setCreatingLocal(false)
    }
  }

  async function handleCloudSignup(e: React.FormEvent) {
    e.preventDefault()
    setCloudError('')
    setSigningUp(true)
    try {
      await cloudApi.signup({ name: cloudName, email, password })
      await completeSetup({ mode: 'cloud' })
      setCloudCreated(true)
    } catch (err) {
      setCloudError(err instanceof Error ? err.message : 'Something went wrong')
      setSigningUp(false)
    }
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
      const pinPrompt = window.prompt('Enter the PIN for this backup file')
      if (!pinPrompt) {
        setImporting(false)
        return
      }
      const result = await importUserData(fileBytes, pinPrompt)
      if (!result.success) {
        setImportError(result.error || 'Import failed')
        setImporting(false)
        return
      }
      await completeSetup({ mode: 'local', localUserId: result.userId })
      router.replace('/desktop/dashboard')
      router.refresh()
    } catch (err) {
      console.error('[signup] import failed', err)
      setImportError(err instanceof Error ? err.message : String(err))
    } finally {
      setImporting(false)
    }
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
            <p className="text-xs text-muted-foreground">Choose how you&apos;d like to use AviationHub</p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          {/* Step: Mode */}
          {step === 'mode' && (
            <div className="space-y-4">
              <div className="text-center">
            <h2 className="text-lg font-bold">How would you like to use the app?</h2>
            <p className="mt-1 text-xs text-muted-foreground">You can change this later in Settings.</p>
              </div>
              <div className="grid gap-3">
                <ModeCard
                  selected={mode === 'local'}
                  onSelect={() => setMode('local')}
                  icon={HardDrive}
                  title="Use Locally"
                  desc="Offline-first. No account needed. Data lives on this machine."
                />
                <ModeCard
                  selected={mode === 'cloud'}
                  onSelect={() => setMode('cloud')}
                  icon={Cloud}
                  title="Cloud Sync"
                  desc="Create an account to sync across devices. Requires internet."
                />
              </div>
              <div className="flex items-center justify-between">
                <Link
                  href="/desktop/login"
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back to Sign In
                </Link>
                <button
                  disabled={!mode}
                  onClick={() => setStep(mode === 'local' ? 'localProfile' : 'cloudSignup')}
                  className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  Continue <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>

              {isTauri && (
                <div className="pt-3 text-center">
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
              )}
            </div>
          )}

          {/* Step: Local profile */}
          {step === 'localProfile' && (
            <div className="space-y-4">
              <div className="text-center">
                <h2 className="text-lg font-bold">Tell us about yourself</h2>
                <p className="mt-1 text-xs text-muted-foreground">No account required — local mode.</p>
              </div>
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
              {localError && <p className="text-sm text-destructive">{localError}</p>}
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setStep('mode')}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back
                </button>
                <button
                  disabled={!name.trim()}
                  onClick={() => setStep('localPin')}
                  className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  Continue <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Step: Local PIN */}
          {step === 'localPin' && (
            <div className="space-y-4">
              <div className="text-center">
                <h2 className="text-lg font-bold">Set a PIN</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  You&apos;ll use this PIN to log back in as {name.split(' ')[0]}.
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
              {localError && <p className="text-sm text-destructive whitespace-pre-line">{localError}</p>}
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setStep('localProfile')}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back
                </button>
                <button
                  disabled={pin.length < 4 || pin !== pinConfirm || creatingLocal}
                  onClick={handleLocalCreate}
                  className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {creatingLocal ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Creating...</>
                  ) : (
                    <>Create Account <ArrowRight className="h-3.5 w-3.5" /></>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Step: Cloud signup */}
          {step === 'cloudSignup' && !cloudCreated && (
            <form onSubmit={handleCloudSignup} className="space-y-4">
              <div className="text-center">
                <h2 className="text-lg font-bold">Create cloud account</h2>
                <p className="mt-1 text-xs text-muted-foreground">Sync your logbook across devices.</p>
              </div>
              <div>
                <label htmlFor="cname" className="mb-1.5 block text-sm font-medium">Name</label>
                <input
                  id="cname"
                  type="text"
                  value={cloudName}
                  onChange={(e) => setCloudName(e.target.value)}
                  required
                  autoFocus
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  placeholder="John Doe"
                />
              </div>
              <div>
                <label htmlFor="cemail" className="mb-1.5 block text-sm font-medium">Email</label>
                <input
                  id="cemail"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  placeholder="you@email.com"
                />
              </div>
              <div>
                <label htmlFor="cpass" className="mb-1.5 block text-sm font-medium">Password</label>
                <input
                  id="cpass"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Minimum 6 characters"
                />
              </div>
              {cloudError && <p className="text-sm text-destructive">{cloudError}</p>}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setStep('mode')}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back
                </button>
                <button
                  type="submit"
                  disabled={signingUp}
                  className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {signingUp && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Create Account
                </button>
              </div>
            </form>
          )}

          {/* Step: Cloud created confirmation */}
          {step === 'cloudSignup' && cloudCreated && (
            <div className="space-y-5 text-center">
              <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-full bg-emerald-500/10">
                <CheckCircle2 className="h-6 w-6 text-emerald-500" />
              </div>
              <div>
                <h2 className="text-lg font-bold">Account created</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Sign in with your email and password.
                </p>
              </div>
              <Link
                href="/desktop/login"
                className="w-full inline-flex items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Go to Sign In
              </Link>
            </div>
          )}

          {/* Step: Done (local) */}
          {step === 'done' && (
            <div className="space-y-5 text-center">
              <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-full bg-emerald-500/10">
                <CheckCircle2 className="h-6 w-6 text-emerald-500" />
              </div>
              <div>
                <h2 className="text-lg font-bold">All set!</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  You&apos;re using AviationHub in{' '}
                  <span className="font-medium text-foreground">Local Mode</span>
                  {createdUser?.name && ` — welcome, ${createdUser.name.split(' ')[0]}.`}
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
        {(step === 'mode' || step === 'localProfile') && (
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Already have an account?{' '}
            <Link href="/desktop/login" className="underline hover:text-foreground">
              Sign in
            </Link>
          </p>
        )}
      </div>
    </div>
  )
}

function ModeCard({
  selected,
  onSelect,
  icon: Icon,
  title,
  desc,
}: {
  selected: boolean
  onSelect: () => void
  icon: React.ComponentType<{ className?: string }>
  title: string
  desc: string
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        'flex items-start gap-3 rounded-md border p-4 text-left transition-all',
        selected
          ? 'border-primary bg-primary/5 ring-1 ring-primary'
          : 'border-border hover:border-foreground/20 hover:bg-muted/50'
      )}
    >
      <div
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-md',
          selected ? 'bg-primary text-primary-foreground' : 'bg-muted'
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      {selected && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
    </button>
  )
}
