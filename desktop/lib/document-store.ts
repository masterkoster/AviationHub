'use client'

/**
 * Document storage layer for AviationHub Desktop.
 *
 * Architecture:
 *   SQLite stores metadata (filename, type, entity association, etc.)
 *   Actual files live at {app_data_dir}/documents/{user_id}/{uuid}.{ext}
 *
 * Entity types:
 *   'aircraft'   — tied to an N-Number (entity_id = nNumber)
 *   'flight'     — tied to a logbook entry (entity_id = flight.id)
 *   'flight_plan' — tied to a saved flight plan (entity_id = plan.id)
 */

import Database from '@tauri-apps/plugin-sql'

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50 MB
const WARN_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

// Reject these MIME types — no executables
const BLOCKED_MIMES = new Set([
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/x-msi',
  'application/x-sh',
  'application/x-bat',
  'application/x-csh',
  'application/x-php',
  'application/x-perl',
  'application/x-python',
  'application/vnd.microsoft.portable-executable',
  'application/x-elf',
  'application/x-mach-binary',
])

export interface DocumentRecord {
  id: string
  user_id: string
  entity_type: 'aircraft' | 'flight' | 'flight_plan'
  entity_id: string
  file_name: string
  mime_type: string
  file_size: number
  storage_path: string
  notes: string | null
  created_at: string
}

export type EntityType = DocumentRecord['entity_type']

let dbPromise: Promise<Database | null> | null = null

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

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

async function tryExecute(db: Database, sqls: string[], params: unknown[]): Promise<void> {
  let lastErr: unknown = null
  for (const sql of sqls) {
    try { await db.execute(sql, params); return } catch (e) { lastErr = e }
  }
  throw lastErr
}

async function trySelect<T>(db: Database, sqls: string[], params: unknown[]): Promise<T[]> {
  let lastErr: unknown = null
  for (const sql of sqls) {
    try { return await db.select<T[]>(sql, params) } catch (e) { lastErr = e }
  }
  throw lastErr
}

/** Ensure the document_attachments table exists. */
async function ensureTable(): Promise<void> {
  const db = await getDb()
  if (!db) return
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
}

/** Get the app data directory for document storage. */
async function getDocsDir(userId: string): Promise<string> {
  const { appDataDir } = await import('@tauri-apps/api/path')
  const appDir = await appDataDir()
  return `${appDir}documents/${userId}`
}

/** Validate a file before storing. Returns error string or null if OK. */
export function validateFile(fileName: string, mimeType: string, fileSize: number): string | null {
  if (!fileName.trim()) return 'File name is required'

  if (BLOCKED_MIMES.has(mimeType)) {
    return 'This file type is not allowed'
  }

  if (fileSize > MAX_FILE_SIZE) {
    return `File is too large (max ${MAX_FILE_SIZE / 1024 / 1024} MB)`
  }

  if (fileSize > WARN_FILE_SIZE) {
    // Not an error, but caller should show a warning
    return null
  }

  return null
}

/**
 * Save a document file to disk and insert its metadata into SQLite.
 *
 * @param userId  - The local user's ID
 * @param entityType - 'aircraft' | 'flight' | 'flight_plan'
 * @param entityId   - The N-Number, flight ID, or flight plan ID
 * @param fileName   - Original file name
 * @param fileBytes  - Raw file bytes
 * @param mimeType   - MIME type
 * @param notes      - Optional caption
 * @returns The created DocumentRecord
 */
export async function saveDocument(
  userId: string,
  entityType: EntityType,
  entityId: string,
  fileName: string,
  fileBytes: Uint8Array,
  mimeType: string,
  notes?: string,
): Promise<DocumentRecord> {
  const db = await getDb()
  if (!db) throw new Error('Database not available')

  await ensureTable()

  const id = uuid()
  const ext = fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : 'bin'
  const storagePath = `${await getDocsDir(userId)}/${id}.${ext}`

  // Write file via Tauri fs plugin
  const { mkdir, writeFile } = await import('@tauri-apps/plugin-fs')
  await mkdir(await getDocsDir(userId), { recursive: true })
  await writeFile(storagePath, fileBytes)

  const now = new Date().toISOString()

  await tryExecute(db, [
    `INSERT INTO document_attachments (id, user_id, entity_type, entity_id, file_name, mime_type, file_size, storage_path, notes, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    `INSERT INTO document_attachments (id, user_id, entity_type, entity_id, file_name, mime_type, file_size, storage_path, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ], [id, userId, entityType, entityId, fileName, mimeType, fileBytes.length, storagePath, notes || null, now])

  return { id, user_id: userId, entity_type: entityType as EntityType, entity_id: entityId, file_name: fileName, mime_type: mimeType, file_size: fileBytes.length, storage_path: storagePath, notes: notes || null, created_at: now }
}

/**
 * Delete a document record and remove the file from disk.
 */
export async function deleteDocument(docId: string): Promise<void> {
  const db = await getDb()
  if (!db) throw new Error('Database not available')

  const rows = await trySelect<{ storage_path: string }>(db, [
    `SELECT storage_path FROM document_attachments WHERE id = $1`,
    `SELECT storage_path FROM document_attachments WHERE id = ?`,
  ], [docId])

  if (rows.length > 0) {
    try {
      const { remove } = await import('@tauri-apps/plugin-fs')
      await remove(rows[0].storage_path)
    } catch { /* file may not exist */ }
  }

  await tryExecute(db, [
    `DELETE FROM document_attachments WHERE id = $1`,
    `DELETE FROM document_attachments WHERE id = ?`,
  ], [docId])
}

/**
 * Read a document's file bytes from disk.
 */
export async function readDocumentFile(storagePath: string): Promise<Uint8Array> {
  const { readFile } = await import('@tauri-apps/plugin-fs')
  return await readFile(storagePath)
}

/**
 * Get all documents for a given entity.
 */
export async function getDocuments(
  entityType: EntityType,
  entityId: string,
): Promise<DocumentRecord[]> {
  const db = await getDb()
  if (!db) return []
  await ensureTable()
  try {
    return await trySelect<DocumentRecord>(db, [
      `SELECT * FROM document_attachments WHERE entity_type = $1 AND entity_id = $2 ORDER BY created_at DESC`,
      `SELECT * FROM document_attachments WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC`,
    ], [entityType, entityId])
  } catch {
    return []
  }
}

/**
 * Get ALL documents for a user (for the Profile document browser).
 */
export async function getAllDocumentsByUser(userId: string): Promise<DocumentRecord[]> {
  const db = await getDb()
  if (!db) return []
  await ensureTable()
  try {
    return await trySelect<DocumentRecord>(db, [
      `SELECT * FROM document_attachments WHERE user_id = $1 ORDER BY created_at DESC`,
      `SELECT * FROM document_attachments WHERE user_id = ? ORDER BY created_at DESC`,
    ], [userId])
  } catch {
    return []
  }
}

/**
 * Get document count for an entity (used on aircraft cards, etc.).
 */
export async function getDocumentCount(
  entityType: EntityType,
  entityId: string,
): Promise<number> {
  const db = await getDb()
  if (!db) return 0
  await ensureTable()
  try {
    const rows = await trySelect<{ cnt: number }>(db, [
      `SELECT COUNT(*) as cnt FROM document_attachments WHERE entity_type = $1 AND entity_id = $2`,
      `SELECT COUNT(*) as cnt FROM document_attachments WHERE entity_type = ? AND entity_id = ?`,
    ], [entityType, entityId])
    return rows[0]?.cnt ?? 0
  } catch {
    return 0
  }
}

/**
 * Get ALL documents for a user grouped by entity_type (for profile browser).
 */
export async function getAllDocumentsGrouped(userId: string): Promise<{
  aircraft: DocumentRecord[]
  flight: DocumentRecord[]
  flight_plan: DocumentRecord[]
}> {
  const all = await getAllDocumentsByUser(userId)
  return {
    aircraft: all.filter((d) => d.entity_type === 'aircraft'),
    flight: all.filter((d) => d.entity_type === 'flight'),
    flight_plan: all.filter((d) => d.entity_type === 'flight_plan'),
  }
}

/** Get a human-readable label for entity types. */
export function entityTypeLabel(type: EntityType): string {
  switch (type) {
    case 'aircraft': return 'Aircraft'
    case 'flight': return 'Flight'
    case 'flight_plan': return 'Flight Plan'
  }
}

/** Format file size for display. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Get a file icon name based on MIME type. */
export function fileIconFromMime(mime: string): string {
  if (mime.startsWith('image/')) return 'image'
  if (mime === 'application/pdf') return 'pdf'
  if (mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('csv')) return 'spreadsheet'
  if (mime.includes('document') || mime.includes('word')) return 'document'
  return 'file'
}
