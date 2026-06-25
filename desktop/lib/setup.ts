'use client'

import { Store } from '@tauri-apps/plugin-store'

const STORE_FILE = 'setup.json'
const SETUP_KEY = 'setup_complete'
const MODE_KEY = 'mode' // 'local' | 'cloud'
const SETUP_AT_KEY = 'setup_at'
const LOCAL_USER_ID_KEY = 'local_user_id'

export type DesktopMode = 'local' | 'cloud'

let storePromise: Promise<Store> | null = null

/**
 * Get the Tauri store. Uses try/catch instead of checking for __TAURI__
 * globals — if we're not in Tauri, Store.load() throws, which we catch.
 * This is more reliable than checking for injected globals.
 */
async function getStore(): Promise<Store | null> {
  if (typeof window === 'undefined') return null
  if (!storePromise) {
    try {
      storePromise = Store.load(STORE_FILE)
    } catch {
      storePromise = null
      return null
    }
  }
  try {
    return await storePromise
  } catch {
    storePromise = null
    return null
  }
}

function notifyAuthChange() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event('desktop-auth-changed'))
}

function wasStartupClearDone(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return window.sessionStorage.getItem('ahb-startup-clear') === '1'
  } catch {
    return false
  }
}

function markStartupClearDone() {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem('ahb-startup-clear', '1')
  } catch {
    // ignore
  }
}

export async function isSetupComplete(): Promise<boolean> {
  const store = await getStore()
  if (!store) return true // web mode — skip wizard
  try {
    return (await store.get<boolean>(SETUP_KEY)) ?? false
  } catch {
    return false
  }
}

export async function getDesktopMode(): Promise<DesktopMode | null> {
  const store = await getStore()
  if (!store) return null
  try {
    return (await store.get<DesktopMode>(MODE_KEY)) ?? null
  } catch {
    return null
  }
}

export async function getLocalUserId(): Promise<string | null> {
  const store = await getStore()
  if (!store) return null
  try {
    return (await store.get<string>(LOCAL_USER_ID_KEY)) ?? null
  } catch {
    return null
  }
}

export async function getSetupAt(): Promise<string | null> {
  const store = await getStore()
  if (!store) return null
  try {
    return (await store.get<string>(SETUP_AT_KEY)) ?? null
  } catch {
    return null
  }
}

interface CompleteOptions {
  mode: DesktopMode
  localUserId?: string
}

export async function completeSetup(opts: CompleteOptions): Promise<void> {
  const store = await getStore()
  if (!store) {
    console.error('[setup] completeSetup: store not available — setup will NOT persist!')
    throw new Error('Store not available')
  }
  await store.set(SETUP_KEY, true)
  await store.set(MODE_KEY, opts.mode)
  await store.set(SETUP_AT_KEY, new Date().toISOString())
  if (opts.localUserId) {
    await store.set(LOCAL_USER_ID_KEY, opts.localUserId)
  }
  await store.save()
  console.log('[setup] completeSetup: persisted mode=' + opts.mode + ' userId=' + (opts.localUserId || 'none'))
  notifyAuthChange()
}

/** Clear the active user (sign out) — keeps setup_complete. */
export async function clearActiveUser(): Promise<void> {
  const store = await getStore()
  if (!store) return
  await store.delete(LOCAL_USER_ID_KEY)
  await store.save()
  notifyAuthChange()
}

/** Set the active local user (after selecting from account tiles). */
export async function setActiveUser(userId: string): Promise<void> {
  const store = await getStore()
  if (!store) throw new Error('Store not available')
  await store.set(LOCAL_USER_ID_KEY, userId)
  await store.save()
  notifyAuthChange()
}

/**
 * Clear the active user on app startup (once per app launch).
 * This ensures the user always sees the account selection screen on launch,
 * rather than auto-logging in from a previous session.
 * Only runs once per app instance — subsequent calls are no-ops.
 */
export async function clearActiveUserOnStartup(): Promise<void> {
  if (wasStartupClearDone()) return
  const store = await getStore()
  if (!store) return
  try {
    await store.delete(LOCAL_USER_ID_KEY)
    await store.save()
    markStartupClearDone()
    console.log('[setup] cleared active user on startup')
  } catch {
    // ignore
  }
}
