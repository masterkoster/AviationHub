'use client'

import Database from '@tauri-apps/plugin-sql'

let dbPromise: Promise<Database> | null = null

export async function getDb(): Promise<Database | null> {
  if (typeof window === 'undefined') return null
  if (!dbPromise) {
    try {
      dbPromise = Database.load('sqlite:aviationhub.db')
    } catch {
      dbPromise = null
      return null
    }
  }
  try {
    return await dbPromise
  } catch {
    dbPromise = null
    return null
  }
}

export async function trySelect<T>(db: Database, sqls: string[], params: unknown[]): Promise<T[]> {
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

export async function tryExecute(db: Database, sqls: string[], params: unknown[]): Promise<void> {
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

export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export interface LocalAircraftStat {
  aircraft: string
  flights: number
}

export interface LocalFlight {
  id: string
  date: string
  aircraft: string
  routeFrom: string
  routeTo: string
  totalTime: number
  remarks: string
}

export interface LocalTotals {
  totalFlights: number
  totalTime: number
  picTime: number
  sicTime: number
  nightTime: number
  instrumentTime: number
  crossCountryTime: number
  landingsDay: number
  landingsNight: number
}

export interface NewLocalFlightInput {
  userId: string
  date: string
  aircraft: string
  aircraftId?: string
  routeFrom?: string
  routeTo?: string
  totalTime: number
  picTime?: number
  sicTime?: number
  soloTime?: number
  dualGiven?: number
  dualReceived?: number
  nightTime?: number
  instrumentTime?: number
  simulatedInstrumentTime?: number
  crossCountryTime?: number
  landingsDay?: number
  landingsNight?: number
  isSimulator?: boolean
  remarks?: string
}

export interface LocalAircraftOption {
  id: string
  nNumber: string
  nickname: string | null
}

export interface ResolveLocalUserOptions {
  mode: 'local' | 'cloud' | null
  localUserId?: string | null
  cloudUser?: { id?: string; name?: string | null; email?: string | null } | null
}

function normalizeCloudUserId(cloudUser: ResolveLocalUserOptions['cloudUser']): string {
  const raw = cloudUser?.id || cloudUser?.email || 'cloud-user'
  return `cloud-${String(raw).replace(/[^a-zA-Z0-9_-]/g, '_')}`
}

/**
 * True for local profile rows that are linked to a cloud account (see
 * normalizeCloudUserId above and cloudLinkedUserId in desktop/lib/local-auth.ts —
 * both must keep producing the same `cloud-...` id shape). Only these
 * profiles' logbook writes get enqueued for cloud sync.
 */
export function isCloudLinkedUserId(userId: string | null | undefined): boolean {
  return typeof userId === 'string' && userId.startsWith('cloud-')
}

export async function resolveLocalLogbookUserId(opts: ResolveLocalUserOptions): Promise<string> {
  if (opts.mode === 'local' && opts.localUserId) return opts.localUserId

  const db = await getDb()
  if (!db) throw new Error('Local database unavailable')

  const id = normalizeCloudUserId(opts.cloudUser || null)
  const name = opts.cloudUser?.name?.trim() || 'Cloud Pilot'
  const email = opts.cloudUser?.email?.trim() || null
  const username = email ? email.split('@')[0] : id.slice(0, 24)

  await db.execute(
    `INSERT OR IGNORE INTO users (id, name, email, username, password_hash) VALUES (?, ?, ?, ?, ?)`,
    [id, name, email, username, 'cloud-linked-account']
  )

  return id
}

export async function listLocalAircraftOptions(userId: string): Promise<LocalAircraftOption[]> {
  const db = await getDb()
  if (!db) return []
  try {
    return await trySelect<LocalAircraftOption>(
      db,
      [
        `SELECT id, n_number as nNumber, nickname FROM aircraft WHERE user_id = $1 ORDER BY n_number ASC`,
        `SELECT id, n_number as nNumber, nickname FROM aircraft WHERE user_id = ? ORDER BY n_number ASC`,
      ],
      [userId]
    )
  } catch {
    return []
  }
}

export async function getLocalAircraftStats(userId: string): Promise<LocalAircraftStat[]> {
  const db = await getDb()
  if (!db) return []
  try {
    return await trySelect<LocalAircraftStat>(
      db,
      [
        `SELECT aircraft, COUNT(*) as flights FROM logbook_entries WHERE user_id = $1 AND voided = 0 GROUP BY aircraft ORDER BY flights DESC, aircraft ASC`,
        `SELECT aircraft, COUNT(*) as flights FROM logbook_entries WHERE user_id = ? AND voided = 0 GROUP BY aircraft ORDER BY flights DESC, aircraft ASC`,
      ],
      [userId]
    )
  } catch {
    return []
  }
}

export async function getLocalRecentFlights(userId: string, limit = 25): Promise<LocalFlight[]> {
  const db = await getDb()
  if (!db) return []
  try {
    return await trySelect<LocalFlight>(
      db,
      [
        `SELECT id, date, aircraft, route_from as routeFrom, route_to as routeTo, total_time as totalTime, remarks FROM logbook_entries WHERE user_id = $1 AND voided = 0 ORDER BY date DESC LIMIT $2`,
        `SELECT id, date, aircraft, route_from as routeFrom, route_to as routeTo, total_time as totalTime, remarks FROM logbook_entries WHERE user_id = ? AND voided = 0 ORDER BY date DESC LIMIT ?`,
      ],
      [userId, limit]
    )
  } catch {
    return []
  }
}

export async function getLocalTotals(userId: string): Promise<LocalTotals> {
  const db = await getDb()
  if (!db) {
    return {
      totalFlights: 0,
      totalTime: 0,
      picTime: 0,
      sicTime: 0,
      nightTime: 0,
      instrumentTime: 0,
      crossCountryTime: 0,
      landingsDay: 0,
      landingsNight: 0,
    }
  }
  try {
    const rows = await trySelect<LocalTotals>(
      db,
      [
        `SELECT COUNT(*) as totalFlights, COALESCE(SUM(total_time), 0) as totalTime, COALESCE(SUM(pic_time), 0) as picTime, COALESCE(SUM(sic_time), 0) as sicTime, COALESCE(SUM(night_time), 0) as nightTime, COALESCE(SUM(instrument_time), 0) as instrumentTime, COALESCE(SUM(cross_country_time), 0) as crossCountryTime, COALESCE(SUM(landings_day), 0) as landingsDay, COALESCE(SUM(landings_night), 0) as landingsNight FROM logbook_entries WHERE user_id = $1 AND voided = 0`,
        `SELECT COUNT(*) as totalFlights, COALESCE(SUM(total_time), 0) as totalTime, COALESCE(SUM(pic_time), 0) as picTime, COALESCE(SUM(sic_time), 0) as sicTime, COALESCE(SUM(night_time), 0) as nightTime, COALESCE(SUM(instrument_time), 0) as instrumentTime, COALESCE(SUM(cross_country_time), 0) as crossCountryTime, COALESCE(SUM(landings_day), 0) as landingsDay, COALESCE(SUM(landings_night), 0) as landingsNight FROM logbook_entries WHERE user_id = ? AND voided = 0`,
      ],
      [userId]
    )
    return rows[0] || {
      totalFlights: 0,
      totalTime: 0,
      picTime: 0,
      sicTime: 0,
      nightTime: 0,
      instrumentTime: 0,
      crossCountryTime: 0,
      landingsDay: 0,
      landingsNight: 0,
    }
  } catch {
    return {
      totalFlights: 0,
      totalTime: 0,
      picTime: 0,
      sicTime: 0,
      nightTime: 0,
      instrumentTime: 0,
      crossCountryTime: 0,
      landingsDay: 0,
      landingsNight: 0,
    }
  }
}

export async function createLocalFlight(input: NewLocalFlightInput): Promise<string> {
  const db = await getDb()
  if (!db) throw new Error('Local database unavailable')

  const id = uuid()
  await tryExecute(
    db,
    [
      `INSERT INTO logbook_entries (id, user_id, date, aircraft, route_from, route_to, total_time, pic_time, sic_time, solo_time, dual_given, dual_received, night_time, instrument_time, simulated_instrument_time, cross_country_time, landings_day, landings_night, sim_flag, remarks, sync_status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
      `INSERT INTO logbook_entries (id, user_id, date, aircraft, route_from, route_to, total_time, pic_time, sic_time, solo_time, dual_given, dual_received, night_time, instrument_time, simulated_instrument_time, cross_country_time, landings_day, landings_night, sim_flag, remarks, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ],
    [
      id,
      input.userId,
      input.date,
      input.aircraft.trim().toUpperCase(),
      (input.routeFrom || '').trim().toUpperCase(),
      (input.routeTo || '').trim().toUpperCase(),
      input.totalTime,
      input.picTime ?? 0,
      input.sicTime ?? 0,
      input.soloTime ?? 0,
      input.dualGiven ?? 0,
      input.dualReceived ?? 0,
      input.nightTime ?? 0,
      input.instrumentTime ?? 0,
      input.simulatedInstrumentTime ?? 0,
      input.crossCountryTime ?? 0,
      input.landingsDay ?? 0,
      input.landingsNight ?? 0,
      input.isSimulator ? 1 : 0,
      (input.remarks || '').trim(),
      'local',
    ]
  )
  await enqueueIfCloudLinked(db, id, 'create')
  return id
}

export async function markLocalFlightSynced(localId: string, cloudEntryId: string | null): Promise<void> {
  const db = await getDb()
  if (!db) return
  await tryExecute(
    db,
    [
      `UPDATE logbook_entries SET sync_status = $1, cloud_entry_id = $2, sync_error = NULL, synced_at = datetime('now'), updated_at = datetime('now') WHERE id = $3`,
      `UPDATE logbook_entries SET sync_status = ?, cloud_entry_id = ?, sync_error = NULL, synced_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
    ],
    ['synced', cloudEntryId, localId]
  )
}

export async function markLocalFlightSyncFailed(localId: string, reason: string): Promise<void> {
  const db = await getDb()
  if (!db) return
  await tryExecute(
    db,
    [
      `UPDATE logbook_entries SET sync_status = $1, sync_error = $2, updated_at = datetime('now') WHERE id = $3`,
      `UPDATE logbook_entries SET sync_status = ?, sync_error = ?, updated_at = datetime('now') WHERE id = ?`,
    ],
    ['pending', reason.slice(0, 500), localId]
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sync queue (enqueue side — see apps/desktop/src/lib/sync-engine.ts for the
// drain/pull side that consumes this queue).
// ─────────────────────────────────────────────────────────────────────────────

export interface LogbookCloudFields {
  date: string
  aircraft: string
  routeFrom: string
  routeTo: string
  totalTime: number
  picTime: number
  sicTime: number
  soloTime: number
  dualGiven: number
  dualReceived: number
  nightTime: number
  instrumentTime: number
  simulatedInstrumentTime: number
  crossCountryTime: number
  dayLandings: number
  nightLandings: number
  isSimulator: boolean
  remarks: string
  isVoided: boolean
  voidedAt: string | null
  voidedBy: string | null
  voidReason: string | null
}

export interface SyncQueuePayload {
  cloudEntryId: string | null
  localUpdatedAt: string
  fields: LogbookCloudFields
}

function toCloudFields(f: {
  date: string
  aircraft: string
  routeFrom: string
  routeTo: string
  totalTime: number
  picTime: number
  sicTime: number
  soloTime: number
  dualGiven: number
  dualReceived: number
  nightTime: number
  instrumentTime: number
  simulatedInstrumentTime: number
  crossCountryTime: number
  landingsDay: number
  landingsNight: number
  isSimulator: boolean
  remarks: string
  voided: boolean
  voidedAt: string | null
  voidedBy: string | null
  voidReason: string | null
}): LogbookCloudFields {
  return {
    date: f.date,
    aircraft: f.aircraft,
    routeFrom: f.routeFrom,
    routeTo: f.routeTo,
    totalTime: f.totalTime,
    picTime: f.picTime,
    sicTime: f.sicTime,
    soloTime: f.soloTime,
    dualGiven: f.dualGiven,
    dualReceived: f.dualReceived,
    nightTime: f.nightTime,
    instrumentTime: f.instrumentTime,
    simulatedInstrumentTime: f.simulatedInstrumentTime,
    crossCountryTime: f.crossCountryTime,
    dayLandings: f.landingsDay,
    nightLandings: f.landingsNight,
    isSimulator: f.isSimulator,
    remarks: f.remarks,
    isVoided: f.voided,
    voidedAt: f.voidedAt,
    voidedBy: f.voidedBy,
    voidReason: f.voidReason,
  }
}

/**
 * Enqueue (or coalesce into) a sync_queue row for a logbook entry write.
 * No-op for local-only (non cloud-linked) profiles.
 *
 * Coalescing: at most one unsynced queue row is kept per record. A new write
 * always supersedes a prior unsynced row for the same record —
 *   create + update -> single 'create' row with the latest data (nothing
 *     reached the cloud yet, so it's still a create)
 *   create + delete -> both cancelled; nothing was ever pushed, so there's
 *     nothing to push now either
 * This keeps the drain loop simple: it never has to look at more than one
 * row per record.
 */
async function enqueueLogbookSync(
  db: Database,
  userId: string,
  recordId: string,
  action: 'create' | 'update' | 'delete',
  payload: SyncQueuePayload
): Promise<void> {
  if (!isCloudLinkedUserId(userId)) return
  try {
    const existing = await trySelect<{ action: string }>(
      db,
      [
        `SELECT action FROM sync_queue WHERE table_name = $1 AND record_id = $2 AND synced = 0`,
        `SELECT action FROM sync_queue WHERE table_name = ? AND record_id = ? AND synced = 0`,
      ],
      ['logbook_entries', recordId]
    )

    let effectiveAction = action
    if (existing.length > 0) {
      const priorAction = existing[0].action
      await tryExecute(
        db,
        [
          `DELETE FROM sync_queue WHERE table_name = $1 AND record_id = $2 AND synced = 0`,
          `DELETE FROM sync_queue WHERE table_name = ? AND record_id = ? AND synced = 0`,
        ],
        ['logbook_entries', recordId]
      )

      if (priorAction === 'create' && action === 'delete') {
        // Never made it to the cloud — cancel both sides, nothing to push.
        await markLocalFlightSynced(recordId, null)
        return
      }
      if (priorAction === 'create' && action === 'update') {
        effectiveAction = 'create' // still hasn't been pushed; keep as a create with the latest data
      }
    }

    await tryExecute(
      db,
      [
        `INSERT INTO sync_queue (table_name, record_id, action, data, synced, retries) VALUES ($1, $2, $3, $4, 0, 0)`,
        `INSERT INTO sync_queue (table_name, record_id, action, data, synced, retries) VALUES (?, ?, ?, ?, 0, 0)`,
      ],
      ['logbook_entries', recordId, effectiveAction, JSON.stringify(payload)]
    )

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('desktop-sync-queue-changed'))
    }
  } catch {
    // Enqueueing is best-effort — never let a queue hiccup fail the local write.
  }
}

/**
 * Re-reads the entry after a local write and, if the owning profile is
 * cloud-linked, enqueues (or coalesces) a sync_queue row for it.
 */
async function enqueueIfCloudLinked(db: Database, id: string, action: 'create' | 'update' | 'delete'): Promise<void> {
  const fresh = await getLocalFlightById(id)
  if (!fresh || !isCloudLinkedUserId(fresh.userId)) return
  const payload: SyncQueuePayload = {
    cloudEntryId: fresh.cloudEntryId,
    localUpdatedAt: fresh.updatedAt,
    fields: toCloudFields(fresh),
  }
  await enqueueLogbookSync(db, fresh.userId, id, action, payload)
}

// ─────────────────────────────────────────────────────────────────────────────
// Aircraft CRUD
// ─────────────────────────────────────────────────────────────────────────────

export interface LocalAircraft {
  id: string
  userId: string
  nNumber: string
  nickname: string | null
  model: string | null
  createdAt: string
  emptyWeight: number | null
  emptyCg: number | null
  maxWeight: number | null
  armPilot: number | null
  armPassenger: number | null
  armBaggage: number | null
  armFuel: number | null
  fuelCapacity: number | null
  cruiseSpeed: number | null
  fuelBurn: number | null
  unusableFuel: number | null
  cgMin: number | null
  cgMax: number | null
}

export interface NewLocalAircraftInput {
  userId: string
  nNumber: string
  nickname?: string | null
  model?: string | null
}

export interface UpdateLocalAircraftInput {
  nNumber?: string
  nickname?: string | null
  model?: string | null
  emptyWeight?: number | null
  emptyCg?: number | null
  maxWeight?: number | null
  armPilot?: number | null
  armPassenger?: number | null
  armBaggage?: number | null
  armFuel?: number | null
  fuelCapacity?: number | null
  cruiseSpeed?: number | null
  fuelBurn?: number | null
  unusableFuel?: number | null
  cgMin?: number | null
  cgMax?: number | null
}

let wbColumnsEnsured = false

async function ensureAircraftWbColumns(db: Database): Promise<void> {
  if (wbColumnsEnsured) return
  const cols = [
    'empty_weight REAL',
    'empty_cg REAL',
    'max_weight REAL',
    'arm_pilot REAL',
    'arm_passenger REAL',
    'arm_baggage REAL',
    'arm_fuel REAL',
    'fuel_capacity REAL',
    'cruise_speed REAL',
    'fuel_burn REAL',
    'unusable_fuel REAL',
    'cg_min REAL',
    'cg_max REAL',
  ]
  for (const col of cols) {
    try {
      await db.execute(`ALTER TABLE aircraft ADD COLUMN ${col}`)
    } catch {
      // column already exists
    }
  }
  wbColumnsEnsured = true
}

export async function getLocalAircraft(userId: string): Promise<LocalAircraft[]> {
  const db = await getDb()
  if (!db) return []
  await ensureAircraftWbColumns(db)
  try {
    return await trySelect<LocalAircraft>(
      db,
      [
        `SELECT id, user_id as userId, n_number as nNumber, nickname, model, created_at as createdAt, empty_weight as emptyWeight, empty_cg as emptyCg, max_weight as maxWeight, arm_pilot as armPilot, arm_passenger as armPassenger, arm_baggage as armBaggage, arm_fuel as armFuel, fuel_capacity as fuelCapacity, cruise_speed as cruiseSpeed, fuel_burn as fuelBurn, unusable_fuel as unusableFuel, cg_min as cgMin, cg_max as cgMax FROM aircraft WHERE user_id = $1 ORDER BY n_number ASC`,
        `SELECT id, user_id as userId, n_number as nNumber, nickname, model, created_at as createdAt, empty_weight as emptyWeight, empty_cg as emptyCg, max_weight as maxWeight, arm_pilot as armPilot, arm_passenger as armPassenger, arm_baggage as armBaggage, arm_fuel as armFuel, fuel_capacity as fuelCapacity, cruise_speed as cruiseSpeed, fuel_burn as fuelBurn, unusable_fuel as unusableFuel, cg_min as cgMin, cg_max as cgMax FROM aircraft WHERE user_id = ? ORDER BY n_number ASC`,
      ],
      [userId]
    )
  } catch {
    return []
  }
}

export async function getLocalAircraftById(id: string): Promise<LocalAircraft | null> {
  const db = await getDb()
  if (!db) return null
  await ensureAircraftWbColumns(db)
  try {
    const rows = await trySelect<LocalAircraft>(
      db,
      [
        `SELECT id, user_id as userId, n_number as nNumber, nickname, model, created_at as createdAt, empty_weight as emptyWeight, empty_cg as emptyCg, max_weight as maxWeight, arm_pilot as armPilot, arm_passenger as armPassenger, arm_baggage as armBaggage, arm_fuel as armFuel, fuel_capacity as fuelCapacity, cruise_speed as cruiseSpeed, fuel_burn as fuelBurn, unusable_fuel as unusableFuel, cg_min as cgMin, cg_max as cgMax FROM aircraft WHERE id = $1`,
        `SELECT id, user_id as userId, n_number as nNumber, nickname, model, created_at as createdAt, empty_weight as emptyWeight, empty_cg as emptyCg, max_weight as maxWeight, arm_pilot as armPilot, arm_passenger as armPassenger, arm_baggage as armBaggage, arm_fuel as armFuel, fuel_capacity as fuelCapacity, cruise_speed as cruiseSpeed, fuel_burn as fuelBurn, unusable_fuel as unusableFuel, cg_min as cgMin, cg_max as cgMax FROM aircraft WHERE id = ?`,
      ],
      [id]
    )
    return rows[0] || null
  } catch {
    return null
  }
}

export async function createLocalAircraft(input: NewLocalAircraftInput): Promise<string> {
  const db = await getDb()
  if (!db) throw new Error('Local database unavailable')

  const id = uuid()
  await tryExecute(
    db,
    [
      `INSERT INTO aircraft (id, user_id, n_number, nickname, model) VALUES ($1, $2, $3, $4, $5)`,
      `INSERT INTO aircraft (id, user_id, n_number, nickname, model) VALUES (?, ?, ?, ?, ?)`,
    ],
    [id, input.userId, input.nNumber.trim().toUpperCase(), input.nickname?.trim() || null, input.model?.trim() || null]
  )
  return id
}

export async function updateLocalAircraft(id: string, input: UpdateLocalAircraftInput): Promise<void> {
  const db = await getDb()
  if (!db) throw new Error('Local database unavailable')

  const sets: string[] = []
  const params: unknown[] = []

  if (input.nNumber !== undefined) {
    sets.push('n_number = ?')
    params.push(input.nNumber.trim().toUpperCase())
  }
  if (input.nickname !== undefined) {
    sets.push('nickname = ?')
    params.push(input.nickname?.trim() || null)
  }
  if (input.model !== undefined) {
    sets.push('model = ?')
    params.push(input.model?.trim() || null)
  }
  if (input.emptyWeight !== undefined) {
    sets.push('empty_weight = ?')
    params.push(input.emptyWeight)
  }
  if (input.emptyCg !== undefined) {
    sets.push('empty_cg = ?')
    params.push(input.emptyCg)
  }
  if (input.maxWeight !== undefined) {
    sets.push('max_weight = ?')
    params.push(input.maxWeight)
  }
  if (input.armPilot !== undefined) {
    sets.push('arm_pilot = ?')
    params.push(input.armPilot)
  }
  if (input.armPassenger !== undefined) {
    sets.push('arm_passenger = ?')
    params.push(input.armPassenger)
  }
  if (input.armBaggage !== undefined) {
    sets.push('arm_baggage = ?')
    params.push(input.armBaggage)
  }
  if (input.armFuel !== undefined) {
    sets.push('arm_fuel = ?')
    params.push(input.armFuel)
  }
  if (input.fuelCapacity !== undefined) {
    sets.push('fuel_capacity = ?')
    params.push(input.fuelCapacity)
  }
  if (input.cruiseSpeed !== undefined) {
    sets.push('cruise_speed = ?')
    params.push(input.cruiseSpeed)
  }
  if (input.fuelBurn !== undefined) {
    sets.push('fuel_burn = ?')
    params.push(input.fuelBurn)
  }
  if (input.unusableFuel !== undefined) {
    sets.push('unusable_fuel = ?')
    params.push(input.unusableFuel)
  }
  if (input.cgMin !== undefined) {
    sets.push('cg_min = ?')
    params.push(input.cgMin)
  }
  if (input.cgMax !== undefined) {
    sets.push('cg_max = ?')
    params.push(input.cgMax)
  }

  if (sets.length === 0) return

  params.push(id)
  await db.execute(`UPDATE aircraft SET ${sets.join(', ')} WHERE id = ?`, params)
}

export async function deleteLocalAircraft(id: string): Promise<void> {
  const db = await getDb()
  if (!db) throw new Error('Local database unavailable')

  await tryExecute(
    db,
    [
      `DELETE FROM aircraft WHERE id = $1`,
      `DELETE FROM aircraft WHERE id = ?`,
    ],
    [id]
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Logbook entry edit / history
// ─────────────────────────────────────────────────────────────────────────────

export interface LocalFlightFull {
  id: string
  userId: string
  date: string
  aircraft: string
  routeFrom: string
  routeTo: string
  totalTime: number
  picTime: number
  sicTime: number
  soloTime: number
  dualGiven: number
  dualReceived: number
  nightTime: number
  instrumentTime: number
  simulatedInstrumentTime: number
  crossCountryTime: number
  landingsDay: number
  landingsNight: number
  isSimulator: boolean
  remarks: string
  voided: boolean
  voidedAt: string | null
  voidedBy: string | null
  voidReason: string | null
  createdAt: string
  updatedAt: string
  cloudEntryId: string | null
  syncStatus: string | null
  syncError: string | null
  syncedAt: string | null
}

export interface LocalFlightHistory {
  id: string
  entryId: string
  action: string
  fieldName: string | null
  oldValue: string | null
  newValue: string | null
  changedBy: string
  reason: string | null
  changedAt: string
}

export interface UpdateLocalFlightInput {
  date?: string
  aircraft?: string
  routeFrom?: string
  routeTo?: string
  totalTime?: number
  picTime?: number
  sicTime?: number
  soloTime?: number
  dualGiven?: number
  dualReceived?: number
  nightTime?: number
  instrumentTime?: number
  simulatedInstrumentTime?: number
  crossCountryTime?: number
  landingsDay?: number
  landingsNight?: number
  isSimulator?: boolean
  remarks?: string
}

let voidColumnsEnsured = false
async function ensureVoidColumns(db: Database): Promise<void> {
  if (voidColumnsEnsured) return
  for (const col of ['voided INTEGER DEFAULT 0', 'voided_at TEXT', 'voided_by TEXT', 'void_reason TEXT']) {
    try { await db.execute(`ALTER TABLE logbook_entries ADD COLUMN ${col}`) } catch { /* exists */ }
  }
  voidColumnsEnsured = true
}

async function ensureHistoryTable(db: Database): Promise<void> {
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS logbook_entry_history (
        id TEXT PRIMARY KEY,
        entry_id TEXT NOT NULL,
        action TEXT NOT NULL,
        field_name TEXT,
        old_value TEXT,
        new_value TEXT,
        changed_by TEXT NOT NULL,
        reason TEXT,
        changed_at TEXT NOT NULL
      )
    `)
  } catch {
    // table already exists
  }
}

export async function getLocalFlightById(id: string): Promise<LocalFlightFull | null> {
  const db = await getDb()
  if (!db) return null
  await ensureVoidColumns(db)
  try {
    const rows = await trySelect<LocalFlightFull>(
      db,
      [
        `SELECT id, user_id as userId, date, aircraft, route_from as routeFrom, route_to as routeTo, total_time as totalTime, pic_time as picTime, sic_time as sicTime, solo_time as soloTime, dual_given as dualGiven, dual_received as dualReceived, night_time as nightTime, instrument_time as instrumentTime, simulated_instrument_time as simulatedInstrumentTime, cross_country_time as crossCountryTime, landings_day as landingsDay, landings_night as landingsNight, sim_flag as isSimulator, remarks, voided, voided_at as voidedAt, voided_by as voidedBy, void_reason as voidReason, created_at as createdAt, updated_at as updatedAt, cloud_entry_id as cloudEntryId, sync_status as syncStatus, sync_error as syncError, synced_at as syncedAt FROM logbook_entries WHERE id = $1`,
        `SELECT id, user_id as userId, date, aircraft, route_from as routeFrom, route_to as routeTo, total_time as totalTime, pic_time as picTime, sic_time as sicTime, solo_time as soloTime, dual_given as dualGiven, dual_received as dualReceived, night_time as nightTime, instrument_time as instrumentTime, simulated_instrument_time as simulatedInstrumentTime, cross_country_time as crossCountryTime, landings_day as landingsDay, landings_night as landingsNight, sim_flag as isSimulator, remarks, voided, voided_at as voidedAt, voided_by as voidedBy, void_reason as voidReason, created_at as createdAt, updated_at as updatedAt, cloud_entry_id as cloudEntryId, sync_status as syncStatus, sync_error as syncError, synced_at as syncedAt FROM logbook_entries WHERE id = ?`,
      ],
      [id]
    )
    if (!rows[0]) return null
    const row = rows[0]
    return { ...row, isSimulator: Boolean(row.isSimulator), voided: Boolean(row.voided) }
  } catch {
    return null
  }
}

export async function updateLocalFlight(
  id: string,
  input: UpdateLocalFlightInput,
  current: LocalFlightFull,
  changedBy: string,
  reason?: string
): Promise<void> {
  const db = await getDb()
  if (!db) throw new Error('Local database unavailable')
  await ensureHistoryTable(db)

  const fieldMap: Array<{ key: keyof UpdateLocalFlightInput; col: string }> = [
    { key: 'date', col: 'date' },
    { key: 'aircraft', col: 'aircraft' },
    { key: 'routeFrom', col: 'route_from' },
    { key: 'routeTo', col: 'route_to' },
    { key: 'totalTime', col: 'total_time' },
    { key: 'picTime', col: 'pic_time' },
    { key: 'sicTime', col: 'sic_time' },
    { key: 'soloTime', col: 'solo_time' },
    { key: 'dualGiven', col: 'dual_given' },
    { key: 'dualReceived', col: 'dual_received' },
    { key: 'nightTime', col: 'night_time' },
    { key: 'instrumentTime', col: 'instrument_time' },
    { key: 'simulatedInstrumentTime', col: 'simulated_instrument_time' },
    { key: 'crossCountryTime', col: 'cross_country_time' },
    { key: 'landingsDay', col: 'landings_day' },
    { key: 'landingsNight', col: 'landings_night' },
    { key: 'isSimulator', col: 'sim_flag' },
    { key: 'remarks', col: 'remarks' },
  ]

  const sets: string[] = []
  const params: unknown[] = []
  const historyRows: Array<{ fieldName: string; oldValue: string; newValue: string }> = []

  for (const { key, col } of fieldMap) {
    if (input[key] === undefined) continue
    const newVal = input[key]
    const oldVal = current[key as keyof LocalFlightFull]
    const oldStr = String(oldVal ?? '')
    const newStr = String(newVal ?? '')
    if (oldStr === newStr) continue
    sets.push(`${col} = ?`)
    params.push(key === 'isSimulator' ? (newVal ? 1 : 0) : newVal)
    historyRows.push({ fieldName: key, oldValue: oldStr, newValue: newStr })
  }

  if (sets.length === 0) return

  sets.push(`updated_at = datetime('now')`, `sync_status = 'local'`)
  params.push(id)
  await db.execute(`UPDATE logbook_entries SET ${sets.join(', ')} WHERE id = ?`, params)

  const now = new Date().toISOString()
  for (const h of historyRows) {
    const hid = uuid()
    await db.execute(
      `INSERT INTO logbook_entry_history (id, entry_id, action, field_name, old_value, new_value, changed_by, reason, changed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [hid, id, 'UPDATED', h.fieldName, h.oldValue, h.newValue, changedBy, reason ?? null, now]
    )
  }

  await enqueueIfCloudLinked(db, id, 'update')
}

export async function voidLocalFlight(id: string, voidedBy: string, reason: string): Promise<void> {
  const db = await getDb()
  if (!db) throw new Error('Local database unavailable')
  await ensureVoidColumns(db)
  await ensureHistoryTable(db)

  const now = new Date().toISOString()
  await tryExecute(
    db,
    [
      `UPDATE logbook_entries SET voided = 1, voided_at = $1, voided_by = $2, void_reason = $3, updated_at = $4, sync_status = 'local' WHERE id = $5`,
      `UPDATE logbook_entries SET voided = 1, voided_at = ?, voided_by = ?, void_reason = ?, updated_at = ?, sync_status = 'local' WHERE id = ?`,
    ],
    [now, voidedBy, reason.trim(), now, id]
  )

  const hid = uuid()
  await db.execute(
    `INSERT INTO logbook_entry_history (id, entry_id, action, field_name, old_value, new_value, changed_by, reason, changed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [hid, id, 'VOIDED', null, null, null, voidedBy, reason.trim(), now]
  )

  await enqueueIfCloudLinked(db, id, 'delete')
}

export async function getLocalFlightHistory(entryId: string): Promise<LocalFlightHistory[]> {
  const db = await getDb()
  if (!db) return []
  await ensureHistoryTable(db)
  try {
    return await trySelect<LocalFlightHistory>(
      db,
      [
        `SELECT id, entry_id as entryId, action, field_name as fieldName, old_value as oldValue, new_value as newValue, changed_by as changedBy, reason, changed_at as changedAt FROM logbook_entry_history WHERE entry_id = $1 ORDER BY changed_at DESC`,
        `SELECT id, entry_id as entryId, action, field_name as fieldName, old_value as oldValue, new_value as newValue, changed_by as changedBy, reason, changed_at as changedAt FROM logbook_entry_history WHERE entry_id = ? ORDER BY changed_at DESC`,
      ],
      [entryId]
    )
  } catch {
    return []
  }
}

export async function getLocalAircraftByNNumber(userId: string, nNumber: string): Promise<LocalAircraft | null> {
  const db = await getDb()
  if (!db) return null
  await ensureAircraftWbColumns(db)
  try {
    const rows = await trySelect<LocalAircraft>(
      db,
      [
        `SELECT id, user_id as userId, n_number as nNumber, nickname, model, created_at as createdAt, empty_weight as emptyWeight, empty_cg as emptyCg, max_weight as maxWeight, arm_pilot as armPilot, arm_passenger as armPassenger, arm_baggage as armBaggage, arm_fuel as armFuel, fuel_capacity as fuelCapacity, cruise_speed as cruiseSpeed, fuel_burn as fuelBurn, unusable_fuel as unusableFuel, cg_min as cgMin, cg_max as cgMax FROM aircraft WHERE user_id = $1 AND UPPER(n_number) = UPPER($2)`,
        `SELECT id, user_id as userId, n_number as nNumber, nickname, model, created_at as createdAt, empty_weight as emptyWeight, empty_cg as emptyCg, max_weight as maxWeight, arm_pilot as armPilot, arm_passenger as armPassenger, arm_baggage as armBaggage, arm_fuel as armFuel, fuel_capacity as fuelCapacity, cruise_speed as cruiseSpeed, fuel_burn as fuelBurn, unusable_fuel as unusableFuel, cg_min as cgMin, cg_max as cgMax FROM aircraft WHERE user_id = ? AND UPPER(n_number) = UPPER(?)`,
      ],
      [userId, nNumber]
    )
    return rows[0] || null
  } catch {
    return null
  }
}
