'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { ArrowLeft, Loader2, Plus, Plane, Trash2 } from 'lucide-react'

type Aircraft = {
  id: string
  nNumber: string
  nickname?: string | null
  categoryClass?: string | null
  engineType?: string | null
  model?: { manufacturer?: string; model?: string } | null
}

export default function AircraftPage() {
  const router = useRouter()
  const { status } = useSession()
  const [aircraft, setAircraft] = useState<Aircraft[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [nNumber, setNNumber] = useState('')
  const [nickname, setNickname] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/v1/login')
  }, [status, router])

  const loadAircraft = () => {
    fetch('/api/v1/aircraft')
      .then(r => r.ok ? r.json() : [])
      .then(data => setAircraft(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (status === 'authenticated') loadAircraft()
  }, [status])

  const handleAdd = async () => {
    if (!nNumber.trim()) { setError('N-Number is required'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/v1/aircraft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nNumber: nNumber.trim(), nickname: nickname.trim() || undefined }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to add')
        return
      }
      setNNumber('')
      setNickname('')
      setShowAdd(false)
      loadAircraft()
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string, nNumber: string) => {
    if (!confirm(`Delete ${nNumber}?`)) return
    try {
      await fetch(`/api/v1/aircraft/${id}`, { method: 'DELETE' })
      loadAircraft()
    } catch {}
  }

  if (status === 'loading' || loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="p-1.5 rounded-md hover:bg-muted transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Plane className="h-5 w-5" />
            My Aircraft
          </h1>
        </div>
        <button onClick={() => setShowAdd(!showAdd)}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
          <Plus className="h-4 w-4" />
          Add Aircraft
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h2 className="text-sm font-semibold">New Aircraft</h2>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">N-Number *</label>
              <input type="text" value={nNumber} onChange={e => setNNumber(e.target.value)}
                placeholder="N12345"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Nickname</label>
              <input type="text" value={nickname} onChange={e => setNickname(e.target.value)}
                placeholder="e.g. Skyhawk"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
              {saving && <Loader2 className="h-3 w-3 animate-spin" />}
              Save
            </button>
            <button onClick={() => { setShowAdd(false); setError('') }}
              className="px-3 py-1.5 rounded-md border border-border text-sm hover:bg-muted transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Aircraft list */}
      {aircraft.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <Plane className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-2 text-sm text-muted-foreground">No aircraft yet. Add one to auto-fill when logging flights.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {aircraft.map(a => (
            <div key={a.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10">
                  <Plane className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">{a.nNumber}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.nickname || a.model ? `${a.nickname || ''}${a.model ? ` · ${a.model.manufacturer || ''} ${a.model.model || ''}` : ''}` : 'No details'}
                  </p>
                </div>
              </div>
              <button onClick={() => handleDelete(a.id, a.nNumber)}
                className="p-1.5 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
