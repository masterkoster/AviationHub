'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Plane, Wrench, Calendar, Clock, DollarSign, ArrowLeft, Loader2,
  AlertTriangle, CheckCircle, BookOpen, Gauge, Plus, Users, FileText, ClipboardList,
  Settings2, X, Pencil, Info,
} from 'lucide-react'

// ---- Equipment editor constants ----

const EQUIPMENT_CATEGORIES = ['Avionics', 'Autopilot', 'ADS-B', 'Engine Monitor', 'Interior', 'Other'] as const

const EQUIPMENT_PRESETS: Array<{ category: string; name: string }> = [
  { category: 'Avionics', name: 'GNS 430W' },
  { category: 'Avionics', name: 'GTN 650' },
  { category: 'Avionics', name: 'GTN 750' },
  { category: 'Avionics', name: 'G5' },
  { category: 'Avionics', name: 'G1000' },
  { category: 'Autopilot', name: 'GFC 500 autopilot' },
  { category: 'Autopilot', name: 'KAP 140 autopilot' },
  { category: 'ADS-B', name: 'Stratus ESG ADS-B Out' },
  { category: 'ADS-B', name: 'GDL 82 ADS-B Out' },
  { category: 'Engine Monitor', name: 'JPI EDM 730' },
  { category: 'Engine Monitor', name: 'JPI EDM 900' },
]

// ---- Types (mirrors lib/club/aircraft-profile.ts AircraftProfileData) ----

interface EquipmentItem {
  category: string
  name: string
}

interface AircraftTypeSpecs {
  source: 'AircraftSpecs' | 'AircraftCache'
  manufacturer: string | null
  model: string | null
  cruiseSpeedKts: number | null
  rangeNm: number | null
  fuelCapacityGal: number | null
  usefulLoadLbs: number | null
  serviceCeilingFt: number | null
  rateOfClimbFpm: number | null
  horsepowerHp: number | null
}

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
  equipment: EquipmentItem[]
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
  typeSpecs: AircraftTypeSpecs | null
  generatedAt: string
}

// ---- Helpers ----

function formatDate(iso: string | null) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) } catch { return iso }
}

function formatTime(iso: string) {
  try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) } catch { return iso }
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

function groupEquipmentByCategory(items: EquipmentItem[]): Array<{ category: string; items: EquipmentItem[] }> {
  const order = [...EQUIPMENT_CATEGORIES]
  const byCategory = new Map<string, EquipmentItem[]>()
  for (const item of items) {
    const cat = order.includes(item.category as typeof order[number]) ? item.category : 'Other'
    if (!byCategory.has(cat)) byCategory.set(cat, [])
    byCategory.get(cat)!.push(item)
  }
  return order
    .filter(cat => byCategory.has(cat))
    .map(cat => ({ category: cat, items: byCategory.get(cat)! }))
}

function fmtSpec(n: number | null, unit: string, decimals = 0) {
  if (n === null || n === undefined || Number.isNaN(n)) return null
  return `${n.toFixed(decimals)} ${unit}`
}

// ---- Equipment editor dialog ----

function EquipmentEditorDialog({
  open,
  onOpenChange,
  items,
  onSave,
  saving,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: EquipmentItem[]
  onSave: (items: EquipmentItem[]) => void
  saving: boolean
}) {
  const [draft, setDraft] = useState<EquipmentItem[]>(items)
  const [category, setCategory] = useState<string>(EQUIPMENT_CATEGORIES[0])
  const [name, setName] = useState('')

  useEffect(() => {
    if (open) {
      setDraft(items)
      setCategory(EQUIPMENT_CATEGORIES[0])
      setName('')
    }
  }, [open, items])

  function addItem(category: string, name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    setDraft(prev => [...prev, { category, name: trimmed }])
    setName('')
  }

  function removeItem(index: number) {
    setDraft(prev => prev.filter((_, i) => i !== index))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Equipment</DialogTitle>
          <DialogDescription>Add or remove installed equipment shown on the aircraft profile.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Add form */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="equipment-category">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="equipment-category" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EQUIPMENT_CATEGORIES.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="equipment-name">Name</Label>
              <Input
                id="equipment-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. GTN 650"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem(category, name) } }}
              />
            </div>
            <Button type="button" onClick={() => addItem(category, name)} disabled={!name.trim()}>
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>

          {/* Quick-pick presets */}
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Quick add</p>
            <div className="flex flex-wrap gap-1.5">
              {EQUIPMENT_PRESETS.map(preset => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => addItem(preset.category, preset.name)}
                  className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>

          {/* Current items */}
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Current equipment ({draft.length})</p>
            {draft.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No equipment added yet.</p>
            ) : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {draft.map((item, i) => (
                  <div key={`${item.category}-${item.name}-${i}`} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5">
                    <span className="text-sm truncate">
                      <span className="text-muted-foreground">{item.category}:</span> {item.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeItem(i)}
                      className="text-muted-foreground hover:text-destructive shrink-0"
                      aria-label={`Remove ${item.name}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={() => onSave(draft)} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save Equipment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// A simple inline meter bar — no chart library needed.
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
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ---- Main Page ----

export default function AircraftProfilePage() {
  const params = useParams()
  const aircraftId = params.aircraftId as string
  const { data: session, status: sessionStatus } = useSession()

  const [profile, setProfile] = useState<AircraftProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!session || !aircraftId) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      setNotFound(false)
      try {
        const groupsRes = await fetch('/api/groups')
        const groupsData = await groupsRes.json()
        if (!groupsRes.ok) {
          if (!cancelled) setError(groupsData?.error || 'Failed to load groups')
          return
        }
        const groups: Array<{ id: string; aircraft?: Array<{ id: string }> }> = Array.isArray(groupsData) ? groupsData : []
        const owningGroup = groups.find(g => (g.aircraft || []).some(a => a.id === aircraftId))

        if (!owningGroup) {
          if (!cancelled) setNotFound(true)
          return
        }

        const profileRes = await fetch(`/api/groups/${owningGroup.id}/aircraft/${aircraftId}/profile`)
        const profileData = await profileRes.json()

        if (profileRes.status === 404) {
          if (!cancelled) setNotFound(true)
          return
        }
        if (!profileRes.ok) {
          if (!cancelled) setError(profileData?.error || 'Failed to load aircraft profile')
          return
        }

        if (!cancelled) setProfile(profileData)
      } catch {
        if (!cancelled) setError('Network error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [session, aircraftId])

  if (sessionStatus === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <Plane className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-bold mb-2">Aircraft Profile</h2>
            <p className="text-muted-foreground mb-4">Sign in to view aircraft details</p>
            <Button asChild><a href="/login">Sign In</a></Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (notFound || !profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <Plane className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-bold mb-2">Aircraft Not Found</h2>
            <p className="text-muted-foreground mb-4">This aircraft doesn&apos;t exist or you don&apos;t have access to it.</p>
            <Link href="/flying-club"><Button variant="outline">Back to Flying Club</Button></Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-destructive" />
            <h2 className="text-xl font-bold mb-2">Something went wrong</h2>
            <p className="text-sm text-destructive mb-4">{error}</p>
            <Link href="/flying-club"><Button variant="outline">Back to Flying Club</Button></Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  const { aircraft, status: aircraftStatus, openSquawks, maintenanceHistory, recentFlightLogs, upcomingBookings, utilization } = profile
  const title = aircraftTitle(aircraft)
  const maxUtilHours = Math.max(utilization.hoursLast90d, utilization.hoursLast30d, 1)

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 pt-10">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Back link */}
        <Link href="/flying-club" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Back to Flying Club
        </Link>

        {/* Header block */}
        <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 md:p-8 shadow-sm">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-4 min-w-0">
              <div className="flex h-14 w-14 sm:h-16 sm:w-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                <Plane className="h-7 w-7 sm:h-8 sm:w-8 text-primary" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-3xl sm:text-4xl font-bold tracking-tight font-mono">{aircraft.nNumber || 'Unknown'}</h1>
                  <Badge variant={aircraft.status === 'Available' ? 'secondary' : 'destructive'}>
                    {aircraft.status || 'Unknown'}
                  </Badge>
                  {aircraftStatus.isGrounded && (
                    <Badge variant="destructive" className="animate-pulse">GROUNDED</Badge>
                  )}
                </div>
                {title && <p className="mt-1 text-lg text-muted-foreground truncate">&ldquo;{title}&rdquo;</p>}
                <p className="text-muted-foreground">
                  {[aircraft.make, aircraft.model, aircraft.year].filter(Boolean).join(' ') || 'No make/model on file'}
                </p>
              </div>
            </div>

            {/* Hourly rate — prominent */}
            <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 px-5 py-4 shrink-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl sm:text-3xl font-bold leading-tight">
                  {aircraft.hourlyRate != null ? `$${aircraft.hourlyRate}` : '—'}
                </p>
                <p className="text-xs text-muted-foreground">per hour</p>
              </div>
            </div>
          </div>
        </div>

        {/* Utilization strip */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gauge className="h-5 w-5" />
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
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Hobbs</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{fmtHours(aircraft.totalHobbsHours)}</div>
              <p className="text-xs text-muted-foreground mt-1">total hours</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tach</CardTitle>
              <Gauge className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{fmtHours(aircraft.totalTachHours)}</div>
              <p className="text-xs text-muted-foreground mt-1">total hours</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Seats</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{aircraft.maxPassengers ?? '—'}</div>
              <p className="text-xs text-muted-foreground mt-1">max passengers</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Booking Window</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{aircraft.bookingWindowDays}</div>
              <p className="text-xs text-muted-foreground mt-1">days ahead</p>
            </CardContent>
          </Card>
        </div>

        {/* Notes */}
        {aircraft.aircraftNotes && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4" />
                Aircraft Notes
              </CardTitle>
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
              <CardTitle className="flex items-center gap-2">
                <Wrench className="h-5 w-5" />
                Open Squawks
                {aircraftStatus.openSquawkCount > 0 && (
                  <Badge variant="outline">{aircraftStatus.openSquawkCount}</Badge>
                )}
              </CardTitle>
              <Link href="/flying-club/squawks">
                <Button size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  Report Issue
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {openSquawks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <CheckCircle className="h-8 w-8 text-green-500/70 mb-2" />
                <p className="text-sm text-muted-foreground">No open squawks — this aircraft is in good standing.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {openSquawks.map(sq => (
                  <div key={sq.id} className={`p-4 rounded-lg border ${sq.isGrounded ? 'border-red-500/50 bg-red-500/5' : 'bg-card'}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Badge className={`text-xs border ${severityBadgeClass(sq.severity)}`}>{sq.severity || 'LOW'}</Badge>
                          {sq.isGrounded && <Badge variant="destructive" className="text-xs">GROUNDED</Badge>}
                        </div>
                        <p className="text-sm">{sq.description}</p>
                        <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                          <span>{formatDate(sq.reportedDate)}</span>
                          {sq.reportedByName && <span>· {sq.reportedByName}</span>}
                          {sq.category && <span>· {sq.category}</span>}
                        </div>
                      </div>
                      {sq.status && <Badge className={`shrink-0 ${statusBadgeColor(sq.status)}`}>{sq.status}</Badge>}
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
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Maintenance History
            </CardTitle>
            <CardDescription>Resolved maintenance items</CardDescription>
          </CardHeader>
          <CardContent>
            {maintenanceHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No maintenance history yet</p>
            ) : (
              <div className="space-y-2">
                {maintenanceHistory.map(m => (
                  <div key={m.id} className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
                    <div className="space-y-1 min-w-0">
                      <p className="text-sm truncate">{m.description}</p>
                      <p className="text-xs text-muted-foreground">Resolved {formatDate(m.resolvedDate)}</p>
                    </div>
                    {m.cost != null && <p className="text-sm font-medium text-green-600 shrink-0">${m.cost.toFixed(2)}</p>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent flight logs + Upcoming bookings side by side on larger screens */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                Recent Flight Logs
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentFlightLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No flight logs yet</p>
              ) : (
                <div className="space-y-2">
                  {recentFlightLogs.map(log => (
                    <div key={log.id} className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
                      <div className="space-y-1 min-w-0">
                        <p className="text-sm font-medium">{formatDate(log.date)}</p>
                        <p className="text-xs text-muted-foreground truncate">{log.pilotName || 'Unknown pilot'}</p>
                      </div>
                      <div className="text-right space-y-1 shrink-0">
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
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Upcoming Bookings
              </CardTitle>
            </CardHeader>
            <CardContent>
              {upcomingBookings.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No upcoming bookings</p>
              ) : (
                <div className="space-y-2">
                  {upcomingBookings.map(b => (
                    <div key={b.id} className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
                      <div className="space-y-1 min-w-0">
                        <p className="text-sm font-medium truncate">{b.pilotName || 'Unknown pilot'}</p>
                        <p className="text-xs text-muted-foreground truncate">{b.purpose || 'No purpose specified'}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-medium">{formatDate(b.startTime)}</p>
                        <p className="text-xs text-muted-foreground">{formatTime(b.startTime)}–{formatTime(b.endTime)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
