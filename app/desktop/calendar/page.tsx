'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { CalendarDays, Plus } from 'lucide-react'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import { listAgendaItems, markAgendaItemDone, type AgendaItem } from '@/apps/desktop/src/lib/local-agenda'

export default function DesktopCalendarPage() {
  const { mode, localUser, cloudUser } = useDesktopAuth()
  const [items, setItems] = useState<AgendaItem[]>([])

  const userId = mode === 'local' ? localUser?.id : (cloudUser?.id || 'cloud-default')

  async function refresh() {
    if (!userId) return
    const rows = await listAgendaItems(userId)
    setItems(rows)
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  async function toggleDone(item: AgendaItem, done: boolean) {
    if (!userId) return
    await markAgendaItemDone(userId, item.id, done)
    await refresh()
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Calendar</h1>
          <p className="text-xs text-muted-foreground">Local timezone agenda and planned items</p>
        </div>
        <Link href="/desktop/calendar/new" className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" /> Add Item
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
          <CalendarDays className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">No agenda items yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Link href={`/desktop/calendar/${item.id}`} className="text-sm font-medium hover:underline">
                    {item.title}
                  </Link>
                  <p className="mt-0.5 text-xs text-muted-foreground">{formatWhen(item)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.itemType}</p>
                </div>
                <button
                  onClick={() => toggleDone(item, item.status !== 'done')}
                  className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                >
                  {item.status === 'done' ? 'Mark Planned' : 'Mark Done'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function formatWhen(item: AgendaItem): string {
  const value = item.startsAt || item.dueAt
  if (!value) return 'No date set'
  const d = new Date(value)
  if (isNaN(d.getTime())) return 'No date set'
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
