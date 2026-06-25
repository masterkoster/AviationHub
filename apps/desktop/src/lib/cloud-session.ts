'use client'

import { getCloudBaseUrl } from '@/apps/desktop/src/lib/cloud-base-url'

export interface CloudSessionUser {
  id?: string
  name?: string | null
  email?: string | null
}

export interface CloudSessionState {
  authenticated: boolean
  user: CloudSessionUser | null
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getCloudBaseUrl()
  const res = await fetch(`${base}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init?.headers || {}),
    },
  })

  const text = await res.text()
  const json = text ? (JSON.parse(text) as T) : ({} as T)
  return json
}

async function getCsrfToken(): Promise<string> {
  const data = await fetchJson<{ csrfToken?: string }>('/api/auth/csrf')
  if (!data?.csrfToken) throw new Error('Unable to obtain CSRF token')
  return data.csrfToken
}

export async function getCloudSession(): Promise<CloudSessionState> {
  try {
    const data = await fetchJson<{ user?: CloudSessionUser | null }>('/api/auth/session')
    if (data?.user) {
      return { authenticated: true, user: data.user }
    }
    return { authenticated: false, user: null }
  } catch {
    return { authenticated: false, user: null }
  }
}

export async function cloudSignIn(username: string, password: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const csrfToken = await getCsrfToken()
    const params = new URLSearchParams()
    params.set('csrfToken', csrfToken)
    params.set('username', username)
    params.set('password', password)
    params.set('json', 'true')

    const base = getCloudBaseUrl()
    const res = await fetch(`${base}/api/auth/callback/credentials?json=true`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
      redirect: 'manual',
    })

    const text = await res.text().catch(() => '')
    const parsed = text ? (JSON.parse(text) as { error?: string }) : null

    if (!res.ok || parsed?.error) {
      return { ok: false, error: parsed?.error || 'Invalid username or password' }
    }

    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Sign in failed' }
  }
}

export async function cloudSignOut(): Promise<void> {
  try {
    const csrfToken = await getCsrfToken()
    const params = new URLSearchParams()
    params.set('csrfToken', csrfToken)
    params.set('json', 'true')

    const base = getCloudBaseUrl()
    await fetch(`${base}/api/auth/signout?json=true`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
      redirect: 'manual',
    })
  } catch {
    // ignore signout errors
  }
}
