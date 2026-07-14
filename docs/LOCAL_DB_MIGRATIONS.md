# Local DB migrations (desktop app)

The desktop (Tauri) app keeps an offline SQLite database at
`sqlite:aviationhub.db`, opened via the tauri SQL plugin in
`desktop/lib/local-auth.ts` (`getDb()`). Its schema is managed in **two
independent places** — know which one owns which tables before touching
either.

## The two migration systems

### 1. Native / Rust migrations — `src-tauri/src/lib.rs`

Uses `tauri_plugin_sql::Migration` (a real `sqlx` migrator). This is the
source of truth for the core tables: `users`, `pilot_profile`, `aircraft`,
`logbook_entries`, `logbook_entry_history`, `currency_rules`, `sync_queue`,
`tile_cache`, `tile_cache_meta`, `agenda_items`. These migrations run to
completion in Rust **before** `Database.load()` ever resolves in JS.
Progress is tracked by `sqlx` in its own `_sqlx_migrations` table — **not**
`PRAGMA user_version`.

To change one of those tables: append a new `Migration { version: N, ... }`
entry to the `migrations` vec in `src-tauri/src/lib.rs`, same rules as
below (append-only, never edit a shipped migration, prefer additive
`ALTER TABLE` for existing tables). This requires a Rust build, so it's a
separate workflow from the one below.

### 2. Local (TS) migrations — `desktop/lib/local-migrations.ts`

Uses a small hand-rolled runner and `PRAGMA user_version` (confirmed unused
by the native system above — safe for this file to own it exclusively).
This is the source of truth for the tables that were historically created
ad-hoc by scattered `CREATE TABLE IF NOT EXISTS` calls across the TS
codebase: `document_attachments`, `e6b_history`, `e6b_aircraft`,
`e6b_notes`, `user_preferences`, `certifications`, plus a second
(mismatched — see "Known issue" below) definition of
`logbook_entry_history`.

`migrateLocalDb(db)` is called once per session from `getDb()` in
`desktop/lib/local-auth.ts`, right after the database opens. It reads
`PRAGMA user_version`, runs every migration in the `MIGRATIONS` array whose
`version` is greater than the current value (in order), and bumps
`PRAGMA user_version` after each one individually.

Migration 1 (`LOCAL_SCHEMA_VERSION = 1`) is a **consolidation**: it
collects every `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`
statement that already existed ad-hoc in the TS codebase, verbatim. Because
those statements are all `IF NOT EXISTS`, running Migration 1 against an
existing pre-migration install (where the tables were already created by
the old ad-hoc `ensure*()` calls, and `user_version` is still 0) is a
no-op that simply stamps the install forward to version 1. A brand-new
install gets the same tables created for the first time. Either way, every
install ends up on a known, versioned baseline.

The old ad-hoc `ensure*()` / inline `CREATE TABLE` calls are **left in
place** for this release as a fallback (belt-and-suspenders) — each one now
has a comment pointing back here. They are safe to delete in a future pass
once `local-migrations.ts` has been the sole schema owner for a while.

## How to add migration 2 (or later)

1. In `desktop/lib/local-migrations.ts`, append a new entry to the
   `MIGRATIONS` array:

   ```ts
   {
     version: 2,
     name: 'add_some_column',
     statements: [
       `ALTER TABLE document_attachments ADD COLUMN thumbnail_path TEXT`,
     ],
   },
   ```

2. Bump `LOCAL_SCHEMA_VERSION` to `2`.
3. **Never edit a migration that has already shipped** (i.e. already went
   out in a released version of the app). Once real users' databases may
   have `user_version >= N`, migration `N`'s statements are permanently
   frozen — if you need to change your mind, add a new migration that
   corrects it, don't rewrite history.
4. SQLite doesn't support `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. If a
   migration might run against a database that could already have the
   column (e.g. because an ad-hoc `ensure*()` call added it independently),
   guard it the same way `ensureColumn()` in `desktop/lib/local-auth.ts`
   does — `try { await db.execute(...) } catch { /* already exists */ }`
   — rather than adding it as a plain array statement that would throw and
   abort the whole migration.

## Compatibility rule (read this before writing a migration)

Migrations here must be **forward-only** and **tolerate being run on any
prior version of the schema**, including:

- A completely fresh database (no tables at all).
- A pre-migration install where `user_version` is 0 but the ad-hoc
  `ensure*()` tables already exist (Migration 1's situation).
- An install that's already on some version `V` and is receiving
  migrations `V+1..N` in one session after an app update.

In practice that means:

- Every `CREATE TABLE` / `CREATE INDEX` statement must use
  `IF NOT EXISTS`.
- Every `ALTER TABLE ... ADD COLUMN` must be wrapped in try/catch to
  tolerate the column already existing.
- Never write a migration that assumes a specific prior state beyond "the
  migrations before it, in order, have run" — don't `DROP` or destructively
  rewrite a table in a way that would break someone still on an older
  version if this migration silently failed partway through.
- No explicit multi-statement transactions (`BEGIN`/`COMMIT` spanning
  multiple `db.execute()` calls) — the tauri SQL plugin doesn't guarantee
  consecutive `execute()` calls share one pooled connection, so statements
  within a migration are applied sequentially instead. This is why the
  idempotency rules above matter: if the app crashes mid-migration, the
  next launch re-attempts from the same (unbumped) `user_version` and must
  be able to pick up safely from a partially-applied state.

## Known issue: `logbook_entry_history` schema mismatch

`apps/desktop/src/lib/local-logbook.ts` creates (and inserts into) a
`logbook_entry_history` table with columns `action` and `reason`. The
*native* Rust migration (`src-tauri/src/lib.rs`, migration version 5)
creates a table of the **same name** without those two columns. Since the
Rust migration runs first (before JS ever gets a `Database` handle) and
`CREATE TABLE IF NOT EXISTS` is a no-op once the table exists, real
installs end up with the narrower Rust-created table — meaning
`local-logbook.ts`'s `INSERT INTO logbook_entry_history (..., action, ...,
reason, ...)` calls are expected to fail with "no such column: action" on
real devices today.

This is a pre-existing bug, independent of the migration runner added
here, and Migration 1 intentionally does not paper over it (it consolidates
what already existed, verbatim). Fixing it requires picking one source of
truth for this table — either extend the Rust migration with an additive
`ALTER TABLE logbook_entry_history ADD COLUMN action ...` /
`ADD COLUMN reason ...` (native side owns the table), or have a local
migration here `ALTER TABLE` the same columns in (TS side patches the
native table) — and should be its own follow-up change.
