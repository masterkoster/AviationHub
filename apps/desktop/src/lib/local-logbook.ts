'use client'

import Database from '@tauri-apps/plugin-sql'

let dbPromise: Promise<Database> | null = null

async function getDb(): Promise<Database | null> {
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

function uuid(): string {
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
// Aircraft CRUD
// ─────────────────────────────────────────────────────────────────────────────

export interface LocalAircraft {
  id: string
  userId: string
  nNumber: string
  nickname: string | null
  model: string | null
  createdAt: string
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
}

export async function getLocalAircraft(userId: string): Promise<LocalAircraft[]> {
  const db = await getDb()
  if (!db) return []
  try {
    return await trySelect<LocalAircraft>(
      db,
      [
        `SELECT id, user_id as userId, n_number as nNumber, nickname, model, created_at as createdAt FROM aircraft WHERE user_id = $1 ORDER BY n_number ASC`,
        `SELECT id, user_id as userId, n_number as nNumber, nickname, model, created_at as createdAt FROM aircraft WHERE user_id = ? ORDER BY n_number ASC`,
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
  try {
    const rows = await trySelect<LocalAircraft>(
      db,
      [
        `SELECT id, user_id as userId, n_number as nNumber, nickname, model, created_at as createdAt FROM aircraft WHERE id = $1`,
        `SELECT id, user_id as userId, n_number as nNumber, nickname, model, created_at as createdAt FROM aircraft WHERE id = ?`,
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
