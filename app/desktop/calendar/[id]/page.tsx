'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import { getAgendaItemById, type AgendaItem } from '@/apps/desktop/src/lib/local-agenda'

export default function CalendarItemDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { mode, localUser, cloudUser } = useDesktopAuth()
  const [item, setItem] = useState<AgendaItem | null>(null)

  const userId = mode === 'local' ? localUser?.id : (cloudUser?.id || 'cloud-default')

  useEffect(() => {
    async function load() {
      if (!userId || !id) return
      const row = await getAgendaItemById(userId, id)
      setItem(row)
    }
    load()
  }, [userId, id])

  if (!item) {
    return <div className="mx-auto max-w-3xl p-6 text-sm text-muted-foreground">Loading item...</div>
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold">{item.title}</h1>
      <p className="mt-1 text-xs text-muted-foreground">{item.itemType} • {item.status}</p>

      <div className="mt-4 rounded-lg border border-border bg-card p-4">
        <p className="text-sm whitespace-pre-wrap">{item.details || 'No details'}</p>
        <p className="mt-3 text-xs text-muted-foreground">{formatWhen(item.startsAt || item.dueAt)}</p>
      </div>

      <div className="mt-4 flex gap-2">
        <Link href={`/desktop/calendar/${item.id}/edit`} className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted">
          Edit
        </Link>
        {item.relatedHref && (
          <Link href={item.relatedHref} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Open Related
          </Link>
        )}
      </div>
    </div>
  )
}

function formatWhen(value: string | null): string {
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
