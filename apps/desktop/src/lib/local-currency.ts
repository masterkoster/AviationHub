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

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type CurrencyStatus = 'current' | 'expiring' | 'expired' | 'unknown'

export interface LocalCurrencyRule {
  id: string
  userId: string
  code: string
  name: string
  authority: string
  status: CurrencyStatus
  daysRemaining: number | null
  completed: number | null
  required: number | null
  unit: string | null
  nextDue: string | null
  updatedAt: string
}

export interface NewCurrencyRuleInput {
  userId: string
  code: string
  name: string
  authority?: string
  completed?: number
  required?: number
  unit?: string
  nextDue?: string | null
}

export interface UpdateCurrencyRuleInput {
  name?: string
  authority?: string
  completed?: number
  required?: number
  unit?: string
  nextDue?: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Default FAA Currency Rules
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_CURRENCY_RULES: Omit<NewCurrencyRuleInput, 'userId'>[] = [
  { code: 'FLIGHT_REVIEW', name: 'Flight Review (BFR)', authority: 'FAA', required: 1, unit: 'review', nextDue: null },
  { code: 'MEDICAL', name: 'Medical Certificate', authority: 'FAA', required: 1, unit: 'certificate', nextDue: null },
  { code: 'DAY_CURRENCY', name: 'Day Passenger Currency', authority: 'FAA', required: 3, completed: 0, unit: 'landings (90 days)' },
  { code: 'NIGHT_CURRENCY', name: 'Night Passenger Currency', authority: 'FAA', required: 3, completed: 0, unit: 'night landings (90 days)' },
  { code: 'IFR_CURRENCY', name: 'Instrument Currency', authority: 'FAA', required: 6, completed: 0, unit: 'approaches (6 months)' },
]

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function calculateStatus(rule: { nextDue?: string | null; completed?: number | null; required?: number | null }): { status: CurrencyStatus; daysRemaining: number | null } {
  if (rule.nextDue) {
    const due = new Date(rule.nextDue)
    const now = new Date()
    const diffMs = due.getTime() - now.getTime()
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
    
    if (diffDays < 0) return { status: 'expired', daysRemaining: diffDays }
    if (diffDays <= 30) return { status: 'expiring', daysRemaining: diffDays }
    return { status: 'current', daysRemaining: diffDays }
  }
  
  if (rule.completed != null && rule.required != null && rule.required > 0) {
    if (rule.completed >= rule.required) return { status: 'current', daysRemaining: null }
    return { status: 'expired', daysRemaining: null }
  }
  
  return { status: 'unknown', daysRemaining: null }
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUD Operations
// ─────────────────────────────────────────────────────────────────────────────

export async function getLocalCurrencyRules(userId: string): Promise<LocalCurrencyRule[]> {
  const db = await getDb()
  if (!db) return []
  try {
    const rows = await trySelect<{
      id: string
      user_id: string
      code: string
      name: string
      authority: string
      status: string
      days_remaining: number | null
      completed: number | null
      required: number | null
      unit: string | null
      next_due: string | null
      updated_at: string
    }>(
      db,
      [
        `SELECT id, user_id, code, name, authority, status, days_remaining, completed, required, unit, next_due, updated_at FROM currency_rules WHERE user_id = $1 ORDER BY name ASC`,
        `SELECT id, user_id, code, name, authority, status, days_remaining, completed, required, unit, next_due, updated_at FROM currency_rules WHERE user_id = ? ORDER BY name ASC`,
      ],
      [userId]
    )
    return rows.map((r) => {
      const { status, daysRemaining } = calculateStatus({ nextDue: r.next_due, completed: r.completed, required: r.required })
      return {
        id: r.id,
        userId: r.user_id,
        code: r.code,
        name: r.name,
        authority: r.authority,
        status,
        daysRemaining,
        completed: r.completed,
        required: r.required,
        unit: r.unit,
        nextDue: r.next_due,
        updatedAt: r.updated_at,
      }
    })
  } catch {
    return []
  }
}

export async function createLocalCurrencyRule(input: NewCurrencyRuleInput): Promise<string> {
  const db = await getDb()
  if (!db) throw new Error('Local database unavailable')

  const id = uuid()
  const { status, daysRemaining } = calculateStatus({ nextDue: input.nextDue, completed: input.completed, required: input.required })
  
  await tryExecute(
    db,
    [
      `INSERT INTO currency_rules (id, user_id, code, name, authority, status, days_remaining, completed, required, unit, next_due) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      `INSERT INTO currency_rules (id, user_id, code, name, authority, status, days_remaining, completed, required, unit, next_due) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ],
    [
      id,
      input.userId,
      input.code.toUpperCase().replace(/\s+/g, '_'),
      input.name.trim(),
      input.authority?.trim() || 'FAA',
      status,
      daysRemaining,
      input.completed ?? null,
      input.required ?? null,
      input.unit?.trim() || null,
      input.nextDue || null,
    ]
  )
  return id
}

export async function updateLocalCurrencyRule(id: string, input: UpdateCurrencyRuleInput): Promise<void> {
  const db = await getDb()
  if (!db) throw new Error('Local database unavailable')

  const current = await trySelect<{ next_due: string | null; completed: number | null; required: number | null }>(
    db,
    [`SELECT next_due, completed, required FROM currency_rules WHERE id = $1`, `SELECT next_due, completed, required FROM currency_rules WHERE id = ?`],
    [id]
  )
  if (current.length === 0) throw new Error('Currency rule not found')

  const nextDue = input.nextDue !== undefined ? input.nextDue : current[0].next_due
  const completed = input.completed !== undefined ? input.completed : current[0].completed
  const required = input.required !== undefined ? input.required : current[0].required
  const { status, daysRemaining } = calculateStatus({ nextDue, completed, required })

  const sets: string[] = ['status = ?', 'days_remaining = ?', 'updated_at = datetime(\'now\')']
  const params: unknown[] = [status, daysRemaining]

  if (input.name !== undefined) {
    sets.push('name = ?')
    params.push(input.name.trim())
  }
  if (input.authority !== undefined) {
    sets.push('authority = ?')
    params.push(input.authority.trim())
  }
  if (input.completed !== undefined) {
    sets.push('completed = ?')
    params.push(input.completed)
  }
  if (input.required !== undefined) {
    sets.push('required = ?')
    params.push(input.required)
  }
  if (input.unit !== undefined) {
    sets.push('unit = ?')
    params.push(input.unit?.trim() || null)
  }
  if (input.nextDue !== undefined) {
    sets.push('next_due = ?')
    params.push(input.nextDue || null)
  }

  params.push(id)
  await db.execute(`UPDATE currency_rules SET ${sets.join(', ')} WHERE id = ?`, params)
}

export async function deleteLocalCurrencyRule(id: string): Promise<void> {
  const db = await getDb()
  if (!db) throw new Error('Local database unavailable')

  await tryExecute(
    db,
    [`DELETE FROM currency_rules WHERE id = $1`, `DELETE FROM currency_rules WHERE id = ?`],
    [id]
  )
}

export async function initializeDefaultCurrencyRules(userId: string): Promise<void> {
  const db = await getDb()
  if (!db) return

  const existing = await getLocalCurrencyRules(userId)
  if (existing.length > 0) return

  for (const rule of DEFAULT_CURRENCY_RULES) {
    await createLocalCurrencyRule({ ...rule, userId })
  }
}

export async function incrementCurrencyCount(userId: string, code: string, amount = 1): Promise<void> {
  const db = await getDb()
  if (!db) return

  const rules = await getLocalCurrencyRules(userId)
  const rule = rules.find((r) => r.code === code)
  if (!rule) return

  const newCompleted = (rule.completed || 0) + amount
  await updateLocalCurrencyRule(rule.id, { completed: newCompleted })
}

export async function resetCurrencyCount(userId: string, code: string): Promise<void> {
  const db = await getDb()
  if (!db) return

  const rules = await getLocalCurrencyRules(userId)
  const rule = rules.find((r) => r.code === code)
  if (!rule) return

  await updateLocalCurrencyRule(rule.id, { completed: 0 })
}
