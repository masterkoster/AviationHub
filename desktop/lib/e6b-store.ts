'use client'

/**
 * E6B & Tools persistence layer (SQLite-backed, local-only).
 *
 * Mirrors the lazy-import pattern from `app/desktop/modules/training/page.tsx`
 * and the graceful-failure API style of `apps/desktop/src/lib/local-logbook.ts`.
 * Every query uses the tauri-plugin-sql SQLite driver's `$N` positional
 * placeholder convention and maps snake_case SQL columns to camelCase TS.
 */

// ── Local DB helper (same pattern as Training page) ──────────────────────────

let _localDbPromise: Promise<any> | null = null

export async function getLocalDb(): Promise<any> {
  if (typeof window === 'undefined') return null
  if (!_localDbPromise) {
    try {
      const Database = await import('@tauri-apps/plugin-sql').then((m) => m.default || m)
      _localDbPromise = Database.load('sqlite:aviationhub.db')
    } catch {
      _localDbPromise = null
      return null
    }
  }
  try {
    return await _localDbPromise
  } catch {
    _localDbPromise = null
    return null
  }
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface E6bHistoryEntry {
  id: string
  userId: string | null
  tool: string
  input: Record<string, unknown>
  output: Record<string, unknown>
  createdAt: string
}

export interface CgEnvelopePoint {
  weight: number
  cgFwd: number
  cgAft: number
}

export interface E6bAircraft {
  id: string
  userId: string | null
  tailnumber: string
  make?: string | null
  model?: string | null
  emptyWeight?: number | null
  emptyCg?: number | null
  maxWeight?: number | null
  armPilot?: number | null
  armPassenger?: number | null
  armRear1?: number | null
  armRear2?: number | null
  armBaggage1?: number | null
  armBaggage2?: number | null
  armFuel?: number | null
  fuelCapacity?: number | null
  cruiseSpeed?: number | null
  fuelBurn?: number | null
  cgEnvelope?: CgEnvelopePoint[] | null // parsed from cg_envelope_json
  createdAt: string
  updatedAt: string
}

// ── JSON helpers for input/output / cg_envelope columns ───────────────────────

function parseJsonObject(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {}
  try {
    const v = JSON.parse(raw)
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function parseEnvelope(raw: string | null | undefined): CgEnvelopePoint[] | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw)
    if (Array.isArray(v)) return v as CgEnvelopePoint[]
    return null
  } catch {
    return null
  }
}

function safeStringify(value: unknown): string | null {
  try {
    return JSON.stringify(value ?? null)
  } catch {
    return null
  }
}

// ── Schema bootstrap (idempotent) ─────────────────────────────────────────────

/**
 * Creates the `e6b_history` and `e6b_aircraft` tables if they don't already
 * exist. Safe to call from a `useEffect` on every mount of the tools page —
 * `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS` are no-ops once
 * the tables/indexes exist.
 */
export async function ensureE6bSchema(): Promise<void> {
  const db = await getLocalDb()
  if (!db) return
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS e6b_history (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        tool TEXT NOT NULL,
        input_json TEXT NOT NULL,
        output_json TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `)
    await db.execute(
      `CREATE INDEX IF NOT EXISTS idx_e6b_history_user_time ON e6b_history(user_id, created_at DESC)`
    )
  } catch (e) {
    console.error('ensureE6bSchema: e6b_history failed', e)
  }
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS e6b_aircraft (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        tailnumber TEXT NOT NULL,
        make TEXT,
        model TEXT,
        empty_weight REAL,
        empty_cg REAL,
        max_weight REAL,
        arm_pilot REAL,
        arm_passenger REAL,
        arm_rear1 REAL,
        arm_rear2 REAL,
        arm_baggage1 REAL,
        arm_baggage2 REAL,
        arm_fuel REAL,
        fuel_capacity REAL,
        cruise_speed REAL,
        fuel_burn REAL,
        cg_envelope_json TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(user_id, tailnumber)
      )
    `)
  } catch (e) {
    console.error('ensureE6bSchema: e6b_aircraft failed', e)
  }
  // ── Notes table ──────────────────────────────────────────────────────────────
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS e6b_notes (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        tool TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(user_id, tool)
      )
    `)
  } catch (e) {
    console.error('ensureE6bSchema: e6b_notes failed', e)
  }
}

// ── History API ─────────────────────────────────────────────────────────────────

/**
 * Persist a single tool calculation. Returns the new row id, or `null` if the
 * local DB is unavailable or the insert failed.
 */
export async function logToolUse(
  userId: string,
  tool: string,
  input: object,
  output: object
): Promise<string | null> {
  const db = await getLocalDb()
  if (!db) return null
  const id = uuid()
  try {
    await db.execute(
      `INSERT INTO e6b_history (id, user_id, tool, input_json, output_json) VALUES ($1, $2, $3, $4, $5)`,
      [id, userId, tool, JSON.stringify(input), JSON.stringify(output)]
    )
    return id
  } catch (e) {
    console.error('logToolUse failed', e)
    return null
  }
}

/**
 * Returns the most recent tool calculations for a user, newest first.
 * Default `limit = 20`. Always returns `[]` when the DB is unavailable.
 */
export async function listRecentTools(
  userId: string,
  limit = 20
): Promise<E6bHistoryEntry[]> {
  const db = await getLocalDb()
  if (!db) return []
  try {
    const rows: E6bHistoryRow[] = await db.select(
      `SELECT id, user_id as userId, tool, input_json as inputJson, output_json as outputJson, created_at as createdAt
       FROM e6b_history
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    )
    return rows.map((r: E6bHistoryRow) => ({
      id: String(r.id),
      userId: r.userId ?? null,
      tool: String(r.tool ?? ''),
      input: parseJsonObject(r.inputJson),
      output: parseJsonObject(r.outputJson),
      createdAt: String(r.createdAt ?? ''),
    }))
  } catch (e) {
    console.error('listRecentTools failed', e)
    return []
  }
}

/**
 * Wipes the entire tool-history set for one user. Returns `false` if the DB is
 * unavailable or the delete failed (rows may have been partially cleared).
 */
export async function clearToolHistory(userId: string): Promise<boolean> {
  const db = await getLocalDb()
  if (!db) return false
  try {
    await db.execute(`DELETE FROM e6b_history WHERE user_id = $1`, [userId])
    return true
  } catch (e) {
    console.error('clearToolHistory failed', e)
    return false
  }
}

// ── Aircraft-save (W&B presets) API ────────────────────────────────────────────

interface E6bHistoryRow {
  id: string | null
  userId: string | null
  tool: string | null
  inputJson: string | null
  outputJson: string | null
  createdAt: string | null
}

/**
 * Raw row shape straight from SQLite — snake_case envelope column is decoded
 * to its `CgEnvelopePoint[]` form by the mapping step in callers below.
 */
interface E6bAircraftRow {
  id: string
  userId: string | null
  tailnumber: string
  make?: string | null
  model?: string | null
  emptyWeight?: number | null
  emptyCg?: number | null
  maxWeight?: number | null
  armPilot?: number | null
  armPassenger?: number | null
  armRear1?: number | null
  armRear2?: number | null
  armBaggage1?: number | null
  armBaggage2?: number | null
  armFuel?: number | null
  fuelCapacity?: number | null
  cruiseSpeed?: number | null
  fuelBurn?: number | null
  cgEnvelopeJson: string | null
  createdAt: string
  updatedAt: string
}

const AIRCRAFT_SELECT_COLUMNS =
  `id, user_id as userId, tailnumber, make, model,
   empty_weight as emptyWeight, empty_cg as emptyCg, max_weight as maxWeight,
   arm_pilot as armPilot, arm_passenger as armPassenger,
   arm_rear1 as armRear1, arm_rear2 as armRear2,
   arm_baggage1 as armBaggage1, arm_baggage2 as armBaggage2,
   arm_fuel as armFuel, fuel_capacity as fuelCapacity,
   cruise_speed as cruiseSpeed, fuel_burn as fuelBurn,
   cg_envelope_json as cgEnvelopeJson,
   created_at as createdAt, updated_at as updatedAt`

function rowToAircraft(r: E6bAircraftRow): E6bAircraft {
  return {
    id: String(r.id),
    userId: r.userId ?? null,
    tailnumber: String(r.tailnumber ?? ''),
    make: r.make ?? null,
    model: r.model ?? null,
    emptyWeight: r.emptyWeight ?? null,
    emptyCg: r.emptyCg ?? null,
    maxWeight: r.maxWeight ?? null,
    armPilot: r.armPilot ?? null,
    armPassenger: r.armPassenger ?? null,
    armRear1: r.armRear1 ?? null,
    armRear2: r.armRear2 ?? null,
    armBaggage1: r.armBaggage1 ?? null,
    armBaggage2: r.armBaggage2 ?? null,
    armFuel: r.armFuel ?? null,
    fuelCapacity: r.fuelCapacity ?? null,
    cruiseSpeed: r.cruiseSpeed ?? null,
    fuelBurn: r.fuelBurn ?? null,
    cgEnvelope: parseEnvelope(r.cgEnvelopeJson),
    createdAt: String(r.createdAt ?? ''),
    updatedAt: String(r.updatedAt ?? ''),
  }
}

/**
 * Lists all W&B presets owned by `userId`, ordered by tail number.
 */
export async function listUserAircraft(userId: string): Promise<E6bAircraft[]> {
  const db = await getLocalDb()
  if (!db) return []
  try {
    const rows: E6bAircraftRow[] = await db.select(
      `SELECT ${AIRCRAFT_SELECT_COLUMNS}
       FROM e6b_aircraft
       WHERE user_id = $1
       ORDER BY tailnumber ASC`,
      [userId]
    )
    return rows.map(rowToAircraft)
  } catch (e) {
    console.error('listUserAircraft failed', e)
    return []
  }
}

/**
 * Fetches a single saved aircraft by `(userId, tailnumber)` — returns `null`
 * when not found or when the DB is unavailable.
 */
export async function getAircraft(
  userId: string,
  tailnumber: string
): Promise<E6bAircraft | null> {
  const db = await getLocalDb()
  if (!db) return null
  try {
    const rows: E6bAircraftRow[] = await db.select(
      `SELECT ${AIRCRAFT_SELECT_COLUMNS}
       FROM e6b_aircraft
       WHERE user_id = $1 AND tailnumber = $2
       LIMIT 1`,
      [userId, tailnumber]
    )
    return rows[0] ? rowToAircraft(rows[0]) : null
  } catch (e) {
    console.error('getAircraft failed', e)
    return null
  }
}

/**
 * Inserts or updates a per-tailnumber W&B preset using SQLite UPSERT semantics
 * (`INSERT ... ON CONFLICT(user_id, tailnumber) DO UPDATE`). On insert a fresh
 * `id` is generated and written; on update the existing row's `id` is preserved
 * (it isn't included in the conflict's SET clause). Always returns the
 * freshly-persisted aircraft row, or `null` on failure.
 */
export async function saveAircraft(
  input: Omit<E6bAircraft, 'id' | 'createdAt' | 'updatedAt'>
): Promise<E6bAircraft | null> {
  const db = await getLocalDb()
  if (!db) return null

  const id = uuid()
  const tailnumber = String(input.tailnumber ?? '').trim().toUpperCase()
  const envJson = safeStringify(input.cgEnvelope ?? null)

  try {
    await db.execute(
      `INSERT INTO e6b_aircraft (
         id, user_id, tailnumber, make, model,
         empty_weight, empty_cg, max_weight,
         arm_pilot, arm_passenger, arm_rear1, arm_rear2,
         arm_baggage1, arm_baggage2, arm_fuel,
         fuel_capacity, cruise_speed, fuel_burn, cg_envelope_json
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
       ON CONFLICT(user_id, tailnumber) DO UPDATE SET
         make = excluded.make,
         model = excluded.model,
         empty_weight = excluded.empty_weight,
         empty_cg = excluded.empty_cg,
         max_weight = excluded.max_weight,
         arm_pilot = excluded.arm_pilot,
         arm_passenger = excluded.arm_passenger,
         arm_rear1 = excluded.arm_rear1,
         arm_rear2 = excluded.arm_rear2,
         arm_baggage1 = excluded.arm_baggage1,
         arm_baggage2 = excluded.arm_baggage2,
         arm_fuel = excluded.arm_fuel,
         fuel_capacity = excluded.fuel_capacity,
         cruise_speed = excluded.cruise_speed,
         fuel_burn = excluded.fuel_burn,
         cg_envelope_json = excluded.cg_envelope_json,
         updated_at = datetime('now')`,
      [
        id,
        input.userId ?? null,
        tailnumber,
        input.make ?? null,
        input.model ?? null,
        input.emptyWeight ?? null,
        input.emptyCg ?? null,
        input.maxWeight ?? null,
        input.armPilot ?? null,
        input.armPassenger ?? null,
        input.armRear1 ?? null,
        input.armRear2 ?? null,
        input.armBaggage1 ?? null,
        input.armBaggage2 ?? null,
        input.armFuel ?? null,
        input.fuelCapacity ?? null,
        input.cruiseSpeed ?? null,
        input.fuelBurn ?? null,
        envJson,
      ]
    )
  } catch (e) {
    console.error('saveAircraft failed', e)
    return null
  }

  // Re-read to get the canonical `id`, `created_at`, and `updated_at` values
  // (the row id may have been preserved on an update, fresh on an insert).
  return getAircraft(input.userId ?? '', tailnumber)
}

/**
 * Deletes the W&B preset for `(userId, tailnumber)`. Returns `false` on any
 * failure (rows may have been partially affected).
 */
export async function deleteAircraft(
  userId: string,
  tailnumber: string
): Promise<boolean> {
  const db = await getLocalDb()
  if (!db) return false
  try {
    await db.execute(
      `DELETE FROM e6b_aircraft WHERE user_id = $1 AND tailnumber = $2`,
      [userId, String(tailnumber ?? '').trim().toUpperCase()]
    )
    return true
  } catch (e) {
    console.error('deleteAircraft failed', e)
    return false
  }
}

// ── Notes API ──────────────────────────────────────────────────────────────────

/**
 * Get the saved note for a tool. Returns empty string if no note exists.
 */
export async function getToolNote(userId: string, tool: string): Promise<string> {
  const db = await getLocalDb()
  if (!db) return ''
  try {
    const rows: { body: string }[] = await db.select(
      `SELECT body FROM e6b_notes WHERE user_id = $1 AND tool = $2`,
      [userId, tool]
    )
    return rows?.[0]?.body ?? ''
  } catch {
    return ''
  }
}

/**
 * Save (upsert) a note for a tool.
 */
export async function saveToolNote(userId: string, tool: string, body: string): Promise<void> {
  const db = await getLocalDb()
  if (!db) return
  const id = uuid()
  try {
    await db.execute(
      `INSERT INTO e6b_notes (id, user_id, tool, body, updated_at) VALUES ($1, $2, $3, $4, datetime('now'))
       ON CONFLICT(user_id, tool) DO UPDATE SET body = $4, updated_at = datetime('now')`,
      [id, userId, tool, body]
    )
  } catch (e) {
    console.error('saveToolNote failed', e)
  }
}