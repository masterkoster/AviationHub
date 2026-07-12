'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { ChevronLeft, ChevronRight, CalendarDays, Users, Plane } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'

type Group = {
  id: string
  name: string
}

type Aircraft = {
  id: string
  nNumber?: string | null
  nickname?: string | null
  customName?: string | null
  make?: string | null
  model?: string | null
}

type Instructor = {
  id: string
  name?: string | null
  email?: string | null
  certificateNumber?: string | null
  certificateType?: string | null
}

type Booking = {
  id: string
  startTime: string
  endTime: string
  purpose?: string | null
  aircraftId?: string | null
  instructorId?: string | null
  user?: { id: string; name?: string | null; email?: string | null }
  instructor?: { id: string; name?: string | null; email?: string | null }
  aircraft?: { nNumber?: string | null; nickname?: string | null }
}

type BookingDetails = {
  title: string
  subtitle: string
  timeRange: string
  purpose?: string | null
}

const HOURS = Array.from({ length: 24 }, (_, i) => i)

function startOfWeek(date: Date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date: Date, days: number) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function formatDayLabel(date: Date) {
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function toMinutes(date: Date) {
  return date.getHours() * 60 + date.getMinutes()
}

function clamp(val: number, min: number, max: number) {
  return Math.min(max, Math.max(min, val))
}

export default function SchedulerPreviewPage() {
  const { data: session } = useSession()
  const [groups, setGroups] = useState<Group[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<string>('')
  const [aircraft, setAircraft] = useState<Aircraft[]>([])
  const [instructors, setInstructors] = useState<Instructor[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()))
  const [selectedBooking, setSelectedBooking] = useState<BookingDetails | null>(null)
  const [showAircraft, setShowAircraft] = useState(true)
  const [showInstructors, setShowInstructors] = useState(true)

  useEffect(() => {
    if (!session?.user?.id && !session?.user?.email) return
    let cancelled = false
    async function loadGroups() {
      try {
        const res = await fetch('/api/groups')
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) {
          setGroups(data || [])
          if (data?.length && !selectedGroupId) {
            setSelectedGroupId(data[0].id)
          }
        }
      } catch (error) {
        console.error('Failed to load groups', error)
      }
    }
    loadGroups()
    return () => { cancelled = true }
  }, [session?.user?.id, session?.user?.email, selectedGroupId])

  useEffect(() => {
    if (!selectedGroupId) return
    let cancelled = false

    async function loadGroupData() {
      try {
        // Pad a month on each side of the visible week so prev/next navigation
        // within that range doesn't need a refetch.
        const rangeStart = addDays(weekStart, -30).toISOString()
        const rangeEnd = addDays(weekStart, 37).toISOString()
        const [bookingsRes, instructorsRes] = await Promise.all([
          fetch(`/api/groups/${selectedGroupId}/bookings?start=${rangeStart}&end=${rangeEnd}`),
          fetch(`/api/groups/${selectedGroupId}/instructors`),
        ])

        if (bookingsRes.ok) {
          const data = await bookingsRes.json()
          if (!cancelled) {
            setBookings(Array.isArray(data) ? data : data.bookings || data || [])
          }
        }

        if (instructorsRes.ok) {
          const data = await instructorsRes.json()
          if (!cancelled) setInstructors(data.instructors || [])
        }

        const groupsRes = await fetch('/api/groups')
        if (groupsRes.ok) {
          const data = await groupsRes.json()
          const group = data.find((g: Group) => g.id === selectedGroupId)
          if (group) setAircraft(group.aircraft || [])
        }
      } catch (error) {
        console.error('Failed to load scheduler data', error)
      }
    }

    loadGroupData()
    return () => { cancelled = true }
  }, [selectedGroupId, weekStart])

  const weekDays = useMemo(() => (
    Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  ), [weekStart])

  const weekEnd = addDays(weekStart, 7)

  const weekBookings = useMemo(() => (
    bookings.filter((b) => {
      const start = new Date(b.startTime)
      return start >= weekStart && start < weekEnd
    })
  ), [bookings, weekStart, weekEnd])

  const handleBookingClick = (booking: Booking, resourceLabel: string) => {
    const start = new Date(booking.startTime)
    const end = new Date(booking.endTime)
    const timeRange = `${start.toLocaleString()} - ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    setSelectedBooking({
      title: resourceLabel,
      subtitle: booking.user?.name || booking.instructor?.name || 'Reservation',
      timeRange,
      purpose: booking.purpose,
    })
  }

  const renderBlocks = (resourceId: string, type: 'aircraft' | 'instructor', day: Date) => {
    const filtered = weekBookings.filter((b) => type === 'aircraft'
      ? b.aircraftId === resourceId
      : b.instructorId === resourceId)

    return filtered.map((b) => {
      const start = new Date(b.startTime)
      const end = new Date(b.endTime)
      if (start.toDateString() !== day.toDateString()) return null

      const startMin = toMinutes(start)
      const endMin = toMinutes(end)
      const leftPercent = clamp(startMin / (24 * 60), 0, 1) * 100
      const widthPercent = clamp((endMin - startMin) / (24 * 60), 0, 1) * 100

      const resourceLabel = type === 'aircraft'
        ? (b.aircraft?.nNumber || 'Aircraft')
        : (b.instructor?.name || 'Instructor')

      return (
        <div
          key={b.id}
          className={`absolute top-2 h-8 rounded-md px-2 text-[11px] leading-8 text-white shadow-sm cursor-pointer ${
            type === 'aircraft' ? 'bg-sky-600' : 'bg-amber-600'
          }`}
          style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
          title={`${resourceLabel} • ${new Date(b.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}-${new Date(b.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
          onClick={() => handleBookingClick(b, resourceLabel)}
        >
          {resourceLabel}
        </div>
      )
    })
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-[1400px] space-y-6">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <CalendarDays className="h-5 w-5" />
                  Scheduler Preview
                  <Badge variant="outline">Weekly Row</Badge>
                </CardTitle>
                <CardDescription>Preview of the next‑gen weekly scheduler (24‑hour grid).</CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, -7))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(new Date()))}>
                  Today
                </Button>
                <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, 7))}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <select
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={selectedGroupId}
                  onChange={(e) => setSelectedGroupId(e.target.value)}
                >
                  <option value="">Select a club...</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
                <Button variant={showAircraft ? 'default' : 'outline'} size="sm" onClick={() => setShowAircraft((v) => !v)}>
                  <Plane className="mr-1 h-4 w-4" /> Aircraft
                </Button>
                <Button variant={showInstructors ? 'default' : 'outline'} size="sm" onClick={() => setShowInstructors((v) => !v)}>
                  <Users className="mr-1 h-4 w-4" /> Instructors
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-[200px_repeat(7,minmax(140px,1fr))] gap-2 text-xs text-muted-foreground">
              <div />
              {weekDays.map((day) => (
                <div key={day.toISOString()} className="text-center font-medium">
                  {formatDayLabel(day)}
                </div>
              ))}
            </div>

            {showAircraft && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Plane className="h-4 w-4 text-sky-500" /> Aircraft
                </div>
                {aircraft.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">No aircraft found.</div>
                ) : (
                  aircraft.map((ac) => (
                    <div key={ac.id} className="grid grid-cols-[200px_repeat(7,minmax(140px,1fr))] gap-2">
                      <div className="rounded-md border border-border p-2 text-sm">
                        <div className="font-medium">{ac.nNumber || 'Aircraft'}</div>
                        <div className="text-xs text-muted-foreground">{ac.nickname || ac.customName || ''}</div>
                      </div>
                      {weekDays.map((day) => (
                        <div key={day.toISOString()} className="relative h-12 rounded-md border border-border">
                          <div className="absolute inset-0 flex">
                            {HOURS.map((h) => (
                              <div key={h} className="flex-1 border-r border-border/40" />
                            ))}
                          </div>
                          {renderBlocks(ac.id, 'aircraft', day)}
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </div>
            )}

            {showInstructors && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Users className="h-4 w-4 text-amber-500" /> Instructors
                </div>
                {instructors.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">No verified instructors found.</div>
                ) : (
                  instructors.map((ins) => (
                    <div key={ins.id} className="grid grid-cols-[200px_repeat(7,minmax(140px,1fr))] gap-2">
                      <div className="rounded-md border border-border p-2 text-sm">
                        <div className="font-medium">{ins.name || ins.email || 'Instructor'}</div>
                        <div className="text-xs text-muted-foreground">{ins.certificateType || 'Verified Instructor'}</div>
                      </div>
                      {weekDays.map((day) => (
                        <div key={day.toISOString()} className="relative h-12 rounded-md border border-border">
                          <div className="absolute inset-0 flex">
                            {HOURS.map((h) => (
                              <div key={h} className="flex-1 border-r border-border/40" />
                            ))}
                          </div>
                          {renderBlocks(ins.id, 'instructor', day)}
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!selectedBooking} onOpenChange={(open) => { if (!open) setSelectedBooking(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedBooking?.title}</DialogTitle>
            <DialogDescription>{selectedBooking?.subtitle}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Time</span>
              <span>{selectedBooking?.timeRange}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Purpose</span>
              <span>{selectedBooking?.purpose || '—'}</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
