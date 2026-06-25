'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Monitor, Loader2, HardDrive, Cloud, ArrowRight, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { completeSetup } from '@/desktop/lib/setup'
import { importUserData } from '@/desktop/lib/backup'
import { cloudSignIn } from '@/apps/desktop/src/lib/cloud-session'

export default function DesktopLoginPage() {
  const router = useRouter()
  const [step, setStep] = useState<'mode' | 'cloud'>('mode')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [isTauri] = useState(() =>
    typeof window !== 'undefined' &&
    Boolean((window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ ||
            (window as unknown as Record<string, unknown>).__TAURI__)
  )

  async function handleLocalResume() {
    // Go to account selection page — user picks which local account to log in as
    router.push('/desktop/accounts')
  }

  async function handleCloudSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const res = await cloudSignIn(username, password)

    setLoading(false)

    if (!res.ok) {
      setError(res.error || 'Invalid username or password')
    } else {
      try {
        await completeSetup({ mode: 'cloud' })
      } catch {
        // store may not exist in web
      }
      router.push('/desktop/dashboard')
      router.refresh()
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
      console.error('[login] import failed', err)
      setImportError(err instanceof Error ? err.message : String(err))
    } finally {
      setImporting(false)
    }
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
            <p className="text-sm text-muted-foreground">Sign in</p>
          </div>
        </div>

        {step === 'mode' && (
          <div className="space-y-3">
            <button
              onClick={handleLocalResume}
              disabled={loading}
              className={cn(
                'flex w-full items-center gap-3 rounded-md border p-4 text-left transition-all disabled:opacity-50',
                'border-border hover:border-foreground/20 hover:bg-muted/50'
              )}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted">
                <HardDrive className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">Use Locally</p>
                <p className="text-xs text-muted-foreground">No account needed.</p>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            </button>

            <button
              onClick={() => setStep('cloud')}
              className={cn(
                'flex w-full items-center gap-3 rounded-md border p-4 text-left transition-all',
                'border-border hover:border-foreground/20 hover:bg-muted/50'
              )}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted">
                <Cloud className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">Sign in with Cloud</p>
                <p className="text-xs text-muted-foreground">Sync across devices.</p>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            </button>

            <p className="pt-1 text-center text-xs text-muted-foreground">
              Don&apos;t have an account?{' '}
              <Link href="/desktop/signup" className="underline hover:text-foreground">
                Create one
              </Link>
            </p>
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
          </div>
        )}

        {step === 'cloud' && (
          <>
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
              onClick={() => setStep('mode')}
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
            >
              ← Back to options
            </button>

            {isTauri && (
              <div className="rounded-md border border-border bg-muted/30 p-3 text-[11px] text-muted-foreground">
                <p className="font-medium text-foreground mb-1">Demo account</p>
                <p className="font-mono">koster / Password123!</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
