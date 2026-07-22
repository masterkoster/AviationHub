'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import { exportUserData, importUserData } from '@/desktop/lib/backup'
import { completeSetup } from '@/desktop/lib/setup'
import {
  Lock, Download, Upload, User, FileText, Plane, CalendarDays, Route,
  Check, Pencil, Award, Clock, BarChart3, Shield, AlertTriangle,
  Plus, Trash2, Save, Camera, X, KeyRound, Syringe, FileBadge,
  Airplay, Eye, Moon, MapPin, Sunrise,
} from 'lucide-react'
import { DocumentUploader } from '@/desktop/components/document-uploader'
import { PinInputDialog } from '@/desktop/components/pin-input-dialog'
import { DocumentGrid } from '@/desktop/components/document-grid'
import {
  getAllDocumentsByUser,
  deleteDocument,
  saveDocument,
  type DocumentRecord,
  type EntityType,
} from '@/desktop/lib/document-store'
import {
  updateLocalUser,
  getDb,
  getAllLocalUsers,
  AVATAR_COLORS,
  uuid,
  verifyPin,
  type LocalUser,
} from '@/desktop/lib/local-auth'
import { ConfirmDialog } from '@/desktop/components/confirm-dialog'
import { notifyError } from '@/desktop/lib/toast-helpers'
import { cloudApi } from '@/desktop/lib/cloud-api'

// ─── Types ─────────────────────────────────────────────────────────────────

type DocFilter = 'all' | EntityType

interface Certification {
  id: string
  userId: string
  type: 'medical' | 'license' | 'bfr' | 'ipc'
  name: string
  issueDate: string | null
  expiryDate: string | null
  certificateNumber: string | null
  ratings: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

interface LogbookTotals {
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

// ─── Certifications DB ──────────────────────────────────────────────────────

// Belt-and-suspenders for this release — the canonical schema going forward
// is desktop/lib/local-migrations.ts (Migration 1 consolidates this
// statement verbatim).
async function ensureCertTable(): Promise<void> {
  const db = await getDb()
  if (!db) return
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS certifications (
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
      )
    `)
  } catch {
    // silent
  }
}

async function getCertifications(userId: string): Promise<Certification[]> {
  const db = await getDb()
  if (!db) return []
  await ensureCertTable()
  try {
    return await db.select<Certification[]>(
      `SELECT * FROM certifications WHERE userId = $1 ORDER BY type, name`,
      [userId]
    )
  } catch {
    try {
      return await db.select<Certification[]>(
        `SELECT * FROM certifications WHERE userId = ? ORDER BY type, name`,
        [userId]
      )
    } catch {
      return []
    }
  }
}

async function saveCertification(cert: Omit<Certification, 'created_at' | 'updated_at'>): Promise<void> {
  const db = await getDb()
  if (!db) return
  await ensureCertTable()
  const now = new Date().toISOString()
  try {
    await db.execute(
      `INSERT OR REPLACE INTO certifications (id, userId, type, name, issueDate, expiryDate, certificateNumber, ratings, notes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [cert.id, cert.userId, cert.type, cert.name, cert.issueDate, cert.expiryDate, cert.certificateNumber, cert.ratings, cert.notes, now, now]
    )
  } catch {
    await db.execute(
      `INSERT OR REPLACE INTO certifications (id, userId, type, name, issueDate, expiryDate, certificateNumber, ratings, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [cert.id, cert.userId, cert.type, cert.name, cert.issueDate, cert.expiryDate, cert.certificateNumber, cert.ratings, cert.notes, now, now]
    )
  }
}

async function deleteCertification(id: string): Promise<void> {
  const db = await getDb()
  if (!db) return
  try {
    await db.execute(`DELETE FROM certifications WHERE id = $1`, [id])
  } catch {
    try {
      await db.execute(`DELETE FROM certifications WHERE id = ?`, [id])
    } catch {
      // silent
    }
  }
}

// ─── Logbook Stats ──────────────────────────────────────────────────────────

async function getLogbookTotals(userId: string): Promise<LogbookTotals> {
  const db = await getDb()
  if (!db) {
    return { totalFlights: 0, totalTime: 0, picTime: 0, sicTime: 0, nightTime: 0, instrumentTime: 0, crossCountryTime: 0, landingsDay: 0, landingsNight: 0 }
  }
  try {
    const rows = await db.select<LogbookTotals[]>(
      `SELECT COUNT(*) as totalFlights,
              COALESCE(SUM(total_time), 0) as totalTime,
              COALESCE(SUM(pic_time), 0) as picTime,
              COALESCE(SUM(sic_time), 0) as sicTime,
              COALESCE(SUM(night_time), 0) as nightTime,
              COALESCE(SUM(instrument_time), 0) as instrumentTime,
              COALESCE(SUM(cross_country_time), 0) as crossCountryTime,
              COALESCE(SUM(landings_day), 0) as landingsDay,
              COALESCE(SUM(landings_night), 0) as landingsNight
       FROM logbook_entries WHERE user_id = $1 AND voided = 0`,
      [userId]
    )
    return rows[0] || { totalFlights: 0, totalTime: 0, picTime: 0, sicTime: 0, nightTime: 0, instrumentTime: 0, crossCountryTime: 0, landingsDay: 0, landingsNight: 0 }
  } catch {
    try {
      const rows = await db.select<LogbookTotals[]>(
        `SELECT COUNT(*) as totalFlights,
                COALESCE(SUM(total_time), 0) as totalTime,
                COALESCE(SUM(pic_time), 0) as picTime,
                COALESCE(SUM(sic_time), 0) as sicTime,
                COALESCE(SUM(night_time), 0) as nightTime,
                COALESCE(SUM(instrument_time), 0) as instrumentTime,
                COALESCE(SUM(cross_country_time), 0) as crossCountryTime,
                COALESCE(SUM(landings_day), 0) as landingsDay,
                COALESCE(SUM(landings_night), 0) as landingsNight
         FROM logbook_entries WHERE user_id = ? AND voided = 0`,
        [userId]
      )
      return rows[0] || { totalFlights: 0, totalTime: 0, picTime: 0, sicTime: 0, nightTime: 0, instrumentTime: 0, crossCountryTime: 0, landingsDay: 0, landingsNight: 0 }
    } catch {
      return { totalFlights: 0, totalTime: 0, picTime: 0, sicTime: 0, nightTime: 0, instrumentTime: 0, crossCountryTime: 0, landingsDay: 0, landingsNight: 0 }
    }
  }
}

async function getLastFlightDate(userId: string): Promise<string | null> {
  const db = await getDb()
  if (!db) return null
  try {
    const rows = await db.select<{ date: string }[]>(
      `SELECT date FROM logbook_entries WHERE user_id = $1 AND voided = 0 ORDER BY date DESC LIMIT 1`,
      [userId]
    )
    return rows[0]?.date || null
  } catch {
    try {
      const rows = await db.select<{ date: string }[]>(
        `SELECT date FROM logbook_entries WHERE user_id = ? AND voided = 0 ORDER BY date DESC LIMIT 1`,
        [userId]
      )
      return rows[0]?.date || null
    } catch {
      return null
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr)
  const now = new Date()
  const diff = target.getTime() - now.getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function daysSince(dateStr: string): number {
  const target = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - target.getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return dateStr
  }
}

// ─── Avatar Helpers ─────────────────────────────────────────────────────────

const AVATAR_BG: Record<string, string> = {
  emerald: 'bg-emerald-500',
  blue: 'bg-blue-500',
  violet: 'bg-violet-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  cyan: 'bg-cyan-500',
  orange: 'bg-orange-500',
  pink: 'bg-pink-500',
}

const AVATAR_RING: Record<string, string> = {
  emerald: 'ring-emerald-500',
  blue: 'ring-blue-500',
  violet: 'ring-violet-500',
  amber: 'ring-amber-500',
  rose: 'ring-rose-500',
  cyan: 'ring-cyan-500',
  orange: 'ring-orange-500',
  pink: 'ring-pink-500',
}

const AVATAR_BRIGHTS: Record<string, string> = {
  emerald: 'bg-emerald-400',
  blue: 'bg-blue-400',
  violet: 'bg-violet-400',
  amber: 'bg-amber-400',
  rose: 'bg-rose-400',
  cyan: 'bg-cyan-400',
  orange: 'bg-orange-400',
  pink: 'bg-pink-400',
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function DesktopProfilePage() {
  const { mode, localUser: _hookLocalUser } = useDesktopAuth()
  const searchParams = useSearchParams()
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [exportPinOpen, setExportPinOpen] = useState(false)
  const [importPinOpen, setImportPinOpen] = useState(false)
  const [importBytes, setImportBytes] = useState<Uint8Array | null>(null)

  // Resolve local user: in cloud mode resolvedUser is null but local SQLite data still exists
  const [resolvedUser, setResolvedUser] = useState<LocalUser | null>(null)
  useEffect(() => {
    if (_hookLocalUser) {
      setResolvedUser(_hookLocalUser)
    } else if (mode === 'cloud') {
      getAllLocalUsers().then(users => {
        if (users.length > 0) setResolvedUser(users[0])
      })
    }
  }, [_hookLocalUser, mode])

  // ── Editable profile fields ────────────────────────────────────
  const [editName, setEditName] = useState('')
  const [editHomeAirport, setEditHomeAirport] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [savingAirport, setSavingAirport] = useState(false)
  const [nameSaved, setNameSaved] = useState(false)
  const [airportSaved, setAirportSaved] = useState(false)

  // ── PIN change flow ────────────────────────────────────────────
  const [pinFlow, setPinFlow] = useState<'idle' | 'verify' | 'new'>('idle')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [savingPin, setSavingPin] = useState(false)
  const [pinSaved, setPinSaved] = useState(false)

  // ── Color picker ───────────────────────────────────────────────
  const [showColorPicker, setShowColorPicker] = useState(false)

  // ── Avatar upload ──────────────────────────────────────────────
  const [avatarPath, setAvatarPath] = useState<string | null>(null)
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)

  // ── Certifications ─────────────────────────────────────────────
  const [certs, setCerts] = useState<Certification[]>([])
  const [loadingCerts, setLoadingCerts] = useState(false)

  // ── Statistics ─────────────────────────────────────────────────
  const [totals, setTotals] = useState<LogbookTotals | null>(null)
  const [lastFlightDate, setLastFlightDate] = useState<string | null>(null)
  const [loadingStats, setLoadingStats] = useState(false)

  // ── Documents state ────────────────────────────────────────────
  const [docs, setDocs] = useState<DocumentRecord[]>([])
  const [docsLoading, setDocsLoading] = useState(false)
  const [docFilter, setDocFilter] = useState<DocFilter>('all')
  const [uploadEntityType, setUploadEntityType] = useState<EntityType>('aircraft')
  const [uploadEntityId, setUploadEntityId] = useState('')

  // ── New license form ───────────────────────────────────────────
  const [showNewLicense, setShowNewLicense] = useState(false)
  const [newLicenseType, setNewLicenseType] = useState<'PPL' | 'CPL' | 'ATP'>('PPL')
  const [newLicenseCertNum, setNewLicenseCertNum] = useState('')
  const [newLicenseIssueDate, setNewLicenseIssueDate] = useState('')
  const [newLicenseRatings, setNewLicenseRatings] = useState('')
  const [savingLicense, setSavingLicense] = useState(false)

  // ── Medical form ───────────────────────────────────────────────
  const [editMedicalClass, setEditMedicalClass] = useState<'1st' | '2nd' | '3rd' | 'none'>('none')
  const [editMedicalIssue, setEditMedicalIssue] = useState('')
  const [editMedicalExpiry, setEditMedicalExpiry] = useState('')
  const [savingMedical, setSavingMedical] = useState(false)
  const [medicalSaved, setMedicalSaved] = useState(false)

  // ── BFR / IPC ──────────────────────────────────────────────────
  const [editBfrDue, setEditBfrDue] = useState('')
  const [savingBfr, setSavingBfr] = useState(false)
  const [bfrSaved, setBfrSaved] = useState(false)
  const [editIpcDue, setEditIpcDue] = useState('')
  const [savingIpc, setSavingIpc] = useState(false)
  const [ipcSaved, setIpcSaved] = useState(false)

  // ── Delete confirm state ────────────────────────────────────────
  const [certDeleteId, setCertDeleteId] = useState<string | null>(null)
  const [docDeleteTarget, setDocDeleteTarget] = useState<DocumentRecord | null>(null)

  const isTauri =
    typeof window !== 'undefined' &&
    Boolean(
      (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ ||
        (window as unknown as Record<string, unknown>).__TAURI__
    )

  // Load avatar image from disk when path changes
  useEffect(() => {
    if (!avatarPath || !isTauri) { setAvatarDataUrl(null); return }
    let cancelled = false
    ;(async () => {
      try {
        const { readFile } = await import('@tauri-apps/plugin-fs')
        const bytes = await readFile(avatarPath)
        if (cancelled) return
        const ext = avatarPath.split('.').pop()?.toLowerCase() || 'png'
        const mimeMap: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }
        const mime = mimeMap[ext] || 'image/png'
        const base64 = btoa(Array.from(bytes).map(b => String.fromCharCode(b)).join(''))
        setAvatarDataUrl(`data:${mime};base64,${base64}`)
      } catch {
        setAvatarDataUrl(null)
      }
    })()
    return () => { cancelled = true }
  }, [avatarPath, isTauri])

  // ── Initialise fields from resolvedUser ───────────────────────────
  useEffect(() => {
    if (!resolvedUser) return
    setEditName(resolvedUser.name)
    setEditHomeAirport(resolvedUser.homeAirport || '')
    setAvatarPath(resolvedUser.avatarPath || null)
  }, [resolvedUser])

  // In cloud mode the server is the source of truth for home airport —
  // the local SQLite row is just a mirror (and absent in the browser).
  useEffect(() => {
    if (mode !== 'cloud') return
    cloudApi
      .getProfile()
      .then((profile) => {
        const ha = profile && typeof profile.homeAirport === 'string' ? profile.homeAirport : ''
        if (ha) setEditHomeAirport(ha)
      })
      .catch((err) => console.error('[profile] load cloud profile failed', err))
  }, [mode])

  // ── Load docs, certs, stats on mount ───────────────────────────
  useEffect(() => {
    if (!resolvedUser) return
    loadDocs()
    loadCertifications()
    loadStats()
  }, [resolvedUser])

  // Deep-link: arriving with ?add=license (e.g. from the Currency page's
  // "Certificates & licenses" button) opens the add form and scrolls to it.
  useEffect(() => {
    if (!resolvedUser) return
    if (searchParams.get('add') !== 'license') return
    setShowNewLicense(true)
    const t = setTimeout(() => {
      document.getElementById('certifications')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 150)
    return () => clearTimeout(t)
  }, [resolvedUser, searchParams])

  // ── Doc loaders ────────────────────────────────────────────────
  async function loadDocs() {
    if (!resolvedUser) return
    setDocsLoading(true)
    try {
      const all = await getAllDocumentsByUser(resolvedUser.id)
      setDocs(all)
    } catch (err) {
      console.error('[profile] load docs failed', err)
    } finally {
      setDocsLoading(false)
    }
  }

  async function handleUpload(file: File) {
    if (!resolvedUser) return
    if (!uploadEntityId.trim()) {
      throw new Error('Please enter an aircraft N-Number, flight ID, or flight plan name')
    }
    const buf = await file.arrayBuffer()
    const bytes = new Uint8Array(buf)
    await saveDocument(
      resolvedUser.id,
      uploadEntityType,
      uploadEntityId.trim().toUpperCase(),
      file.name,
      bytes,
      file.type || 'application/octet-stream',
    )
    await loadDocs()
  }

  async function handleDelete(doc: DocumentRecord) {
    setDocDeleteTarget(doc)
  }

  async function confirmDocDelete() {
    if (!docDeleteTarget) return
    try {
      await deleteDocument(docDeleteTarget.id)
      await loadDocs()
    } catch (err) {
      console.error('[profile] delete doc failed', err)
      notifyError('Document', err instanceof Error ? err.message : 'Failed to delete document')
    } finally {
      setDocDeleteTarget(null)
    }
  }

  const filteredDocs = docFilter === 'all'
    ? docs
    : docs.filter((d) => d.entity_type === docFilter)

  const docCounts = {
    all: docs.length,
    aircraft: docs.filter((d) => d.entity_type === 'aircraft').length,
    flight: docs.filter((d) => d.entity_type === 'flight').length,
    flight_plan: docs.filter((d) => d.entity_type === 'flight_plan').length,
  }

  // ── Certifications ─────────────────────────────────────────────
  async function loadCertifications() {
    if (!resolvedUser) return
    setLoadingCerts(true)
    try {
      const rows = await getCertifications(resolvedUser.id)
      setCerts(rows)

      // Populate form fields from stored certs
      const medical = rows.find((c) => c.type === 'medical')
      if (medical) {
        setEditMedicalClass((medical.name as '1st' | '2nd' | '3rd' | 'none') || 'none')
        setEditMedicalIssue(medical.issueDate?.split('T')[0] || '')
        setEditMedicalExpiry(medical.expiryDate?.split('T')[0] || '')
      }
      const bfr = rows.find((c) => c.type === 'bfr')
      if (bfr) {
        setEditBfrDue(bfr.expiryDate?.split('T')[0] || '')
      }
      const ipc = rows.find((c) => c.type === 'ipc')
      if (ipc) {
        setEditIpcDue(ipc.expiryDate?.split('T')[0] || '')
      }
    } catch (err) {
      console.error('[profile] load certs failed', err)
    } finally {
      setLoadingCerts(false)
    }
  }

  async function handleSaveMedical() {
    if (!resolvedUser) return
    setSavingMedical(true)
    setMedicalSaved(false)
    try {
      const existing = certs.find((c) => c.type === 'medical')
      const id = existing?.id || uuid()
      const medicalClass = editMedicalClass === 'none' ? 'None' : `${editMedicalClass} Class`
      await saveCertification({
        id,
        userId: resolvedUser.id,
        type: 'medical',
        name: medicalClass,
        issueDate: editMedicalIssue || null,
        expiryDate: editMedicalExpiry || null,
        certificateNumber: null,
        ratings: null,
        notes: null,
      })
      await loadCertifications()
      setMedicalSaved(true)
      setTimeout(() => setMedicalSaved(false), 2000)
    } catch (err) {
      console.error('[profile] save medical failed', err)
      notifyError('Medical', err instanceof Error ? err.message : 'Failed to save medical')
    } finally {
      setSavingMedical(false)
    }
  }

  async function handleSaveLicense() {
    if (!resolvedUser) return
    if (!newLicenseCertNum.trim()) return
    setSavingLicense(true)
    try {
      const ratingsArr = newLicenseRatings
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean)
      await saveCertification({
        id: uuid(),
        userId: resolvedUser.id,
        type: 'license',
        name: newLicenseType,
        issueDate: newLicenseIssueDate || null,
        expiryDate: null,
        certificateNumber: newLicenseCertNum.trim().toUpperCase(),
        ratings: ratingsArr.length > 0 ? JSON.stringify(ratingsArr) : null,
        notes: null,
      })
      await loadCertifications()
      setShowNewLicense(false)
      setNewLicenseCertNum('')
      setNewLicenseIssueDate('')
      setNewLicenseRatings('')
    } catch (err) {
      console.error('[profile] save license failed', err)
      notifyError('License', err instanceof Error ? err.message : 'Failed to save license')
    } finally {
      setSavingLicense(false)
    }
  }

  function handleDeleteCert(id: string) {
    setCertDeleteId(id)
  }

  async function confirmCertDelete() {
    if (!certDeleteId) return
    try {
      await deleteCertification(certDeleteId)
      await loadCertifications()
    } catch (err) {
      console.error('[profile] delete cert failed', err)
      notifyError('License', err instanceof Error ? err.message : 'Failed to delete license')
    } finally {
      setCertDeleteId(null)
    }
  }

  async function handleSaveBfr() {
    if (!resolvedUser) return
    setSavingBfr(true)
    setBfrSaved(false)
    try {
      const existing = certs.find((c) => c.type === 'bfr')
      const id = existing?.id || uuid()
      await saveCertification({
        id,
        userId: resolvedUser.id,
        type: 'bfr',
        name: 'Flight Review',
        issueDate: null,
        expiryDate: editBfrDue || null,
        certificateNumber: null,
        ratings: null,
        notes: null,
      })
      await loadCertifications()
      setBfrSaved(true)
      setTimeout(() => setBfrSaved(false), 2000)
    } catch (err) {
      console.error('[profile] save bfr failed', err)
      notifyError('Flight Review', err instanceof Error ? err.message : 'Failed to save BFR')
    } finally {
      setSavingBfr(false)
    }
  }

  async function handleSaveIpc() {
    if (!resolvedUser) return
    setSavingIpc(true)
    setIpcSaved(false)
    try {
      const existing = certs.find((c) => c.type === 'ipc')
      const id = existing?.id || uuid()
      await saveCertification({
        id,
        userId: resolvedUser.id,
        type: 'ipc',
        name: 'Instrument Proficiency Check',
        issueDate: null,
        expiryDate: editIpcDue || null,
        certificateNumber: null,
        ratings: null,
        notes: null,
      })
      await loadCertifications()
      setIpcSaved(true)
      setTimeout(() => setIpcSaved(false), 2000)
    } catch (err) {
      console.error('[profile] save ipc failed', err)
      notifyError('IPC', err instanceof Error ? err.message : 'Failed to save IPC')
    } finally {
      setSavingIpc(false)
    }
  }

  // ── Statistics ─────────────────────────────────────────────────
  async function loadStats() {
    if (!resolvedUser) return
    setLoadingStats(true)
    try {
      const [t, last] = await Promise.all([
        getLogbookTotals(resolvedUser.id),
        getLastFlightDate(resolvedUser.id),
      ])
      setTotals(t)
      setLastFlightDate(last)
    } catch (err) {
      console.error('[profile] load stats failed', err)
      notifyError('Statistics', err instanceof Error ? err.message : 'Failed to load statistics')
    } finally {
      setLoadingStats(false)
    }
  }

  // ── Profile field saves ────────────────────────────────────────
  async function handleSaveName() {
    if (!resolvedUser || !editName.trim()) return
    setSavingName(true)
    setNameSaved(false)
    try {
      await updateLocalUser(resolvedUser.id, { name: editName.trim() })
      setNameSaved(true)
      setTimeout(() => setNameSaved(false), 2000)
    } catch (err) {
      console.error('[profile] save name failed', err)
    } finally {
      setSavingName(false)
    }
  }

  async function handleSaveAirport() {
    const value = editHomeAirport.trim().toUpperCase()
    setSavingAirport(true)
    setAirportSaved(false)
    try {
      // Cloud accounts: persist to the server (PilotProfile.homeAirport) so it
      // survives reloads and other devices; the local row is only a mirror.
      if (mode === 'cloud') {
        await cloudApi.updateProfile({ homeAirport: value || null })
      }
      // Mirror into the local SQLite when a local row exists (Tauri).
      if (resolvedUser) {
        await updateLocalUser(resolvedUser.id, { homeAirport: value })
        setResolvedUser({ ...resolvedUser, homeAirport: value || null })
      } else if (mode !== 'cloud') {
        throw new Error('No profile to save to')
      }
      setEditHomeAirport(value)
      setAirportSaved(true)
      setTimeout(() => setAirportSaved(false), 2000)
    } catch (err) {
      console.error('[profile] save airport failed', err)
      notifyError('Home airport', err instanceof Error ? err.message : 'Failed to save home airport')
    } finally {
      setSavingAirport(false)
    }
  }

  async function handleAvatarColor(color: string) {
    if (!resolvedUser) return
    try {
      await updateLocalUser(resolvedUser.id, { avatarColor: color })
      // Dispatch event so the shell sidebar updates
      window.dispatchEvent(new CustomEvent('desktop-auth-changed'))
    } catch (err) {
      console.error('[profile] save color failed', err)
    }
    setShowColorPicker(false)
  }

  async function handleAvatarUpload() {
    if (!resolvedUser || !isTauri) return
    setUploadingAvatar(true)
    setAvatarError(null)
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const filePath = await open({
        multiple: false,
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
      })
      if (!filePath) {
        setUploadingAvatar(false)
        return
      }
      const { readFile, mkdir, writeFile } = await import('@tauri-apps/plugin-fs')
      const { appDataDir } = await import('@tauri-apps/api/path')

      const ext = (filePath as string).split('.').pop()?.toLowerCase() || 'png'
      const appDir = await appDataDir()
      const sep = appDir.includes('/') ? '/' : '\\'
      const avatarDir = `${appDir}${sep}documents${sep}${resolvedUser.id}`
      const avatarFileName = `avatar.${ext}`
      const avatarFullPath = `${avatarDir}${sep}${avatarFileName}`

      await mkdir(avatarDir, { recursive: true })
      const bytes = await readFile(filePath as string)
      await writeFile(avatarFullPath, bytes)

      // Store reference in the user record so it survives reloads
      await updateLocalUser(resolvedUser.id, { avatarPath: avatarFullPath })
      setAvatarPath(avatarFullPath)
      setResolvedUser({ ...resolvedUser, avatarPath: avatarFullPath })
      window.dispatchEvent(new CustomEvent('desktop-auth-changed'))
    } catch (err) {
      console.error('[profile] avatar upload failed', err)
      setAvatarError(err instanceof Error ? err.message : 'Could not save the photo.')
    } finally {
      setUploadingAvatar(false)
    }
  }

  // ── PIN change ─────────────────────────────────────────────────
  async function handleCurrentPinVerified(pin: string) {
    if (!resolvedUser) return
    const ok = await verifyPin(resolvedUser.id, pin)
    if (!ok) throw new Error('Current PIN is incorrect')
    setPinFlow('new')
  }

  async function handleSaveNewPin() {
    if (!resolvedUser) return
    setPinError('')
    if (newPin.length < 4 || newPin.length > 8) {
      setPinError('PIN must be 4–8 digits')
      return
    }
    if (newPin !== confirmPin) {
      setPinError('PINs do not match')
      return
    }
    setSavingPin(true)
    try {
      await updateLocalUser(resolvedUser.id, { pin: newPin })
      setPinSaved(true)
      setTimeout(() => setPinSaved(false), 2000)
      setPinFlow('idle')
      setNewPin('')
      setConfirmPin('')
    } catch (err) {
      setPinError(err instanceof Error ? err.message : 'Failed to update PIN')
    } finally {
      setSavingPin(false)
    }
  }

  // ── Backup handlers ────────────────────────────────────────────
  async function handleExport() {
    if (!isTauri) {
      setError('Backup export is available in the desktop app only.')
      return
    }
    if (!resolvedUser) {
      setError('No local user is active.')
      return
    }
    setExportPinOpen(true)
  }

  async function handleExportSubmit(pin: string) {
    setExporting(true)
    setMessage('')
    setError('')
    try {
      const result = await exportUserData(resolvedUser!.id, pin)
      if (!result.success) {
        setError(result.error || 'Export failed')
      } else {
        setMessage(`Backup saved to ${result.fileName}`)
      }
    } catch (err) {
      console.error('[profile] export failed', err)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setExporting(false)
      setExportPinOpen(false)
    }
  }

  async function handleImport() {
    if (!isTauri) {
      setError('Backup import is available in the desktop app only.')
      return
    }
    setImporting(true)
    setMessage('')
    setError('')
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const filePath = await open({
        multiple: false,
        filters: [{ name: 'AviationHub Backup', extensions: ['ahb'] }],
      })
      if (!filePath) {
        setImporting(false)
        return
      }
      const { readFile } = await import('@tauri-apps/plugin-fs')
      const bytes = (await readFile(filePath as string)) as Uint8Array
      setImportBytes(bytes)
      setImportPinOpen(true)
    } catch (err) {
      console.error('[profile] import failed', err)
      setError(err instanceof Error ? err.message : String(err))
      setImporting(false)
    }
  }

  async function handleImportSubmit(pin: string) {
    if (!importBytes) return
    try {
      const result = await importUserData(importBytes, pin)
      if (!result.success) {
        setError(result.error || 'Import failed')
        setImporting(false)
        setImportPinOpen(false)
        return
      }
      await completeSetup({ mode: 'local', localUserId: result.userId })
      setMessage(`Imported ${result.flightsImported} flights for ${result.userName}`)
    } catch (err) {
      console.error('[profile] import failed', err)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setImporting(false)
      setImportPinOpen(false)
    }
  }

  // ── Derived values ─────────────────────────────────────────────
  const activeColor = resolvedUser?.avatarColor || 'emerald'
  const medicalCert = certs.find((c) => c.type === 'medical')
  const bfrCert = certs.find((c) => c.type === 'bfr')
  const ipcCert = certs.find((c) => c.type === 'ipc')
  const licenses = certs.filter((c) => c.type === 'license')

  const statRows = totals
    ? [
        { label: 'Total Hours', value: `${totals.totalTime.toFixed(1)}` },
        { label: 'PIC', value: `${totals.picTime.toFixed(1)}` },
        { label: 'SIC', value: `${totals.sicTime.toFixed(1)}` },
        { label: 'Night', value: `${totals.nightTime.toFixed(1)}` },
        { label: 'Instrument', value: `${totals.instrumentTime.toFixed(1)}` },
        { label: 'Cross-Country', value: `${totals.crossCountryTime.toFixed(1)}` },
        { label: 'Landings (Day)', value: `${totals.landingsDay}` },
        { label: 'Landings (Night)', value: `${totals.landingsNight}` },
      ]
    : []

  // ─── RENDER ────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">
      {/* ──────── PROFILE HEADER ──────── */}
      <div className="rounded-lg border border-border bg-card shadow-sm">
        <div className="p-5">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4" />
            <h1 className="text-lg font-semibold">Pilot Profile</h1>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Your pilot information, certifications, logbook statistics, data backup, and document storage.
          </p>
        </div>
      </div>

      {/* ──────── PROFILE DETAILS (EDITABLE) ──────── */}
      {resolvedUser && (
        <div className="rounded-lg border border-border bg-card shadow-sm divide-y divide-border">
          <div className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <User className="h-4 w-4" />
              <h2 className="text-sm font-semibold">Profile Details</h2>
            </div>

            <div className="flex flex-col sm:flex-row gap-6">
              {/* Avatar column */}
              <div className="flex flex-col items-center gap-2 shrink-0">
                <div className="relative group">
                  {avatarDataUrl ? (
                    <img
                      src={avatarDataUrl}
                      alt="Avatar"
                      className="h-20 w-20 rounded-full object-cover shadow-md cursor-pointer"
                      onClick={() => setShowColorPicker(!showColorPicker)}
                      title="Click to change photo"
                    />
                  ) : (
                    <div
                      className={`h-20 w-20 rounded-full ${AVATAR_BG[activeColor] || 'bg-emerald-500'} flex items-center justify-center text-xl font-bold text-white shadow-md cursor-pointer`}
                      onClick={() => setShowColorPicker(!showColorPicker)}
                      title="Click to change color or upload photo"
                    >
                      {getInitials(resolvedUser.name)}
                    </div>
                  )}
                  <button
                    onClick={handleAvatarUpload}
                    disabled={uploadingAvatar || !isTauri}
                    className="absolute -bottom-1 -right-1 rounded-full bg-background border border-border p-1.5 shadow-sm hover:bg-muted transition-colors disabled:opacity-50"
                    title="Upload avatar photo"
                  >
                    {uploadingAvatar ? (
                      <svg className="h-3.5 w-3.5 animate-spin text-muted-foreground" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <Camera className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </button>
                </div>
                {avatarError && (
                  <p className="max-w-[9rem] text-center text-xs text-destructive">{avatarError}</p>
                )}
                {!isTauri && (
                  <p className="max-w-[9rem] text-center text-xs text-muted-foreground">
                    Photo upload is available in the desktop app.
                  </p>
                )}

                {/* Color picker popover */}
                {showColorPicker && (
                  <div className="bg-card border border-border rounded-lg p-2.5 shadow-lg z-10 mt-1">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 text-center">Avatar Color</p>
                    <div className="grid grid-cols-4 gap-1.5">
                      {AVATAR_COLORS.map((color) => (
                        <button
                          key={color}
                          onClick={() => handleAvatarColor(color)}
                          className={`h-7 w-7 rounded-full ${AVATAR_BG[color]} ${
                            activeColor === color
                              ? 'ring-2 ring-offset-1 ring-offset-card ring-white'
                              : 'hover:scale-110'
                          } transition-all`}
                          title={color}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Mode + Username badges */}
                <div className="flex flex-col items-center gap-1 mt-1">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Local
                  </span>
                  {resolvedUser.username && (
                    <span className="text-[10px] text-muted-foreground">
                      @{resolvedUser.username}
                    </span>
                  )}
                  {resolvedUser.displayId && (
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {resolvedUser.displayId}
                    </span>
                  )}
                </div>
              </div>

              {/* Fields column */}
              <div className="flex-1 min-w-0 space-y-4">
                {/* Display Name */}
                <div>
                  <label className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-1 block">
                    Display Name
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                      placeholder="Your name"
                    />
                    <button
                      onClick={handleSaveName}
                      disabled={savingName || !editName.trim() || editName.trim() === resolvedUser.name}
                      className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 shrink-0"
                    >
                      {savingName ? (
                        <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )}
                      {nameSaved ? 'Saved!' : 'Save'}
                    </button>
                  </div>
                </div>

                {/* Home Airport */}
                <div>
                  <label className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-1 block">
                    Home Airport
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={editHomeAirport}
                      onChange={(e) => setEditHomeAirport(e.target.value.toUpperCase())}
                      className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring uppercase"
                      placeholder="KLAX"
                      maxLength={4}
                    />
                    <button
                      onClick={handleSaveAirport}
                      disabled={savingAirport}
                      className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 shrink-0"
                    >
                      {savingAirport ? (
                        <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )}
                      {airportSaved ? 'Saved!' : 'Save'}
                    </button>
                  </div>
                </div>

                {/* Change PIN */}
                <div>
                  <label className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-1 block">
                    Security PIN
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPinFlow('verify')}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      Change PIN
                    </button>
                    {resolvedUser.pin && (
                      <span className="text-[11px] text-muted-foreground">
                        PIN is set
                      </span>
                    )}
                    {!resolvedUser.pin && (
                      <span className="text-[11px] text-amber-500">
                        No PIN set
                      </span>
                    )}
                  </div>

                  {/* New PIN form */}
                  {pinFlow === 'new' && (
                    <div className="mt-3 rounded-md border border-border bg-muted/20 p-3 space-y-3">
                      <p className="text-xs font-medium text-muted-foreground">Set new PIN (4–8 digits)</p>
                      <div className="flex flex-wrap gap-2">
                        <input
                          type="password"
                          inputMode="numeric"
                          value={newPin}
                          onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                          placeholder="New PIN"
                          className="flex-1 min-w-[120px] rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                        />
                        <input
                          type="password"
                          inputMode="numeric"
                          value={confirmPin}
                          onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                          placeholder="Confirm PIN"
                          className="flex-1 min-w-[120px] rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                        />
                        <button
                          onClick={handleSaveNewPin}
                          disabled={savingPin || newPin.length < 4}
                          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        >
                          {savingPin ? (
                            <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                          ) : (
                            <Save className="h-3.5 w-3.5" />
                          )}
                          {pinSaved ? 'Saved!' : 'Update'}
                        </button>
                        <button
                          onClick={() => { setPinFlow('idle'); setNewPin(''); setConfirmPin(''); setPinError('') }}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
                        >
                          <X className="h-3.5 w-3.5" />
                          Cancel
                        </button>
                      </div>
                      {pinError && <p className="text-xs text-destructive">{pinError}</p>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ──────── CERTIFICATIONS ──────── */}
      {resolvedUser && (
        <div id="certifications" className="rounded-lg border border-border bg-card shadow-sm divide-y divide-border scroll-mt-6">
          <div className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Award className="h-4 w-4" />
              <h2 className="text-sm font-semibold">Certifications</h2>
            </div>

            {loadingCerts && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
                <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Loading certifications...
              </div>
            )}

            {!loadingCerts && (
              <div className="grid gap-4 sm:grid-cols-2">
                {/* ─ Medical ─ */}
                <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2.5">
                  <div className="flex items-center gap-1.5">
                    <Syringe className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">Medical</span>
                    {medicalCert?.expiryDate && (() => {
                      const d = daysUntil(medicalCert.expiryDate)
                      if (d < 0) return <span className="text-[10px] text-destructive ml-auto">Expired {Math.abs(d)}d ago</span>
                      return <span className="text-[10px] text-emerald-500 ml-auto">Expires in {d}d</span>
                    })()}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-muted-foreground">Class</label>
                      <select
                        value={editMedicalClass}
                        onChange={(e) => setEditMedicalClass(e.target.value as '1st' | '2nd' | '3rd' | 'none')}
                        className="w-full rounded border border-input bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-ring mt-0.5"
                      >
                        <option value="none">None</option>
                        <option value="1st">1st Class</option>
                        <option value="2nd">2nd Class</option>
                        <option value="3rd">3rd Class</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">Issue Date</label>
                      <input
                        type="date"
                        value={editMedicalIssue}
                        onChange={(e) => setEditMedicalIssue(e.target.value)}
                        className="w-full rounded border border-input bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-ring mt-0.5"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="text-[10px] text-muted-foreground">Expiry Date</label>
                      <div className="flex gap-2 items-center">
                        <input
                          type="date"
                          value={editMedicalExpiry}
                          onChange={(e) => setEditMedicalExpiry(e.target.value)}
                          className={`flex-1 rounded border border-input bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-ring mt-0.5 ${
                            editMedicalExpiry && daysUntil(editMedicalExpiry) < 0 ? 'border-destructive/50 text-destructive' : ''
                          }`}
                        />
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={handleSaveMedical}
                    disabled={savingMedical}
                    className="inline-flex items-center gap-1 rounded-md bg-primary/10 text-primary px-2.5 py-1 text-[11px] font-medium hover:bg-primary/20 disabled:opacity-50 transition-colors"
                  >
                    {savingMedical ? (
                      <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <Save className="h-3 w-3" />
                    )}
                    {medicalSaved ? 'Saved!' : 'Save Medical'}
                  </button>
                </div>

                {/* ─ BFR ─ */}
                <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2.5">
                  <div className="flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">Flight Review (BFR)</span>
                    {bfrCert?.expiryDate && (() => {
                      const d = daysUntil(bfrCert.expiryDate)
                      if (d < 0) return <span className="text-[10px] text-destructive ml-auto">Due {Math.abs(d)}d ago</span>
                      return <span className="text-[10px] text-emerald-500 ml-auto">Due in {d}d</span>
                    })()}
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">Due Date</label>
                    <input
                      type="date"
                      value={editBfrDue}
                      onChange={(e) => setEditBfrDue(e.target.value)}
                      className={`w-full rounded border border-input bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-ring mt-0.5 ${
                        editBfrDue && daysUntil(editBfrDue) < 0 ? 'border-destructive/50 text-destructive' : ''
                      }`}
                    />
                  </div>
                  <button
                    onClick={handleSaveBfr}
                    disabled={savingBfr}
                    className="inline-flex items-center gap-1 rounded-md bg-primary/10 text-primary px-2.5 py-1 text-[11px] font-medium hover:bg-primary/20 disabled:opacity-50 transition-colors"
                  >
                    {savingBfr ? (
                      <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <Save className="h-3 w-3" />
                    )}
                    {bfrSaved ? 'Saved!' : 'Save BFR'}
                  </button>
                </div>

                {/* ─ IPC ─ */}
                <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2.5">
                  <div className="flex items-center gap-1.5">
                    <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">Instrument Proficiency Check</span>
                    {ipcCert?.expiryDate && (() => {
                      const d = daysUntil(ipcCert.expiryDate)
                      if (d < 0) return <span className="text-[10px] text-destructive ml-auto">Due {Math.abs(d)}d ago</span>
                      return <span className="text-[10px] text-emerald-500 ml-auto">Due in {d}d</span>
                    })()}
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">Due Date</label>
                    <input
                      type="date"
                      value={editIpcDue}
                      onChange={(e) => setEditIpcDue(e.target.value)}
                      className={`w-full rounded border border-input bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-ring mt-0.5 ${
                        editIpcDue && daysUntil(editIpcDue) < 0 ? 'border-destructive/50 text-destructive' : ''
                      }`}
                    />
                  </div>
                  <button
                    onClick={handleSaveIpc}
                    disabled={savingIpc}
                    className="inline-flex items-center gap-1 rounded-md bg-primary/10 text-primary px-2.5 py-1 text-[11px] font-medium hover:bg-primary/20 disabled:opacity-50 transition-colors"
                  >
                    {savingIpc ? (
                      <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <Save className="h-3 w-3" />
                    )}
                    {ipcSaved ? 'Saved!' : 'Save IPC'}
                  </button>
                </div>

                {/* ─ Licenses ─ */}
                <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2.5">
                  <div className="flex items-center gap-1.5">
                    <FileBadge className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">Licenses & Ratings</span>
                  </div>

                  {/* License list */}
                  {licenses.length === 0 && (
                    <p className="text-[11px] text-muted-foreground italic">No licenses added yet.</p>
                  )}
                  <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                    {licenses.map((lic) => (
                      <div key={lic.id} className="flex items-start justify-between rounded bg-background px-2 py-1.5 border border-border/50">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold">{lic.name}</span>
                            {lic.certificateNumber && (
                              <span className="text-[10px] font-mono text-muted-foreground">{lic.certificateNumber}</span>
                            )}
                          </div>
                          {lic.issueDate && (
                            <p className="text-[10px] text-muted-foreground">Issued: {formatDate(lic.issueDate)}</p>
                          )}
                          {lic.ratings && (() => {
                            try {
                              const r = JSON.parse(lic.ratings) as string[]
                              return r.length > 0 ? (
                                <p className="text-[10px] text-muted-foreground truncate">{r.join(', ')}</p>
                              ) : null
                            } catch { return null }
                          })()}
                        </div>
                        <button
                          onClick={() => handleDeleteCert(lic.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors shrink-0 ml-2"
                          title="Delete license"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Add license form */}
                  {showNewLicense ? (
                    <div className="space-y-2 rounded bg-background border border-border/50 p-2.5">
                      <div className="grid grid-cols-3 gap-1.5">
                        {(['PPL', 'CPL', 'ATP'] as const).map((t) => (
                          <button
                            key={t}
                            onClick={() => setNewLicenseType(t)}
                            className={`rounded px-2 py-1 text-[11px] font-medium border transition-colors ${
                              newLicenseType === t
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-border text-muted-foreground hover:bg-muted'
                            }`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                      <input
                        type="text"
                        value={newLicenseCertNum}
                        onChange={(e) => setNewLicenseCertNum(e.target.value)}
                        placeholder="Certificate number"
                        className="w-full rounded border border-input bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-ring"
                      />
                      <div>
                        <label className="text-[10px] text-muted-foreground">Issue Date</label>
                        <input
                          type="date"
                          value={newLicenseIssueDate}
                          onChange={(e) => setNewLicenseIssueDate(e.target.value)}
                          className="w-full rounded border border-input bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-ring mt-0.5"
                        />
                      </div>
                      <input
                        type="text"
                        value={newLicenseRatings}
                        onChange={(e) => setNewLicenseRatings(e.target.value)}
                        placeholder="Ratings (comma-separated, e.g. ASEL, AMEL, Instrument)"
                        className="w-full rounded border border-input bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-ring"
                      />
                      <div className="flex gap-1.5">
                        <button
                          onClick={handleSaveLicense}
                          disabled={savingLicense || !newLicenseCertNum.trim()}
                          className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        >
                          {savingLicense ? (
                            <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                          ) : (
                            <Check className="h-3 w-3" />
                          )}
                          Add License
                        </button>
                        <button
                          onClick={() => { setShowNewLicense(false); setNewLicenseCertNum(''); setNewLicenseIssueDate(''); setNewLicenseRatings('') }}
                          className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowNewLicense(true)}
                      className="inline-flex items-center gap-1 rounded-md bg-primary/10 text-primary px-2.5 py-1 text-[11px] font-medium hover:bg-primary/20 transition-colors"
                    >
                      <Plus className="h-3 w-3" />
                      Add License
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ──────── STATISTICS ──────── */}
      {resolvedUser && (
        <div className="rounded-lg border border-border bg-card shadow-sm">
          <div className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="h-4 w-4" />
              <h2 className="text-sm font-semibold">Logbook Statistics</h2>
            </div>

            {loadingStats && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
                <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Loading statistics...
              </div>
            )}

            {!loadingStats && totals && (
              <div className="space-y-4">
                {/* Total hours hero */}
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold tracking-tight">{totals.totalTime.toFixed(1)}</span>
                  <span className="text-xs text-muted-foreground">total hours</span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs text-muted-foreground">{totals.totalFlights} flights</span>
                </div>

                {/* Breakdown grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { label: 'PIC', value: totals.picTime, icon: Airplay },
                    { label: 'SIC', value: totals.sicTime, icon: User },
                    { label: 'Night', value: totals.nightTime, icon: Moon },
                    { label: 'Instrument', value: totals.instrumentTime, icon: Eye },
                    { label: 'Cross-Country', value: totals.crossCountryTime, icon: MapPin },
                    { label: 'Total Landings', value: totals.landingsDay + totals.landingsNight, icon: Plane },
                  ].map(({ label, value, icon: Icon }) => (
                    <div key={label} className="rounded-md border border-border bg-muted/20 p-2.5">
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-0.5">
                        <Icon className="h-3 w-3" />
                        <span>{label}</span>
                      </div>
                      <span className="text-sm font-semibold">
                        {label === 'Total Landings' ? value : value.toFixed(1)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Landings detail + Last flight */}
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                  <span>Day Landings: <strong className="text-foreground">{totals.landingsDay}</strong></span>
                  <span>Night Landings: <strong className="text-foreground">{totals.landingsNight}</strong></span>
                  {lastFlightDate && (
                    <>
                      <span>
                        Last Flight: <strong className="text-foreground">{formatDate(lastFlightDate)}</strong>
                      </span>
                      <span>
                        Days Since Last Flight: <strong className="text-foreground">{daysSince(lastFlightDate)}d</strong>
                      </span>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ──────── DOCUMENTS ──────── */}
      {resolvedUser && (
        <div className="rounded-lg border border-border bg-card shadow-sm">
          <div className="p-5">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="h-4 w-4" />
              <h2 className="text-sm font-semibold">Documents</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Upload and manage documents for your aircraft, flights, and flight plans.
            </p>

            {/* Upload area */}
            <div className="mb-4 space-y-3 rounded-md border border-border bg-muted/20 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">Attach to:</span>
                {([
                  { value: 'aircraft' as EntityType, label: 'Aircraft', icon: Plane },
                  { value: 'flight' as EntityType, label: 'Flight', icon: CalendarDays },
                  { value: 'flight_plan' as EntityType, label: 'Flight Plan', icon: Route },
                ]).map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    onClick={() => setUploadEntityType(value)}
                    className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                      uploadEntityType === value
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    <Icon className="h-3 w-3" />
                    {label}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={uploadEntityId}
                onChange={(e) => setUploadEntityId(e.target.value)}
                placeholder={
                  uploadEntityType === 'aircraft' ? 'Enter N-Number (e.g. N12345)' :
                  uploadEntityType === 'flight' ? 'Enter Flight ID' :
                  'Enter Flight Plan name'
                }
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
              />
              <DocumentUploader onUpload={handleUpload} />
            </div>

            {/* Filter tabs */}
            <div className="mb-3 flex flex-wrap gap-1">
              {([
                { value: 'all' as DocFilter, label: 'All', count: docCounts.all },
                { value: 'aircraft' as DocFilter, label: 'Aircraft', count: docCounts.aircraft },
                { value: 'flight' as DocFilter, label: 'Flights', count: docCounts.flight },
                { value: 'flight_plan' as DocFilter, label: 'Flight Plans', count: docCounts.flight_plan },
              ]).map(({ value, label, count }) => (
                <button
                  key={value}
                  onClick={() => setDocFilter(value)}
                  className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    docFilter === value
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {label}
                  <span className="text-[10px] text-muted-foreground">({count})</span>
                </button>
              ))}
            </div>

            <DocumentGrid
              documents={filteredDocs}
              onDelete={handleDelete}
              loading={docsLoading}
              emptyMessage="No documents matching this filter."
            />
          </div>
        </div>
      )}

      {/* ──────── BACKUP & RESTORE ──────── */}
      <div id="backup" className="rounded-lg border border-border bg-card shadow-sm">
        <div className="p-5">
          <div className="flex items-center gap-2 mb-1">
            <Lock className="h-4 w-4" />
            <h2 className="text-sm font-semibold">Backup & Restore</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Export your local logbook to an encrypted .ahb file or restore from a backup. Backups use your PIN for encryption.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={handleExport}
              disabled={exporting || !resolvedUser}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {exporting ? <Download className="h-4 w-4 animate-bounce" /> : <Download className="h-4 w-4" />}
              Export backup
            </button>
            <button
              onClick={handleImport}
              disabled={importing}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
            >
              {importing ? <Upload className="h-4 w-4 animate-bounce" /> : <Upload className="h-4 w-4" />}
              Import backup
            </button>
          </div>
          {message && <p className="mt-2 text-xs text-emerald-500 whitespace-pre-line">{message}</p>}
          {error && <p className="mt-2 text-xs text-destructive whitespace-pre-line">{error}</p>}
          {!resolvedUser && (
            <p className="mt-2 text-[10px] text-muted-foreground">
              Export requires a local account.
            </p>
          )}
        </div>
      </div>

      {/* ──────── PIN DIALOGS ──────── */}
      <PinInputDialog
        open={exportPinOpen}
        onOpenChange={setExportPinOpen}
        title="Enter your PIN"
        description="Enter your PIN to encrypt this backup file"
        confirmLabel="Export"
        onSubmit={handleExportSubmit}
      />

      <PinInputDialog
        open={importPinOpen}
        onOpenChange={(open) => {
          setImportPinOpen(open)
          if (!open) setImporting(false)
        }}
        title="Enter the PIN"
        description="Enter the PIN for this backup file"
        confirmLabel="Import"
        onSubmit={handleImportSubmit}
      />

      {/* PIN verify for change PIN */}
      <PinInputDialog
        open={pinFlow === 'verify'}
        onOpenChange={(open) => {
          if (!open) setPinFlow('idle')
        }}
        title="Verify Current PIN"
        description="Enter your current PIN to change it"
        confirmLabel="Verify"
        onSubmit={handleCurrentPinVerified}
      />

      <ConfirmDialog
        open={!!certDeleteId}
        onOpenChange={(open) => { if (!open) setCertDeleteId(null) }}
        title="Delete License"
        description="This will permanently remove this license from your profile. This action cannot be undone."
        confirmLabel="Delete License"
        onConfirm={confirmCertDelete}
      />

      <ConfirmDialog
        open={!!docDeleteTarget}
        onOpenChange={(open) => { if (!open) setDocDeleteTarget(null) }}
        title="Delete Document"
        description="This document will be permanently deleted. This action cannot be undone."
        confirmLabel="Delete Document"
        onConfirm={confirmDocDelete}
      />
    </div>
  )
}
