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

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export type AgendaItemType = 'flight' | 'maintenance' | 'personal'
export type AgendaItemStatus = 'planned' | 'done'

export interface AgendaItem {
  id: string
  userId: string
  itemType: AgendaItemType
  title: string
  details: string
  startsAt: string | null
  dueAt: string | null
  status: AgendaItemStatus
  relatedHref: string
  createdAt: string
  updatedAt: string
}

type AgendaRow = {
  id: string
  user_id: string
  item_type: AgendaItemType
  title: string
  details: string
  starts_at: string | null
  due_at: string | null
  status: AgendaItemStatus
  related_href: string
  created_at: string
  updated_at: string
}

function mapRow(row: AgendaRow): AgendaItem {
  return {
    id: row.id,
    userId: row.user_id,
    itemType: row.item_type,
    title: row.title,
    details: row.details || '',
    startsAt: row.starts_at,
    dueAt: row.due_at,
    status: row.status,
    relatedHref: row.related_href || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listAgendaItems(userId: string): Promise<AgendaItem[]> {
  const db = await getDb()
  if (!db) return []
  const rows = await db.select<AgendaRow[]>(
    `SELECT * FROM agenda_items WHERE user_id = ? ORDER BY COALESCE(starts_at, due_at, created_at) ASC`,
    [userId]
  )
  return rows.map(mapRow)
}

export async function getAgendaItemById(userId: string, id: string): Promise<AgendaItem | null> {
  const db = await getDb()
  if (!db) return null
  const rows = await db.select<AgendaRow[]>(
    `SELECT * FROM agenda_items WHERE user_id = ? AND id = ? LIMIT 1`,
    [userId, id]
  )
  return rows[0] ? mapRow(rows[0]) : null
}

export async function createAgendaItem(input: {
  userId: string
  itemType: AgendaItemType
  title: string
  details?: string
  startsAt?: string | null
  dueAt?: string | null
  relatedHref?: string
}): Promise<string> {
  const db = await getDb()
  if (!db) throw new Error('Local database unavailable')
  const id = uuid()
  await db.execute(
    `INSERT INTO agenda_items (id, user_id, item_type, title, details, starts_at, due_at, status, related_href) VALUES (?, ?, ?, ?, ?, ?, ?, 'planned', ?)`,
    [
      id,
      input.userId,
      input.itemType,
      input.title.trim(),
      (input.details || '').trim(),
      input.startsAt || null,
      input.dueAt || null,
      input.relatedHref || '',
    ]
  )
  return id
}

export async function updateAgendaItem(input: {
  userId: string
  id: string
  itemType: AgendaItemType
  title: string
  details?: string
  startsAt?: string | null
  dueAt?: string | null
  status: AgendaItemStatus
  relatedHref?: string
}): Promise<void> {
  const db = await getDb()
  if (!db) throw new Error('Local database unavailable')
  await db.execute(
    `UPDATE agenda_items SET item_type = ?, title = ?, details = ?, starts_at = ?, due_at = ?, status = ?, related_href = ?, updated_at = datetime('now') WHERE user_id = ? AND id = ?`,
    [
      input.itemType,
      input.title.trim(),
      (input.details || '').trim(),
      input.startsAt || null,
      input.dueAt || null,
      input.status,
      input.relatedHref || '',
      input.userId,
      input.id,
    ]
  )
}

export async function markAgendaItemDone(userId: string, id: string, done: boolean): Promise<void> {
  const db = await getDb()
  if (!db) throw new Error('Local database unavailable')
  await db.execute(
    `UPDATE agenda_items SET status = ?, updated_at = datetime('now') WHERE user_id = ? AND id = ?`,
    [done ? 'done' : 'planned', userId, id]
  )
}
