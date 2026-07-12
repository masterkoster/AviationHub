use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        // Users table (local accounts)
        Migration {
            version: 1,
            description: "create_users_table",
            sql: "CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT,
                username TEXT UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now')),
                last_login TEXT DEFAULT (datetime('now'))
            )",
            kind: MigrationKind::Up,
        },
        // Pilot profile
        Migration {
            version: 2,
            description: "create_pilot_profile",
            sql: "CREATE TABLE IF NOT EXISTS pilot_profile (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                display_id TEXT,
                home_airport TEXT,
                medical_expiry TEXT,
                medical_class TEXT,
                bfr_expiry TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (user_id) REFERENCES users(id)
            )",
            kind: MigrationKind::Up,
        },
        // Aircraft
        Migration {
            version: 3,
            description: "create_aircraft",
            sql: "CREATE TABLE IF NOT EXISTS aircraft (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                n_number TEXT NOT NULL,
                nickname TEXT,
                model TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (user_id) REFERENCES users(id)
            )",
            kind: MigrationKind::Up,
        },
        // Logbook entries
        Migration {
            version: 4,
            description: "create_logbook_entries",
            sql: "CREATE TABLE IF NOT EXISTS logbook_entries (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                date TEXT NOT NULL,
                aircraft TEXT NOT NULL,
                route_from TEXT DEFAULT '',
                route_to TEXT DEFAULT '',
                total_time REAL DEFAULT 0,
                pic_time REAL DEFAULT 0,
                sic_time REAL DEFAULT 0,
                night_time REAL DEFAULT 0,
                instrument_time REAL DEFAULT 0,
                cross_country_time REAL DEFAULT 0,
                landings_day INTEGER DEFAULT 0,
                landings_night INTEGER DEFAULT 0,
                sim_flag INTEGER DEFAULT 0,
                remarks TEXT DEFAULT '',
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now')),
                voided INTEGER DEFAULT 0,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )",
            kind: MigrationKind::Up,
        },
        // Logbook entry history (audit trail)
        Migration {
            version: 5,
            description: "create_logbook_entry_history",
            sql: "CREATE TABLE IF NOT EXISTS logbook_entry_history (
                id TEXT PRIMARY KEY,
                entry_id TEXT NOT NULL,
                field_name TEXT NOT NULL,
                old_value TEXT,
                new_value TEXT,
                changed_by TEXT,
                changed_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (entry_id) REFERENCES logbook_entries(id)
            )",
            kind: MigrationKind::Up,
        },
        // Currency rules
        Migration {
            version: 6,
            description: "create_currency_rules",
            sql: "CREATE TABLE IF NOT EXISTS currency_rules (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                code TEXT NOT NULL,
                name TEXT NOT NULL,
                authority TEXT NOT NULL,
                status TEXT DEFAULT 'unknown',
                days_remaining INTEGER,
                completed INTEGER,
                required INTEGER,
                unit TEXT,
                next_due TEXT,
                updated_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (user_id) REFERENCES users(id)
            )",
            kind: MigrationKind::Up,
        },
        // Sync queue (for offline changes)
        Migration {
            version: 7,
            description: "create_sync_queue",
            sql: "CREATE TABLE IF NOT EXISTS sync_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                table_name TEXT NOT NULL,
                record_id TEXT NOT NULL,
                action TEXT NOT NULL,
                data TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                synced INTEGER DEFAULT 0
            )",
            kind: MigrationKind::Up,
        },
        // Tile cache (offline map tiles stored as BLOBs)
        Migration {
            version: 8,
            description: "create_tile_cache",
            sql: "CREATE TABLE IF NOT EXISTS tile_cache (
                provider TEXT NOT NULL,
                z INTEGER NOT NULL,
                x INTEGER NOT NULL,
                y INTEGER NOT NULL,
                data BLOB NOT NULL,
                cached_at TEXT DEFAULT (datetime('now')),
                PRIMARY KEY (provider, z, x, y)
            )",
            kind: MigrationKind::Up,
        },
        // Tile cache metadata (when was a provider's cache last refreshed)
        Migration {
            version: 9,
            description: "create_tile_cache_meta",
            sql: "CREATE TABLE IF NOT EXISTS tile_cache_meta (
                provider TEXT PRIMARY KEY,
                downloaded_at TEXT NOT NULL,
                tile_count INTEGER DEFAULT 0,
                updated_at TEXT DEFAULT (datetime('now'))
            )",
            kind: MigrationKind::Up,
        },
        // Migration 10: Add PIN column to users (for local account login)
        Migration {
            version: 10,
            description: "add_pin_to_users",
            sql: "ALTER TABLE users ADD COLUMN pin TEXT",
            kind: MigrationKind::Up,
        },
        // Migration 11: Add avatar_color column (for PS4-style profile tiles)
        Migration {
            version: 11,
            description: "add_avatar_color_to_users",
            sql: "ALTER TABLE users ADD COLUMN avatar_color TEXT DEFAULT 'emerald'",
            kind: MigrationKind::Up,
        },
        // Agenda / calendar items for dashboard widget + calendar pages
        Migration {
            version: 12,
            description: "create_agenda_items",
            sql: "CREATE TABLE IF NOT EXISTS agenda_items (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                item_type TEXT NOT NULL,
                title TEXT NOT NULL,
                details TEXT DEFAULT '',
                starts_at TEXT,
                due_at TEXT,
                status TEXT DEFAULT 'planned',
                related_href TEXT DEFAULT '',
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            )",
            kind: MigrationKind::Up,
        },
        // Advanced logbook + sync metadata fields
        Migration {
            version: 13,
            description: "extend_logbook_entries_for_sync_and_advanced_fields",
            sql: "ALTER TABLE logbook_entries ADD COLUMN solo_time REAL DEFAULT 0",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 14,
            description: "add_dual_given_to_logbook_entries",
            sql: "ALTER TABLE logbook_entries ADD COLUMN dual_given REAL DEFAULT 0",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 15,
            description: "add_dual_received_to_logbook_entries",
            sql: "ALTER TABLE logbook_entries ADD COLUMN dual_received REAL DEFAULT 0",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 16,
            description: "add_simulated_instrument_time_to_logbook_entries",
            sql: "ALTER TABLE logbook_entries ADD COLUMN simulated_instrument_time REAL DEFAULT 0",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 17,
            description: "add_cloud_entry_id_to_logbook_entries",
            sql: "ALTER TABLE logbook_entries ADD COLUMN cloud_entry_id TEXT",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 18,
            description: "add_sync_status_to_logbook_entries",
            sql: "ALTER TABLE logbook_entries ADD COLUMN sync_status TEXT DEFAULT 'local'",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 19,
            description: "add_sync_error_to_logbook_entries",
            sql: "ALTER TABLE logbook_entries ADD COLUMN sync_error TEXT",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 20,
            description: "add_synced_at_to_logbook_entries",
            sql: "ALTER TABLE logbook_entries ADD COLUMN synced_at TEXT",
            kind: MigrationKind::Up,
        },
        // Recovery PIN support (backup format v2 — dual-wrapped master key).
        // recovery_pin_hash: salted hash of the profile's immutable 8-digit
        // recovery PIN (same hashing approach as the `pin` column, distinct salt).
        Migration {
            version: 21,
            description: "add_recovery_pin_hash_to_users",
            sql: "ALTER TABLE users ADD COLUMN recovery_pin_hash TEXT",
            kind: MigrationKind::Up,
        },
        // backup_master_key: base64-encoded random 32-byte key used to encrypt
        // this profile's .ahb backups. Persisted locally (same trust boundary
        // as the PIN hash) so it never needs to be re-derived from either PIN.
        Migration {
            version: 22,
            description: "add_backup_master_key_to_users",
            sql: "ALTER TABLE users ADD COLUMN backup_master_key TEXT",
            kind: MigrationKind::Up,
        },
        // recovery_wrap_salt / recovery_wrap_iv / recovery_wrapped_key: a
        // precomputed wrapping of backup_master_key under a key derived from
        // the (never-persisted-in-plaintext) recovery PIN. Computed once when
        // the recovery PIN is generated, so exports can include a
        // recovery-unwrappable header without ever knowing the raw recovery PIN.
        Migration {
            version: 23,
            description: "add_recovery_wrap_salt_to_users",
            sql: "ALTER TABLE users ADD COLUMN recovery_wrap_salt TEXT",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 24,
            description: "add_recovery_wrap_iv_to_users",
            sql: "ALTER TABLE users ADD COLUMN recovery_wrap_iv TEXT",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 25,
            description: "add_recovery_wrapped_key_to_users",
            sql: "ALTER TABLE users ADD COLUMN recovery_wrapped_key TEXT",
            kind: MigrationKind::Up,
        },
        // Sync engine: retry bookkeeping for queued logbook pushes. `retries`
        // counts failed push attempts for a queue row; `next_retry_at` is an
        // ISO timestamp gating the exponential-backoff window (drain skips
        // rows whose backoff hasn't elapsed unless a manual sync forces it).
        Migration {
            version: 26,
            description: "add_retries_to_sync_queue",
            sql: "ALTER TABLE sync_queue ADD COLUMN retries INTEGER DEFAULT 0",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 27,
            description: "add_next_retry_at_to_sync_queue",
            sql: "ALTER TABLE sync_queue ADD COLUMN next_retry_at TEXT",
            kind: MigrationKind::Up,
        },
        // Sync engine: per-profile high-water mark for pulling cloud changes
        // (only entries updated after this timestamp are fetched on the next pull).
        Migration {
            version: 28,
            description: "add_last_pull_at_to_users",
            sql: "ALTER TABLE users ADD COLUMN last_pull_at TEXT",
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:aviationhub.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::default().build())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
