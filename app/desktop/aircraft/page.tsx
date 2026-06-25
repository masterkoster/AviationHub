'use client'

import { useEffect, useState, useCallback } from 'react'
import { LocalModePlaceholder } from '@/desktop/components/local-mode-placeholder'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import {
  getLocalAircraft,
  createLocalAircraft,
  updateLocalAircraft,
  deleteLocalAircraft,
  getLocalAircraftStats,
  type LocalAircraft,
  type LocalAircraftStat,
} from '@/apps/desktop/src/lib/local-logbook'
import { Plus, Pencil, Trash2, X, Plane, Save } from 'lucide-react'

interface AircraftWithStats extends LocalAircraft {
  flights: number
}

export default function DesktopAircraftPage() {
  const { mode, localUser } = useDesktopAuth()
  const [aircraft, setAircraft] = useState<AircraftWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState({ nNumber: '', nickname: '', model: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const loadAircraft = useCallback(async () => {
    if (mode !== 'local' || !localUser) return
    setLoading(true)
    try {
      const [aircraftList, stats] = await Promise.all([
        getLocalAircraft(localUser.id),
        getLocalAircraftStats(localUser.id),
      ])
      const statsMap = new Map<string, number>()
      stats.forEach((s: LocalAircraftStat) => statsMap.set(s.aircraft, s.flights))
      const merged: AircraftWithStats[] = aircraftList.map((a) => ({
        ...a,
        flights: statsMap.get(a.nNumber) || 0,
      }))
      setAircraft(merged)
    } catch (err) {
      console.error('[desktop/aircraft] failed', err)
    } finally {
      setLoading(false)
    }
  }, [mode, localUser])

  useEffect(() => {
    loadAircraft()
  }, [loadAircraft])

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

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this aircraft? This will not affect logged flights.')) return
    try {
      await deleteLocalAircraft(id)
      await loadAircraft()
    } catch (err) {
      console.error('[desktop/aircraft] delete failed', err)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!localUser) return

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
      } else {
        await createLocalAircraft({
          userId: localUser.id,
          nNumber,
          nickname: formData.nickname.trim() || null,
          model: formData.model.trim() || null,
        })
      }
      resetForm()
      await loadAircraft()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save aircraft')
    } finally {
      setSaving(false)
    }
  }

  if (mode !== 'local' || !localUser) {
    return (
      <LocalModePlaceholder
        title="Aircraft"
        description="Switch to local mode to manage aircraft on this machine."
        cta={{ label: 'Accounts', href: '/desktop/accounts' }}
      />
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Aircraft</h1>
        {!showForm && (
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
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
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
        <p className="text-sm text-muted-foreground">Loading aircraft...</p>
      ) : aircraft.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 p-8 text-center">
          <Plane className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="mt-2 text-sm text-muted-foreground">No aircraft yet. Add your first aircraft to get started.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {aircraft.map((a) => (
            <div key={a.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-mono text-lg font-semibold text-foreground">{a.nNumber}</p>
                  {a.nickname && <p className="text-sm text-muted-foreground">{a.nickname}</p>}
                  {a.model && <p className="text-xs text-muted-foreground">{a.model}</p>}
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleEdit(a)}
                    className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(a.id)}
                    className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{a.flights} flight{a.flights !== 1 ? 's' : ''} logged</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
