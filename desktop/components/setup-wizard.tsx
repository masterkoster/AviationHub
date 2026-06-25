'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  Monitor,
  HardDrive,
  Cloud,
  ArrowRight,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  MapPin,
  User,
  Lock,
  Check,
  X,
  Sun,
  Moon,
  Laptop,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'
import { completeSetup, type DesktopMode } from '@/desktop/lib/setup'
import { createLocalUser, diagnoseTauri, type LocalUser } from '@/desktop/lib/local-auth'
import { importUserData } from '@/desktop/lib/backup'
import { cloudSignIn } from '@/apps/desktop/src/lib/cloud-session'

type Step = 'welcome' | 'mode' | 'profile' | 'pin' | 'signin' | 'theme' | 'done'

export function SetupWizard() {
  const router = useRouter()
  const pathname = usePathname()
  const { setTheme } = useTheme()
  const [step, setStep] = useState<Step>('welcome')
  const [mode, setMode] = useState<DesktopMode | null>(null)
  const [selectedTheme, setSelectedTheme] = useState<'light' | 'dark' | 'system'>('system')

  // Local profile fields
  const [name, setName] = useState('')
  const [homeAirport, setHomeAirport] = useState('')
  const [pin, setPin] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [creatingLocal, setCreatingLocal] = useState(false)
  const [localError, setLocalError] = useState('')
  const [createdUser, setCreatedUser] = useState<LocalUser | null>(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')

  // Cloud signin fields
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [cloudError, setCloudError] = useState('')
  const [signingIn, setSigningIn] = useState(false)

  // Step 3a → Step 3b (PIN): go to PIN step after profile
  function handleProfileNext() {
    if (!name.trim()) return
    setStep('pin')
  }

  // Step 3b (PIN): actually create the user with name + pin + home airport
  async function handleCreateLocal() {
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
      setStep('theme')
    } catch (err: unknown) {
      console.error(err)
      const msg = err instanceof Error ? err.message : String(err)
      const diag = await diagnoseTauri()
      setLocalError(`Error: ${msg}\n\nDiagnostics:\n${diag}`)
    } finally {
      setCreatingLocal(false)
    }
  }

  async function handleCloudSignIn(e: React.FormEvent) {
    e.preventDefault()
    setSigningIn(true)
    setCloudError('')
    const res = await cloudSignIn(username, password)
    setSigningIn(false)
    if (!res.ok) {
      setCloudError(res.error || 'Invalid username or password')
      return
    }
    try {
      await completeSetup({ mode: 'cloud' })
    } catch {
      // store might not be available in web preview — ignore
    }
    setStep('theme')
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
      console.error('[setup] import failed', err)
      setImportError(err instanceof Error ? err.message : String(err))
    } finally {
      setImporting(false)
    }
  }

  function handleThemeSelect(theme: 'light' | 'dark' | 'system') {
    setSelectedTheme(theme)
    setTheme(theme)
  }

  function handleThemeDone() {
    setStep('done')
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
            <h1 className="text-lg font-bold">AviationHub Desktop</h1>
            <p className="text-xs text-muted-foreground">First-time setup</p>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          {step === 'welcome' && (
            <StepWelcome onNext={() => setStep('mode')} />
          )}

          {step === 'mode' && (
            <StepMode
              selected={mode}
              onSelect={(m) => setMode(m)}
              onBack={() => setStep('welcome')}
              onNext={(m) => setStep(m === 'local' ? 'profile' : 'signin')}
              onImport={handleImportBackup}
              importing={importing}
              importError={importError}
            />
          )}

          {step === 'profile' && (
            <StepProfile
              name={name}
              setName={setName}
              homeAirport={homeAirport}
              setHomeAirport={setHomeAirport}
              onBack={() => setStep('mode')}
              onNext={handleProfileNext}
              error={localError}
            />
          )}

          {step === 'pin' && (
            <StepPin
              name={name}
              pin={pin}
              setPin={setPin}
              pinConfirm={pinConfirm}
              setPinConfirm={setPinConfirm}
              onBack={() => setStep('profile')}
              onCreate={handleCreateLocal}
              loading={creatingLocal}
              error={localError}
            />
          )}

          {step === 'signin' && (
            <StepSignIn
              username={username}
              setUsername={setUsername}
              password={password}
              setPassword={setPassword}
              error={cloudError}
              loading={signingIn}
              onBack={() => setStep('mode')}
              onSubmit={handleCloudSignIn}
              onSignUp={() => router.push('/desktop/signup')}
            />
          )}

          {step === 'theme' && (
            <StepTheme
              selected={selectedTheme}
              onSelect={handleThemeSelect}
              onNext={handleThemeDone}
            />
          )}

          {step === 'done' && (
            <StepDone
              mode={mode!}
              userName={createdUser?.name ?? name}
              homeAirport={createdUser?.homeAirport ?? homeAirport}
              onDone={handleDone}
            />
          )}
        </div>

        {/* Footer — pathname unused but kept symmetrical for adjustments */}
        <span className="hidden">{pathname}</span>
      </div>
    </div>
  )
}

/* ---------- Individual steps ---------- */

function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="space-y-5 text-center">
      <div>
        <h2 className="text-xl font-bold">Welcome to AviationHub</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Your flights. Your data. Use it offline, sync with the cloud, or
          both — your choice.
        </p>
      </div>
      <ul className="space-y-1.5 text-left text-xs text-muted-foreground">
        <li>• Logbook, currency, and aircraft management</li>
        <li>• Interactive airport map with fuel prices and TFRs</li>
        <li>• Keyboard shortcuts for fast, power-user workflows</li>
      </ul>
      <button
        onClick={onNext}
        className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        Get Started
      </button>
    </div>
  )
}

function StepMode({
  selected,
  onSelect,
  onBack,
  onNext,
  onImport,
  importing,
  importError,
}: {
  selected: DesktopMode | null
  onSelect: (m: DesktopMode) => void
  onBack: () => void
  onNext: (m: DesktopMode) => void
  onImport: () => void
  importing: boolean
  importError: string
}) {
  const cards: {
    mode: DesktopMode
    icon: React.ComponentType<{ className?: string }>
    title: string
    desc: string
  }[] = [
    {
      mode: 'local',
      icon: HardDrive,
      title: 'Use Locally',
      desc: 'Offline-first. No account needed. Data lives on this machine.',
    },
    {
      mode: 'cloud',
      icon: Cloud,
      title: 'Cloud Sync',
      desc: 'Sign in to sync across devices. Requires internet to back up.',
    },
  ]
  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="text-lg font-bold">How would you like to use the app?</h2>
        <p className="mt-1 text-xs text-muted-foreground">You can change this later in Settings.</p>
      </div>
      <div className="grid gap-3">
        {cards.map((c) => (
          <button
            key={c.mode}
            onClick={() => onSelect(c.mode)}
            className={cn(
              'flex items-start gap-3 rounded-md border p-4 text-left transition-all',
              selected === c.mode
                ? 'border-primary bg-primary/5 ring-1 ring-primary'
                : 'border-border hover:border-foreground/20 hover:bg-muted/50'
            )}
          >
            <div
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-md',
                selected === c.mode ? 'bg-primary text-primary-foreground' : 'bg-muted'
              )}
            >
              <c.icon className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold">{c.title}</p>
              <p className="text-xs text-muted-foreground">{c.desc}</p>
            </div>
            {selected === c.mode && (
              <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
            )}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
        <button
          disabled={!selected}
          onClick={() => selected && onNext(selected)}
          className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          Continue <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-4 space-y-1 text-center">
        <button
          onClick={onImport}
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
          <p className="text-[11px] text-destructive whitespace-pre-line">{importError}</p>
        )}
      </div>
    </div>
  )
}

function StepProfile({
  name,
  setName,
  homeAirport,
  setHomeAirport,
  onBack,
  onNext,
  error,
}: {
  name: string
  setName: (v: string) => void
  homeAirport: string
  setHomeAirport: (v: string) => void
  onBack: () => void
  onNext: () => void
  error: string
}) {
  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="text-lg font-bold">Tell us about yourself</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Local mode — no account required. You can add more details later.
        </p>
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
        <p className="mt-1 text-[11px] text-muted-foreground">ICAO code — e.g. KMIA, KJFK, KVNY</p>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
        <button
          disabled={!name.trim()}
          onClick={onNext}
          className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          Continue <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

function StepPin({
  name,
  pin,
  setPin,
  pinConfirm,
  setPinConfirm,
  onBack,
  onCreate,
  loading,
  error,
}: {
  name: string
  pin: string
  setPin: (v: string) => void
  pinConfirm: string
  setPinConfirm: (v: string) => void
  onBack: () => void
  onCreate: () => void
  loading: boolean
  error: string
}) {
  // Match indicator: only show when confirm has >=4 chars
  const showMatch = pinConfirm.length >= 4
  const pinsMatch = pin === pinConfirm && pin.length >= 4
  return (
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
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
          required autoFocus minLength={4} maxLength={8}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-lg tracking-[0.3em] outline-none focus:ring-2 focus:ring-ring text-center"
          placeholder="••••"
        />
      </div>
      <div>
        <label htmlFor="pinConfirm" className="mb-1.5 block text-sm font-medium">
          Confirm PIN
        </label>
        <div className="relative">
          <input
            id="pinConfirm"
            type="password"
            inputMode="numeric"
            value={pinConfirm}
            onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 8))}
            required minLength={4} maxLength={8}
            className={cn(
              'w-full rounded-md border bg-background px-3 py-2 pr-10 text-lg tracking-[0.3em] outline-none focus:ring-2 text-center',
              showMatch && !pinsMatch ? 'border-destructive focus:ring-destructive' : 'border-input focus:ring-ring'
            )}
            placeholder="••••"
          />
          {showMatch && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {pinsMatch ? (
                <Check className="h-5 w-5 text-emerald-500" />
              ) : (
                <X className="h-5 w-5 text-destructive" />
              )}
            </div>
          )}
        </div>
      </div>
      {error && <p className="text-sm text-destructive whitespace-pre-line">{error}</p>}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
        <button
          disabled={!pinsMatch || loading}
          onClick={onCreate}
          className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {loading ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Creating...</>
          ) : (
            <>Create Account <ArrowRight className="h-3.5 w-3.5" /></>
          )}
        </button>
      </div>
    </div>
  )
}

function StepSignIn({
  username,
  setUsername,
  password,
  setPassword,
  error,
  loading,
  onBack,
  onSubmit,
  onSignUp,
}: {
  username: string
  setUsername: (v: string) => void
  password: string
  setPassword: (v: string) => void
  error: string
  loading: boolean
  onBack: () => void
  onSubmit: (e: React.FormEvent) => void
  onSignUp: () => void
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="text-center">
        <h2 className="text-lg font-bold">Sign in to your cloud account</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Sync your logbook across devices with AviationHub Cloud.
        </p>
      </div>
      <div>
        <label htmlFor="signin-username" className="mb-1.5 block text-sm font-medium">
          Username or Email
        </label>
        <input
          id="signin-username"
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
        <label htmlFor="signin-password" className="mb-1.5 block text-sm font-medium">
          Password
        </label>
        <input
          id="signin-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          placeholder="Password"
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="rounded-md border border-border bg-muted/30 p-3 text-[11px] text-muted-foreground">
        <p className="font-medium text-foreground mb-1">Demo account</p>
        <p className="font-mono">koster / Password123!</p>
      </div>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Sign In
        </button>
      </div>
      <div className="text-center text-xs text-muted-foreground">
        Don&apos;t have an account?{' '}
        <button type="button" onClick={onSignUp} className="font-medium underline hover:text-foreground">
          Create one
        </button>
      </div>
    </form>
  )
}

function StepTheme({
  selected,
  onSelect,
  onNext,
}: {
  selected: 'light' | 'dark' | 'system'
  onSelect: (theme: 'light' | 'dark' | 'system') => void
  onNext: () => void
}) {
  const themes: { value: 'light' | 'dark' | 'system'; icon: React.ComponentType<{ className?: string }>; title: string; desc: string }[] = [
    { value: 'light', icon: Sun, title: 'Light', desc: 'Bright and clear for daytime use' },
    { value: 'dark', icon: Moon, title: 'Dark', desc: 'Easy on the eyes in low light' },
    { value: 'system', icon: Laptop, title: 'System', desc: 'Follows your OS preference' },
  ]
  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="text-lg font-bold">Choose your theme</h2>
        <p className="mt-1 text-xs text-muted-foreground">You can change this later in Settings.</p>
      </div>
      <div className="grid gap-3">
        {themes.map((t) => (
          <button
            key={t.value}
            onClick={() => onSelect(t.value)}
            className={cn(
              'flex items-center gap-3 rounded-md border p-4 text-left transition-all',
              selected === t.value
                ? 'border-primary bg-primary/5 ring-1 ring-primary'
                : 'border-border hover:border-foreground/20 hover:bg-muted/50'
            )}
          >
            <div
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-md',
                selected === t.value ? 'bg-primary text-primary-foreground' : 'bg-muted'
              )}
            >
              <t.icon className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold">{t.title}</p>
              <p className="text-xs text-muted-foreground">{t.desc}</p>
            </div>
            {selected === t.value && (
              <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
            )}
          </button>
        ))}
      </div>
      <button
        onClick={onNext}
        className="w-full flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        Continue <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function StepDone({
  mode,
  userName,
  homeAirport,
  onDone,
}: {
  mode: DesktopMode
  userName: string
  homeAirport: string
  onDone: () => void
}) {
  return (
    <div className="space-y-5 text-center">
      <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-full bg-emerald-500/10">
        <CheckCircle2 className="h-6 w-6 text-emerald-500" />
      </div>
      <div>
        <h2 className="text-lg font-bold">All set!</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          You&apos;re using AviationHub in{' '}
          <span className="font-medium text-foreground">
            {mode === 'local' ? 'Local Mode' : 'Cloud Mode'}
          </span>
          {userName && ` — welcome, ${userName.split(' ')[0]}.`}
        </p>
        {homeAirport && (
          <p className="mt-1 text-xs text-muted-foreground">
            Home airport set to {homeAirport}
          </p>
        )}
      </div>
      <button
        onClick={onDone}
        className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        Open Dashboard
      </button>
    </div>
  )
}
