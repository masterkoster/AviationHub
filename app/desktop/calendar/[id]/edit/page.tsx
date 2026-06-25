'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import {
  getAgendaItemById,
  updateAgendaItem,
  type AgendaItemType,
  type AgendaItemStatus,
} from '@/apps/desktop/src/lib/local-agenda'

export default function CalendarItemEditPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { mode, localUser, cloudUser } = useDesktopAuth()
  const userId = mode === 'local' ? localUser?.id : (cloudUser?.id || 'cloud-default')

  const [loaded, setLoaded] = useState(false)
  const [itemType, setItemType] = useState<AgendaItemType>('personal')
  const [status, setStatus] = useState<AgendaItemStatus>('planned')
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [relatedHref, setRelatedHref] = useState('')

  useEffect(() => {
    async function load() {
      if (!userId || !id) return
      const row = await getAgendaItemById(userId, id)
      if (!row) return
      setItemType(row.itemType)
      setStatus(row.status)
      setTitle(row.title)
      setDetails(row.details || '')
      setRelatedHref(row.relatedHref || '')
      setStartsAt(row.startsAt ? toInputDateTime(row.startsAt) : '')
      setLoaded(true)
    }
    load()
  }, [userId, id])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!userId || !id) return
    await updateAgendaItem({
      userId,
      id,
      itemType,
      title,
      details,
      startsAt: startsAt ? new Date(startsAt).toISOString() : null,
      dueAt: null,
      status,
      relatedHref,
    })
    router.replace(`/desktop/calendar/${id}`)
    router.refresh()
  }

  if (!loaded) {
    return <div className="mx-auto max-w-2xl p-6 text-sm text-muted-foreground">Loading item...</div>
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-bold">Edit Calendar Item</h1>
      <form onSubmit={onSubmit} className="mt-4 space-y-4 rounded-lg border border-border bg-card p-4">
        <Field label="Type">
          <select value={itemType} onChange={(e) => setItemType(e.target.value as AgendaItemType)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
            <option value="personal">Personal</option>
            <option value="flight">Flight</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </Field>
        <Field label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value as AgendaItemStatus)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
            <option value="planned">Planned</option>
            <option value="done">Done</option>
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
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => router.back()} className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted">Cancel</button>
          <button className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Save</button>
        </div>
      </form>
    </div>
  )
}

function toInputDateTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium">{label}</label>
      {children}
    </div>
  )
}
