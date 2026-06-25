'use client'

import { Store } from '@tauri-apps/plugin-store'

export interface StoredRouteWaypoint {
  id: string
  icao: string
  name: string
  latitude: number
  longitude: number
}

export interface StoredRoute {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  waypoints: StoredRouteWaypoint[]
}

const STORE_FILE = 'setup.json'
const KEY = 'route_planner.saved_routes'

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`
}

async function loadStore(): Promise<Store | null> {
  if (typeof window === 'undefined') return null
  try {
    return await Store.load(STORE_FILE)
  } catch {
    return null
  }
}

function sortRoutes(routes: StoredRoute[]): StoredRoute[] {
  return [...routes].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

export async function getSavedRoutes(): Promise<StoredRoute[]> {
  const store = await loadStore()
  if (store) {
    const data = await store.get<StoredRoute[]>(KEY)
    return sortRoutes(Array.isArray(data) ? data : [])
  }

  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(KEY)
      const parsed = raw ? (JSON.parse(raw) as StoredRoute[]) : []
      return sortRoutes(Array.isArray(parsed) ? parsed : [])
    } catch {
      return []
    }
  }

  return []
}

async function writeSavedRoutes(routes: StoredRoute[]): Promise<void> {
  const sorted = sortRoutes(routes)
  const store = await loadStore()
  if (store) {
    await store.set(KEY, sorted)
    await store.save()
  } else if (typeof window !== 'undefined') {
    window.localStorage.setItem(KEY, JSON.stringify(sorted))
  }
}

export async function saveRoute(name: string, waypoints: StoredRouteWaypoint[], routeId?: string): Promise<StoredRoute> {
  const routes = await getSavedRoutes()
  const now = new Date().toISOString()

  const existing = routeId ? routes.find((r) => r.id === routeId) : undefined
  const record: StoredRoute = existing
    ? {
        ...existing,
        name: name.trim() || existing.name,
        waypoints,
        updatedAt: now,
      }
    : {
        id: uid(),
        name: name.trim() || `Route ${routes.length + 1}`,
        createdAt: now,
        updatedAt: now,
        waypoints,
      }

  const next = existing ? routes.map((r) => (r.id === record.id ? record : r)) : [record, ...routes]
  await writeSavedRoutes(next)
  return record
}

export async function deleteRoute(routeId: string): Promise<void> {
  const routes = await getSavedRoutes()
  await writeSavedRoutes(routes.filter((r) => r.id !== routeId))
}

export async function duplicateRoute(routeId: string): Promise<StoredRoute | null> {
  const routes = await getSavedRoutes()
  const src = routes.find((r) => r.id === routeId)
  if (!src) return null
  const now = new Date().toISOString()
  const copy: StoredRoute = {
    ...src,
    id: uid(),
    name: `${src.name} (Copy)`,
    createdAt: now,
    updatedAt: now,
  }
  await writeSavedRoutes([copy, ...routes])
  return copy
}
