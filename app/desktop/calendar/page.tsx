'use client'

import Link from 'next/link'
import { useEffect, useState, useCallback } from 'react'
import {
  CalendarDays, Plus, ChevronLeft, ChevronRight, MapPin, ExternalLink,
  PlaneLanding, Sparkles, GraduationCap, Users, Coffee, type LucideIcon,
} from 'lucide-react'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import { listAgendaItems, markAgendaItemDone, type AgendaItem } from '@/apps/desktop/src/lib/local-agenda'
import { getAllLocalUsers } from '@/desktop/lib/local-auth'
import { ErrorCard } from '@/desktop/components/error-card'
import { notifyError } from '@/desktop/lib/toast-helpers'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

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

// ─── Nearby events ────────────────────────────────────────────────────────

const NEARBY_EVENTS_STORAGE_KEY = 'desktop.calendar.showNearbyEvents'
const NEARBY_RADIUS_NM = 100

type EventCategory = 'fly-in' | 'airshow' | 'seminar' | 'meetup' | 'breakfast'

interface NearbyEvent {
  id: string
  title: string
  description: string | null
  category: EventCategory
  website: string | null
  startTime: string
  endTime: string | null
  airportIcao: string
  airportName: string | null
  city: string | null
  distanceNm: number
  organizationId: string | null
}

const EVENT_CATEGORY_ICON: Record<EventCategory, LucideIcon> = {
  'fly-in': PlaneLanding,
  airshow: Sparkles,
  seminar: GraduationCap,
  meetup: Users,
  breakfast: Coffee,
}

const EVENT_CATEGORY_LABEL: Record<EventCategory, string> = {
  'fly-in': 'Fly-In',
  airshow: 'Airshow',
  seminar: 'Seminar',
  meetup: 'Meetup',
  breakfast: 'Breakfast',
}

const EVENT_CHIP_STYLE =
  'bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-dashed border-teal-500/40'

function loadShowNearbyEventsPref(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(NEARBY_EVENTS_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function saveShowNearbyEventsPref(value: boolean) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(NEARBY_EVENTS_STORAGE_KEY, value ? '1' : '0')
  } catch {
    // ignore
  }
}

function formatEventDateTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function formatEventRange(ev: NearbyEvent): string {
  const start = formatEventDateTime(ev.startTime)
  if (!ev.endTime) return start
  const startDate = new Date(ev.startTime)
  const endDate = new Date(ev.endTime)
  if (isNaN(endDate.getTime())) return start
  if (sameDay(startDate, endDate)) {
    const endTime = endDate.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit' })
    return `${start} – ${endTime}`
  }
  return `${start} – ${formatEventDateTime(ev.endTime)}`
}

async function fetchNearbyEvents(icao: string, from: Date, to: Date): Promise<NearbyEvent[]> {
  const params = new URLSearchParams({
    icao,
    radiusNm: String(NEARBY_RADIUS_NM),
    from: from.toISOString(),
    to: to.toISOString(),
  })
  const res = await fetch(`/api/events/nearby?${params.toString()}`)
  if (!res.ok) throw new Error(`Failed to load nearby events (${res.status})`)
  const data = await res.json()
  return Array.isArray(data) ? data : []
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

  // ── Nearby events: home airport resolution ─────────────────────
  // Local mode profiles carry homeAirport directly. Cloud mode mirrors the
  // active account into a local pilot_profile row (see local-auth.ts /
  // profile page), so we resolve it the same way the profile page does.
  const [homeAirport, setHomeAirport] = useState<string | null>(null)
  const [homeAirportLoading, setHomeAirportLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function resolveHomeAirport() {
      setHomeAirportLoading(true)
      if (localUser?.homeAirport) {
        if (!cancelled) { setHomeAirport(localUser.homeAirport); setHomeAirportLoading(false) }
        return
      }
      if (mode === 'cloud') {
        try {
          const users = await getAllLocalUsers()
          if (!cancelled) setHomeAirport(users[0]?.homeAirport ?? null)
        } catch {
          if (!cancelled) setHomeAirport(null)
        } finally {
          if (!cancelled) setHomeAirportLoading(false)
        }
        return
      }
      if (!cancelled) { setHomeAirport(null); setHomeAirportLoading(false) }
    }
    resolveHomeAirport()
    return () => { cancelled = true }
  }, [mode, localUser?.homeAirport])

  // ── Nearby events: toggle + fetch ───────────────────────────────
  const [showNearbyEvents, setShowNearbyEventsState] = useState(false)
  useEffect(() => { setShowNearbyEventsState(loadShowNearbyEventsPref()) }, [])

  function setShowNearbyEvents(value: boolean) {
    setShowNearbyEventsState(value)
    saveShowNearbyEventsPref(value)
  }

  const [nearbyEvents, setNearbyEvents] = useState<NearbyEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [eventsError, setEventsError] = useState<string | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<NearbyEvent | null>(null)

  useEffect(() => {
    if (!showNearbyEvents || !homeAirport) {
      setNearbyEvents([])
      setEventsError(null)
      return
    }
    let cancelled = false
    setEventsLoading(true)
    setEventsError(null)
    const from = new Date(viewYear, viewMonth, 1)
    const to = new Date(viewYear, viewMonth + 1, 0, 23, 59, 59)
    fetchNearbyEvents(homeAirport, from, to)
      .then((rows) => { if (!cancelled) setNearbyEvents(rows) })
      .catch((err) => {
        console.error('[calendar] failed to load nearby events:', err)
        if (!cancelled) {
          setEventsError('Could not load nearby events')
          setNearbyEvents([])
        }
      })
      .finally(() => { if (!cancelled) setEventsLoading(false) })
    return () => { cancelled = true }
  }, [showNearbyEvents, homeAirport, viewYear, viewMonth])

  function eventsForDay(day: number): NearbyEvent[] {
    const target = new Date(viewYear, viewMonth, day)
    return nearbyEvents.filter((ev) => {
      const start = new Date(ev.startTime)
      if (isNaN(start.getTime())) return false
      const end = ev.endTime ? new Date(ev.endTime) : start
      const endResolved = isNaN(end.getTime()) ? start : end
      const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate())
      const endDay = new Date(endResolved.getFullYear(), endResolved.getMonth(), endResolved.getDate())
      return target >= startDay && target <= endDay
    })
  }

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

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-md border border-border bg-muted/20 px-3 py-2">
        <label
          className={[
            'flex items-center gap-2 text-xs font-medium',
            !homeAirportLoading && !homeAirport ? 'cursor-not-allowed' : 'cursor-pointer',
          ].join(' ')}
        >
          <input
            type="checkbox"
            checked={showNearbyEvents}
            disabled={!homeAirport}
            onChange={(e) => setShowNearbyEvents(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-input accent-primary disabled:opacity-50"
          />
          <span className={!homeAirport ? 'text-muted-foreground' : ''}>Nearby events</span>
          <span className="text-[10px] font-normal text-muted-foreground">
            (within {NEARBY_RADIUS_NM}nm)
          </span>
        </label>

        {!homeAirportLoading && !homeAirport && (
          <span className="text-[11px] text-muted-foreground">
            Set a home airport in your profile to see nearby events.
          </span>
        )}
        {showNearbyEvents && eventsLoading && (
          <span className="text-[11px] text-muted-foreground">Loading nearby events…</span>
        )}
        {showNearbyEvents && eventsError && (
          <span className="text-[11px] text-destructive">{eventsError}</span>
        )}
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
            const dayEvents = day !== null && showNearbyEvents ? eventsForDay(day) : []
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

                    {/* Nearby events (opt-in overlay) */}
                    {dayEvents.length > 0 && (
                      <div className="mt-0.5 space-y-0.5">
                        {dayEvents.slice(0, 2).map((ev) => {
                          const Icon = EVENT_CATEGORY_ICON[ev.category] ?? CalendarDays
                          return (
                            <button
                              key={ev.id}
                              type="button"
                              onClick={() => setSelectedEvent(ev)}
                              className={[
                                'flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[10px] font-medium transition-opacity hover:opacity-70',
                                EVENT_CHIP_STYLE,
                              ].join(' ')}
                              title={ev.title}
                            >
                              <Icon className="h-2.5 w-2.5 shrink-0" />
                              <span className="truncate">{ev.title}</span>
                            </button>
                          )
                        })}
                        {dayEvents.length > 2 && (
                          <p className="px-1 text-[10px] text-muted-foreground">
                            +{dayEvents.length - 2} more event{dayEvents.length - 2 === 1 ? '' : 's'}
                          </p>
                        )}
                      </div>
                    )}
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

      {/* Nearby event details */}
      <Dialog open={selectedEvent !== null} onOpenChange={(open) => { if (!open) setSelectedEvent(null) }}>
        <DialogContent>
          {selectedEvent && (() => {
            const Icon = EVENT_CATEGORY_ICON[selectedEvent.category] ?? CalendarDays
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Icon className="h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" />
                    {selectedEvent.title}
                  </DialogTitle>
                  <DialogDescription>{formatEventRange(selectedEvent)}</DialogDescription>
                </DialogHeader>

                <div className="space-y-3 text-sm">
                  <span
                    className={[
                      'inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
                      EVENT_CHIP_STYLE,
                    ].join(' ')}
                  >
                    {EVENT_CATEGORY_LABEL[selectedEvent.category] ?? selectedEvent.category}
                  </span>

                  <div className="flex items-start gap-1.5">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div>
                      <p className="font-medium">
                        {selectedEvent.airportIcao}
                        {selectedEvent.airportName ? ` — ${selectedEvent.airportName}` : ''}
                      </p>
                      {selectedEvent.city && (
                        <p className="text-xs text-muted-foreground">{selectedEvent.city}</p>
                      )}
                      <p className="text-xs text-muted-foreground">{selectedEvent.distanceNm} nm away</p>
                    </div>
                  </div>

                  {selectedEvent.description && (
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                      {selectedEvent.description}
                    </p>
                  )}

                  {selectedEvent.website && (
                    <a
                      href={selectedEvent.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Website
                    </a>
                  )}
                </div>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>
    </div>
  )
}
