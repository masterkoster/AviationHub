'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, AlertTriangle, Clock } from 'lucide-react'

export interface ScheduleAircraft {
  id: string
  nNumber: string
  nickname: string | null
  customName: string | null
  status: string | null
  airworthiness?: 'OVERDUE' | 'DUE_SOON' | 'OK' | 'UNKNOWN'
}
export interface ScheduleBooking {
  id: string
  aircraftId: string
  startTime: string
  endTime: string
  purpose: string | null
  user: { id: string; name: string } | null
  instructor: { id: string; name: string } | null
}
export interface ScheduleBlockout {
  id: string
  clubAircraftId: string | null
  startTime: string
  endTime: string
  reason?: string | null
}
export interface ClubScheduleViewProps {
  aircraft: ScheduleAircraft[]
  bookings: ScheduleBooking[]
  blockouts: ScheduleBlockout[]
  onBook?: (opts: { aircraftId: string; date: string; startHour: number }) => void
  onSelectBooking?: (bookingId: string) => void
  onSelectAircraft?: (aircraftId: string) => void
}

const DAY_START = 6 // 06:00
const DAY_END = 22 // 22:00
const HOURS = Array.from({ length: DAY_END - DAY_START }, (_, i) => DAY_START + i)
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const LABEL_W = 128 // px, aircraft label column

function round1(n: number) {
  return Math.round(n * 10) / 10
}
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function startOfWeek(d: Date) {
  const s = new Date(d)
  s.setDate(s.getDate() - s.getDay())
  s.setHours(0, 0, 0, 0)
  return s
}
function fmtHour(h: number) {
  const period = h < 12 ? 'a' : 'p'
  const hr = h % 12 === 0 ? 12 : h % 12
  return `${hr}${period}`
}
function acLabel(a: ScheduleAircraft) {
  return a.nickname || a.customName || null
}

/** Clip [start,end] to a single day's visible 06:00–22:00 window; fraction 0..1. */
function clipToDay(start: Date, end: Date, day: Date): { l: number; w: number } | null {
  const dayStart = new Date(day)
  dayStart.setHours(DAY_START, 0, 0, 0)
  const dayEnd = new Date(day)
  dayEnd.setHours(DAY_END, 0, 0, 0)
  const s = Math.max(start.getTime(), dayStart.getTime())
  const e = Math.min(end.getTime(), dayEnd.getTime())
  if (e <= s) return null
  const span = dayEnd.getTime() - dayStart.getTime()
  return { l: (s - dayStart.getTime()) / span, w: (e - s) / span }
}

export default function ClubScheduleView({
  aircraft,
  bookings,
  blockouts,
  onBook,
  onSelectBooking,
  onSelectAircraft,
}: ClubScheduleViewProps) {
  const [view, setView] = useState<'day' | 'week'>('day')
  const [anchor, setAnchor] = useState(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  })

  const visibleDays = useMemo(() => {
    if (view === 'day') return [new Date(anchor)]
    const s = startOfWeek(anchor)
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(s)
      d.setDate(s.getDate() + i)
      return d
    })
  }, [view, anchor])

  const totalDays = visibleDays.length

  // Position an event across the visible day columns (handles multi-day in week view)
  function blocksFor(startISO: string, endISO: string) {
    const start = new Date(startISO)
    const end = new Date(endISO)
    const out: { left: number; width: number }[] = []
    visibleDays.forEach((day, di) => {
      const c = clipToDay(start, end, day)
      if (!c) return
      out.push({
        left: round1(((di + c.l) / totalDays) * 100),
        width: Math.max(0.5, round1((c.w / totalDays) * 100)),
      })
    })
    return out
  }

  const clubWide = blockouts.filter((b) => b.clubAircraftId === null)

  function shift(dir: number) {
    const d = new Date(anchor)
    d.setDate(d.getDate() + dir * (view === 'day' ? 1 : 7))
    setAnchor(d)
  }
  function goToday() {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    setAnchor(d)
  }

  const headerLabel =
    view === 'day'
      ? anchor.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
      : `${visibleDays[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${visibleDays[6].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`

  function laneClick(e: React.MouseEvent<HTMLDivElement>, aircraftId: string) {
    if (!onBook) return
    const rect = e.currentTarget.getBoundingClientRect()
    const frac = Math.min(0.999, Math.max(0, (e.clientX - rect.left) / rect.width))
    const dayIdx = Math.floor(frac * totalDays)
    const withinDay = frac * totalDays - dayIdx
    const hour = DAY_START + Math.floor(withinDay * (DAY_END - DAY_START))
    onBook({ aircraftId, date: ymd(visibleDays[dayIdx] || visibleDays[0]), startHour: hour })
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <div className="flex items-center gap-1">
          <button onClick={() => shift(-1)} className="grid h-8 w-8 place-items-center rounded-md border border-border text-muted-foreground hover:bg-muted" aria-label="Previous">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={goToday} className="h-8 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted">Today</button>
          <button onClick={() => shift(1)} className="grid h-8 w-8 place-items-center rounded-md border border-border text-muted-foreground hover:bg-muted" aria-label="Next">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <span className="text-sm font-semibold">{headerLabel}</span>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-md border border-border p-0.5">
            {(['day', 'week'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded px-3 py-1 text-xs font-medium capitalize ${view === v ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {v}
              </button>
            ))}
          </div>
          {onBook && aircraft.length > 0 && (
            <button
              onClick={() => onBook({ aircraftId: aircraft[0].id, date: ymd(visibleDays[0]), startHour: 9 })}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:brightness-105"
            >
              <Plus className="h-3.5 w-3.5" /> Book
            </button>
          )}
        </div>
      </div>

      {aircraft.length === 0 ? (
        <div className="p-10 text-center text-sm text-muted-foreground">
          No aircraft yet — add one to start scheduling.
        </div>
      ) : (
        <div className="flex">
          {/* Aircraft label column */}
          <div className="shrink-0 border-r border-border" style={{ width: LABEL_W }}>
            <div className="h-8 border-b border-border" />
            {aircraft.map((a) => {
              const sub = acLabel(a)
              const grounded = a.airworthiness === 'OVERDUE' || /ground|maintenance/i.test(a.status || '')
              return (
                <button
                  key={a.id}
                  onClick={() => onSelectAircraft?.(a.id)}
                  className="flex h-16 w-full flex-col justify-center gap-0.5 border-b border-border px-3 text-left hover:bg-muted/50"
                >
                  <span className="font-mono text-[13px] font-semibold">{a.nNumber}</span>
                  {sub && <span className="truncate text-[11px] text-muted-foreground">{sub}</span>}
                  {grounded ? (
                    <span className="flex items-center gap-1 text-[11px] font-medium text-destructive"><AlertTriangle className="h-3 w-3" /> {a.airworthiness === 'OVERDUE' ? 'Insp overdue' : 'Grounded'}</span>
                  ) : a.airworthiness === 'DUE_SOON' ? (
                    <span className="flex items-center gap-1 text-[11px] font-medium text-amber-600"><Clock className="h-3 w-3" /> Insp due</span>
                  ) : (
                    <span className="flex items-center gap-1 text-[11px] text-emerald-600"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Available</span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Time area */}
          <div className="flex-1 overflow-x-auto">
            <div className="min-w-[560px]">
              {/* Column headers */}
              <div className="flex h-8 border-b border-border">
                {view === 'day'
                  ? HOURS.map((h) => (
                      <div key={h} className="flex-1 border-l border-border/60 px-1 text-[10px] leading-8 text-muted-foreground first:border-l-0">{fmtHour(h)}</div>
                    ))
                  : visibleDays.map((d, i) => (
                      <div key={i} className="flex-1 border-l border-border/60 px-1 text-[10px] leading-8 text-muted-foreground first:border-l-0">
                        {DAY_LABELS[d.getDay()]} {d.getDate()}
                      </div>
                    ))}
              </div>

              {/* Rows */}
              <div className="relative">
                {aircraft.map((a) => {
                  const acBookings = bookings.filter((b) => b.aircraftId === a.id)
                  const acBlockouts = blockouts.filter((b) => b.clubAircraftId === a.id)
                  return (
                    <div
                      key={a.id}
                      className="relative h-16 border-b border-border"
                      onClick={(e) => laneClick(e, a.id)}
                    >
                      {/* grid columns */}
                      <div className="pointer-events-none absolute inset-0 flex">
                        {(view === 'day' ? HOURS : visibleDays).map((_, i) => (
                          <div key={i} className="flex-1 border-l border-border/40 first:border-l-0" />
                        ))}
                      </div>
                      {/* blockouts (per-aircraft) */}
                      {acBlockouts.flatMap((bo) =>
                        blocksFor(bo.startTime, bo.endTime).map((pos, i) => (
                          <div
                            key={`${bo.id}-${i}`}
                            className="absolute top-2 bottom-2 flex items-center justify-center rounded border border-destructive/30 px-2 text-[11px] font-medium text-destructive"
                            style={{ left: `${pos.left}%`, width: `${pos.width}%`, backgroundImage: 'repeating-linear-gradient(45deg, color-mix(in srgb, hsl(var(--destructive)) 12%, transparent) 0 5px, transparent 5px 10px)' }}
                          >
                            {bo.reason || 'Blocked'}
                          </div>
                        ))
                      )}
                      {/* bookings */}
                      {acBookings.flatMap((b) =>
                        blocksFor(b.startTime, b.endTime).map((pos, i) => (
                          <div
                            key={`${b.id}-${i}`}
                            onClick={(e) => { e.stopPropagation(); onSelectBooking?.(b.id) }}
                            className="absolute top-2 bottom-2 z-10 flex cursor-pointer flex-col justify-center gap-0.5 overflow-hidden rounded border border-primary/30 bg-primary/15 px-2 text-primary hover:bg-primary/25"
                            style={{ left: `${pos.left}%`, width: `${pos.width}%` }}
                          >
                            <span className="truncate text-[11px] font-semibold">{b.user?.name || 'Reserved'}</span>
                            {b.purpose && <span className="truncate text-[10px] opacity-80">{b.purpose}</span>}
                          </div>
                        ))
                      )}
                    </div>
                  )
                })}

                {/* club-wide blockouts overlay */}
                {clubWide.flatMap((bo) =>
                  blocksFor(bo.startTime, bo.endTime).map((pos, i) => (
                    <div
                      key={`cw-${bo.id}-${i}`}
                      className="pointer-events-none absolute top-0 bottom-0 border-x border-destructive/30"
                      style={{ left: `${pos.left}%`, width: `${pos.width}%`, backgroundImage: 'repeating-linear-gradient(45deg, color-mix(in srgb, hsl(var(--destructive)) 10%, transparent) 0 6px, transparent 6px 12px)' }}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
