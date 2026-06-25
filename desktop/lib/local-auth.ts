'use client'

import Database from '@tauri-apps/plugin-sql'

let dbPromise: Promise<Database> | null = null

export interface LocalUser {
  id: string
  name: string
  username: string | null
  email: string | null
  homeAirport: string | null
  displayId: string | null
  pin: string | null
  avatarColor: string
}

const AVATAR_COLORS = [
  'emerald', 'blue', 'violet', 'amber', 'rose', 'cyan', 'orange', 'pink',
]

function randomColor(): string {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]
}

async function getDb(): Promise<Database | null> {
  if (typeof window === 'undefined') return null
  if (!dbPromise) {
    try {
      dbPromise = Database.load('sqlite:aviationhub.db')
    } catch (err) {
      console.error('[local-auth] Database.load threw:', err)
      dbPromise = null
      return null
    }
  }
  try {
    return await dbPromise
  } catch (err) {
    console.error('[local-auth] dbPromise rejected:', err)
    dbPromise = null
    return null
  }
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function randomUsername(): string {
  const suffix = Math.random().toString(36).slice(2, 10)
  return `local_${suffix}`
}

function randomDisplayId(): string {
  const hex = Array.from({ length: 4 }, () =>
    Math.floor(Math.random() * 256).toString(16).padStart(2, '0')
  ).join('').toUpperCase()
  return `LOG-${hex}`
}

/** Simple hash for PIN (not bcrypt — PINs are 4-8 digits, stored as simple hash). */
function hashPin(pin: string): string {
  let hash = 0
  const salted = `aviationhub_salt_${pin}_v1`
  for (let i = 0; i < salted.length; i++) {
    const chr = salted.charCodeAt(i)
    hash = ((hash << 5) - hash) + chr
    hash |= 0
  }
  return String(hash)
}

export async function diagnoseTauri(): Promise<string> {
  if (typeof window === 'undefined') return 'window undefined (SSR)'
  const w = window as unknown as Record<string, unknown>
  const parts: string[] = []
  if (w.__TAURI__) {
    parts.push('__TAURI__ present ✓')
    parts.push('keys: ' + Object.keys(w.__TAURI__ as object).join(', '))
  } else {
    parts.push('__TAURI__ NOT present')
  }
  if (w.__TAURI_INTERNALS__) {
    parts.push('__TAURI_INTERNALS__ present ✓')
  } else {
    parts.push('__TAURI_INTERNALS__ NOT present')
  }
  // Try to actually load the store
  try {
    const { Store } = await import('@tauri-apps/plugin-store')
    const store = await Store.load('setup.json')
    const entries = await store.entries()
    parts.push(`Store test: OK — ${entries.length} entries`)
  } catch (err) {
    parts.push(`Store test: FAILED — ${err instanceof Error ? err.message : String(err)}`)
  }
  return parts.join('\n')
}

// Try $1 style first (sqlx default), fall back to ? style
async function tryExecute(db: Database, sqls: string[], params: unknown[]): Promise<void> {
  let lastErr: unknown = null
  for (const sql of sqls) {
    try {
      await db.execute(sql, params)
      return
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr
}

async function trySelect<T>(db: Database, sqls: string[], params: unknown[]): Promise<T[]> {
  let lastErr: unknown = null
  for (const sql of sqls) {
    try {
      return await db.select<T[]>(sql, params)
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr
}

/**
 * Create a local (offline) user with name + PIN + optional home airport.
 */
export async function createLocalUser(
  name: string,
  pin: string,
  homeAirport?: string
): Promise<LocalUser> {
  const db = await getDb()
  if (!db) throw new Error('Database not available (not in Tauri or plugin failed to load)')

  const id = uuid()
  const username = randomUsername()
  const displayId = randomDisplayId()
  const profileId = uuid()
  const pinHash = hashPin(pin)
  const avatarColor = randomColor()
  const homeAirportTrim =
    homeAirport && homeAirport.trim().length > 0
      ? homeAirport.trim().toUpperCase()
      : null

  // Insert user with PIN + avatar_color
  await tryExecute(db, [
    `INSERT INTO users (id, name, email, username, password_hash, pin, avatar_color) VALUES ($1, $2, NULL, $3, $4, $5, $6)`,
    `INSERT INTO users (id, name, email, username, password_hash, pin, avatar_color) VALUES (?, ?, NULL, ?, ?, ?, ?)`,
  ], [id, name.trim(), username, 'local-no-auth', pinHash, avatarColor])

  // Insert pilot profile
  await tryExecute(db, [
    `INSERT INTO pilot_profile (id, user_id, display_id, home_airport) VALUES ($1, $2, $3, $4)`,
    `INSERT INTO pilot_profile (id, user_id, display_id, home_airport) VALUES (?, ?, ?, ?)`,
  ], [profileId, id, displayId, homeAirportTrim])

  return {
    id,
    name: name.trim(),
    username,
    email: null,
    homeAirport: homeAirportTrim,
    displayId,
    pin: pinHash,
    avatarColor,
  }
}

/** Get a local user by id. */
export async function getLocalUser(userId: string): Promise<LocalUser | null> {
  const db = await getDb()
  if (!db) return null
  try {
    const rows = await trySelect<{
      id: string; name: string; username: string | null; email: string | null; pin: string | null; avatar_color: string | null
    }>(db, [
      `SELECT id, name, username, email, pin, avatar_color FROM users WHERE id = $1`,
      `SELECT id, name, username, email, pin, avatar_color FROM users WHERE id = ?`,
    ], [userId])
    if (rows.length === 0) return null
    const u = rows[0]

    const profileRows = await trySelect<{ display_id: string | null; home_airport: string | null }>(db, [
      `SELECT display_id, home_airport FROM pilot_profile WHERE user_id = $1 LIMIT 1`,
      `SELECT display_id, home_airport FROM pilot_profile WHERE user_id = ? LIMIT 1`,
    ], [userId])

    return {
      id: u.id,
      name: u.name,
      username: u.username,
      email: u.email,
      homeAirport: profileRows[0]?.home_airport ?? null,
      displayId: profileRows[0]?.display_id ?? null,
      pin: u.pin,
      avatarColor: u.avatar_color ?? 'emerald',
    }
  } catch (err) {
    console.error('[local-auth] getLocalUser failed:', err)
    return null
  }
}

/** Get all local users (for account selection tiles). */
export async function getAllLocalUsers(): Promise<LocalUser[]> {
  const db = await getDb()
  if (!db) return []
  try {
    const rows = await trySelect<{
      id: string; name: string; username: string | null; email: string | null; pin: string | null; avatar_color: string | null
    }>(db, [
      `SELECT id, name, username, email, pin, avatar_color FROM users ORDER BY name COLLATE NOCASE ASC`,
      `SELECT id, name, username, email, pin, avatar_color FROM users ORDER BY name COLLATE NOCASE ASC`,
    ], [])

    // Fetch profiles in bulk
    const users: LocalUser[] = []
    for (const u of rows) {
      let homeAirport: string | null = null
      let displayId: string | null = null
      try {
        const p = await trySelect<{ home_airport: string | null; display_id: string | null }>(db, [
          `SELECT home_airport, display_id FROM pilot_profile WHERE user_id = $1 LIMIT 1`,
          `SELECT home_airport, display_id FROM pilot_profile WHERE user_id = ? LIMIT 1`,
        ], [u.id])
        homeAirport = p[0]?.home_airport ?? null
        displayId = p[0]?.display_id ?? null
      } catch { /* ignore profile errors */ }

      users.push({
        id: u.id,
        name: u.name,
        username: u.username,
        email: u.email,
        homeAirport,
        displayId,
        pin: u.pin,
        avatarColor: u.avatar_color ?? 'emerald',
      })
    }
    return users
  } catch (err) {
    console.error('[local-auth] getAllLocalUsers failed:', err)
    return []
  }
}

/** Verify a PIN for a local user. Returns true if correct. */
export async function verifyPin(userId: string, pin: string): Promise<boolean> {
  const db = await getDb()
  if (!db) return false
  try {
    const rows = await trySelect<{ pin: string | null }>(db, [
      `SELECT pin FROM users WHERE id = $1`,
      `SELECT pin FROM users WHERE id = ?`,
    ], [userId])
    if (rows.length === 0) return false
    const storedHash = rows[0].pin
    if (!storedHash) return false // no PIN set
    return storedHash === hashPin(pin)
  } catch (err) {
    console.error('[local-auth] verifyPin failed:', err)
    return false
  }
}

/** Update local user profile. */
export async function updateLocalUser(
  userId: string,
  updates: { name?: string; homeAirport?: string; pin?: string }
): Promise<void> {
  const db = await getDb()
  if (!db) return
  try {
    if (updates.name !== undefined) {
      await tryExecute(db, [
        `UPDATE users SET name = $1 WHERE id = $2`,
        `UPDATE users SET name = ? WHERE id = ?`,
      ], [updates.name.trim(), userId])
    }
    if (updates.pin !== undefined) {
      await tryExecute(db, [
        `UPDATE users SET pin = $1 WHERE id = $2`,
        `UPDATE users SET pin = ? WHERE id = ?`,
      ], [hashPin(updates.pin), userId])
    }
    if (updates.homeAirport !== undefined) {
      const ha = updates.homeAirport.trim().toUpperCase() || null
      await tryExecute(db, [
        `INSERT INTO pilot_profile (id, user_id, display_id, home_airport) VALUES ($1, $2, $3, $4) ON CONFLICT(user_id) DO UPDATE SET home_airport = excluded.home_airport`,
        `INSERT INTO pilot_profile (id, user_id, display_id, home_airport) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET home_airport = excluded.home_airport`,
      ], [uuid(), userId, randomDisplayId(), ha])
    }
  } catch (err) {
    console.error('[local-auth] updateLocalUser failed:', err)
  }
}