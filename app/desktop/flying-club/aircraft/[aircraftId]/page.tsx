'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Plane, Wrench, Calendar, Clock, DollarSign, ArrowLeft, Loader2,
  AlertTriangle, CheckCircle, BookOpen, Gauge, Plus, Users, FileText,
  ClipboardList, CloudOff,
} from 'lucide-react'

// ---- Types (mirrors lib/club/aircraft-profile.ts AircraftProfileData) ----

interface AircraftProfileAircraft {
  id: string
  organizationId: string | null
  nNumber: string | null
  nickname: string | null
  customName: string | null
  make: string | null
  model: string | null
  year: number | null
  hourlyRate: number | null
  totalTachHours: number | null
  totalHobbsHours: number | null
  registrationType: string | null
  maxPassengers: number | null
  aircraftNotes: string | null
  status: string | null
  bookingWindowDays: number
}

interface MaintenanceItemSummary {
  id: string
  description: string
  status: string | null
  category: string | null
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | null
  isGrounded: boolean
  reportedDate: string | null
  resolvedDate: string | null
  cost: number | null
  notes: string | null
  reportedByName: string | null
}

interface FlightLogSummary {
  id: string
  date: string
  tachTime: number | null
  hobbsTime: number | null
  hobbsStart: number | null
  hobbsEnd: number | null
  calculatedCost: number | null
  notes: string | null
  pilotName: string | null
}

interface BookingSummary {
  id: string
  startTime: string
  endTime: string
  purpose: string | null
  pilotName: string | null
}

interface AircraftProfileData {
  aircraft: AircraftProfileAircraft
  status: {
    isGrounded: boolean
    openSquawkCount: number
    highestOpenSeverity: 'LOW' | 'MEDIUM' | 'HIGH' | null
  }
  openSquawks: MaintenanceItemSummary[]
  maintenanceHistory: MaintenanceItemSummary[]
  recentFlightLogs: FlightLogSummary[]
  upcomingBookings: BookingSummary[]
  utilization: {
    flightsLast30d: number
    hoursLast30d: number
    flightsLast90d: number
    hoursLast90d: number
  }
  generatedAt: string
}

// ---- Helpers ----

function fmt(iso: string | null, mode: 'date' | 'time') {
  if (!iso) return '—'
  try {
    return mode === 'date'
      ? new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
      : new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch { return iso }
}

function fmtHours(n: number | null) {
  if (n === null || n === undefined) return '—'
  return n.toFixed(1)
}

function severityBadgeClass(severity: 'LOW' | 'MEDIUM' | 'HIGH' | null) {
  if (severity === 'HIGH') return 'bg-red-500/10 text-red-600 border-red-500/30'
  if (severity === 'MEDIUM') return 'bg-amber-500/10 text-amber-600 border-amber-500/30'
  return 'bg-muted text-muted-foreground'
}

function statusBadgeColor(status: string | null) {
  if (status === 'NEEDED') return 'bg-amber-500/10 text-amber-600'
  if (status === 'IN_PROGRESS') return 'bg-blue-500/10 text-blue-600'
  return 'bg-green-500/10 text-green-600'
}

function aircraftTitle(a: AircraftProfileAircraft) {
  return a.customName || a.nickname || null
}

function UtilizationBar({ label, flights, hours, maxHours }: { label: string; flights: number; hours: number; maxHours: number }) {
  const pct = maxHours > 0 ? Math.max(hours > 0 ? 4 : 0, Math.min(100, (hours / maxHours) * 100)) : 0
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <span className="text-sm">
          <span className="font-semibold text-foreground">{fmtHours(hours)} hrs</span>
          <span className="text-muted-foreground"> · {flights} flight{flights === 1 ? '' : 's'}</span>
        </span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// ---- Main Page ----

export default function DesktopAircraftProfilePage() {
  const params = useParams()
  const aircraftId = params.aircraftId as string
  const { cloudUser, initializing } = useDesktopAuth()

  const [profile, setProfile] = useState<AircraftProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [connectionError, setConnectionError] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (initializing || !cloudUser || !aircraftId) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      setNotFound(false)
      setConnectionError(false)
      try {
        const groupsRes = await fetch('/api/groups')
        const groupsData = await groupsRes.json().catch(() => null)
        if (!groupsRes.ok) {
          if (!cancelled) setError((groupsData && groupsData.error) || 'Failed to load groups')
          return
        }
        const groups: Array<{ id: string; aircraft?: Array<{ id: string }> }> = Array.isArray(groupsData) ? groupsData : []
        const owningGroup = groups.find(g => (g.aircraft || []).some(a => a.id === aircraftId))

        if (!owningGroup) {
          if (!cancelled) setNotFound(true)
          return
        }

        const profileRes = await fetch(`/api/groups/${owningGroup.id}/aircraft/${aircraftId}/profile`)
        const profileData = await profileRes.json().catch(() => null)

        if (profileRes.status === 404) {
          if (!cancelled) setNotFound(true)
          return
        }
        if (!profileRes.ok) {
          if (!cancelled) setError((profileData && profileData.error) || 'Failed to load aircraft profile')
          return
        }

        if (!cancelled) setProfile(profileData)
      } catch {
        // fetch threw — most likely offline / no route to the cloud API
        if (!cancelled) setConnectionError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [cloudUser, initializing, aircraftId])

  if (initializing || (loading && cloudUser)) {
    return (
      <div className="flex h-full items-center justify-center p-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!cloudUser) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
          <Plane className="h-7 w-7 text-primary" />
        </div>
        <h2 className="text-lg font-semibold">Aircraft Profile</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Flying Club requires a cloud account. Sign in from the Flying Club home page to view aircraft.
        </p>
        <Link href="/desktop/flying-club">
          <Button size="sm">Go to Flying Club</Button>
        </Link>
      </div>
    )
  }

  if (connectionError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted">
          <CloudOff className="h-7 w-7 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold">Flying Club needs a connection</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          This aircraft&apos;s profile is stored in the cloud and couldn&apos;t be reached. Check your connection and try again.
        </p>
        <Button size="sm" variant="outline" onClick={() => window.location.reload()}>Retry</Button>
      </div>
    )
  }

  if (notFound || !profile) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
        <Plane className="h-10 w-10 text-muted-foreground/50" />
        <h2 className="text-lg font-semibold">Aircraft Not Found</h2>
        <p className="max-w-sm text-sm text-muted-foreground">This aircraft doesn&apos;t exist or you don&apos;t have access to it.</p>
        <Link href="/desktop/flying-club"><Button size="sm" variant="outline">Back to Flying Club</Button></Link>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="max-w-sm text-sm text-destructive">{error}</p>
        <Link href="/desktop/flying-club"><Button size="sm" variant="outline">Back to Flying Club</Button></Link>
      </div>
    )
  }

  const { aircraft, status: aircraftStatus, openSquawks, maintenanceHistory, recentFlightLogs, upcomingBookings, utilization } = profile
  const title = aircraftTitle(aircraft)
  const maxUtilHours = Math.max(utilization.hoursLast90d, utilization.hoursLast30d, 1)

  return (
    <div className="p-6 space-y-6">
      <Link href="/desktop/flying-club" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" />
        Back to Flying Club
      </Link>

      {/* Header */}
      <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Plane className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold font-mono">{aircraft.nNumber || 'Unknown'}</h1>
                <Badge variant={aircraft.status === 'Available' ? 'secondary' : 'destructive'} className="text-xs">
                  {aircraft.status || 'Unknown'}
                </Badge>
                {aircraftStatus.isGrounded && <Badge variant="destructive" className="text-xs">GROUNDED</Badge>}
              </div>
              {title && <p className="text-sm text-muted-foreground mt-0.5">&ldquo;{title}&rdquo;</p>}
              <p className="text-xs text-muted-foreground">
                {[aircraft.make, aircraft.model, aircraft.year].filter(Boolean).join(' ') || 'No make/model on file'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/30 px-4 py-2.5 shrink-0">
            <DollarSign className="h-4 w-4 text-primary" />
            <div>
              <p className="text-xl font-bold leading-tight">{aircraft.hourlyRate != null ? `$${aircraft.hourlyRate}` : '—'}</p>
              <p className="text-[10px] text-muted-foreground">per hour</p>
            </div>
          </div>
        </div>
      </div>

      {/* Utilization */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className="h-4 w-4" />
            Utilization
          </CardTitle>
          <CardDescription>Flight activity over the trailing 30 and 90 days</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <UtilizationBar label="Last 30 Days" flights={utilization.flightsLast30d} hours={utilization.hoursLast30d} maxHours={maxUtilHours} />
          <UtilizationBar label="Last 90 Days" flights={utilization.flightsLast90d} hours={utilization.hoursLast90d} maxHours={maxUtilHours} />
        </CardContent>
      </Card>

      {/* Details grid */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><Clock className="h-3.5 w-3.5" />Hobbs</div>
          <p className="text-lg font-semibold">{fmtHours(aircraft.totalHobbsHours)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><Gauge className="h-3.5 w-3.5" />Tach</div>
          <p className="text-lg font-semibold">{fmtHours(aircraft.totalTachHours)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><Users className="h-3.5 w-3.5" />Seats</div>
          <p className="text-lg font-semibold">{aircraft.maxPassengers ?? '—'}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><Calendar className="h-3.5 w-3.5" />Booking</div>
          <p className="text-lg font-semibold">{aircraft.bookingWindowDays}d</p>
        </div>
      </div>

      {aircraft.aircraftNotes && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm"><FileText className="h-4 w-4" />Aircraft Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{aircraft.aircraftNotes}</p>
          </CardContent>
        </Card>
      )}

      {/* Open squawks */}
      <Card className={aircraftStatus.isGrounded ? 'border-red-500/40' : undefined}>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Wrench className="h-4 w-4" />
              Open Squawks
              {aircraftStatus.openSquawkCount > 0 && <Badge variant="outline">{aircraftStatus.openSquawkCount}</Badge>}
            </CardTitle>
            <Link href={`/desktop/flying-club/squawks?aircraftId=${aircraft.id}&groupId=${aircraft.organizationId ?? ''}`}>
              <Button size="sm"><Plus className="mr-2 h-4 w-4" />Report Issue</Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {openSquawks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle className="h-7 w-7 text-green-500/70 mb-2" />
              <p className="text-sm text-muted-foreground">No open squawks — this aircraft is in good standing.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {openSquawks.map(sq => (
                <div key={sq.id} className={`p-3 rounded-lg border ${sq.isGrounded ? 'border-red-500/50 bg-red-500/5' : 'bg-card'}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge className={`text-xs border ${severityBadgeClass(sq.severity)}`}>{sq.severity || 'LOW'}</Badge>
                        {sq.isGrounded && <Badge variant="destructive" className="text-xs">GROUNDED</Badge>}
                      </div>
                      <p className="text-sm">{sq.description}</p>
                      <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-muted-foreground">
                        <span>{fmt(sq.reportedDate, 'date')}</span>
                        {sq.reportedByName && <span>· {sq.reportedByName}</span>}
                        {sq.category && <span>· {sq.category}</span>}
                      </div>
                    </div>
                    {sq.status && <Badge className={`shrink-0 text-xs ${statusBadgeColor(sq.status)}`}>{sq.status}</Badge>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Maintenance history */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><ClipboardList className="h-4 w-4" />Maintenance History</CardTitle>
          <CardDescription>Resolved maintenance items</CardDescription>
        </CardHeader>
        <CardContent>
          {maintenanceHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No maintenance history yet</p>
          ) : (
            <div className="space-y-2">
              {maintenanceHistory.map(m => (
                <div key={m.id} className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
                  <div className="space-y-0.5 min-w-0">
                    <p className="text-sm truncate">{m.description}</p>
                    <p className="text-xs text-muted-foreground">Resolved {fmt(m.resolvedDate, 'date')}</p>
                  </div>
                  {m.cost != null && <p className="text-sm font-medium text-green-600 shrink-0">${m.cost.toFixed(2)}</p>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><BookOpen className="h-4 w-4" />Recent Flight Logs</CardTitle>
          </CardHeader>
          <CardContent>
            {recentFlightLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No flight logs yet</p>
            ) : (
              <div className="space-y-2">
                {recentFlightLogs.map(log => (
                  <div key={log.id} className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
                    <div className="space-y-0.5 min-w-0">
                      <p className="text-sm font-medium">{fmt(log.date, 'date')}</p>
                      <p className="text-xs text-muted-foreground truncate">{log.pilotName || 'Unknown pilot'}</p>
                    </div>
                    <div className="text-right space-y-0.5 shrink-0">
                      <p className="text-xs text-muted-foreground">
                        {log.hobbsTime != null && `${log.hobbsTime.toFixed(1)} Hobbs`}
                        {log.hobbsTime != null && log.tachTime != null && ' · '}
                        {log.tachTime != null && `${log.tachTime.toFixed(1)} Tach`}
                      </p>
                      {log.calculatedCost != null && <p className="text-sm font-medium text-green-600">${log.calculatedCost.toFixed(2)}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Calendar className="h-4 w-4" />Upcoming Bookings</CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingBookings.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No upcoming bookings</p>
            ) : (
              <div className="space-y-2">
                {upcomingBookings.map(b => (
                  <div key={b.id} className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
                    <div className="space-y-0.5 min-w-0">
                      <p className="text-sm font-medium truncate">{b.pilotName || 'Unknown pilot'}</p>
                      <p className="text-xs text-muted-foreground truncate">{b.purpose || 'No purpose specified'}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-medium">{fmt(b.startTime, 'date')}</p>
                      <p className="text-xs text-muted-foreground">{fmt(b.startTime, 'time')}–{fmt(b.endTime, 'time')}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
