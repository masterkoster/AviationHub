'use client'

/**
 * Local SQLite CRUD for user_preferences.
 * Mirrors the Prisma UserPreferences model for cloud compatibility.
 *
 * Properties:
 *   userId        TEXT PRIMARY KEY
 *   theme         TEXT DEFAULT 'system'
 *   durationFormat TEXT DEFAULT 'decimal'     'decimal' | 'hmm'
 *   airportFormat TEXT DEFAULT 'icao'          'icao' | 'iata'
 *   timezone      TEXT DEFAULT 'utc'           'utc' | 'local'
 *   defaultAircraft TEXT
 *   defaultRole    TEXT                        'PIC' | 'SIC' | 'Solo' | 'Dual' | 'Instructor'
 *   dashboardLayout TEXT DEFAULT 'default'     'default' | 'compact' | 'detailed'
 *   widgetsVisible TEXT                        JSON array of visible widget IDs
 *   notificationCurrencyAlerts INTEGER DEFAULT 1
 *   notificationUpdateCheck INTEGER DEFAULT 1
 *   analyticsConsent INTEGER DEFAULT 0
 *   agendaCompact INTEGER DEFAULT 0
 *   distanceUnit    TEXT DEFAULT 'nm'          'nm' | 'km' | 'sm'
 *   temperatureUnit TEXT DEFAULT 'c'           'c' | 'f'
 *   updatedAt       TEXT
 */

import Database from '@tauri-apps/plugin-sql'

// ── Type ──────────────────────────────────────────────────────
export interface UserPreferences {
  userId: string
  theme: string
  durationFormat: 'decimal' | 'hmm'
  airportFormat: 'icao' | 'iata'
  timezone: 'utc' | 'local'
  defaultAircraft: string | null
  defaultRole: string | null
  dashboardLayout: 'default' | 'compact' | 'detailed'
  widgetsVisible: string | null
  notificationCurrencyAlerts: number
  notificationUpdateCheck: number
  analyticsConsent: number
  agendaCompact: number
  distanceUnit: 'nm' | 'km' | 'sm'
  temperatureUnit: 'c' | 'f'
  updatedAt: string | null
}

// ── Defaults ───────────────────────────────────────────────────
export function defaultPreferences(userId: string): UserPreferences {
  return {
    userId,
    theme: 'system',
    durationFormat: 'decimal',
    airportFormat: 'icao',
    timezone: 'utc',
    defaultAircraft: null,
    defaultRole: null,
    dashboardLayout: 'default',
    widgetsVisible: null,
    notificationCurrencyAlerts: 1,
    notificationUpdateCheck: 1,
    analyticsConsent: 0,
    agendaCompact: 0,
    distanceUnit: 'nm',
    temperatureUnit: 'c',
    updatedAt: null,
  }
}

// ── Helpers ────────────────────────────────────────────────────
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

async function tryExecute(sql: string, params?: unknown[]): Promise<void> {
  const db = await getDb()
  if (!db) return
  try {
    await db.execute(sql, params)
  } catch {
    // fallback for parameter style
    const fallback = params ? sql.replace(/\$1/g, '?').replace(/\$2/g, '?').replace(/\$3/g, '?').replace(/\$4/g, '?').replace(/\$5/g, '?').replace(/\$6/g, '?') : sql
    await db.execute(fallback, params)
  }
}

async function trySelect<T>(sql: string, params?: unknown[]): Promise<T[]> {
  const db = await getDb()
  if (!db) return []
  try {
    return await db.select<T[]>(sql, params)
  } catch {
    const fallback = params ? sql.replace(/\$1/g, '?').replace(/\$2/g, '?').replace(/\$3/g, '?').replace(/\$4/g, '?') : sql
    return await db.select<T[]>(fallback, params)
  }
}

// ── Schema ─────────────────────────────────────────────────────
// Belt-and-suspenders for this release — the canonical schema going forward
// is desktop/lib/local-migrations.ts (Migration 1 consolidates this
// statement verbatim).
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS user_preferences (
  userId              TEXT PRIMARY KEY,
  theme               TEXT NOT NULL DEFAULT 'system',
  durationFormat      TEXT NOT NULL DEFAULT 'decimal',
  airportFormat       TEXT NOT NULL DEFAULT 'icao',
  timezone            TEXT NOT NULL DEFAULT 'utc',
  defaultAircraft     TEXT,
  defaultRole         TEXT,
  dashboardLayout     TEXT NOT NULL DEFAULT 'default',
  widgetsVisible      TEXT,
  notificationCurrencyAlerts INTEGER NOT NULL DEFAULT 1,
  notificationUpdateCheck    INTEGER NOT NULL DEFAULT 1,
  analyticsConsent    INTEGER NOT NULL DEFAULT 0,
  agendaCompact       INTEGER NOT NULL DEFAULT 0,
  distanceUnit        TEXT NOT NULL DEFAULT 'nm',
  temperatureUnit     TEXT NOT NULL DEFAULT 'c',
  updatedAt           TEXT
)`

export async function ensurePreferencesSchema(): Promise<void> {
  await tryExecute(SCHEMA_SQL)
}

// ── CRUD ───────────────────────────────────────────────────────

/** Get preferences for a user. Returns defaults if none exist. */
export async function getUserPreferences(userId: string): Promise<UserPreferences> {
  await ensurePreferencesSchema()
  const rows = await trySelect<UserPreferences>(
    'SELECT * FROM user_preferences WHERE userId = $1',
    [userId]
  )
  if (rows.length > 0) return rows[0]
  const defaults = defaultPreferences(userId)
  await tryExecute(
    `INSERT INTO user_preferences (userId, theme, durationFormat, airportFormat, timezone,
      defaultAircraft, defaultRole, dashboardLayout, widgetsVisible,
      notificationCurrencyAlerts, notificationUpdateCheck, analyticsConsent, agendaCompact,
      distanceUnit, temperatureUnit, updatedAt)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    [
      defaults.userId, defaults.theme, defaults.durationFormat, defaults.airportFormat,
      defaults.timezone, defaults.defaultAircraft, defaults.defaultRole,
      defaults.dashboardLayout, defaults.widgetsVisible,
      defaults.notificationCurrencyAlerts, defaults.notificationUpdateCheck,
      defaults.analyticsConsent, defaults.agendaCompact,
      defaults.distanceUnit, defaults.temperatureUnit, new Date().toISOString(),
    ]
  )
  return defaults
}

/** Update specific preference keys for a user. */
export async function updateUserPreference(
  userId: string,
  key: keyof UserPreferences,
  value: string | number | null
): Promise<void> {
  await ensurePreferencesSchema()
  const now = new Date().toISOString()
  // Build a dynamic UPDATE — column name matches the key
  await tryExecute(
    `UPDATE user_preferences SET ${String(key)} = $1, updatedAt = $2 WHERE userId = $3`,
    [value, now, userId]
  )
}

/** Bulk update all preferences. */
export async function updateUserPreferences(
  userId: string,
  prefs: Partial<UserPreferences>
): Promise<void> {
  await ensurePreferencesSchema()
  const now = new Date().toISOString()
  const entries = Object.entries(prefs).filter(([k]) => k !== 'userId')
  if (entries.length === 0) return

  const setClauses = entries.map(([k], i) => `${k} = $${i + 1}`).join(', ')
  const values = entries.map(([, v]) => v)
  values.push(now, userId)

  await tryExecute(
    `UPDATE user_preferences SET ${setClauses}, updatedAt = $${values.length - 1} WHERE userId = $${values.length}`,
    values
  )
}
