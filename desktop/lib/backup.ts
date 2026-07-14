'use client'

/**
 * Export/Import layer for AviationHub local user data.
 *
 * Flow:
 *   EXPORT: gather all user rows from SQLite → serialize to JSON →
 *           encrypt with a per-profile master key → wrap that master key
 *           under BOTH the main PIN and the recovery PIN → save .ahb file
 *           via Tauri dialog
 *
 *   IMPORT: read .ahb file → try unwrapping the master key with whichever
 *           PIN the user typed (main or recovery) → decrypt JSON → insert
 *           rows into SQLite (upsert) → optionally log in as that user
 *
 * ── File format v2 (current) ──────────────────────────────────────────────
 *
 * Every backup now protects its data with a random 32-byte "master key"
 * instead of encrypting directly with a PIN-derived key. The master key is
 * generated once per local profile (see `desktop/lib/local-auth.ts`,
 * `provisionRecoveryPin`) and persisted locally alongside the profile's PIN
 * hash — the same trust boundary the app already relies on for `users.pin`.
 * That master key is then wrapped ("key-wrapped", i.e. encrypted) twice:
 *
 *   - once with a key derived (PBKDF2) from the user's current **main PIN**
 *     (re-wrapped fresh on every export, since the main PIN can change)
 *   - once with a key derived from the profile's **recovery PIN** (wrapped
 *     once, at recovery-PIN-creation time, and stored in SQLite — see
 *     `local-auth.ts` — because the raw recovery PIN is only ever known at
 *     the moment it is generated and shown to the user)
 *
 * This lets `importUserData` accept *either* PIN: it tries to unwrap the
 * main-PIN-wrapped copy first, then the recovery-PIN-wrapped copy, and uses
 * whichever succeeds to recover the master key, which then decrypts the
 * payload. Neither wrap reveals anything about the other.
 *
 * Byte layout (all lengths fixed, no length-prefixes needed):
 *
 *   [0]   MAGIC                    3 bytes   "AHB"
 *   [3]   VERSION                  1 byte    0x02
 *   [4]   mainWrapSalt             16 bytes  PBKDF2 salt for main-PIN key
 *   [20]  mainWrapIv               12 bytes  AES-GCM IV for main-PIN wrap
 *   [32]  mainWrappedKey           48 bytes  master key encrypted w/ main-PIN key (32 + 16-byte GCM tag)
 *   [80]  recoveryWrapSalt         16 bytes  PBKDF2 salt for recovery-PIN key
 *   [96]  recoveryWrapIv           12 bytes  AES-GCM IV for recovery-PIN wrap
 *   [108] recoveryWrappedKey       48 bytes  master key encrypted w/ recovery-PIN key
 *   [156] payloadIv                12 bytes  AES-GCM IV for the JSON payload
 *   [168] ciphertext               ...       AES-256-GCM(payload JSON, master key, payloadIv)
 *
 * ── Backward compatibility (file format v1) ───────────────────────────────
 *
 * Older backups have VERSION = 0x01 and the original, simpler layout:
 *
 *   [0] MAGIC(3) [3] VERSION=1(1) [4] salt(12) [16] iv(12) [28] ciphertext...
 *
 * where the AES-256 key is derived directly from the main PIN (no master
 * key, no recovery wrap). `importUserData` detects the version byte and
 * routes to the matching decode path automatically — v1 files still import
 * with exactly the main PIN, as before. There is no way to import a v1 file
 * with a recovery PIN, since v1 files predate the recovery PIN feature.
 *
 * Crypto:
 *   - PBKDF2 (100k iterations, SHA-256) derives 256-bit AES keys from PINs
 *   - AES-256-GCM for both key-wrapping and payload encryption (authenticated
 *     — tamper-proof)
 *   - This is "good enough" for protecting a logbook from casual theft. It is
 *     NOT military-grade — a determined attacker with the file + brute-force
 *     could eventually crack a 4-digit PIN. For a 6-8 digit PIN it's much
 *     harder. Users who want stronger protection should use a longer PIN.
 *
 * Legal note: FAA logbook rules (14 CFR §61.51) require accurate records but
 * do not mandate encryption. This encryption is a privacy measure, not a
 * regulatory one. The exported data is the user's own — they can always
 * export to plain CSV from the Profile page too (unencrypted, for FAA
 * audit purposes).
 */

const PBKDF2_ITERATIONS = 100_000
const KEY_LENGTH = 256 // bits — AES-256
const MASTER_KEY_LENGTH = 32 // bytes — AES-256 master key
const GCM_TAG_LENGTH = 16 // bytes — AES-GCM authentication tag, appended to ciphertext by WebCrypto
const WRAPPED_KEY_LENGTH = MASTER_KEY_LENGTH + GCM_TAG_LENGTH // 48 bytes

// v2 wrap parameters
const WRAP_SALT_LENGTH = 16 // bytes — PBKDF2 salt for each key-wrap
const IV_LENGTH = 12 // bytes — AES-GCM standard IV length (used for wraps + payload)

// v1 (legacy) parameters — kept only for decoding old files
const V1_SALT_LENGTH = 12
const V1_IV_LENGTH = 12

/** Magic bytes at the start of every .ahb file (for format identification). */
const MAGIC = new Uint8Array([0x41, 0x48, 0x42]) // "AHB"
const CONTAINER_VERSION_V1 = 1
const CONTAINER_VERSION_V2 = 2

/** Schema version of the JSON payload itself (unrelated to container version above). */
const PAYLOAD_VERSION = 1

const HEADER_LENGTH_V2 =
  MAGIC.length + 1 + (WRAP_SALT_LENGTH + IV_LENGTH + WRAPPED_KEY_LENGTH) * 2 + IV_LENGTH // = 168

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
  documents: Array<Record<string, unknown>>
}

// ── Base64 helpers (for storing binary key material in TEXT columns) ──

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// ── Crypto helpers ──

/** Derive a 256-bit AES-GCM key from a PIN (or any passphrase) + salt via PBKDF2. */
async function deriveWrapKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
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

/** Generate a fresh random 32-byte master key for a profile's backups. */
export async function generateMasterKey(): Promise<Uint8Array> {
  return crypto.getRandomValues(new Uint8Array(MASTER_KEY_LENGTH))
}

/** Wrap (encrypt) a master key under a PIN-derived key. Fresh salt + IV each call. */
export async function wrapMasterKey(
  masterKey: Uint8Array,
  pin: string
): Promise<{ salt: Uint8Array; iv: Uint8Array; wrapped: Uint8Array }> {
  const salt = crypto.getRandomValues(new Uint8Array(WRAP_SALT_LENGTH))
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const key = await deriveWrapKey(pin, salt)
  const wrappedBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    masterKey as BufferSource
  )
  return { salt, iv, wrapped: new Uint8Array(wrappedBuf) }
}

/**
 * Try to unwrap (decrypt) a master key with a PIN candidate + its salt/IV.
 * Returns null (never throws) on a wrong PIN / auth failure, so callers can
 * try the next candidate (e.g. main PIN, then recovery PIN).
 */
export async function unwrapMasterKey(
  wrapped: Uint8Array,
  pin: string,
  salt: Uint8Array,
  iv: Uint8Array
): Promise<Uint8Array | null> {
  try {
    const key = await deriveWrapKey(pin, salt)
    const buf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      wrapped as BufferSource
    )
    return new Uint8Array(buf)
  } catch {
    return null
  }
}

async function encryptPayloadWithKey(
  masterKey: Uint8Array,
  data: BackupPayload
): Promise<{ iv: Uint8Array; ciphertext: Uint8Array }> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const key = await crypto.subtle.importKey('raw', masterKey as BufferSource, { name: 'AES-GCM' }, false, ['encrypt'])
  const enc = new TextEncoder()
  const plaintext = enc.encode(JSON.stringify(data))
  const buf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, plaintext as BufferSource)
  return { iv, ciphertext: new Uint8Array(buf) }
}

async function decryptPayloadWithKey(
  masterKey: Uint8Array,
  iv: Uint8Array,
  ciphertext: Uint8Array
): Promise<BackupPayload> {
  const key = await crypto.subtle.importKey('raw', masterKey as BufferSource, { name: 'AES-GCM' }, false, ['decrypt'])
  const buf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, ciphertext as BufferSource)
  const dec = new TextDecoder()
  return JSON.parse(dec.decode(buf)) as BackupPayload
}

/** Recovery-wrap material for a profile, as persisted in SQLite (see local-auth.ts). */
export interface RecoveryWrapMaterial {
  masterKey: Uint8Array
  salt: Uint8Array
  iv: Uint8Array
  wrapped: Uint8Array
}

async function encryptDataV2(
  mainPin: string,
  data: BackupPayload,
  recovery: RecoveryWrapMaterial
): Promise<Uint8Array> {
  const mainWrap = await wrapMasterKey(recovery.masterKey, mainPin)
  const { iv: payloadIv, ciphertext } = await encryptPayloadWithKey(recovery.masterKey, data)

  const header = new Uint8Array(HEADER_LENGTH_V2)
  let o = 0
  header.set(MAGIC, o); o += MAGIC.length
  header[o] = CONTAINER_VERSION_V2; o += 1
  header.set(mainWrap.salt, o); o += WRAP_SALT_LENGTH
  header.set(mainWrap.iv, o); o += IV_LENGTH
  header.set(mainWrap.wrapped, o); o += WRAPPED_KEY_LENGTH
  header.set(recovery.salt, o); o += WRAP_SALT_LENGTH
  header.set(recovery.iv, o); o += IV_LENGTH
  header.set(recovery.wrapped, o); o += WRAPPED_KEY_LENGTH
  header.set(payloadIv, o); o += IV_LENGTH

  const result = new Uint8Array(header.length + ciphertext.length)
  result.set(header, 0)
  result.set(ciphertext, header.length)
  return result
}

async function decryptDataV2(fileBytes: Uint8Array, pinCandidate: string): Promise<BackupPayload> {
  let o = 4
  const mainSalt = fileBytes.slice(o, o + WRAP_SALT_LENGTH); o += WRAP_SALT_LENGTH
  const mainIv = fileBytes.slice(o, o + IV_LENGTH); o += IV_LENGTH
  const mainWrapped = fileBytes.slice(o, o + WRAPPED_KEY_LENGTH); o += WRAPPED_KEY_LENGTH
  const recoverySalt = fileBytes.slice(o, o + WRAP_SALT_LENGTH); o += WRAP_SALT_LENGTH
  const recoveryIv = fileBytes.slice(o, o + IV_LENGTH); o += IV_LENGTH
  const recoveryWrapped = fileBytes.slice(o, o + WRAPPED_KEY_LENGTH); o += WRAPPED_KEY_LENGTH
  const payloadIv = fileBytes.slice(o, o + IV_LENGTH); o += IV_LENGTH
  const ciphertext = fileBytes.slice(o)

  // Try the candidate PIN against the main-PIN wrap first, then the recovery-PIN wrap.
  let masterKey = await unwrapMasterKey(mainWrapped, pinCandidate, mainSalt, mainIv)
  if (!masterKey) {
    masterKey = await unwrapMasterKey(recoveryWrapped, pinCandidate, recoverySalt, recoveryIv)
  }
  if (!masterKey) throw new Error('Incorrect PIN or corrupted file')

  try {
    return await decryptPayloadWithKey(masterKey, payloadIv, ciphertext)
  } catch {
    throw new Error('Incorrect PIN or corrupted file')
  }
}

// ── Legacy v1 decode path (backward compatibility) ──

async function deriveKeyV1(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  return deriveWrapKey(pin, salt)
}

async function decryptDataV1(pin: string, fileBytes: Uint8Array): Promise<BackupPayload> {
  const salt = fileBytes.slice(4, 4 + V1_SALT_LENGTH)
  const iv = fileBytes.slice(4 + V1_SALT_LENGTH, 4 + V1_SALT_LENGTH + V1_IV_LENGTH)
  const ciphertext = fileBytes.slice(4 + V1_SALT_LENGTH + V1_IV_LENGTH)

  const key = await deriveKeyV1(pin, salt)
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

async function decryptData(pin: string, fileBytes: Uint8Array): Promise<BackupPayload> {
  // Verify magic
  for (let i = 0; i < MAGIC.length; i++) {
    if (fileBytes[i] !== MAGIC[i]) throw new Error('Not a valid AviationHub backup file (.ahb)')
  }
  const version = fileBytes[3]
  if (version === CONTAINER_VERSION_V1) return decryptDataV1(pin, fileBytes)
  if (version === CONTAINER_VERSION_V2) return decryptDataV2(fileBytes, pin)
  throw new Error(`Unsupported backup version ${version}`)
}

// ── Export ──

export interface ExportResult {
  success: boolean
  fileName: string
  error?: string
}

/**
 * Export all data for a given user ID to a PIN-encrypted .ahb file (format v2).
 * Uses Tauri's save dialog to let the user pick the destination.
 *
 * Requires the profile to already have recovery-PIN material provisioned
 * (see `desktop/lib/local-auth.ts` `provisionRecoveryPin`) — every profile
 * gets this either at creation time or on first PIN unlock after this
 * feature shipped, so this should not fail for any profile that has been
 * unlocked at least once.
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

    const [userRows, profileRows, aircraftRows, logbookRows, totalsRows, historyRows, currencyRows, documentRows] = await Promise.all([
      trySel<{
        id: string; name: string; username: string | null; email: string | null; pin: string | null; avatar_color: string | null
        backup_master_key: string | null; recovery_wrap_salt: string | null; recovery_wrap_iv: string | null; recovery_wrapped_key: string | null
      }>([
        `SELECT id, name, username, email, pin, avatar_color, backup_master_key, recovery_wrap_salt, recovery_wrap_iv, recovery_wrapped_key FROM users WHERE id = $1`,
        `SELECT id, name, username, email, pin, avatar_color, backup_master_key, recovery_wrap_salt, recovery_wrap_iv, recovery_wrapped_key FROM users WHERE id = ?`,
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
      trySel<Record<string, unknown>>([
        `SELECT * FROM document_attachments WHERE user_id = $1`,
        `SELECT * FROM document_attachments WHERE user_id = ?`,
      ], [userId]),
    ])

    if (userRows.length === 0) throw new Error('User not found')
    const u = userRows[0]

    if (!u.backup_master_key || !u.recovery_wrap_salt || !u.recovery_wrap_iv || !u.recovery_wrapped_key) {
      throw new Error(
        'This profile doesn’t have a recovery PIN set up yet. Go to Settings → Account and generate one, then try exporting again.'
      )
    }

    const payload: BackupPayload = {
      version: PAYLOAD_VERSION,
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
      documents: documentRows,
    }

    // Encrypt (v2 — master key dual-wrapped under main PIN + recovery PIN)
    const recovery: RecoveryWrapMaterial = {
      masterKey: base64ToBytes(u.backup_master_key),
      salt: base64ToBytes(u.recovery_wrap_salt),
      iv: base64ToBytes(u.recovery_wrap_iv),
      wrapped: base64ToBytes(u.recovery_wrapped_key),
    }
    const encryptedBytes = await encryptDataV2(pin, payload, recovery)

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
 * Accepts either the main PIN or the recovery PIN for v2 files; v1 files
 * still require the main PIN exactly as before.
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

    // Insert documents (upsert by id, table may not exist in older backups)
    if (Array.isArray(payload.documents) && payload.documents.length > 0) {
      // Ensure table exists. Belt-and-suspenders for this release — the
      // canonical schema going forward is desktop/lib/local-migrations.ts.
      try {
        await db.execute(`
          CREATE TABLE IF NOT EXISTS document_attachments (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            file_name TEXT NOT NULL,
            mime_type TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            storage_path TEXT NOT NULL,
            notes TEXT,
            created_at TEXT NOT NULL
          )
        `)
      } catch { /* ignore */ }

      for (const doc of payload.documents) {
        const cols = Object.keys(doc)
        const vals = Object.values(doc)
        const placeholders1 = vals.map((_, i) => `$${i + 1}`).join(', ')
        const placeholders2 = vals.map((_, i) => `?`).join(', ')
        try {
          await tryExec([
            `INSERT OR REPLACE INTO document_attachments (${cols.join(', ')}) VALUES (${placeholders1})`,
            `INSERT OR REPLACE INTO document_attachments (${cols.join(', ')}) VALUES (${placeholders2})`,
          ], vals)
        } catch { /* skip if schema mismatch */ }
      }
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

/** Verify a backup file's PIN (main or recovery) without loading data — used for the "verify before import" UI. */
export async function verifyBackupPin(fileBytes: Uint8Array, pin: string): Promise<{ valid: boolean; userName: string | null }> {
  try {
    const payload = await decryptData(pin, fileBytes)
    return { valid: true, userName: payload.user.name }
  } catch {
    return { valid: false, userName: null }
  }
}
