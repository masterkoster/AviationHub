'use client'

import Link from 'next/link'
import { useEffect, useState, useCallback } from 'react'
import { CalendarDays, Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import { listAgendaItems, markAgendaItemDone, type AgendaItem } from '@/apps/desktop/src/lib/local-agenda'
import { ErrorCard } from '@/desktop/components/error-card'
import { notifyError } from '@/desktop/lib/toast-helpers'

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const TYPE_STYLE: Record<string, string> = {
  flight: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20',
  maintenance: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20',
  personal: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20',
}

function getItemDate(item: AgendaItem): Date | null {
  const val = item.startsAt || item.dueAt
  if (!val) return null
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export default function DesktopCalendarPage() {
  const { mode, localUser, cloudUser } = useDesktopAuth()
  const [items, setItems] = useState<AgendaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())

  const userId = mode === 'local' ? localUser?.id : (cloudUser?.id || 'cloud-default')

  const refresh = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    setLoadError(null)
    try {
      const rows = await listAgendaItems(userId)
      setItems(rows)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load agenda items')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => { refresh() }, [refresh])

  function prevMonth() {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11) }
    else setViewMonth((m) => m - 1)
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0) }
    else setViewMonth((m) => m + 1)
  }

  async function toggleDone(item: AgendaItem, done: boolean) {
    if (!userId) return
    try {
      await markAgendaItemDone(userId, item.id, done)
      await refresh()
    } catch (err) {
      notifyError('Calendar', err instanceof Error ? err.message : 'Failed to update item')
    }
  }

  // Build the grid cells
  const firstDayOfMonth = new Date(viewYear, viewMonth, 1)
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const startOffset = firstDayOfMonth.getDay()
  const cells: (number | null)[] = [
    ...Array<null>(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  function itemsForDay(day: number): AgendaItem[] {
    const target = new Date(viewYear, viewMonth, day)
    return items.filter((item) => {
      const d = getItemDate(item)
      return d !== null && sameDay(d, target)
    })
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      {/* Header */}
      <div className="mb-4 flex items-center gap-2">
        <CalendarDays className="h-5 w-5 shrink-0 text-muted-foreground" />
        <h1 className="text-2xl font-bold flex-1">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </h1>
        <div className="flex items-center gap-1">
          <button
            onClick={prevMonth}
            className="rounded-md p-1.5 transition-colors hover:bg-muted"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()) }}
            className="rounded-md border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted"
          >
            Today
          </button>
          <button
            onClick={nextMonth}
            className="rounded-md p-1.5 transition-colors hover:bg-muted"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <Link
          href="/desktop/calendar/new"
          className="ml-2 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Add Item
        </Link>
      </div>

      {loadError && <div className="mb-4"><ErrorCard message={loadError} onRetry={refresh} /></div>}

      {/* Grid */}
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-border bg-muted/30">
          {DAY_HEADERS.map((d) => (
            <div
              key={d}
              className="py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            const isToday =
              day !== null &&
              sameDay(new Date(viewYear, viewMonth, day), today)
            const dayItems = day !== null ? itemsForDay(day) : []
            const isLastInRow = i % 7 === 6
            const isLastRow = i >= cells.length - 7

            return (
              <div
                key={i}
                className={[
                  'min-h-[110px] p-1.5',
                  !isLastRow ? 'border-b border-border' : '',
                  !isLastInRow ? 'border-r border-border' : '',
                  !day ? 'bg-muted/10' : '',
                ].join(' ')}
              >
                {day && (
                  <>
                    {/* Day number */}
                    <div className="mb-1 flex items-center justify-between">
                      <span
                        className={[
                          'flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium',
                          isToday
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground',
                        ].join(' ')}
                      >
                        {day}
                      </span>
                    </div>

                    {/* Items */}
                    <div className="space-y-0.5">
                      {dayItems.slice(0, 3).map((item) => (
                        <div key={item.id} className="flex items-center gap-0.5 group">
                          <Link
                            href={`/desktop/calendar/${item.id}`}
                            className={[
                              'flex-1 truncate rounded px-1 py-0.5 text-[10px] font-medium transition-opacity hover:opacity-70',
                              TYPE_STYLE[item.itemType] ?? 'bg-muted text-muted-foreground border border-border',
                              item.status === 'done' ? 'opacity-40 line-through' : '',
                            ].join(' ')}
                            title={item.title}
                          >
                            {item.title}
                          </Link>
                          <button
                            onClick={() => toggleDone(item, item.status !== 'done')}
                            className="hidden group-hover:flex h-4 w-4 shrink-0 items-center justify-center rounded text-[8px] text-muted-foreground hover:text-foreground transition-colors"
                            title={item.status === 'done' ? 'Mark planned' : 'Mark done'}
                          >
                            {item.status === 'done' ? '↩' : '✓'}
                          </button>
                        </div>
                      ))}
                      {dayItems.length > 3 && (
                        <p className="px-1 text-[10px] text-muted-foreground">
                          +{dayItems.length - 3} more
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Loading spinner (subtle, below grid) */}
      {loading && (
        <div className="mt-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading...
        </div>
      )}

      {/* Empty state (no items anywhere this month) */}
      {!loading && !loadError && items.length === 0 && (
        <div className="mt-4 rounded-lg border border-dashed border-border bg-card p-6 text-center">
          <CalendarDays className="mx-auto h-7 w-7 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">No agenda items yet. Add one to get started.</p>
        </div>
      )}
    </div>
  )
}
