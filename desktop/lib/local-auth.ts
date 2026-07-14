'use client'

import Database from '@tauri-apps/plugin-sql'
import { generateMasterKey, wrapMasterKey, bytesToBase64 } from '@/desktop/lib/backup'
import { migrateLocalDb } from '@/desktop/lib/local-migrations'

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
  /** Whether this profile already has a recovery PIN provisioned (hash stored). */
  hasRecoveryPin: boolean
}

export const AVATAR_COLORS = [
  'emerald', 'blue', 'violet', 'amber', 'rose', 'cyan', 'orange', 'pink',
]

function randomColor(): string {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]
}

export async function getDb(): Promise<Database | null> {
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
  let db: Database
  try {
    db = await dbPromise
  } catch (err) {
    console.error('[local-auth] dbPromise rejected:', err)
    dbPromise = null
    return null
  }
  // Canonical local-schema migration runner (see desktop/lib/local-migrations.ts).
  // Memoized internally — cheap to call on every getDb() resolution, and
  // failures are logged/swallowed there rather than surfaced here so a
  // migration hiccup never prevents the app from getting a DB handle.
  await migrateLocalDb(db)
  return db
}

/**
 * Attempt to add a column to the users table if it doesn't exist.
 * SQLite doesn't support IF NOT EXISTS for ALTER TABLE, so we try
 * the ALTER and silently ignore "duplicate column" errors.
 */
async function ensureColumn(db: Database, columnName: string, columnDef: string): Promise<void> {
  try {
    await db.execute(`ALTER TABLE users ADD COLUMN ${columnName} ${columnDef}`)
  } catch {
    // Column already exists — this is fine.
  }
}

export function uuid(): string {
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
export function hashPin(pin: string): string {
  let hash = 0
  const salted = `aviationhub_salt_${pin}_v1`
  for (let i = 0; i < salted.length; i++) {
    const chr = salted.charCodeAt(i)
    hash = ((hash << 5) - hash) + chr
    hash |= 0
  }
  return String(hash)
}

/**
 * Same hashing approach as `hashPin`, but with a distinct salt constant so a
 * recovery PIN and a main PIN that happen to be the same digits never hash
 * to the same value.
 */
export function hashRecoveryPin(pin: string): string {
  let hash = 0
  const salted = `aviationhub_recovery_salt_${pin}_v1`
  for (let i = 0; i < salted.length; i++) {
    const chr = salted.charCodeAt(i)
    hash = ((hash << 5) - hash) + chr
    hash |= 0
  }
  return String(hash)
}

/**
 * Generate a cryptographically random 8-digit recovery PIN. Leading zeros
 * are allowed (always displayed/stored as all 8 digits) so every value in
 * 00000000-99999999 is equally likely.
 */
export function generateRecoveryPinCode(): string {
  const arr = new Uint32Array(1)
  crypto.getRandomValues(arr)
  // Reject values >= the largest multiple of 1e8 below 2^32 to avoid modulo bias.
  const limit = Math.floor(0xffffffff / 1e8) * 1e8
  let value = arr[0]
  while (value >= limit) {
    crypto.getRandomValues(arr)
    value = arr[0]
  }
  const num = value % 100_000_000
  return String(num).padStart(8, '0')
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
    hasRecoveryPin: false,
  }
}

/**
 * Deterministic local row id for a profile linked to a cloud account.
 * MUST stay in sync with normalizeCloudUserId in
 * apps/desktop/src/lib/local-logbook.ts, which lazily creates the same row
 * for cloud sessions — both paths have to converge on one row.
 */
export function cloudLinkedUserId(
  cloudUser: { id?: string; name?: string | null; email?: string | null } | null
): string {
  const raw = cloudUser?.id || cloudUser?.email || 'cloud-user'
  return `cloud-${String(raw).replace(/[^a-zA-Z0-9_-]/g, '_')}`
}

/**
 * Create (or claim) the local device profile linked to a cloud account,
 * protected by a device PIN. If the row already exists (created lazily by
 * local-logbook without a PIN), this sets its PIN and identity fields so the
 * profile shows up on the account tiles and unlocks like any other.
 */
export async function createCloudLinkedLocalUser(
  cloudUser: { id?: string; name?: string | null; email?: string | null },
  pin: string,
  homeAirport?: string
): Promise<LocalUser> {
  const db = await getDb()
  if (!db) throw new Error('Database not available (not in Tauri or plugin failed to load)')

  const id = cloudLinkedUserId(cloudUser)
  const name = cloudUser.name?.trim() || 'Cloud Pilot'
  const email = cloudUser.email?.trim() || null
  const username = email ? email.split('@')[0] : id.slice(0, 24)
  const pinHash = hashPin(pin)
  const avatarColor = randomColor()
  const homeAirportTrim =
    homeAirport && homeAirport.trim().length > 0
      ? homeAirport.trim().toUpperCase()
      : null

  await tryExecute(db, [
    `INSERT INTO users (id, name, email, username, password_hash, pin, avatar_color) VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, email = excluded.email, username = excluded.username, pin = excluded.pin, avatar_color = COALESCE(users.avatar_color, excluded.avatar_color)`,
    `INSERT INTO users (id, name, email, username, password_hash, pin, avatar_color) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, email = excluded.email, username = excluded.username, pin = excluded.pin, avatar_color = COALESCE(users.avatar_color, excluded.avatar_color)`,
  ], [id, name, email, username, 'cloud-linked-account', pinHash, avatarColor])

  // Pilot profile: create only if this user doesn't have one yet.
  const existingProfiles = await trySelect<{ id: string }>(db, [
    `SELECT id FROM pilot_profile WHERE user_id = $1`,
    `SELECT id FROM pilot_profile WHERE user_id = ?`,
  ], [id])
  if (existingProfiles.length === 0) {
    await tryExecute(db, [
      `INSERT INTO pilot_profile (id, user_id, display_id, home_airport) VALUES ($1, $2, $3, $4)`,
      `INSERT INTO pilot_profile (id, user_id, display_id, home_airport) VALUES (?, ?, ?, ?)`,
    ], [uuid(), id, randomDisplayId(), homeAirportTrim])
  }

  const hasRecoveryPin = await hasRecoveryPinProvisioned(id)
  return {
    id,
    name,
    username,
    email,
    homeAirport: homeAirportTrim,
    displayId: null,
    pin: pinHash,
    avatarColor,
    hasRecoveryPin,
  }
}

/**
 * Generate this profile's (immutable) recovery PIN, provision the backup
 * master key + recovery wrap material, and persist everything. Returns the
 * raw recovery PIN — the ONLY time it is ever available in plaintext — so
 * the caller can show it to the user exactly once.
 *
 * Safe to call at most once per profile in practice (the recovery PIN never
 * changes), but if called again it will silently replace the previous
 * recovery PIN/master key — callers should gate on `hasRecoveryPinProvisioned`.
 */
export async function provisionRecoveryPin(userId: string): Promise<string> {
  const db = await getDb()
  if (!db) throw new Error('Database not available (not in Tauri or plugin failed to load)')

  // Ensure the recovery_pin_hash column exists (pre-migration profiles)
  await ensureColumn(db, 'recovery_pin_hash', 'TEXT')
  await ensureColumn(db, 'backup_master_key', 'TEXT')
  await ensureColumn(db, 'recovery_wrap_salt', 'TEXT')
  await ensureColumn(db, 'recovery_wrap_iv', 'TEXT')
  await ensureColumn(db, 'recovery_wrapped_key', 'TEXT')

  const recoveryPin = generateRecoveryPinCode()
  const masterKey = await generateMasterKey()
  const { salt, iv, wrapped } = await wrapMasterKey(masterKey, recoveryPin)

  await tryExecute(db, [
    `UPDATE users SET recovery_pin_hash = $1, backup_master_key = $2, recovery_wrap_salt = $3, recovery_wrap_iv = $4, recovery_wrapped_key = $5 WHERE id = $6`,
    `UPDATE users SET recovery_pin_hash = ?, backup_master_key = ?, recovery_wrap_salt = ?, recovery_wrap_iv = ?, recovery_wrapped_key = ? WHERE id = ?`,
  ], [
    hashRecoveryPin(recoveryPin),
    bytesToBase64(masterKey),
    bytesToBase64(salt),
    bytesToBase64(iv),
    bytesToBase64(wrapped),
    userId,
  ])

  return recoveryPin
}

/** Whether a profile already has recovery-PIN material provisioned. */
export async function hasRecoveryPinProvisioned(userId: string): Promise<boolean> {
  const db = await getDb()
  if (!db) return false
  try {
    // Ensure recovery_pin_hash column exists (pre-migration profiles)
    await ensureColumn(db, 'recovery_pin_hash', 'TEXT')
    const rows = await trySelect<{ recovery_pin_hash: string | null }>(db, [
      `SELECT recovery_pin_hash FROM users WHERE id = $1`,
      `SELECT recovery_pin_hash FROM users WHERE id = ?`,
    ], [userId])
    return Boolean(rows[0]?.recovery_pin_hash)
  } catch (err) {
    console.error('[local-auth] hasRecoveryPinProvisioned failed:', err)
    return false
  }
}

/** Get a local user by id. */
export async function getLocalUser(userId: string): Promise<LocalUser | null> {
  const db = await getDb()
  if (!db) return null
  try {
    // Ensure recovery_pin_hash column exists (pre-migration profiles)
    await ensureColumn(db, 'recovery_pin_hash', 'TEXT')
    const rows = await trySelect<{
      id: string; name: string; username: string | null; email: string | null; pin: string | null; avatar_color: string | null
      recovery_pin_hash: string | null
    }>(db, [
      `SELECT id, name, username, email, pin, avatar_color, recovery_pin_hash FROM users WHERE id = $1`,
      `SELECT id, name, username, email, pin, avatar_color, recovery_pin_hash FROM users WHERE id = ?`,
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
      hasRecoveryPin: Boolean(u.recovery_pin_hash),
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
    // Ensure recovery_pin_hash column exists (pre-migration profiles)
    await ensureColumn(db, 'recovery_pin_hash', 'TEXT')
    const rows = await trySelect<{
      id: string; name: string; username: string | null; email: string | null; pin: string | null; avatar_color: string | null
      recovery_pin_hash: string | null
    }>(db, [
      `SELECT id, name, username, email, pin, avatar_color, recovery_pin_hash FROM users ORDER BY name COLLATE NOCASE ASC`,
      `SELECT id, name, username, email, pin, avatar_color, recovery_pin_hash FROM users ORDER BY name COLLATE NOCASE ASC`,
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
        hasRecoveryPin: Boolean(u.recovery_pin_hash),
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
  updates: { name?: string; homeAirport?: string; pin?: string; avatarColor?: string }
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
    if (updates.avatarColor !== undefined) {
      await tryExecute(db, [
        `UPDATE users SET avatar_color = $1 WHERE id = $2`,
        `UPDATE users SET avatar_color = ? WHERE id = ?`,
      ], [updates.avatarColor, userId])
    }
  } catch (err) {
    console.error('[local-auth] updateLocalUser failed:', err)
  }
}

/** Delete a local user and all their data (cascade). */
export async function deleteLocalUser(userId: string): Promise<void> {
  const db = await getDb()
  if (!db) throw new Error('Database not available')

  // Clean up any document files from disk first
  try {
    const docRows = await trySelect<{ storage_path: string }>(db, [
      `SELECT storage_path FROM document_attachments WHERE user_id = $1`,
      `SELECT storage_path FROM document_attachments WHERE user_id = ?`,
    ], [userId])
    for (const row of docRows) {
      try {
        const { remove } = await import('@tauri-apps/plugin-fs')
        await remove(row.storage_path)
      } catch { /* file may not exist */ }
    }
  } catch { /* table may not exist yet */ }

  const tables = [
    'logbook_entry_history',
    'logbook_entries',
    'logbook_starting_totals',
    'aircraft',
    'currency_rules',
    'document_attachments',
    'pilot_profile',
  ]

  for (const table of tables) {
    try {
      await tryExecute(db, [
        `DELETE FROM ${table} WHERE user_id = $1`,
        `DELETE FROM ${table} WHERE user_id = ?`,
      ], [userId])
    } catch { /* table may not exist */ }
  }

  await tryExecute(db, [
    `DELETE FROM users WHERE id = $1`,
    `DELETE FROM users WHERE id = ?`,
  ], [userId])
}