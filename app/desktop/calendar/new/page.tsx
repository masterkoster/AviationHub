'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import { createAgendaItem, type AgendaItemType } from '@/apps/desktop/src/lib/local-agenda'

export default function NewCalendarItemPage() {
  const { mode, localUser, cloudUser } = useDesktopAuth()
  const router = useRouter()
  const userId = mode === 'local' ? localUser?.id : (cloudUser?.id || 'cloud-default')

  const [itemType, setItemType] = useState<AgendaItemType>('personal')
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [relatedHref, setRelatedHref] = useState('/desktop/map')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!userId) return
    if (!title.trim()) {
      setError('Title is required')
      return
    }
    setSaving(true)
    setError('')
    try {
      const id = await createAgendaItem({
        userId,
        itemType,
        title,
        details,
        startsAt: startsAt ? new Date(startsAt).toISOString() : null,
        relatedHref,
      })
      router.replace(`/desktop/calendar/${id}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save item')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-bold">New Calendar Item</h1>
      <form onSubmit={onSubmit} className="mt-4 space-y-4 rounded-lg border border-border bg-card p-4">
        <Field label="Type">
          <select value={itemType} onChange={(e) => setItemType(e.target.value as AgendaItemType)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
            <option value="personal">Personal</option>
            <option value="flight">Flight</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </Field>
        <Field label="Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
        </Field>
        <Field label="Details">
          <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={4} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
        </Field>
        <Field label="When (local time)">
          <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
        </Field>
        <Field label="Open button link">
          <input value={relatedHref} onChange={(e) => setRelatedHref(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
        </Field>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => router.back()} className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted">Cancel</button>
          <button disabled={saving} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {saving ? 'Saving…' : 'Create Item'}
          </button>
        </div>
      </form>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium">{label}</label>
      {children}
    </div>
  )
}
