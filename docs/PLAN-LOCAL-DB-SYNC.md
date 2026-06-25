# Local SQLite ↔ Azure SQL Sync Compatibility Plan

> Status: **Approved Direction** · Implementation in Phase 3

## The Problem

A user starts in **local mode** (offline, no account). Later they want to create an online account and sync their logbook to the cloud. The local SQLite DB must be shaped so its data can flow cleanly into Azure SQL — no loss, no awkward transformations.

## Current Reality

| Aspect | Local SQLite (Tauri) | Cloud Azure SQL (Prisma) |
|---|---|---|
| Table names | `users`, `pilot_profile`, `logbook_entries`, `aircraft` | `User`, `PilotProfile`, `LogbookEntry`, `UserAircraft` |
| Column names | `snake_case` (`home_airport`, `total_time`) | `camelCase` (`homeAirport`, `totalTime`) |
| Types | `TEXT`, `INTEGER`, `REAL` | `NVarChar(36)`, `Int`, `Float` |
| IDs | `uuid()` strings | `uuid()` strings |
| Timestamps | `datetime('now')` ISO strings | `DateTime` |

**Semantic mapping is 1:1** today — every local column has a corresponding Azure column. So sync is **possible** with a column-name transformation layer. But it's not **byte-compatible**: same query won't work on both.

## Strategy (Approved)

We use **Option B: Schema parity via migrations**, plus a thin sync adapter.

### Option B: Mirror Azure schema in SQLite

We add a new migration (version 10+) that **creates sync-shaped tables** using Azure's exact table + column names. These become the canonical local storage. Existing snake_case tables stay for compatibility but get migrated.

New tables created with Azure-pascalcase + camelCase columns:

```sql
-- Sync-compatible tables (mirror Azure SQL schema)
CREATE TABLE IF NOT EXISTS UserSync (
  id TEXT PRIMARY KEY,                       -- NVarChar(36)
  username TEXT UNIQUE,                       -- NVarChar(50)
  email TEXT UNIQUE,                          -- NVarChar(255)
  name TEXT,                                  -- NVarChar(255)
  role TEXT DEFAULT 'user',                   -- NVarChar(20)
  tier TEXT DEFAULT 'free',                   -- NVarChar(20)
  homeState TEXT,                             -- NVarChar(2)
  bfrExpiry TEXT,                             -- DateTime (ISO)
  medicalExpiry TEXT,                          -- DateTime (ISO)
  medicalClass TEXT,                          -- NVarChar(10)
  password TEXT,                              -- NVarChar(255) (nullable for local-only)
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now')),
  -- Local-only sentinel: distinguishes local-only users from cloud-linked
  syncOrigin TEXT DEFAULT 'local',            -- 'local' | 'cloud' | 'linked'
  cloudUserId TEXT                            -- when linked to cloud, this is the id there
);

CREATE TABLE IF NOT EXISTS PilotProfileSync (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  displayId TEXT UNIQUE,
  homeAirport TEXT,                           -- NVarChar(10)
  homeAirportName TEXT,                       -- NVarChar(200)
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS LogbookEntrySync (
  id TEXT PRIMARY KEY,
  pilotProfileId TEXT,
  date TEXT NOT NULL,                         -- ISO datetime
  aircraft TEXT NOT NULL,                     -- NVarChar(100)
  aircraftId TEXT,                            -- NVarChar(36)
  routeFrom TEXT DEFAULT '',                  -- NVarChar(10) — matches Azure
  routeTo TEXT DEFAULT '',                    -- NVarChar(10)
  routeVia TEXT,                              -- Max — NVarChar(Max) via TEXT
  totalTime REAL DEFAULT 0,
  picTime REAL DEFAULT 0,
  sicTime REAL DEFAULT 0,
  soloTime REAL DEFAULT 0,
  dualGiven REAL DEFAULT 0,
  dualReceived REAL DEFAULT 0,
  nightTime REAL DEFAULT 0,
  instrumentTime REAL DEFAULT 0,
  simulatedInstrumentTime REAL DEFAULT 0,
  crossCountryTime REAL DEFAULT 0,
  dayLandings INTEGER DEFAULT 0,
  nightLandings INTEGER DEFAULT 0,
  approaches INTEGER DEFAULT 0,
  holds INTEGER DEFAULT 0,
  isCrossCountry INTEGER DEFAULT 0,
  isNight INTEGER DEFAULT 0,
  isSolo INTEGER DEFAULT 0,
  remarks TEXT,
  instructor TEXT,                            -- NVarChar(100)
  isVoided INTEGER DEFAULT 0,
  voidedAt TEXT,
  voidReason TEXT,
  authority TEXT DEFAULT 'FAA',
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now')),
  -- Sync fields (local-only; not synced to cloud)
  syncState TEXT DEFAULT 'new',               -- 'new' | 'synced' | 'modified' | 'deleted'
  lastSyncedAt TEXT,
  cloudId TEXT                                -- when synced, the Azure-side id (if different)
);

CREATE TABLE IF NOT EXISTS LogbookEntryHistorySync (
  id TEXT PRIMARY KEY,
  entryId TEXT NOT NULL,
  action TEXT,                                -- CREATED | UPDATED | VOIDED | UNVOIDED
  fieldName TEXT,
  oldValue TEXT,
  newValue TEXT,
  changedBy TEXT,
  changedAt TEXT DEFAULT (datetime('now')),
  reason TEXT
);

CREATE TABLE IF NOT EXISTS UserAircraftSync (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  nNumber TEXT NOT NULL,                      -- NVarChar(10)
  nickname TEXT,                              -- NVarChar(100)
  notes TEXT,                                 -- NVarChar(Max)
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now')),
  syncState TEXT DEFAULT 'new',
  lastSyncedAt TEXT,
  cloudId TEXT
);

-- Logbook starting totals (carries the user's pre-AviationHub totals)
CREATE TABLE IF NOT EXISTS LogbookStartingTotalSync (
  id TEXT PRIMARY KEY,
  userId TEXT UNIQUE,
  totalTime REAL DEFAULT 0,
  picTime REAL DEFAULT 0,
  sicTime REAL DEFAULT 0,
  nightTime REAL DEFAULT 0,
  instrumentTime REAL DEFAULT 0,
  crossCountryTime REAL DEFAULT 0,
  landingsDay INTEGER DEFAULT 0,
  landingsNight INTEGER DEFAULT 0,
  asOfDate TEXT,
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now'))
);
```

### Why this approach

1. **User logbook data is portable** — every flight, aircraft, and total has a clear path to the cloud.
2. **`syncState` columns** mark which rows are new/modified/deleted since last sync — the sync engine just drains these.
3. **`cloudId` columns** preserve the mapping if Azure ever regenerates an ID (rare, but possible during a manual merge operation).
4. **`syncOrigin` on UserSync** distinguishes:
   - `'local'` — created locally, no cloud account yet
   - `'linked'` — user signed in with an existing cloud account (`cloudUserId` filled)
   - `'cloud'` — created via cloud sign-up, pulled down to local

### Linking a local user to a cloud account (Phase 3 user story)

1. User clicks "Link to Cloud Account" in Settings.
2. They enter cloud credentials (or sign up new cloud account).
3. Cloud returns a `cloudUserId`.
4. We update `UserSync.syncOrigin = 'linked'` and `cloudUserId = <id>`.
5. Sync engine reads all rows where `syncState != 'synced'`:
   - Sends `LogbookEntrySync` rows → cloud `POST /api/v1/logbook`
   - Sends `UserAircraftSync` rows → cloud `POST /api/v1/aircraft`
   - Sends `LogbookStartingTotalSync` → cloud `PUT /api/v1/logbook/starting-totals`
6. For each row uploaded, sets `syncState = 'synced'` and `cloudId = <returned id>`.
7. Then pulls any rows that exist on cloud but not locally → inserts as `synced`.

### Export to file (user safety net)

The user can always export their logbook to CSV/JSON locally — this is a **plain-text dump of `LogbookEntrySync` rows**. It's their data, not encrypted, not proprietary:

```
File > Export > CSV/JSON
  → SELECT * FROM LogbookEntrySync WHERE isVoided = 0 ORDER BY date
  → Write to user-chosen path via Tauri file dialog
```

This guarantees the user is never locked in — they can leave with all their data anytime.

### Encryption at rest (Phase 2 stretch)

The local SQLite file (`aviationhub.db`) lives in the OS app data directory. By default it's plain SQLite. For encryption:

- **SQLCipher** (encrypted SQLite) — supported by `tauri-plugin-sql`'s `sqlite` feature via the `sqlcipher` feature flag in Rust. Adds ~1MB to the binary.
- Encryption is per-DB with a key stored in the OS keychain (via `tauri-plugin-keychain` or similar).
- The local user has no password (sentinel placeholder), so the encryption key is auto-generated on first run and stored in the OS keychain. User never sees it; it just keeps the file from being readable if someone steals the laptop.
- This is **opt-in** for users (Settings → "Encrypt local data") since it adds a recovery complexity (if they reinstall the OS, they lose the key + their data unless they exported to CSV first).

## What I'm Not Doing Right Now

- **Schema migration to UserSync etc.** — **Phase 3 work** (sync engine). Don't want to break things mid-setup.
- **Data migration from old snake_case tables** — Phase 3 (write a `migrateLegacyTables()` Rust command that copies rows from `logbook_entries` → `LogbookEntrySync`).
- **Encryption** — Phase 2 stretch goal, not blocking.

## What I AM Doing Right Now

1. **Fixed** the immediate local profile creation bug (SQL placeholder syntax).
2. **Documented** the sync strategy so when we get to Phase 3, we know the shape.
3. The existing `users`, `pilot_profile`, `aircraft`, `logbook_entries` tables keep working for now; we'll migrate to `UserSync` etc. during Phase 3.

## Cloud API Additions Needed for Sync (Phase 3)

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/logbook?since=<ISO>` | Pull all entries modified since last sync |
| `POST /api/v1/logbook/bulk` | Push multiple entries in one request |
| `PUT /api/v1/logbook/[id]` (already exists) | Update existing entry |
| `GET /api/v1/aircraft?since=<ISO>` | Pull aircraft |
| `POST /api/v1/aircraft/bulk` | Push multiple aircraft |
| `GET /api/v1/logbook/starting-totals` | Pull starting totals |
| `PUT /api/v1/logbook/starting-totals` | Push starting totals |

All exist individually except the `bulk` variants — adding bulk is easy once we have the sync queue drain.