'use client'

/**
 * Offline-tolerant entitlement cache for the desktop app.
 *
 * The cloud is the source of truth for what a user has paid for
 * (User.tier + User.purchasedModules, served by /api/v1/entitlements).
 * Because the desktop app is offline-first, we cache the last-known
 * entitlements in a Tauri store and honor them for a grace period, so a
 * subscriber in a hangar with no WiFi is never locked out of features
 * they paid for.
 *
 * Policy:
 *  - Online: refresh from the server (at most once per REFRESH_MS), cache it.
 *  - Offline / server unreachable: use the cache as long as it is younger
 *    than GRACE_MS (30 days). Past the grace window, fall back to free tier
 *    until the app can reach the server again.
 *
 * This is client-side gating — it keeps honest users working offline, it is
 * not tamper-proof DRM (nothing client-side is).
 */

import { Store } from '@tauri-apps/plugin-store'
import { getCloudBaseUrl } from '@/apps/desktop/src/lib/cloud-base-url'
import { MIN_SUPPORTED_DESKTOP_VERSION } from '@/lib/version'

const STORE_FILE = 'entitlements.json'
const GRACE_MS = 30 * 24 * 60 * 60 * 1000 // 30 days offline grace
const REFRESH_MS = 60 * 60 * 1000 // re-fetch at most hourly

export interface Entitlements {
  tier: string // 'free' | 'pro' | ...
  modules: string[]
  subscriptionEnd: string | null
  credits: number
  fetchedAt: string
  /**
   * Oldest desktop app version the backend still supports, as of the last
   * successful fetch. Cached alongside the rest of the entitlements payload
   * so an offline launch can still enforce the last-known minimum — but a
   * failed/offline fetch never invents a minimum on its own (see FREE_TIER
   * below, which uses '0.0.0' so unreachability alone never blocks anyone).
   */
  minDesktopVersion: string
}

const FREE_TIER: Entitlements = {
  tier: 'free',
  modules: [],
  subscriptionEnd: null,
  credits: 0,
  fetchedAt: new Date(0).toISOString(),
  minDesktopVersion: MIN_SUPPORTED_DESKTOP_VERSION,
}

interface CacheEntry {
  entitlements: Entitlements
  cachedAt: string
}

let storePromise: Promise<Store | null> | null = null
let inFlight: Promise<Entitlements> | null = null
let lastFetchAt = 0

async function getStore(): Promise<Store | null> {
  if (typeof window === 'undefined') return null
  if (!storePromise) {
    storePromise = Store.load(STORE_FILE).catch((err) => {
      console.error('[entitlements] Store.load failed:', err)
      storePromise = null
      return null
    })
  }
  try {
    return await storePromise
  } catch {
    storePromise = null
    return null
  }
}

function cacheKey(cloudUserKey: string): string {
  return `entitlements:${cloudUserKey}`
}

async function readCache(cloudUserKey: string): Promise<CacheEntry | null> {
  const store = await getStore()
  if (!store) return null
  try {
    return (await store.get<CacheEntry>(cacheKey(cloudUserKey))) ?? null
  } catch {
    return null
  }
}

async function writeCache(cloudUserKey: string, entitlements: Entitlements): Promise<void> {
  const store = await getStore()
  if (!store) return
  try {
    const entry: CacheEntry = { entitlements, cachedAt: new Date().toISOString() }
    await store.set(cacheKey(cloudUserKey), entry)
    await store.save()
  } catch {
    // cache write failures are non-fatal
  }
}

function isWithinGrace(entry: CacheEntry): boolean {
  const age = Date.now() - new Date(entry.cachedAt).getTime()
  return Number.isFinite(age) && age >= 0 && age < GRACE_MS
}

async function fetchFromServer(): Promise<Entitlements | null> {
  try {
    const base = getCloudBaseUrl()
    const res = await fetch(`${base}/api/v1/entitlements`, { credentials: 'include' })
    if (!res.ok) return null
    const data = (await res.json()) as Partial<Entitlements>
    if (typeof data.tier !== 'string') return null
    return {
      tier: data.tier,
      modules: Array.isArray(data.modules) ? data.modules : [],
      subscriptionEnd: data.subscriptionEnd ?? null,
      credits: typeof data.credits === 'number' ? data.credits : 0,
      fetchedAt: data.fetchedAt || new Date().toISOString(),
      minDesktopVersion:
        typeof data.minDesktopVersion === 'string' ? data.minDesktopVersion : MIN_SUPPORTED_DESKTOP_VERSION,
    }
  } catch {
    return null // offline or unreachable
  }
}

/**
 * Get the current entitlements for the given cloud-linked profile.
 *
 * @param cloudUserKey stable key for the signed-in profile (use the local
 *   cloud-linked user id, e.g. from cloudLinkedUserId()); entitlements are
 *   cached per profile so pilots sharing a computer don't see each other's.
 * @param opts.forceRefresh bypass the hourly refresh throttle.
 */
export async function getEntitlements(
  cloudUserKey: string,
  opts?: { forceRefresh?: boolean }
): Promise<Entitlements> {
  if (inFlight) return inFlight

  inFlight = (async () => {
    const cached = await readCache(cloudUserKey)

    const throttled = !opts?.forceRefresh && Date.now() - lastFetchAt < REFRESH_MS
    if (cached && throttled && isWithinGrace(cached)) {
      return cached.entitlements
    }

    const fresh = await fetchFromServer()
    if (fresh) {
      lastFetchAt = Date.now()
      await writeCache(cloudUserKey, fresh)
      return fresh
    }

    // Offline or server unreachable — honor the cache within the grace window.
    if (cached && isWithinGrace(cached)) {
      return cached.entitlements
    }

    // No usable cache — free tier until we can reach the server.
    return FREE_TIER
  })()

  try {
    return await inFlight
  } finally {
    inFlight = null
  }
}

/** Convenience: does this profile have a paid module (or pro tier)? */
export async function hasModule(cloudUserKey: string, moduleId: string): Promise<boolean> {
  const ent = await getEntitlements(cloudUserKey)
  return ent.modules.includes(moduleId)
}

/** Convenience: is this profile on a paid tier? */
export async function isPaidTier(cloudUserKey: string): Promise<boolean> {
  const ent = await getEntitlements(cloudUserKey)
  return ent.tier !== 'free'
}

/** Drop the cached entitlements for a profile (e.g. on sign-out). */
export async function clearEntitlementsCache(cloudUserKey: string): Promise<void> {
  const store = await getStore()
  if (!store) return
  try {
    await store.delete(cacheKey(cloudUserKey))
    await store.save()
  } catch {
    // ignore
  }
}
