'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import { getAllLocalUsers } from '@/desktop/lib/local-auth'
import {
  getLocalAircraft,
  createLocalAircraft,
  updateLocalAircraft,
  deleteLocalAircraft,
  getLocalAircraftStats,
  type LocalAircraft,
  type LocalAircraftStat,
} from '@/apps/desktop/src/lib/local-logbook'
import { getDocumentCount } from '@/desktop/lib/document-store'
import { ConfirmDialog } from '@/desktop/components/confirm-dialog'
import { ErrorCard } from '@/desktop/components/error-card'
import { Plus, Pencil, Trash2, X, Plane, Save, FileText, ExternalLink } from 'lucide-react'
import { notifyCreated, notifySaved, notifyDeleted, notifyError } from '@/desktop/lib/toast-helpers'

interface AircraftWithStats extends LocalAircraft {
  flights: number
  documents: number
}

export default function DesktopAircraftPage() {
  const { localUser, mode } = useDesktopAuth()
  const [localUserId, setLocalUserId] = useState<string | null>(null)
  const [aircraft, setAircraft] = useState<AircraftWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState({ nNumber: '', nickname: '', model: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Resolve user ID: in cloud mode localUser is null but data is still in local SQLite
  useEffect(() => {
    if (localUser) {
      setLocalUserId(localUser.id)
    } else if (mode === 'cloud') {
      getAllLocalUsers().then(users => {
        if (users.length > 0) setLocalUserId(users[0].id)
      })
    }
  }, [localUser, mode])

  const loadAircraft = useCallback(async () => {
    if (!localUserId) return
    setLoading(true)
    setLoadError(null)
    try {
      const [aircraftList, stats] = await Promise.all([
        getLocalAircraft(localUserId),
        getLocalAircraftStats(localUserId),
      ])
      const statsMap = new Map<string, number>()
      stats.forEach((s: LocalAircraftStat) => statsMap.set(s.aircraft, s.flights))

      // Load doc counts for each aircraft
      const docCounts = new Map<string, number>()
      for (const a of aircraftList) {
        try {
          const cnt = await getDocumentCount('aircraft', a.nNumber)
          docCounts.set(a.nNumber, cnt)
        } catch { /* table may not exist */ }
      }

      const merged: AircraftWithStats[] = aircraftList.map((a) => ({
        ...a,
        flights: statsMap.get(a.nNumber) || 0,
        documents: docCounts.get(a.nNumber) || 0,
      }))
      setAircraft(merged)
    } catch (err) {
      console.error('[desktop/aircraft] failed', err)
      setLoadError(err instanceof Error ? err.message : 'Failed to load aircraft')
    } finally {
      setLoading(false)
    }
  }, [localUserId])

  useEffect(() => {
    loadAircraft()
  }, [loadAircraft])

  // Pre-populate form when navigated from aircraft detail page
  useEffect(() => {
    try {
      const raw = localStorage.getItem('aircraft_import_prefill')
      if (!raw) return
      localStorage.removeItem('aircraft_import_prefill')
      const prefill = JSON.parse(raw) as { manufacturer?: string; model?: string }
      const modelStr = [prefill.manufacturer, prefill.model].filter(Boolean).join(' ')
      if (modelStr) {
        setFormData(f => ({ ...f, model: modelStr }))
        setShowForm(true)
      }
    } catch { /* ignore */ }
  }, [])

  const resetForm = () => {
    setFormData({ nNumber: '', nickname: '', model: '' })
    setEditingId(null)
    setShowForm(false)
    setError('')
  }

  const handleEdit = (a: LocalAircraft) => {
    setFormData({ nNumber: a.nNumber, nickname: a.nickname || '', model: a.model || '' })
    setEditingId(a.id)
    setShowForm(true)
  }

  const handleDelete = (id: string) => {
    setDeleteTargetId(id)
    setConfirmOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!deleteTargetId) return
    setDeleting(true)
    try {
      await deleteLocalAircraft(deleteTargetId)
      notifyDeleted('Aircraft')
      setConfirmOpen(false)
      setDeleteTargetId(null)
      await loadAircraft()
    } catch (err) {
      console.error('[desktop/aircraft] delete failed', err)
      notifyError('Aircraft', err instanceof Error ? err.message : 'Failed to delete aircraft')
    } finally {
      setDeleting(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!localUserId) return

    const nNumber = formData.nNumber.trim().toUpperCase()
    if (!nNumber) {
      setError('N-Number is required')
      return
    }
    if (!/^N\d{1,5}[A-Z]{0,2}$/.test(nNumber) && !/^[A-Z]{1,2}-[A-Z]{3,5}$/.test(nNumber)) {
      setError('Invalid registration format (e.g., N12345 or G-ABCD)')
      return
    }

    setSaving(true)
    setError('')
    try {
      if (editingId) {
        await updateLocalAircraft(editingId, {
          nNumber,
          nickname: formData.nickname.trim() || null,
          model: formData.model.trim() || null,
        })
        notifySaved('Aircraft')
      } else {
        await createLocalAircraft({
          userId: localUserId,
          nNumber,
          nickname: formData.nickname.trim() || null,
          model: formData.model.trim() || null,
        })
        notifyCreated('Aircraft')
      }
      resetForm()
      await loadAircraft()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save aircraft')
    } finally {
      setSaving(false)
    }
  }

  if (!localUserId) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-muted-foreground">No user data available.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Aircraft</h1>
        {!showForm && !loading && !loadError && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Add Aircraft
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-card p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-medium">{editingId ? 'Edit Aircraft' : 'Add Aircraft'}</h2>
            <button type="button" onClick={resetForm} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">N-Number *</label>
              <input
                type="text"
                value={formData.nNumber}
                onChange={(e) => setFormData((f) => ({ ...f, nNumber: e.target.value.toUpperCase() }))}
                placeholder="N12345"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                maxLength={10}
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Nickname</label>
              <input
                type="text"
                value={formData.nickname}
                onChange={(e) => setFormData((f) => ({ ...f, nickname: e.target.value }))}
                placeholder="My Skyhawk"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                maxLength={50}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Model</label>
              <input
                type="text"
                value={formData.model}
                onChange={(e) => setFormData((f) => ({ ...f, model: e.target.value }))}
                placeholder="Cessna 172S"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                maxLength={50}
              />
            </div>
          </div>
          {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={resetForm}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : editingId ? 'Update' : 'Add'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 space-y-2">
                  <div className="h-5 w-20 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-32 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                </div>
                <div className="flex gap-1">
                  <div className="h-7 w-7 animate-pulse rounded bg-muted" />
                  <div className="h-7 w-7 animate-pulse rounded bg-muted" />
                  <div className="h-7 w-7 animate-pulse rounded bg-muted" />
                </div>
              </div>
              <div className="mt-2 h-3 w-28 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : loadError ? (
        <ErrorCard message={loadError} onRetry={loadAircraft} />
      ) : aircraft.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 p-8 text-center">
          <Plane className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="mt-2 text-sm text-muted-foreground">No aircraft yet. Add your first aircraft to get started.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {aircraft.map((a) => (
            <div key={a.id} className="rounded-lg border border-border bg-card p-4 transition-all hover:border-primary/50 hover:shadow-sm">
              <div className="flex items-start justify-between">
                <Link href={`/desktop/aircraft/${a.nNumber}`} className="flex-1 group">
                  <p className="font-mono text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
                    {a.nNumber}
                  </p>
                  {a.nickname && <p className="text-sm text-muted-foreground">{a.nickname}</p>}
                  {a.model && <p className="text-xs text-muted-foreground">{a.model}</p>}
                </Link>
                <div className="flex gap-1 ml-2">
                  <Link
                    href={`/desktop/aircraft/${a.nNumber}`}
                    className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="View details & documents"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                  <button
                    onClick={() => handleEdit(a)}
                    aria-label="Edit aircraft"
                    className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(a.id)}
                    aria-label="Delete aircraft"
                    className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                <span>{a.flights} flight{a.flights !== 1 ? 's' : ''} logged</span>
                {a.documents > 0 && (
                  <span className="flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    {a.documents} document{a.documents !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={handleConfirmDelete}
        title="Delete Aircraft"
        description="Delete this aircraft? This will not affect logged flights."
        loading={deleting}
      />
    </div>
  )
}
