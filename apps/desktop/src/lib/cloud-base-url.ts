'use client'

export function getCloudBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_DESKTOP_CLOUD_API_BASE?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  if (typeof window !== 'undefined') return window.location.origin
  return ''
}
