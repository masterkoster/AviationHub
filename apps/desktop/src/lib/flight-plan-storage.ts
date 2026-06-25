'use client'

import { Store } from '@tauri-apps/plugin-store'

export interface StoredFlightPlan {
  id: string
  name: string
  callsign: string
  pilotName: string
  aircraftName: string
  departureAt: string
  cruiseAltFt: number
  soulsOnBoard: number
  alternateIcao: string
  remarks: string
  fuelPercent: number
  waypoints: Array<{ icao: string; name: string }>
  createdAt: string
  updatedAt: string
}

const STORE_FILE = 'setup.json'
const KEY = 'flight_plans.saved'

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

function sortPlans(plans: StoredFlightPlan[]): StoredFlightPlan[] {
  return [...plans].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

export async function getSavedFlightPlans(): Promise<StoredFlightPlan[]> {
  const store = await loadStore()
  if (store) {
    const data = await store.get<StoredFlightPlan[]>(KEY)
    return sortPlans(Array.isArray(data) ? data : [])
  }
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(KEY)
      const parsed = raw ? (JSON.parse(raw) as StoredFlightPlan[]) : []
      return sortPlans(Array.isArray(parsed) ? parsed : [])
    } catch {
      return []
    }
  }
  return []
}

async function writePlans(plans: StoredFlightPlan[]): Promise<void> {
  const sorted = sortPlans(plans)
  const store = await loadStore()
  if (store) {
    await store.set(KEY, sorted)
    await store.save()
  } else if (typeof window !== 'undefined') {
    window.localStorage.setItem(KEY, JSON.stringify(sorted))
  }
}

export async function saveFlightPlan(plan: Omit<StoredFlightPlan, 'id' | 'createdAt' | 'updatedAt'>): Promise<StoredFlightPlan> {
  const plans = await getSavedFlightPlans()
  const now = new Date().toISOString()
  const record: StoredFlightPlan = {
    ...plan,
    id: uid(),
    createdAt: now,
    updatedAt: now,
  }
  await writePlans([record, ...plans])
  return record
}
