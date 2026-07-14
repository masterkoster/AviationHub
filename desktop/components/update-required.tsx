'use client'

import { useState } from 'react'
import { AlertTriangle, Download, ExternalLink, Loader2, Plane } from 'lucide-react'

const RELEASES_URL = 'https://github.com/masterkoster/next-dashboard/releases/latest'

interface UpdateRequiredProps {
  currentVersion: string
  requiredVersion: string
}

/**
 * Blocking, full-screen gate shown when the running desktop build is below
 * the backend's minDesktopVersion (see lib/version.ts and
 * apps/desktop/src/lib/entitlements.ts). Cloud mode only — rendered by
 * DesktopShell over everything else, including the sidebar and content.
 */
export function UpdateRequired({ currentVersion, requiredVersion }: UpdateRequiredProps) {
  const [state, setState] = useState<{ installing: boolean; error?: string }>({ installing: false })

  async function handleInstall() {
    setState({ installing: true, error: undefined })
    try {
      if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
        window.open(RELEASES_URL, '_blank', 'noopener,noreferrer')
        setState({ installing: false })
        return
      }
      const { check } = await import('@tauri-apps/plugin-updater')
      const { relaunch } = await import('@tauri-apps/plugin-process')
      const update = await check()
      if (!update?.available) {
        // Tauri's updater endpoint hasn't caught up yet, or this build
        // isn't wired to it — fall back to the manual download page.
        window.open(RELEASES_URL, '_blank', 'noopener,noreferrer')
        setState({ installing: false })
        return
      }
      await update.downloadAndInstall()
      await relaunch()
    } catch (err) {
      setState({
        installing: false,
        error: err instanceof Error ? err.message : 'Update failed. Try the manual download below.',
      })
    }
  }

  return (
    <div className="fixed inset-0 z-[20000] flex items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-background to-background p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Plane className="h-6 w-6 text-primary-foreground" />
          </div>
          <div className="text-center">
            <h1 className="text-lg font-bold">AviationHub Desktop</h1>
            <p className="text-xs text-muted-foreground">Update required</p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            </div>
            <h2 className="text-base font-semibold">
              A newer version of AviationHub is required to continue
            </h2>
            <p className="text-sm text-muted-foreground">
              This installation is out of date and can no longer talk to the AviationHub servers safely.
              Install the update to keep using the app.
            </p>

            <div className="mt-1 flex w-full items-center justify-center gap-4 rounded-lg border border-border bg-muted/30 px-4 py-3 text-xs">
              <div>
                <p className="text-muted-foreground">Current version</p>
                <p className="font-mono font-medium text-foreground">{currentVersion}</p>
              </div>
              <div className="h-6 w-px bg-border" />
              <div>
                <p className="text-muted-foreground">Required version</p>
                <p className="font-mono font-medium text-foreground">{requiredVersion}+</p>
              </div>
            </div>

            {state.error && (
              <p className="w-full rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {state.error}
              </p>
            )}

            <button
              onClick={handleInstall}
              disabled={state.installing}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {state.installing ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Installing update...</>
              ) : (
                <><Download className="h-4 w-4" /> Install update</>
              )}
            </button>

            <a
              href={RELEASES_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3" /> Or download the latest installer manually
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
