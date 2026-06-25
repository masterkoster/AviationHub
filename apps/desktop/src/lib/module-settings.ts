'use client'

import { Store } from '@tauri-apps/plugin-store'
import { DEFAULT_ENABLED_MODULES } from '@/desktop/lib/module-registry'

const KEY = 'enabled_modules'
const STORE_FILE = 'setup.json'
const REQUIRED_DEFAULT_MODULES = ['fuel-saver', 'route-planner']

async function loadStore(): Promise<Store | null> {
  if (typeof window === 'undefined') return null
  try {
    return await Store.load(STORE_FILE)
  } catch {
    return null
  }
}

export async function getEnabledModules(): Promise<string[]> {
  const store = await loadStore()
  if (store) {
    const val = await store.get<string[]>(KEY)
    if (Array.isArray(val)) {
      const merged = Array.from(new Set([...val, ...REQUIRED_DEFAULT_MODULES]))
      if (merged.length !== val.length) {
        await store.set(KEY, merged)
        await store.save()
      }
      return merged
    }
    await store.set(KEY, DEFAULT_ENABLED_MODULES)
    await store.save()
    return Array.from(new Set([...DEFAULT_ENABLED_MODULES, ...REQUIRED_DEFAULT_MODULES]))
  }

  const local = typeof window !== 'undefined' ? window.localStorage.getItem(KEY) : null
  if (local) {
    try {
      const parsed = JSON.parse(local) as string[]
      if (Array.isArray(parsed)) {
        const merged = Array.from(new Set([...parsed, ...REQUIRED_DEFAULT_MODULES]))
        if (typeof window !== 'undefined' && merged.length !== parsed.length) {
          window.localStorage.setItem(KEY, JSON.stringify(merged))
        }
        return merged
      }
    } catch {
      // ignore
    }
  }
  const defaults = Array.from(new Set([...DEFAULT_ENABLED_MODULES, ...REQUIRED_DEFAULT_MODULES]))
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(KEY, JSON.stringify(defaults))
  }
  return defaults
}

export async function installModule(moduleId: string): Promise<void> {
  const current = await getEnabledModules()
  if (current.includes(moduleId)) return
  const next = [...current, moduleId]

  const store = await loadStore()
  if (store) {
    await store.set(KEY, next)
    await store.save()
  } else if (typeof window !== 'undefined') {
    window.localStorage.setItem(KEY, JSON.stringify(next))
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('desktop-modules-changed'))
  }
}
