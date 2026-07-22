'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plane, Camera } from 'lucide-react'

interface AircraftPhotoProps {
  nNumber: string
  userId: string | null
  model?: string | null
}

const PHOTO_EXTS = ['jpg', 'jpeg', 'png', 'webp'] as const

const MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

function bytesToDataUrl(bytes: Uint8Array, ext: string): string {
  const mime = MIME_MAP[ext] || 'image/jpeg'
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  const base64 = btoa(binary)
  return `data:${mime};base64,${base64}`
}

export function AircraftPhoto({ nNumber, userId, model }: AircraftPhotoProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isTauri =
    typeof window !== 'undefined' &&
    Boolean(
      (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ ||
        (window as unknown as Record<string, unknown>).__TAURI__
    )

  // Resolve the aircraft photo directory using the same appDataDir convention
  // as the profile avatar: {appDataDir}/documents/{userId}/aircraft/{nNumber}.<ext>
  const resolveDir = useCallback(async (): Promise<{ dir: string; sep: string } | null> => {
    if (!userId) return null
    const { appDataDir } = await import('@tauri-apps/api/path')
    const appDir = await appDataDir()
    const sep = appDir.includes('/') ? '/' : '\\'
    const dir = `${appDir}${sep}documents${sep}${userId}${sep}aircraft`
    return { dir, sep }
  }, [userId])

  // On mount (Tauri + userId), look for an existing photo across known extensions.
  useEffect(() => {
    if (!isTauri || !userId) {
      setDataUrl(null)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const resolved = await resolveDir()
        if (!resolved) return
        const { readFile } = await import('@tauri-apps/plugin-fs')
        for (const ext of PHOTO_EXTS) {
          const fullPath = `${resolved.dir}${resolved.sep}${nNumber}.${ext}`
          try {
            const bytes = await readFile(fullPath)
            if (cancelled) return
            setDataUrl(bytesToDataUrl(bytes, ext))
            return
          } catch {
            // Missing file for this extension — try the next one.
          }
        }
        // No photo found yet.
        if (!cancelled) setDataUrl(null)
      } catch {
        if (!cancelled) setDataUrl(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isTauri, userId, nNumber, resolveDir])

  async function handleUpload() {
    if (!isTauri || !userId) return
    setUploading(true)
    setError(null)
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const filePath = await open({
        multiple: false,
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
      })
      if (!filePath) {
        setUploading(false)
        return
      }
      const resolved = await resolveDir()
      if (!resolved) {
        setUploading(false)
        return
      }
      const { readFile, mkdir, writeFile } = await import('@tauri-apps/plugin-fs')

      const pickedExt = (filePath as string).split('.').pop()?.toLowerCase() || 'jpg'
      const targetPath = `${resolved.dir}${resolved.sep}${nNumber}.${pickedExt}`

      await mkdir(resolved.dir, { recursive: true })
      const bytes = await readFile(filePath as string)
      await writeFile(targetPath, bytes)

      setDataUrl(bytesToDataUrl(bytes, pickedExt))
    } catch (err) {
      console.error('[aircraft-photo] upload failed', err)
      setError(err instanceof Error ? err.message : 'Could not save the photo.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="relative w-full overflow-hidden rounded-lg border border-border bg-muted">
        {dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={dataUrl}
            alt={model ? `${nNumber} — ${model}` : nNumber}
            className="h-[200px] w-full object-cover"
          />
        ) : (
          <div className="flex h-[200px] w-full items-center justify-center bg-muted text-muted-foreground">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-20 w-20 opacity-40"
              aria-hidden="true"
            >
              <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
            </svg>
          </div>
        )}
        <button
          onClick={handleUpload}
          disabled={uploading || !isTauri}
          className="absolute bottom-2 right-2 inline-flex items-center gap-1.5 rounded-md border border-border bg-background/90 px-2.5 py-1.5 text-[11px] font-medium text-foreground shadow-sm backdrop-blur transition-colors hover:bg-muted disabled:opacity-50"
          title={dataUrl ? 'Change photo' : 'Add photo'}
        >
          {uploading ? (
            <svg className="h-3.5 w-3.5 animate-spin text-muted-foreground" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <Camera className="h-3.5 w-3.5" />
          )}
          {dataUrl ? 'Change photo' : 'Add photo'}
        </button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {!isTauri && (
        <p className="text-xs text-muted-foreground">Photo upload is available in the desktop app.</p>
      )}
    </div>
  )
}
