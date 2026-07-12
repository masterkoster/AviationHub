'use client'

import { useEffect, useState } from 'react'
import type Database from '@tauri-apps/plugin-sql'
import {
  getDb,
  trySelect,
  tryExecute,
  uuid,
  isCloudLinkedUserId,
  markLocalFlightSynced,
  markLocalFlightSyncFailed,
} from '@/apps/desktop/src/lib/local-logbook'
import type { SyncQueuePayload } from '@/apps/desktop/src/lib/local-logbook'
import { cloudApi } from '@/apps/desktop/src/lib/cloud-api'
import { getCloudSession } from '@/apps/desktop/src/lib/cloud-session'

// ─────────────────────────────────────────────────────────────────────────────
// Offline-first sync engine (logbook entries only, for now).
//
// Local SQLite is always the write target (see local-logbook.ts). Every
// create/update/void on a cloud-linked profile (`cloud-...` id) enqueues a
// coalesced sync_queue row there. This module drains that queue against
// /api/v1/logbook, resolves conflicts last-write-wins by `updatedAt`, and
// pulls down cloud-side changes made from other devices.
// ─────────────────────────────────────────────────────────────────────────────

const TABLE = 'logbook_entries'
const BASE_DELAY_MS = 30_000 // 30s
const MAX_DELAY_MS = 60 * 60 * 1000 // 1hr cap
const MAX_ATTEMPTS = 8
const FAR_FUTURE_ISO = '9999-12-31T23:59:59.000Z' // parks a given-up row so automatic drains skip it forever
const DEBOUNCE_MS = 5000
const INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

export type SyncStatus = 'synced' | 'syncing' | 'pending' | 'offline' | 'error'

export interface SyncSnapshot {
  status: SyncStatus
  pendingCount: number
  errorCount: number
}

let activeUserId: string | null = null
let draining = false
let engineInitialized = false
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let intervalTimer: ReturnType<typeof setInterval> | null = null

let snapshot: SyncSnapshot = { status: 'offline', pendingCount: 0, errorCount: 0 }
const listeners = new Set<(s: SyncSnapshot) => void>()

function emit(): void {
  for (const l of listeners) l(snapshot)
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine
}

/** Subscribe to live sync status changes. Returns an unsubscribe function. */
export function subscribeSyncStatus(cb: (s: SyncSnapshot) => void): () => void {
  listeners.add(cb)
  cb(snapshot)
  return () => listeners.delete(cb)
}

/** React hook wrapper around subscribeSyncStatus, for the title-bar indicator. */
export function useSyncStatus(): SyncSnapshot {
  const [state, setState] = useState<SyncSnapshot>(snapshot)
  useEffect(() => subscribeSyncStatus(setState), [])
  return state
}

/**
 * Tell the engine which local profile row (a `cloud-...` id, or null for a
 * local-only profile) is currently active. Called from the desktop shell
 * whenever auth state resolves or changes.
 */
export function setActiveSyncUserId(userId: string | null): void {
  if (activeUserId === userId) return
  activeUserId = userId
  void updateSnapshot()
}

async function updateSnapshot(opts: { syncing?: boolean } = {}): Promise<void> {
  if (!activeUserId || !isCloudLinkedUserId(activeUserId)) {
    snapshot = { status: 'offline', pendingCount: 0, errorCount: 0 }
    emit()
    return
  }

  if (opts.syncing) {
    snapshot = { ...snapshot, status: 'syncing' }
    emit()
    return
  }

  const online = isOnline()
  try {
    const db = await getDb()
    if (!db) {
      snapshot = { status: online ? 'synced' : 'offline', pendingCount: 0, errorCount: 0 }
      emit()
      return
    }

    const pendingRows = await trySelect<{ count: number }>(
      db,
      [
        `SELECT COUNT(*) as count FROM sync_queue sq JOIN logbook_entries le ON le.id = sq.record_id WHERE sq.table_name = $1 AND sq.synced = 0 AND le.user_id = $2`,
        `SELECT COUNT(*) as count FROM sync_queue sq JOIN logbook_entries le ON le.id = sq.record_id WHERE sq.table_name = ? AND sq.synced = 0 AND le.user_id = ?`,
      ],
      [TABLE, activeUserId]
    )
    const errorRows = await trySelect<{ count: number }>(
      db,
      [
        `SELECT COUNT(*) as count FROM logbook_entries WHERE user_id = $1 AND sync_status = 'pending'`,
        `SELECT COUNT(*) as count FROM logbook_entries WHERE user_id = ? AND sync_status = 'pending'`,
      ],
      [activeUserId]
    )

    const pendingCount = Number(pendingRows[0]?.count ?? 0)
    const errorCount = Number(errorRows[0]?.count ?? 0)

    let status: SyncStatus = 'synced'
    if (!online) status = 'offline'
    else if (errorCount > 0) status = 'error'
    else if (pendingCount > 0) status = 'pending'

    snapshot = { status, pendingCount, errorCount }
  } catch {
    snapshot = { status: online ? 'synced' : 'offline', pendingCount: 0, errorCount: 0 }
  }
  emit()
}

// ─────────────────────────────────────────────────────────────────────────────
// Drain: push queued local writes to the cloud.
// ─────────────────────────────────────────────────────────────────────────────

interface QueueRow {
  queueId: number
  recordId: string
  action: string
  data: string | null
  retries: number
  nextRetryAt: string | null
}

export interface DrainResult {
  processed: number
  failed: number
}

/**
 * Drain the sync queue for the active profile. Processes rows FIFO; a single
 * row's failure never blocks the rest (caught, backed off, next row runs).
 * `force` bypasses both the backoff window and the "gave up" state — used by
 * the manual "sync now" trigger.
 */
export async function drainSyncQueue(opts: { force?: boolean } = {}): Promise<DrainResult> {
  if (draining) return { processed: 0, failed: 0 }
  if (!activeUserId || !isCloudLinkedUserId(activeUserId)) return { processed: 0, failed: 0 }
  if (!isOnline()) return { processed: 0, failed: 0 }

  const session = await getCloudSession()
  if (!session.authenticated) return { processed: 0, failed: 0 }

  draining = true
  await updateSnapshot({ syncing: true })

  let processed = 0
  let failed = 0

  try {
    const db = await getDb()
    if (!db) return { processed, failed }

    const rows = await trySelect<QueueRow>(
      db,
      [
        `SELECT sq.id as queueId, sq.record_id as recordId, sq.action, sq.data, COALESCE(sq.retries, 0) as retries, sq.next_retry_at as nextRetryAt
         FROM sync_queue sq JOIN logbook_entries le ON le.id = sq.record_id
         WHERE sq.table_name = $1 AND sq.synced = 0 AND le.user_id = $2
         ORDER BY sq.id ASC`,
        `SELECT sq.id as queueId, sq.record_id as recordId, sq.action, sq.data, COALESCE(sq.retries, 0) as retries, sq.next_retry_at as nextRetryAt
         FROM sync_queue sq JOIN logbook_entries le ON le.id = sq.record_id
         WHERE sq.table_name = ? AND sq.synced = 0 AND le.user_id = ?
         ORDER BY sq.id ASC`,
      ],
      [TABLE, activeUserId]
    )

    const now = Date.now()

    for (const row of rows) {
      if (!opts.force && row.nextRetryAt) {
        const gate = Date.parse(row.nextRetryAt)
        if (!Number.isNaN(gate) && gate > now) continue // backoff window hasn't elapsed
      }

      let payload: SyncQueuePayload | null = null
      try {
        payload = row.data ? (JSON.parse(row.data) as SyncQueuePayload) : null
      } catch {
        payload = null
      }

      if (!payload) {
        // Corrupt/unreadable row — drop it rather than block the queue forever.
        await markQueueRowSynced(db, row.queueId)
        continue
      }

      try {
        await pushOne(db, row.recordId, payload)
        await markQueueRowSynced(db, row.queueId)
        processed++
      } catch (err) {
        failed++
        await recordQueueFailure(db, row, err)
      }
    }
  } finally {
    draining = false
    await updateSnapshot()
  }

  return { processed, failed }
}

async function markQueueRowSynced(db: Database, queueId: number): Promise<void> {
  await tryExecute(
    db,
    [`UPDATE sync_queue SET synced = 1 WHERE id = $1`, `UPDATE sync_queue SET synced = 1 WHERE id = ?`],
    [queueId]
  )
}

async function recordQueueFailure(db: Database, row: QueueRow, err: unknown): Promise<void> {
  const nextRetries = (row.retries || 0) + 1
  const message = err instanceof Error ? err.message : 'Sync failed'

  if (nextRetries >= MAX_ATTEMPTS) {
    await tryExecute(
      db,
      [
        `UPDATE sync_queue SET retries = $1, next_retry_at = $2 WHERE id = $3`,
        `UPDATE sync_queue SET retries = ?, next_retry_at = ? WHERE id = ?`,
      ],
      [nextRetries, FAR_FUTURE_ISO, row.queueId]
    )
    await markLocalFlightSyncFailed(row.recordId, message)
    return
  }

  const delay = Math.min(BASE_DELAY_MS * 2 ** (nextRetries - 1), MAX_DELAY_MS)
  const nextRetryAt = new Date(Date.now() + delay).toISOString()
  await tryExecute(
    db,
    [
      `UPDATE sync_queue SET retries = $1, next_retry_at = $2 WHERE id = $3`,
      `UPDATE sync_queue SET retries = ?, next_retry_at = ? WHERE id = ?`,
    ],
    [nextRetries, nextRetryAt, row.queueId]
  )
}

/**
 * Push one coalesced queue row's final state to the cloud.
 *   - no cloudEntryId yet -> POST (create)
 *   - cloudEntryId present -> conflict-check GET, then PUT (update/void)
 * Throws on failure so the caller can back off and retry.
 */
async function pushOne(db: Database, recordId: string, payload: SyncQueuePayload): Promise<void> {
  if (!payload.cloudEntryId) {
    const created = await cloudApi.createLogbookEntry(payload.fields as unknown as Record<string, unknown>)
    const createdId = (created as { id?: string } | null)?.id ?? null
    await markLocalFlightSynced(recordId, createdId)
    return
  }

  // Last-write-wins conflict check: if the server moved on since our local
  // snapshot, the server wins — pull it down instead of overwriting it.
  try {
    const server = await cloudApi.getLogbookEntry(payload.cloudEntryId)
    const serverUpdatedAt = Date.parse(String((server as { updatedAt?: string })?.updatedAt ?? ''))
    const localUpdatedAt = Date.parse(payload.localUpdatedAt)
    if (!Number.isNaN(serverUpdatedAt) && !Number.isNaN(localUpdatedAt) && serverUpdatedAt > localUpdatedAt) {
      await applyServerEntryToLocal(db, recordId, server as Record<string, unknown>, payload.cloudEntryId)
      return
    }
  } catch {
    // Conflict-check GET failing (e.g. transient network blip) shouldn't
    // block the push — fall through and let the PUT itself surface/retry
    // the real error.
  }

  await cloudApi.updateLogbookEntry(payload.cloudEntryId, payload.fields as unknown as Record<string, unknown>)
  await markLocalFlightSynced(recordId, payload.cloudEntryId)
}

async function applyServerEntryToLocal(
  db: Database,
  localId: string,
  server: Record<string, unknown>,
  cloudEntryId: string
): Promise<void> {
  const num = (k: string) => Number(server[k] ?? 0)
  const str = (k: string, fallback = '') => (server[k] != null ? String(server[k]) : fallback)
  const nullableStr = (k: string) => (server[k] != null ? String(server[k]) : null)

  await tryExecute(
    db,
    [
      `UPDATE logbook_entries SET date = $1, aircraft = $2, route_from = $3, route_to = $4, total_time = $5, pic_time = $6, sic_time = $7, solo_time = $8, dual_given = $9, dual_received = $10, night_time = $11, instrument_time = $12, simulated_instrument_time = $13, cross_country_time = $14, landings_day = $15, landings_night = $16, sim_flag = $17, remarks = $18, voided = $19, voided_at = $20, voided_by = $21, void_reason = $22, sync_status = 'synced', cloud_entry_id = $23, sync_error = NULL, synced_at = datetime('now'), updated_at = $24 WHERE id = $25`,
      `UPDATE logbook_entries SET date = ?, aircraft = ?, route_from = ?, route_to = ?, total_time = ?, pic_time = ?, sic_time = ?, solo_time = ?, dual_given = ?, dual_received = ?, night_time = ?, instrument_time = ?, simulated_instrument_time = ?, cross_country_time = ?, landings_day = ?, landings_night = ?, sim_flag = ?, remarks = ?, voided = ?, voided_at = ?, voided_by = ?, void_reason = ?, sync_status = 'synced', cloud_entry_id = ?, sync_error = NULL, synced_at = datetime('now'), updated_at = ? WHERE id = ?`,
    ],
    [
      str('date'),
      str('aircraft'),
      str('routeFrom'),
      str('routeTo'),
      num('totalTime'),
      num('picTime'),
      num('sicTime'),
      num('soloTime'),
      num('dualGiven'),
      num('dualReceived'),
      num('nightTime'),
      num('instrumentTime'),
      num('simulatedInstrumentTime'),
      num('crossCountryTime'),
      num('dayLandings'),
      num('nightLandings'),
      server.isSimulator ? 1 : 0,
      str('remarks'),
      server.isVoided ? 1 : 0,
      nullableStr('voidedAt'),
      nullableStr('voidedBy'),
      nullableStr('voidReason'),
      cloudEntryId,
      str('updatedAt', new Date().toISOString()),
      localId,
    ]
  )

  // The server now reflects the current state — any coalesced local edit
  // still sitting in the queue for this record is moot.
  await tryExecute(
    db,
    [
      `DELETE FROM sync_queue WHERE table_name = $1 AND record_id = $2 AND synced = 0`,
      `DELETE FROM sync_queue WHERE table_name = ? AND record_id = ? AND synced = 0`,
    ],
    [TABLE, localId]
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Pull: fetch cloud-side changes since the last successful pull.
// ─────────────────────────────────────────────────────────────────────────────

const INSERT_COLUMNS = [
  'id', 'user_id', 'date', 'aircraft', 'route_from', 'route_to', 'total_time', 'pic_time', 'sic_time',
  'solo_time', 'dual_given', 'dual_received', 'night_time', 'instrument_time', 'simulated_instrument_time',
  'cross_country_time', 'landings_day', 'landings_night', 'sim_flag', 'remarks', 'voided', 'voided_at',
  'voided_by', 'void_reason', 'sync_status', 'cloud_entry_id', 'synced_at', 'created_at', 'updated_at',
]

/**
 * Pull cloud-side logbook changes (from other devices) since the last
 * successful pull for this profile, and upsert them locally. Last-write-wins:
 * a local row with unsynced edits newer than the server's updatedAt is left
 * alone (it'll be pushed by the next drain); otherwise the server wins.
 */
export async function pullCloudChanges(userId?: string | null): Promise<void> {
  const uid = userId ?? activeUserId
  if (!uid || !isCloudLinkedUserId(uid)) return
  if (!isOnline()) return

  const session = await getCloudSession()
  if (!session.authenticated) return

  const db = await getDb()
  if (!db) return

  try {
    const lastPullRows = await trySelect<{ lastPullAt: string | null }>(
      db,
      [`SELECT last_pull_at as lastPullAt FROM users WHERE id = $1`, `SELECT last_pull_at as lastPullAt FROM users WHERE id = ?`],
      [uid]
    )
    const lastPullAt = lastPullRows[0]?.lastPullAt ?? null
    const pullStartedAt = new Date().toISOString()

    let serverEntries: Array<Record<string, unknown>> = []
    try {
      serverEntries = await cloudApi.getLogbookUpdatedSince(lastPullAt, { includeVoided: true, limit: 500 })
    } catch {
      return // offline / request failed — try again on the next trigger
    }

    for (const server of serverEntries) {
      const cloudId = String(server.id)
      const existing = await trySelect<{ id: string; updatedAt: string; syncStatus: string | null }>(
        db,
        [
          `SELECT id, updated_at as updatedAt, sync_status as syncStatus FROM logbook_entries WHERE cloud_entry_id = $1 AND user_id = $2`,
          `SELECT id, updated_at as updatedAt, sync_status as syncStatus FROM logbook_entries WHERE cloud_entry_id = ? AND user_id = ?`,
        ],
        [cloudId, uid]
      )

      if (existing.length === 0) {
        await insertPulledEntry(db, uid, cloudId, server)
        continue
      }

      const local = existing[0]
      const serverUpdatedAt = Date.parse(String(server.updatedAt ?? ''))
      const localUpdatedAt = Date.parse(local.updatedAt)
      const localHasUnsyncedEdits = Boolean(local.syncStatus) && local.syncStatus !== 'synced'

      if (
        localHasUnsyncedEdits &&
        !Number.isNaN(localUpdatedAt) &&
        !Number.isNaN(serverUpdatedAt) &&
        localUpdatedAt > serverUpdatedAt
      ) {
        continue // local edit is newer — keep it, the drain loop will push it
      }

      await applyServerEntryToLocal(db, local.id, server, cloudId)
    }

    await tryExecute(
      db,
      [`UPDATE users SET last_pull_at = $1 WHERE id = $2`, `UPDATE users SET last_pull_at = ? WHERE id = ?`],
      [pullStartedAt, uid]
    )
  } finally {
    await updateSnapshot()
  }
}

async function insertPulledEntry(db: Database, uid: string, cloudId: string, server: Record<string, unknown>): Promise<void> {
  const localId = uuid()
  const num = (k: string) => Number(server[k] ?? 0)
  const str = (k: string, fallback = '') => (server[k] != null ? String(server[k]) : fallback)
  const nullableStr = (k: string) => (server[k] != null ? String(server[k]) : null)
  const nowIso = new Date().toISOString()

  const params = [
    localId,
    uid,
    str('date'),
    str('aircraft'),
    str('routeFrom'),
    str('routeTo'),
    num('totalTime'),
    num('picTime'),
    num('sicTime'),
    num('soloTime'),
    num('dualGiven'),
    num('dualReceived'),
    num('nightTime'),
    num('instrumentTime'),
    num('simulatedInstrumentTime'),
    num('crossCountryTime'),
    num('dayLandings'),
    num('nightLandings'),
    server.isSimulator ? 1 : 0,
    str('remarks'),
    server.isVoided ? 1 : 0,
    nullableStr('voidedAt'),
    nullableStr('voidedBy'),
    nullableStr('voidReason'),
    'synced',
    cloudId,
    nowIso,
    str('createdAt', nowIso),
    str('updatedAt', nowIso),
  ]

  const dollarPlaceholders = INSERT_COLUMNS.map((_, i) => `$${i + 1}`).join(', ')
  const qPlaceholders = INSERT_COLUMNS.map(() => '?').join(', ')

  await tryExecute(
    db,
    [
      `INSERT INTO logbook_entries (${INSERT_COLUMNS.join(', ')}) VALUES (${dollarPlaceholders})`,
      `INSERT INTO logbook_entries (${INSERT_COLUMNS.join(', ')}) VALUES (${qPlaceholders})`,
    ],
    params
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Triggers: app start, online event, debounced after local writes, interval.
// ─────────────────────────────────────────────────────────────────────────────

function scheduleDebouncedSync(): void {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    void drainSyncQueue()
  }, DEBOUNCE_MS)
}

/**
 * Wire up global sync triggers. Safe to call multiple times (idempotent) —
 * call once from the desktop shell on mount. Returns a cleanup function.
 */
export function initSyncEngine(): () => void {
  if (typeof window === 'undefined') return () => {}
  if (engineInitialized) return () => {}
  engineInitialized = true

  const handleOnline = () => {
    void drainSyncQueue()
    void pullCloudChanges()
  }
  const handleOffline = () => {
    void updateSnapshot()
  }
  const handleQueueChanged = () => {
    scheduleDebouncedSync()
  }

  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)
  window.addEventListener('desktop-sync-queue-changed', handleQueueChanged)

  intervalTimer = setInterval(() => {
    if (isOnline()) {
      void drainSyncQueue()
    }
  }, INTERVAL_MS)

  void drainSyncQueue()
  void updateSnapshot()

  return () => {
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
    window.removeEventListener('desktop-sync-queue-changed', handleQueueChanged)
    if (intervalTimer) clearInterval(intervalTimer)
    if (debounceTimer) clearTimeout(debounceTimer)
    intervalTimer = null
    debounceTimer = null
    engineInitialized = false
  }
}

/** Manual trigger (e.g. clicking the sync badge). Ignores backoff windows. */
export async function syncNow(): Promise<void> {
  await drainSyncQueue({ force: true })
  await pullCloudChanges()
  await updateSnapshot()
}
