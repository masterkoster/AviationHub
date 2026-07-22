'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import { cloudApi } from '@/apps/desktop/src/lib/cloud-api'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Plane, Wrench, Calendar, Clock, DollarSign, ArrowLeft, Loader2,
  AlertTriangle, CheckCircle, BookOpen, Gauge, Plus, Users, FileText,
  ClipboardList, CloudOff, ShieldCheck, Pencil, Trash2, X,
} from 'lucide-react'
import {
  INSPECTION_TYPES,
  inspectionCountdown,
  isGroundedByInspection,
  type InspectionComputed,
  type InspectionStatus,
  type InspectionType,
} from '@/lib/club/inspections'

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

const STATUS_SORT_ORDER: Record<InspectionStatus, number> = { OVERDUE: 0, DUE_SOON: 1, OK: 2, UNKNOWN: 3 }

function inspectionStatusBadgeClass(status: InspectionStatus) {
  if (status === 'OVERDUE') return 'bg-red-500/10 text-red-600 border-red-500/30'
  if (status === 'DUE_SOON') return 'bg-amber-500/10 text-amber-600 border-amber-500/30'
  if (status === 'OK') return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
  return 'bg-muted text-muted-foreground'
}

function inspectionStatusLabel(status: InspectionStatus) {
  if (status === 'OVERDUE') return 'Overdue'
  if (status === 'DUE_SOON') return 'Due Soon'
  if (status === 'OK') return 'OK'
  return 'Not set up'
}

function fmtInspectionPoint(date: string | null, hours: number | null) {
  const parts: string[] = []
  if (date) {
    try { parts.push(new Date(date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })) } catch { /* ignore */ }
  }
  if (hours != null) parts.push(`${hours.toFixed(1)} hrs`)
  return parts.length ? parts.join(' · ') : '—'
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

// ---- InspectionModal ----

type InspectionModalMode = 'add' | 'edit' | 'complete'

function InspectionModal({
  mode, groupId, aircraftId, existing, currentTachHours, onClose, onSaved,
}: {
  mode: InspectionModalMode
  groupId: string
  aircraftId: string
  existing?: InspectionComputed
  currentTachHours: number | null
  onClose: () => void
  onSaved: () => void
}) {
  const initialType = (existing?.type as InspectionType) || 'ANNUAL'
  const isComplete = mode === 'complete'
  const usesHours = existing ? (existing.intervalHours != null || existing.lastDoneHours != null) : true

  const [type, setType] = useState<InspectionType>(initialType)
  const [label, setLabel] = useState(existing?.label && existing.type === 'OTHER' ? existing.label : '')
  const [lastDoneDate, setLastDoneDate] = useState(() => {
    if (isComplete) return new Date().toISOString().split('T')[0]
    return existing?.lastDoneDate ? existing.lastDoneDate.split('T')[0] : ''
  })
  const [lastDoneHours, setLastDoneHours] = useState(() => {
    if (isComplete) {
      if (currentTachHours != null) return String(currentTachHours)
      return existing?.lastDoneHours != null ? String(existing.lastDoneHours) : ''
    }
    return existing?.lastDoneHours != null ? String(existing.lastDoneHours) : ''
  })
  const [intervalMonths, setIntervalMonths] = useState(() => {
    if (existing) return existing.intervalMonths != null ? String(existing.intervalMonths) : ''
    const meta = INSPECTION_TYPES[initialType]
    return meta.defaultMonths != null ? String(meta.defaultMonths) : ''
  })
  const [intervalHours, setIntervalHours] = useState(() => {
    if (existing) return existing.intervalHours != null ? String(existing.intervalHours) : ''
    const meta = INSPECTION_TYPES[initialType]
    return meta.defaultHours != null ? String(meta.defaultHours) : ''
  })
  const [isRequired, setIsRequired] = useState(existing ? existing.isRequired : true)
  const [notes, setNotes] = useState(existing?.notes || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleTypeChange(t: InspectionType) {
    setType(t)
    const meta = INSPECTION_TYPES[t]
    setIntervalMonths(meta.defaultMonths != null ? String(meta.defaultMonths) : '')
    setIntervalHours(meta.defaultHours != null ? String(meta.defaultHours) : '')
  }

  async function handleSubmit() {
    setError(null)
    if (mode === 'add' && type === 'OTHER' && !label.trim()) {
      setError('Label is required for a custom inspection type')
      return
    }
    setSaving(true)
    try {
      if (mode === 'add') {
        const { ok, data } = await cloudApi.createGroupAircraftInspection(groupId, aircraftId, {
          type,
          label: label.trim() || undefined,
          lastDoneDate: lastDoneDate || undefined,
          lastDoneHours: lastDoneHours !== '' ? Number(lastDoneHours) : undefined,
          intervalMonths: intervalMonths !== '' ? Number(intervalMonths) : undefined,
          intervalHours: intervalHours !== '' ? Number(intervalHours) : undefined,
          isRequired,
          notes: notes.trim() || undefined,
        })
        if (!ok) { setError((data && (data as { error?: string }).error) || 'Failed to add inspection'); return }
      } else if (mode === 'edit' && existing) {
        const { ok, data } = await cloudApi.updateGroupAircraftInspection(groupId, aircraftId, existing.id, {
          label: label.trim() || null,
          lastDoneDate: lastDoneDate || null,
          lastDoneHours: lastDoneHours !== '' ? Number(lastDoneHours) : null,
          intervalMonths: intervalMonths !== '' ? Number(intervalMonths) : null,
          intervalHours: intervalHours !== '' ? Number(intervalHours) : null,
          isRequired,
          notes: notes.trim() || null,
        })
        if (!ok) { setError((data && (data as { error?: string }).error) || 'Failed to update inspection'); return }
      } else if (mode === 'complete' && existing) {
        const body: Record<string, unknown> = {}
        if (lastDoneDate) body.lastDoneDate = lastDoneDate
        if (lastDoneHours !== '') body.lastDoneHours = Number(lastDoneHours)
        const { ok, data } = await cloudApi.updateGroupAircraftInspection(groupId, aircraftId, existing.id, body)
        if (!ok) { setError((data && (data as { error?: string }).error) || 'Failed to record completion'); return }
      }
      onSaved()
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  const title = mode === 'add'
    ? 'Add Inspection'
    : mode === 'edit'
      ? `Edit — ${existing?.label ?? ''}`
      : `Record Completion — ${existing?.label ?? ''}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-4">
          {mode === 'add' && (
            <div>
              <label className="text-sm font-medium">Type *</label>
              <select
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={type}
                onChange={e => handleTypeChange(e.target.value as InspectionType)}
              >
                {(Object.entries(INSPECTION_TYPES) as [InspectionType, typeof INSPECTION_TYPES[InspectionType]][]).map(([key, meta]) => (
                  <option key={key} value={key}>{meta.label}</option>
                ))}
              </select>
              {INSPECTION_TYPES[type].note && (
                <p className="mt-1 text-xs text-muted-foreground">{INSPECTION_TYPES[type].note}</p>
              )}
            </div>
          )}

          {mode === 'edit' && existing && (
            <div>
              <label className="text-sm font-medium">Type</label>
              <p className="mt-1 text-sm text-muted-foreground">{INSPECTION_TYPES[existing.type as InspectionType]?.label ?? existing.type}</p>
            </div>
          )}

          {(mode === 'add' || mode === 'edit') && (
            <div>
              <label className="text-sm font-medium">
                Custom Label {mode === 'add' && type === 'OTHER' ? '*' : <span className="font-normal text-muted-foreground">(optional)</span>}
              </label>
              <input
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder={mode === 'add' ? INSPECTION_TYPES[type].label : (existing?.label ?? '')}
                maxLength={100}
              />
            </div>
          )}

          <div>
            <label className="text-sm font-medium">Last Done Date</label>
            <input
              type="date"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={lastDoneDate}
              onChange={e => setLastDoneDate(e.target.value)}
            />
          </div>

          {(mode !== 'complete' || usesHours) && (
            <div>
              <label className="text-sm font-medium">Last Done Hours (Tach)</label>
              <input
                type="number"
                step="0.1"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={lastDoneHours}
                onChange={e => setLastDoneHours(e.target.value)}
                placeholder={currentTachHours != null ? String(currentTachHours) : undefined}
              />
            </div>
          )}

          {(mode === 'add' || mode === 'edit') && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Interval (Months)</label>
                  <input
                    type="number"
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={intervalMonths}
                    onChange={e => setIntervalMonths(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Interval (Hours)</label>
                  <input
                    type="number"
                    step="0.1"
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={intervalHours}
                    onChange={e => setIntervalHours(e.target.value)}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={isRequired} onChange={e => setIsRequired(e.target.checked)} className="rounded" />
                Required for airworthiness
              </label>
              <div>
                <label className="text-sm font-medium">Notes</label>
                <textarea
                  className="mt-1 w-full min-h-[70px] rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={notes}
                  onChange={e => setNotes(e.target.value.slice(0, 2000))}
                  placeholder="Optional notes"
                />
              </div>
            </>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : mode === 'complete' ? 'Record Completion' : mode === 'edit' ? 'Save Changes' : 'Add Inspection'}
            </Button>
          </div>
        </div>
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

  // Group context for the inspections API + admin gating (resolved alongside the profile).
  const [groupId, setGroupId] = useState<string | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const isAdmin = role === 'ADMIN'

  const [inspections, setInspections] = useState<InspectionComputed[] | null>(null)
  const [currentTachHours, setCurrentTachHours] = useState<number | null>(null)
  const [inspectionsError, setInspectionsError] = useState<string | null>(null)
  const [inspectionModal, setInspectionModal] = useState<{ mode: InspectionModalMode; existing?: InspectionComputed } | null>(null)

  async function refetchInspections(gid?: string) {
    const useGroupId = gid ?? groupId
    if (!useGroupId) return
    setInspectionsError(null)
    try {
      const { ok, data } = await cloudApi.getGroupAircraftInspections(useGroupId, aircraftId)
      if (!ok) {
        setInspectionsError((data && (data as { error?: string }).error) || 'Failed to load inspections')
        return
      }
      setInspections(Array.isArray(data?.inspections) ? data.inspections : [])
      setCurrentTachHours(data?.currentTachHours ?? null)
    } catch {
      setInspectionsError('Network error loading inspections')
    }
  }

  async function handleRemoveInspection(c: InspectionComputed) {
    if (!groupId) return
    if (!window.confirm(`Remove "${c.label}" from tracked inspections?`)) return
    try {
      const { ok, data } = await cloudApi.deleteGroupAircraftInspection(groupId, aircraftId, c.id)
      if (!ok) {
        setInspectionsError((data && (data as { error?: string }).error) || 'Failed to remove inspection')
        return
      }
      refetchInspections()
    } catch {
      setInspectionsError('Network error removing inspection')
    }
  }

  useEffect(() => {
    if (initializing || !cloudUser || !aircraftId) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      setNotFound(false)
      setConnectionError(false)
      setInspectionsError(null)
      try {
        const groupsResult = await cloudApi.getGroups()
        if (!groupsResult.ok) {
          if (!cancelled) setError((groupsResult.data && (groupsResult.data as { error?: string }).error) || 'Failed to load groups')
          return
        }
        const groups: Array<{ id: string; role?: string; aircraft?: Array<{ id: string }> }> = Array.isArray(groupsResult.data) ? groupsResult.data : []
        const owningGroup = groups.find(g => (g.aircraft || []).some(a => a.id === aircraftId))

        if (!owningGroup) {
          if (!cancelled) setNotFound(true)
          return
        }
        if (!cancelled) {
          setGroupId(owningGroup.id)
          setRole(owningGroup.role || 'MEMBER')
        }

        const [profileResult, inspResult] = await Promise.all([
          cloudApi.getGroupAircraftProfile(owningGroup.id, aircraftId),
          cloudApi.getGroupAircraftInspections(owningGroup.id, aircraftId),
        ])
        const profileData = profileResult.data

        if (profileResult.status === 404) {
          if (!cancelled) setNotFound(true)
          return
        }
        if (!profileResult.ok) {
          if (!cancelled) setError((profileData && (profileData as { error?: string }).error) || 'Failed to load aircraft profile')
          return
        }

        if (!cancelled) setProfile(profileData as unknown as AircraftProfileData)

        const inspData = inspResult.data
        if (!cancelled) {
          if (inspResult.ok && inspData) {
            setInspections(Array.isArray(inspData.inspections) ? inspData.inspections : [])
            setCurrentTachHours(inspData.currentTachHours ?? null)
          } else {
            setInspectionsError((inspData && (inspData as { error?: string }).error) || 'Failed to load inspections')
          }
        }
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

      {/* Airworthiness & Inspections */}
      <Card className={inspections && isGroundedByInspection(inspections) ? 'border-red-500/40' : undefined}>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4" />
              Airworthiness & Inspections
            </CardTitle>
            {isAdmin && (
              <Button size="sm" onClick={() => setInspectionModal({ mode: 'add' })}>
                <Plus className="mr-2 h-4 w-4" />Add Inspection
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {inspectionsError && inspections === null ? (
            <p className="text-sm text-destructive py-4 text-center">{inspectionsError}</p>
          ) : inspections === null ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : inspections.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No inspections tracked yet — add one to start monitoring airworthiness.
            </p>
          ) : (
            <div className="space-y-4">
              {inspectionsError && <p className="text-sm text-destructive">{inspectionsError}</p>}

              {(() => {
                const grounded = isGroundedByInspection(inspections)
                const overdueRequiredCount = inspections.filter(c => c.isRequired && c.status === 'OVERDUE').length
                const dueSoonCount = inspections.filter(c => c.status === 'DUE_SOON').length
                if (grounded) {
                  return (
                    <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      Not airworthy — {overdueRequiredCount} overdue
                    </div>
                  )
                }
                if (dueSoonCount > 0) {
                  return (
                    <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-600">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      {dueSoonCount} due soon
                    </div>
                  )
                }
                return (
                  <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600">
                    <CheckCircle className="h-4 w-4 shrink-0" />
                    All inspections current
                  </div>
                )
              })()}

              <div className="space-y-2">
                {[...inspections]
                  .sort((a, b) => STATUS_SORT_ORDER[a.status] - STATUS_SORT_ORDER[b.status])
                  .map(c => (
                    <div key={c.id} className="rounded-lg border border-border p-3">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium">{c.label}</p>
                            <Badge className={`text-xs border ${inspectionStatusBadgeClass(c.status)}`}>{inspectionStatusLabel(c.status)}</Badge>
                            {!c.isRequired && <Badge variant="outline" className="text-xs">Optional</Badge>}
                          </div>
                          <p className="text-xs text-muted-foreground">{inspectionCountdown(c)}</p>
                          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                            <span>Last done: {fmtInspectionPoint(c.lastDoneDate, c.lastDoneHours)}</span>
                            <span>Next due: {fmtInspectionPoint(c.dueDate, c.dueHours)}</span>
                          </div>
                          {c.notes && <p className="text-xs text-muted-foreground italic">{c.notes}</p>}
                        </div>
                        {isAdmin && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Button size="sm" variant="outline" onClick={() => setInspectionModal({ mode: 'complete', existing: c })}>
                              Record Completion
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setInspectionModal({ mode: 'edit', existing: c })}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => handleRemoveInspection(c)}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {inspectionModal && groupId && (
        <InspectionModal
          mode={inspectionModal.mode}
          groupId={groupId}
          aircraftId={aircraftId}
          existing={inspectionModal.existing}
          currentTachHours={currentTachHours}
          onClose={() => setInspectionModal(null)}
          onSaved={() => { setInspectionModal(null); refetchInspections() }}
        />
      )}

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
