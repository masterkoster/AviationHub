'use client'

/**
 * Export/Import layer for AviationHub local user data.
 *
 * Flow:
 *   EXPORT: gather all user rows from SQLite → serialize to JSON →
 *           encrypt with PIN-derived key → save .ahb file via Tauri dialog
 *
 *   IMPORT: read .ahb file → decrypt with PIN → parse JSON →
 *           insert rows into SQLite (upsert) → optionally log in as that user
 *
 * Crypto:
 *   - PBKDF2 (100k iterations, SHA-256) derives a 256-bit AES key from the
 *     user's PIN + a random salt embedded in the file header
 *   - AES-GCM encrypts the JSON payload (authenticated encryption — tamper-proof)
 *   - This is "good enough" for protecting a logbook from casual theft. It is
 *     NOT military-grade — a determined attacker with the file + brute-force
 *     could eventually crack a 4-digit PIN. For a 6-8 digit PIN it's much
 *     harder. Users who want stronger protection should use a longer PIN.
 *
 * File format (.ahb):
 *   [12-byte salt][12-byte IV][ciphertext...]
 *   The salt + IV are plaintext (needed to derive key + decrypt).
 *   Everything after is AES-GCM encrypted JSON.
 *
 * Legal note: FAA logbook rules (14 CFR §61.51) require accurate records but
 * do not mandate encryption. This encryption is a privacy measure, not a
 * regulatory one. The exported data is the user's own — they can always
 * export to plain CSV from the Profile page too (unencrypted, for FAA
 * audit purposes).
 */

const PBKDF2_ITERATIONS = 100_000
const SALT_LENGTH = 12 // bytes — random per export, stored in file header
const IV_LENGTH = 12 // bytes — AES-GCM standard IV length
const KEY_LENGTH = 256 // bits — AES-256

/** Magic bytes at the start of every .ahb file (for format identification). */
const MAGIC = new Uint8Array([0x41, 0x48, 0x42]) // "AHB"
const VERSION = 1

/** Shape of the decrypted JSON payload inside an .ahb file. */
export interface BackupPayload {
  version: number
  exportedAt: string // ISO timestamp
  appVersion: string
  user: {
    id: string
    name: string
    username: string | null
    email: string | null
    avatarColor: string
    pin: string | null // hashed PIN (so import can verify / keep it)
  }
  pilotProfile: {
    id: string
    displayId: string | null
    homeAirport: string | null
  } | null
  logbookEntries: Array<Record<string, unknown>>
  aircraft: Array<Record<string, unknown>>
  logbookStartingTotals: Array<Record<string, unknown>>
  logbookEntryHistory: Array<Record<string, unknown>>
  currencyRules: Array<Record<string, unknown>>
}

// ── Crypto helpers ──

async function deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  )
}

async function encryptData(pin: string, data: BackupPayload): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const key = await deriveKey(pin, salt)

  const enc = new TextEncoder()
  const plaintext = enc.encode(JSON.stringify(data))

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    plaintext as BufferSource
  )

  // Assemble file: [MAGIC(3)][VERSION(1)][salt(12)][IV(12)][ciphertext]
  const header = new Uint8Array(MAGIC.length + 1 + SALT_LENGTH + IV_LENGTH)
  header.set(MAGIC, 0)
  header[3] = VERSION
  header.set(salt, 4)
  header.set(iv, 4 + SALT_LENGTH)

  const cipherBytes = new Uint8Array(ciphertext)
  const result = new Uint8Array(header.length + cipherBytes.length)
  result.set(header, 0)
  result.set(cipherBytes, header.length)
  return result
}

async function decryptData(pin: string, fileBytes: Uint8Array): Promise<BackupPayload> {
  // Verify magic
  for (let i = 0; i < MAGIC.length; i++) {
    if (fileBytes[i] !== MAGIC[i]) throw new Error('Not a valid AviationHub backup file (.ahb)')
  }
  const version = fileBytes[3]
  if (version !== VERSION) throw new Error(`Unsupported backup version ${version}`)

  const salt = fileBytes.slice(4, 4 + SALT_LENGTH)
  const iv = fileBytes.slice(4 + SALT_LENGTH, 4 + SALT_LENGTH + IV_LENGTH)
  const ciphertext = fileBytes.slice(4 + SALT_LENGTH + IV_LENGTH)

  const key = await deriveKey(pin, salt)
  let plaintext: ArrayBuffer
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      ciphertext as BufferSource
    )
  } catch {
    throw new Error('Incorrect PIN or corrupted file')
  }

  const dec = new TextDecoder()
  return JSON.parse(dec.decode(plaintext)) as BackupPayload
}

// ── Export ──

export interface ExportResult {
  success: boolean
  fileName: string
  error?: string
}

/**
 * Export all data for a given user ID to a PIN-encrypted .ahb file.
 * Uses Tauri's save dialog to let the user pick the destination.
 */
export async function exportUserData(userId: string, pin: string): Promise<ExportResult> {
  try {
    // Load data from SQLite (reuse the same connection as local-auth)
    const Database = (await import('@tauri-apps/plugin-sql')).default
    const db = await Database.load('sqlite:aviationhub.db')

    // Gather all rows for this user across all tables
    const trySel = async <T,>(sqls: string[], params: unknown[]): Promise<T[]> => {
      for (const sql of sqls) {
        try { return await db.select<T[]>(sql, params) } catch { /* try next */ }
      }
      return []
    }

    const [userRows, profileRows, aircraftRows, logbookRows, totalsRows, historyRows, currencyRows] = await Promise.all([
      trySel<{ id: string; name: string; username: string | null; email: string | null; pin: string | null; avatar_color: string | null }>([
        `SELECT id, name, username, email, pin, avatar_color FROM users WHERE id = $1`,
        `SELECT id, name, username, email, pin, avatar_color FROM users WHERE id = ?`,
      ], [userId]),
      trySel<{ id: string; display_id: string | null; home_airport: string | null }>([
        `SELECT id, display_id, home_airport FROM pilot_profile WHERE user_id = $1 LIMIT 1`,
        `SELECT id, display_id, home_airport FROM pilot_profile WHERE user_id = ? LIMIT 1`,
      ], [userId]),
      trySel<Record<string, unknown>>([
        `SELECT * FROM aircraft WHERE user_id = $1`,
        `SELECT * FROM aircraft WHERE user_id = ?`,
      ], [userId]),
      trySel<Record<string, unknown>>([
        `SELECT * FROM logbook_entries WHERE user_id = $1 AND is_voided = 0`,
        `SELECT * FROM logbook_entries WHERE user_id = ? AND is_voided = 0`,
      ], [userId]),
      trySel<Record<string, unknown>>([
        `SELECT * FROM logbook_starting_totals WHERE user_id = $1`,
        `SELECT * FROM logbook_starting_totals WHERE user_id = ?`,
      ], [userId]),
      trySel<Record<string, unknown>>([
        `SELECT * FROM logbook_entry_history WHERE entry_id IN (SELECT id FROM logbook_entries WHERE user_id = $1)`,
        `SELECT * FROM logbook_entry_history WHERE entry_id IN (SELECT id FROM logbook_entries WHERE user_id = ?)`,
      ], [userId]),
      trySel<Record<string, unknown>>([
        `SELECT * FROM currency_rules WHERE user_id = $1`,
        `SELECT * FROM currency_rules WHERE user_id = ?`,
      ], [userId]),
    ])

    if (userRows.length === 0) throw new Error('User not found')
    const u = userRows[0]

    const payload: BackupPayload = {
      version: VERSION,
      exportedAt: new Date().toISOString(),
      appVersion: '1.0.0',
      user: {
        id: u.id,
        name: u.name,
        username: u.username,
        email: u.email,
        avatarColor: u.avatar_color ?? 'emerald',
        pin: u.pin,
      },
      pilotProfile: profileRows[0] ? {
        id: profileRows[0].id,
        displayId: profileRows[0].display_id,
        homeAirport: profileRows[0].home_airport,
      } : null,
      logbookEntries: logbookRows,
      aircraft: aircraftRows,
      logbookStartingTotals: totalsRows,
      logbookEntryHistory: historyRows,
      currencyRules: currencyRows,
    }

    // Encrypt
    const encryptedBytes = await encryptData(pin, payload)

    // Save via Tauri file dialog
    const { save } = await import('@tauri-apps/plugin-dialog')
    const fileName = `aviationhub-backup-${u.name.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.ahb`
    const filePath = await save({
      defaultPath: fileName,
      filters: [{ name: 'AviationHub Backup', extensions: ['ahb'] }],
    })
    if (!filePath) return { success: false, fileName, error: 'Cancelled' }

    // Write the file — Tauri's writeFile accepts Uint8Array
    const { writeFile } = await import('@tauri-apps/plugin-fs')
    await writeFile(filePath, encryptedBytes)

    return { success: true, fileName: filePath }
  } catch (err) {
    console.error('[export] failed:', err)
    return {
      success: false,
      fileName: '',
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ── Import ──

export interface ImportResult {
  success: boolean
  userName: string
  userId: string
  flightsImported: number
  aircraftImported: number
  error?: string
}

/**
 * Decrypt + load a backup file into SQLite.
 * Returns the user ID so the caller can log them in.
 */
export async function importUserData(fileBytes: Uint8Array, pin: string): Promise<ImportResult> {
  try {
    const payload = await decryptData(pin, fileBytes)

    const Database = (await import('@tauri-apps/plugin-sql')).default
    const db = await Database.load('sqlite:aviationhub.db')

    const tryExec = async (sqls: string[], params: unknown[]): Promise<void> => {
      for (const sql of sqls) {
        try { await db.execute(sql, params); return } catch { /* try next */ }
      }
    }

    // Upsert user (use their existing ID)
    await tryExec([
      `INSERT INTO users (id, name, email, username, password_hash, pin, avatar_color)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, email = excluded.email, pin = excluded.pin, avatar_color = excluded.avatar_color`,
      `INSERT INTO users (id, name, email, username, password_hash, pin, avatar_color)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, email = excluded.email, pin = excluded.pin, avatar_color = excluded.avatar_color`,
    ], [payload.user.id, payload.user.name, payload.user.email, payload.user.username, 'local-no-auth', payload.user.pin, payload.user.avatarColor])

    // Upsert pilot profile
    if (payload.pilotProfile) {
      await tryExec([
        `INSERT INTO pilot_profile (id, user_id, display_id, home_airport)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT(user_id) DO UPDATE SET display_id = excluded.display_id, home_airport = excluded.home_airport`,
        `INSERT INTO pilot_profile (id, user_id, display_id, home_airport)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET display_id = excluded.display_id, home_airport = excluded.home_airport`,
      ], [payload.pilotProfile.id, payload.user.id, payload.pilotProfile.displayId, payload.pilotProfile.homeAirport])
    }

    // Insert aircraft (upsert by id)
    for (const ac of payload.aircraft) {
      const cols = Object.keys(ac)
      const vals = Object.values(ac)
      const placeholders1 = vals.map((_, i) => `$${i + 1}`).join(', ')
      const placeholders2 = vals.map((_, i) => `?`).join(', ')
      try {
        await tryExec([
          `INSERT OR REPLACE INTO aircraft (${cols.join(', ')}) VALUES (${placeholders1})`,
          `INSERT OR REPLACE INTO aircraft (${cols.join(', ')}) VALUES (${placeholders2})`,
        ], vals)
      } catch { /* skip if schema mismatch */ }
    }

    // Insert logbook entries (upsert by id)
    for (const entry of payload.logbookEntries) {
      const cols = Object.keys(entry)
      const vals = Object.values(entry)
      const placeholders1 = vals.map((_, i) => `$${i + 1}`).join(', ')
      const placeholders2 = vals.map((_, i) => `?`).join(', ')
      try {
        await tryExec([
          `INSERT OR REPLACE INTO logbook_entries (${cols.join(', ')}) VALUES (${placeholders1})`,
          `INSERT OR REPLACE INTO logbook_entries (${cols.join(', ')}) VALUES (${placeholders2})`,
        ], vals)
      } catch { /* skip */ }
    }

    return {
      success: true,
      userName: payload.user.name,
      userId: payload.user.id,
      flightsImported: payload.logbookEntries.length,
      aircraftImported: payload.aircraft.length,
    }
  } catch (err) {
    console.error('[import] failed:', err)
    return {
      success: false,
      userName: '',
      userId: '',
      flightsImported: 0,
      aircraftImported: 0,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/** Verify a backup file's PIN without loading data — used for the "verify before import" UI. */
export async function verifyBackupPin(fileBytes: Uint8Array, pin: string): Promise<{ valid: boolean; userName: string | null }> {
  try {
    const payload = await decryptData(pin, fileBytes)
    return { valid: true, userName: payload.user.name }
  } catch {
    return { valid: false, userName: null }
  }
}
