'use client'

import type Database from '@tauri-apps/plugin-sql'

/**
 * Versioned schema migration runner for the desktop app's local SQLite
 * database (`sqlite:aviationhub.db`, opened by `getDb()` in
 * `desktop/lib/local-auth.ts`).
 *
 * Why this exists: today the local schema is created lazily by scattered
 * `CREATE TABLE IF NOT EXISTS` calls spread across many files (document
 * storage, E6B tools, user preferences, logbook history, certifications —
 * see the inventory in `docs/LOCAL_DB_MIGRATIONS.md`). That works for a
 * fresh install but gives us no reliable way to evolve the schema (rename a
 * column, backfill data, drop a table) across an app upgrade, because
 * there's nowhere that tracks "which schema changes has this specific
 * user's local.db already received." This file is that tracking mechanism.
 *
 * Relationship to the *native* migrations in `src-tauri/src/lib.rs`:
 * `tauri_plugin_sql` already runs a real versioned migration list (via
 * `sqlx`'s migrator, which tracks progress in its own `_sqlx_migrations`
 * table — NOT `PRAGMA user_version`) for the core tables (`users`,
 * `pilot_profile`, `aircraft`, `logbook_entries`, `logbook_entry_history`,
 * `currency_rules`, `sync_queue`, `tile_cache`, `tile_cache_meta`,
 * `agenda_items`), and that migration list runs to completion in Rust
 * *before* `Database.load()` ever resolves in JS. Those tables are
 * intentionally NOT duplicated here — they already have a proper source of
 * truth. `PRAGMA user_version` is unused by that system (confirmed against
 * the vendored `tauri-plugin-sql` 2.4.0 source and by grepping this repo),
 * so it's safe for this file to use it as its own independent counter for
 * the ad-hoc, TS-only tables.
 *
 * Transactions: the tauri SQL plugin only exposes two commands to JS —
 * `execute` and `select` — each of which is handled independently on the
 * Rust side against a pooled connection (see `commands.rs` in the plugin).
 * There is no JS-level guarantee that two consecutive `db.execute()` calls
 * share the same underlying connection, so wrapping multiple statements in
 * an explicit `BEGIN`/`COMMIT` here would not be a reliable transaction —
 * a pooled connection could interleave and commit a partial set. Statements
 * are therefore applied sequentially. Every statement in every migration
 * MUST be safe to re-run / resume from a partial application (`IF NOT
 * EXISTS`, additive `ALTER TABLE ... ADD COLUMN` guarded against
 * "duplicate column", etc.) — see docs/LOCAL_DB_MIGRATIONS.md for the full
 * compatibility rule.
 */

export const LOCAL_SCHEMA_VERSION = 1

interface LocalMigration {
  version: number
  name: string
  statements: string[]
}

/**
 * Ordered list of migrations. Append new entries here — never edit a
 * migration that has already shipped (see docs/LOCAL_DB_MIGRATIONS.md).
 */
const MIGRATIONS: LocalMigration[] = [
  {
    version: 1,
    name: 'consolidate_adhoc_tables',
    statements: [
      // ── desktop/lib/document-store.ts (ensureTable) ──────────────────
      // Identical statement is also duplicated in desktop/lib/backup.ts's
      // restore path (both are `IF NOT EXISTS`, so harmless duplication).
      `CREATE TABLE IF NOT EXISTS document_attachments (
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
      )`,

      // ── desktop/lib/e6b-store.ts (ensureE6bSchema) ───────────────────
      `CREATE TABLE IF NOT EXISTS e6b_history (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        tool TEXT NOT NULL,
        input_json TEXT NOT NULL,
        output_json TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_e6b_history_user_time ON e6b_history(user_id, created_at DESC)`,
      `CREATE TABLE IF NOT EXISTS e6b_aircraft (
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
      )`,
      `CREATE TABLE IF NOT EXISTS e6b_notes (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        tool TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(user_id, tool)
      )`,

      // ── desktop/lib/user-preferences.ts (SCHEMA_SQL) ─────────────────
      // Column names are camelCase in the source file — kept verbatim.
      `CREATE TABLE IF NOT EXISTS user_preferences (
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
      )`,

      // ── apps/desktop/src/lib/local-logbook.ts (ensureHistoryTable) ───
      // NOTE: this table name collides with a table the *native* Rust
      // migrator already creates (src-tauri/src/lib.rs, migration version
      // 5) under the same name but with a NARROWER column set (no
      // `action`, no `reason`). Because the Rust migration runs first and
      // `CREATE TABLE IF NOT EXISTS` is a no-op once the table exists, on
      // every real install the Rust-created table wins and this statement
      // never actually executes its column list. The missing `action` /
      // `reason` columns are now added by Rust migrations 29-30 (also in
      // src-tauri/src/lib.rs), so the native side remains the source of
      // truth for this table; this statement is kept verbatim per the
      // "consolidate what exists" goal and only matters for a DB where the
      // native migrator never ran at all. See docs/LOCAL_DB_MIGRATIONS.md.
      `CREATE TABLE IF NOT EXISTS logbook_entry_history (
        id TEXT PRIMARY KEY,
        entry_id TEXT NOT NULL,
        action TEXT NOT NULL,
        field_name TEXT,
        old_value TEXT,
        new_value TEXT,
        changed_by TEXT NOT NULL,
        reason TEXT,
        changed_at TEXT NOT NULL
      )`,

      // ── app/desktop/profile/page.tsx (ensureCertTable) ───────────────
      `CREATE TABLE IF NOT EXISTS certifications (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        type TEXT NOT NULL,
        name TEXT,
        issueDate TEXT,
        expiryDate TEXT,
        certificateNumber TEXT,
        ratings TEXT,
        notes TEXT,
        created_at TEXT,
        updated_at TEXT
      )`,
    ],
  },
]

async function readUserVersion(db: Database): Promise<number> {
  const rows = await db.select<{ user_version: number }[]>('PRAGMA user_version')
  return rows[0]?.user_version ?? 0
}

async function writeUserVersion(db: Database, version: number): Promise<void> {
  // PRAGMA statements don't support bound parameters in SQLite — `version`
  // is always one of our own integer literals (never user input), so
  // inlining it is safe.
  await db.execute(`PRAGMA user_version = ${version}`)
}

let migratedOnce = false

/**
 * Run any local-schema migrations that haven't been applied to this
 * database yet, tracked via `PRAGMA user_version`. Safe to call multiple
 * times per session (memoized after a successful run) and safe to call on
 * a database at any prior state, including:
 *  - a brand-new database (`user_version` 0, no tables yet)
 *  - an existing pre-migration install (`user_version` 0, tables already
 *    created by the scattered ad-hoc `ensure*`/`CREATE TABLE IF NOT
 *    EXISTS` calls) — Migration 1's statements are all `IF NOT EXISTS`, so
 *    they no-op through to just stamping the version forward
 *  - an already-migrated install (`user_version` >= LOCAL_SCHEMA_VERSION)
 *
 * Failures are logged and swallowed rather than thrown: every statement in
 * Migration 1 is `IF NOT EXISTS`, so a failure here means something
 * unexpected (e.g. a genuinely corrupt DB file) rather than a missing
 * table — better to let the app continue (the existing ad-hoc `ensure*`
 * calls remain in place as a fallback for this release) than to brick the
 * whole app on launch. `migratedOnce` is only set on success, so a
 * transient failure gets retried on the next `getDb()` call in the same
 * session.
 */
export async function migrateLocalDb(db: Database): Promise<void> {
  if (migratedOnce) return
  try {
    let currentVersion = await readUserVersion(db)

    for (const migration of MIGRATIONS) {
      if (migration.version <= currentVersion) continue

      for (const statement of migration.statements) {
        await db.execute(statement)
      }

      // Stamp the version forward after each migration individually
      // (rather than once at the very end) so a later migration failing
      // doesn't cause an earlier, already-applied migration to be
      // reattempted unnecessarily on the next launch.
      await writeUserVersion(db, migration.version)
      currentVersion = migration.version
    }

    migratedOnce = true
  } catch (err) {
    console.error('[local-migrations] migrateLocalDb failed:', err)
  }
}
