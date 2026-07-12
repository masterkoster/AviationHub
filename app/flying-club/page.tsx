'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import {
  Plane, Calendar, Users, Wrench, DollarSign, Clock,
  AlertCircle, Plus, ChevronLeft, ChevronRight,
  BookOpen, Settings, X, Loader2, CheckCircle2
} from "lucide-react"
import { FlightCompleteWizard } from "@/components/flight-complete/FlightCompleteWizard"
import { ClubHomeView } from "@/components/club-home/ClubHomeView"
import type { Post, DocumentMeta, BlockOutItem } from "@/components/club-home/types"
import { fmtNum, cn } from "@/lib/utils"

// ---- Types ----

interface ClubAircraft {
  id: string
  nNumber: string
  nickname: string | null
  customName: string | null
  make: string | null
  model: string | null
  status: string | null
  hourlyRate: number | null
}

interface Group {
  id: string
  name: string
  type: string
  ownerId: string
  role: string
  aircraft: ClubAircraft[]
}

interface Booking {
  id: string
  aircraftId: string
  userId: string
  instructorId: string | null
  startTime: string
  endTime: string
  purpose: string | null
  aircraft: { id: string; nNumber: string; customName: string | null; nickname: string | null; make: string | null; model: string | null }
  user: { id: string; name: string; email: string }
  instructor: { id: string; name: string; email: string } | null
}

interface Member {
  id: string
  userId: string
  groupId: string
  role: string
  joinedAt: string
  user: { id: string; name: string; email: string }
}

interface FlightLog {
  id: string
  aircraftId: string
  userId: string
  date: string
  tachTime: number | string | null
  hobbsTime: number | string | null
  notes: string | null
  aircraft: { id: string; nNumber: string; customName: string | null; nickname: string | null }
  user: { id: string; name: string; email: string }
}

interface MaintenanceItem {
  id: string
  description: string
  status: string
  category: string | null
  severity: string | null
  isGrounded: boolean
  reportedDate: string
  resolvedDate: string | null
  cost: number | string | null
  notes: string | null
  reportedBy: { id: string; name: string | null; email: string } | null
  aircraft: { id: string; nNumber: string; customName: string | null; nickname: string | null; make?: string | null; model?: string | null }
}

// ---- NewGroupModal ----

const SIZE_BRACKET_OPTIONS = [
  { value: '1-5', label: '1–5 members' },
  { value: '6-15', label: '6–15 members' },
  { value: '16-40', label: '16–40 members' },
  { value: '40+', label: '40+ members' },
]

function NewGroupModal({ onClose, onCreated }: { onClose: () => void; onCreated: (group: Group) => void }) {
  const [step, setStep] = useState<'choose' | 'partnership' | 'club'>('choose')
  const [selectedType, setSelectedType] = useState<'partnership' | 'club' | null>(null)
  const [name, setName] = useState('')
  const [sizeBracket, setSizeBracket] = useState('')
  const [homeAirport, setHomeAirport] = useState('')
  const [website, setWebsite] = useState('')
  const [description, setDescription] = useState('')
  const [showOnMap, setShowOnMap] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate(type: 'partnership' | 'club') {
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const payload =
        type === 'partnership'
          ? { name: name.trim(), type }
          : {
              name: name.trim(),
              type,
              description: description.trim() || undefined,
              website: website.trim() || undefined,
              homeAirport: homeAirport.trim() || undefined,
              sizeBracket: sizeBracket || undefined,
              showOnMap,
            }
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to create group')
        return
      }
      onCreated({ ...data, aircraft: [], role: 'ADMIN' })
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  const inputClass =
    'mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {step !== 'choose' && (
              <Button variant="ghost" size="icon" onClick={() => { setStep('choose'); setError(null) }}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
            <h2 className="text-lg font-semibold">
              {step === 'choose' && 'Create a Group'}
              {step === 'partnership' && 'Create Partnership'}
              {step === 'club' && 'Create Flying Club'}
            </h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        {step === 'choose' && (
          <div className="space-y-4">
            <div className="text-center">
              <h2 className="text-lg font-bold">What kind of group is this?</h2>
              <p className="mt-1 text-xs text-muted-foreground">You can change the details later.</p>
            </div>
            <div className="grid gap-3">
              {[
                {
                  type: 'partnership' as const,
                  icon: Users,
                  title: 'Partnership',
                  desc: 'A few friends who own a plane together and split costs',
                },
                {
                  type: 'club' as const,
                  icon: Plane,
                  title: 'Flying Club',
                  desc: 'A club with members, scheduling, and billing',
                },
              ].map((c) => (
                <button
                  key={c.type}
                  onClick={() => setSelectedType(c.type)}
                  className={cn(
                    'flex items-start gap-3 rounded-md border p-4 text-left transition-all',
                    selectedType === c.type
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-border hover:border-foreground/20 hover:bg-muted/50'
                  )}
                >
                  <div
                    className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-md',
                      selectedType === c.type ? 'bg-primary text-primary-foreground' : 'bg-muted'
                    )}
                  >
                    <c.icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{c.title}</p>
                    <p className="text-xs text-muted-foreground">{c.desc}</p>
                  </div>
                  {selectedType === c.type && (
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  )}
                </button>
              ))}
            </div>
            <div className="flex justify-end">
              <Button onClick={() => selectedType && setStep(selectedType)} disabled={!selectedType}>
                Continue
              </Button>
            </div>
          </div>
        )}

        {step === 'partnership' && (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Partnership Name</label>
              <input
                className={inputClass}
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. N12345 Partners"
                onKeyDown={e => e.key === 'Enter' && handleCreate('partnership')}
                autoFocus
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={() => handleCreate('partnership')} disabled={saving || !name.trim()}>
                {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating…</> : 'Create Partnership'}
              </Button>
            </div>
          </div>
        )}

        {step === 'club' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Only the name is required — the rest fills out your club profile.</p>
            <div>
              <label className="text-sm font-medium">Club Name *</label>
              <input
                className={inputClass}
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Sky High Flying Club"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Club size</label>
                <select
                  className={inputClass}
                  value={sizeBracket}
                  onChange={e => setSizeBracket(e.target.value)}
                >
                  <option value="">Select a size</option>
                  {SIZE_BRACKET_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Home airport</label>
                <input
                  className={inputClass}
                  value={homeAirport}
                  onChange={e => setHomeAirport(e.target.value.toUpperCase())}
                  placeholder="e.g. KPTK"
                  maxLength={7}
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Website</label>
              <input
                className={inputClass}
                value={website}
                onChange={e => setWebsite(e.target.value)}
                placeholder="yourclub.com"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Bio</label>
              <textarea
                className={`${inputClass} min-h-[80px]`}
                value={description}
                onChange={e => setDescription(e.target.value.slice(0, 2000))}
                placeholder="Tell pilots about your club..."
              />
            </div>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={showOnMap}
                onChange={e => setShowOnMap(e.target.checked)}
              />
              <span className="text-sm">
                Show my club on the public club map
                <span className="block text-xs text-muted-foreground">
                  Pilots browsing the map can discover your club at its home airport
                </span>
              </span>
            </label>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={() => handleCreate('club')} disabled={saving || !name.trim()}>
                {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating…</> : 'Create Club'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ---- NewBookingModal ----

function NewBookingModal({
  group,
  onClose,
  onCreated,
}: {
  group: Group
  onClose: () => void
  onCreated: (booking: Booking) => void
}) {
  const [aircraftId, setAircraftId] = useState(group.aircraft[0]?.id || '')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('11:00')
  const [purpose, setPurpose] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleBook() {
    if (!aircraftId || !date) return
    setSaving(true)
    setError(null)
    try {
      const startISO = new Date(`${date}T${startTime}:00`).toISOString()
      const endISO = new Date(`${date}T${endTime}:00`).toISOString()
      const res = await fetch(`/api/groups/${group.id}/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aircraftId, startTime: startISO, endTime: endISO, purpose: purpose || undefined }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to create booking')
        return
      }
      onCreated(data)
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">New Booking — {group.name}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Aircraft</label>
            <select
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={aircraftId}
              onChange={e => setAircraftId(e.target.value)}
            >
              {group.aircraft.map(a => (
                <option key={a.id} value={a.id}>
                  {a.nNumber}{a.nickname ? ` (${a.nickname})` : ''}{a.make ? ` – ${a.make} ${a.model}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Date</label>
            <input
              type="date"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Start Time</label>
              <input
                type="time"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">End Time</label>
              <input
                type="time"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Purpose (optional)</label>
            <input
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={purpose}
              onChange={e => setPurpose(e.target.value)}
              placeholder="e.g. Local practice, cross country…"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleBook} disabled={saving || !aircraftId}>
              {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Booking…</> : 'Book Aircraft'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---- Helpers ----

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function formatTime(iso: string) {
  try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) } catch { return iso }
}

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) } catch { return iso }
}

function bookingStatus(b: Booking): 'past' | 'active' | 'upcoming' {
  const now = new Date()
  const start = new Date(b.startTime)
  const end = new Date(b.endTime)
  if (end < now) return 'past'
  if (start <= now && now <= end) return 'active'
  return 'upcoming'
}

function aircraftDisplayName(a: { nNumber: string; nickname?: string | null }) {
  return a.nNumber + (a.nickname ? ` (${a.nickname})` : '')
}

// ---- BookingDetailDialog ----

function BookingDetailDialog({
  booking,
  currentUserId,
  isGroupAdmin,
  groupId,
  onClose,
  onCancelled,
}: {
  booking: Booking
  currentUserId: string | null
  isGroupAdmin: boolean
  groupId: string
  onClose: () => void
  onCancelled: (bookingId: string) => void
}) {
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isOwner = !!currentUserId && booking.user?.id === currentUserId
  const canCancel = isOwner || isGroupAdmin
  const status = bookingStatus(booking)

  async function handleCancel() {
    if (!window.confirm('Cancel this booking? This cannot be undone.')) return
    setCancelling(true)
    setError(null)
    try {
      const res = await fetch(`/api/groups/${groupId}/bookings/${booking.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Failed to cancel booking')
        return
      }
      toast.success('Booking cancelled')
      onCancelled(booking.id)
      onClose()
    } catch {
      setError('Network error')
    } finally {
      setCancelling(false)
    }
  }

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{aircraftDisplayName(booking.aircraft)}</DialogTitle>
          {booking.aircraft?.make && (
            <DialogDescription>{booking.aircraft.make} {booking.aircraft.model}</DialogDescription>
          )}
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Status</span>
            <Badge
              variant={status === 'active' ? 'default' : status === 'past' ? 'secondary' : 'outline'}
              className={status === 'active' ? 'bg-emerald-500' : ''}
            >
              {status}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Pilot</span>
            <span className="font-medium">{booking.user?.name || 'Unknown'}</span>
          </div>
          {booking.instructor && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Instructor</span>
              <span className="font-medium">{booking.instructor.name}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Date</span>
            <span className="font-medium">{formatDate(booking.startTime)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Time</span>
            <span className="font-medium">{formatTime(booking.startTime)} – {formatTime(booking.endTime)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Purpose</span>
            <span className="font-medium">{booking.purpose || 'No purpose specified'}</span>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          {canCancel && (
            <Button variant="destructive" onClick={handleCancel} disabled={cancelling}>
              {cancelling ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Cancelling…</> : 'Cancel booking'}
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---- MaintenanceDetailDialog ----

function MaintenanceDetailDialog({
  item,
  isGroupAdmin,
  onClose,
  onUpdated,
}: {
  item: MaintenanceItem
  isGroupAdmin: boolean
  onClose: () => void
  onUpdated: (updated: MaintenanceItem) => void
}) {
  const [status, setStatus] = useState(item.status)
  const [cost, setCost] = useState(item.cost != null ? String(item.cost) : '')
  const [notes, setNotes] = useState(item.notes || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function patch(body: Record<string, unknown>) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/maintenance/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Failed to update maintenance item')
        return
      }
      onUpdated({ ...item, ...data.maintenance })
      toast.success('Maintenance item updated')
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  function handleStatusChange(next: string) {
    setStatus(next)
    patch({ status: next })
  }

  function handleToggleGrounded() {
    patch({ isGrounded: !item.isGrounded })
  }

  function handleSaveCostNotes() {
    const trimmedCost = cost.trim()
    const numericCost = trimmedCost === '' ? null : Number(trimmedCost)
    if (numericCost !== null && (Number.isNaN(numericCost) || numericCost < 0)) {
      setError('Cost must be a non-negative number')
      return
    }
    patch({ cost: numericCost, notes: notes.trim() === '' ? null : notes.trim() })
  }

  const severity = item.severity || 'LOW'
  const severityVariant = severity === 'HIGH' ? 'destructive' : 'secondary'
  const severityClassName = severity === 'MEDIUM' ? 'bg-amber-500 text-white hover:bg-amber-500' : ''

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item.aircraft?.nNumber || 'Maintenance item'}</DialogTitle>
          {item.aircraft?.make && (
            <DialogDescription>{item.aircraft.make} {item.aircraft.model}</DialogDescription>
          )}
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p>{item.description}</p>
          <div className="flex flex-wrap items-center gap-2">
            {item.category && <Badge variant="outline">{item.category}</Badge>}
            <Badge variant={severityVariant} className={severityClassName}>{severity}</Badge>
            {item.isGrounded && <Badge variant="destructive">Grounded</Badge>}
            <Badge variant="secondary">{status}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Reported by</span>
            <span className="font-medium">{item.reportedBy?.name || item.reportedBy?.email || 'Unknown'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Reported</span>
            <span className="font-medium">{formatDate(item.reportedDate)}</span>
          </div>
          {status === 'COMPLETED' && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Resolved</span>
                <span className="font-medium">{item.resolvedDate ? formatDate(item.resolvedDate) : '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Cost</span>
                <span className="font-medium">{item.cost != null ? `$${fmtNum(item.cost, 2)}` : '—'}</span>
              </div>
              {item.notes && (
                <div>
                  <span className="text-muted-foreground">Notes</span>
                  <p className="mt-1">{item.notes}</p>
                </div>
              )}
            </>
          )}

          {isGroupAdmin && (
            <div className="space-y-3 border-t border-border pt-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Status</label>
                <select
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={status}
                  onChange={e => handleStatusChange(e.target.value)}
                  disabled={saving}
                >
                  <option value="NEEDED">Needed</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="COMPLETED">Completed</option>
                </select>
              </div>
              <Button variant="outline" size="sm" onClick={handleToggleGrounded} disabled={saving}>
                {item.isGrounded ? 'Clear grounded' : 'Mark grounded'}
              </Button>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Cost ($)</label>
                  <input
                    type="number" step="0.01" min="0"
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={cost}
                    onChange={e => setCost(e.target.value)}
                    disabled={saving}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Notes</label>
                  <input
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    disabled={saving}
                  />
                </div>
              </div>
              <Button size="sm" onClick={handleSaveCostNotes} disabled={saving}>
                {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Save cost & notes'}
              </Button>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---- Main Page ----

export default function FlyingClubPage() {
  const { data: session } = useSession()
  const currentUserId = session?.user?.id ?? null

  const [activeTab, setActiveTab] = useState('home')
  const [currentMonth, setCurrentMonth] = useState(new Date())

  // Groups
  const [groups, setGroups] = useState<Group[]>([])
  const [groupsLoading, setGroupsLoading] = useState(true)
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const selectedGroup = groups.find(g => g.id === selectedGroupId) ?? null

  // Bookings
  const [bookings, setBookings] = useState<Booking[]>([])
  const [bookingsLoading, setBookingsLoading] = useState(false)
  const [bookingsError, setBookingsError] = useState<string | null>(null)

  // Members
  const [members, setMembers] = useState<Member[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [membersError, setMembersError] = useState<string | null>(null)

  // Flights & Maintenance
  const [flightLogs, setFlightLogs] = useState<FlightLog[]>([])
  const [maintenance, setMaintenance] = useState<MaintenanceItem[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsError, setLogsError] = useState<string | null>(null)

  // Home view — announcements, documents, block-outs
  const [posts, setPosts] = useState<Post[]>([])
  const [postsLoading, setPostsLoading] = useState(false)
  const [postsError, setPostsError] = useState<string | null>(null)

  const [documents, setDocuments] = useState<DocumentMeta[]>([])
  const [documentsLoading, setDocumentsLoading] = useState(false)
  const [documentsError, setDocumentsError] = useState<string | null>(null)

  const [blockOuts, setBlockOuts] = useState<BlockOutItem[]>([])
  const [blockOutsLoading, setBlockOutsLoading] = useState(false)
  const [blockOutsError, setBlockOutsError] = useState<string | null>(null)

  // Modals
  const [showNewGroup, setShowNewGroup] = useState(false)
  const [showNewBooking, setShowNewBooking] = useState(false)

  // Booking + maintenance detail dialogs
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null)
  const [selectedMaintenance, setSelectedMaintenance] = useState<MaintenanceItem | null>(null)

  // Flight complete wizard
  const [showFlightComplete, setShowFlightComplete] = useState(false)
  const [activeFlight, setActiveFlight] = useState<{
    id: string; aircraftId: string; aircraftName: string
    userId: string; userName: string; hobbsStart?: number; date?: string; time?: string
  } | null>(null)

  // Load groups on mount
  useEffect(() => {
    async function loadGroups() {
      setGroupsLoading(true)
      try {
        const res = await fetch('/api/groups')
        const data = await res.json()
        const list: Group[] = Array.isArray(data) ? data : []
        setGroups(list)
        if (list.length > 0) setSelectedGroupId(list[0].id)
      } catch {
        setGroups([])
      } finally {
        setGroupsLoading(false)
      }
    }
    loadGroups()
  }, [])

  // Load bookings when selected group changes
  useEffect(() => {
    if (!selectedGroupId) return
    setBookings([])
    setBookingsError(null)
    setBookingsLoading(true)
    fetch(`/api/groups/${selectedGroupId}/bookings`)
      .then(async res => {
        const data = await res.json()
        if (!res.ok) { setBookingsError(data.error || 'Failed to load bookings'); return }
        setBookings(Array.isArray(data) ? data : [])
      })
      .catch(() => setBookingsError('Network error'))
      .finally(() => setBookingsLoading(false))
  }, [selectedGroupId])

  const [leavingClub, setLeavingClub] = useState(false)
  const [leaveError, setLeaveError] = useState<string | null>(null)

  async function handleLeaveClub() {
    if (!selectedGroupId || !currentMember) return
    if (!window.confirm(`Leave ${selectedGroup?.name ?? 'this club'}? You will need a new invite to rejoin.`)) return
    setLeavingClub(true)
    setLeaveError(null)
    try {
      const res = await fetch(`/api/groups/${selectedGroupId}/members?memberId=${currentMember.id}`, {
        method: 'DELETE'
      })
      const data = await res.json()
      if (!res.ok) {
        setLeaveError(data.error || 'Failed to leave club')
        return
      }
      window.location.href = '/flying-club'
    } catch {
      setLeaveError('Network error')
    } finally {
      setLeavingClub(false)
    }
  }

  // Load members when selected group changes
  useEffect(() => {
    if (!selectedGroupId) return
    setMembers([])
    setMembersError(null)
    setMembersLoading(true)
    fetch(`/api/groups/${selectedGroupId}/members`)
      .then(async res => {
        const data = await res.json()
        if (!res.ok) { setMembersError(data.error || 'Failed to load members'); return }
        setMembers(Array.isArray(data) ? data : [])
      })
      .catch(() => setMembersError('Network error'))
      .finally(() => setMembersLoading(false))
  }, [selectedGroupId])

  // Load flight logs + maintenance when selected group changes
  useEffect(() => {
    if (!selectedGroupId) return
    setFlightLogs([])
    setMaintenance([])
    setLogsError(null)
    setLogsLoading(true)
    fetch(`/api/groups/${selectedGroupId}/logs`)
      .then(async res => {
        const data = await res.json()
        if (!res.ok) { setLogsError(data.error || 'Failed to load logs'); return }
        setFlightLogs(Array.isArray(data.logs) ? data.logs : [])
        setMaintenance(Array.isArray(data.maintenance) ? data.maintenance : [])
      })
      .catch(() => setLogsError('Network error'))
      .finally(() => setLogsLoading(false))
  }, [selectedGroupId])

  // Load announcements when selected group changes
  useEffect(() => {
    if (!selectedGroupId) return
    setPosts([])
    setPostsError(null)
    setPostsLoading(true)
    fetch(`/api/groups/${selectedGroupId}/posts`)
      .then(async res => {
        const data = await res.json()
        if (!res.ok) { setPostsError(data.error || 'Failed to load announcements'); return }
        setPosts(Array.isArray(data) ? data : [])
      })
      .catch(() => setPostsError('Network error'))
      .finally(() => setPostsLoading(false))
  }, [selectedGroupId])

  // Load documents when selected group changes
  useEffect(() => {
    if (!selectedGroupId) return
    setDocuments([])
    setDocumentsError(null)
    setDocumentsLoading(true)
    fetch(`/api/groups/${selectedGroupId}/documents`)
      .then(async res => {
        const data = await res.json()
        if (!res.ok) { setDocumentsError(data.error || 'Failed to load documents'); return }
        setDocuments(Array.isArray(data) ? data : [])
      })
      .catch(() => setDocumentsError('Network error'))
      .finally(() => setDocumentsLoading(false))
  }, [selectedGroupId])

  // Load block-outs (club closures + per-aircraft downtime) when selected group changes
  useEffect(() => {
    if (!selectedGroupId) return
    setBlockOuts([])
    setBlockOutsError(null)
    setBlockOutsLoading(true)
    fetch(`/api/groups/${selectedGroupId}/blockouts`)
      .then(async res => {
        const data = await res.json()
        if (!res.ok) { setBlockOutsError(data.error || 'Failed to load block-outs'); return }
        setBlockOuts(Array.isArray(data) ? data : [])
      })
      .catch(() => setBlockOutsError('Network error'))
      .finally(() => setBlockOutsLoading(false))
  }, [selectedGroupId])

  const today = new Date().toISOString().split('T')[0]
  const todaysBookings = bookings.filter(b => b.startTime?.split('T')[0] === today)
  const upcomingBookings = bookings.filter(b => bookingStatus(b) !== 'past').slice(0, 5)

  function getDaysInMonth() {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const days: (number | null)[] = []
    for (let i = 0; i < firstDay.getDay(); i++) days.push(null)
    for (let i = 1; i <= lastDay.getDate(); i++) days.push(i)
    return days
  }

  function getBookingsForDay(day: number): Booking[] {
    const y = currentMonth.getFullYear()
    const m = String(currentMonth.getMonth() + 1).padStart(2, '0')
    const d = String(day).padStart(2, '0')
    return bookings.filter(b => b.startTime?.split('T')[0] === `${y}-${m}-${d}`)
  }

  const hasGroups = !groupsLoading && groups.length > 0
  const canManageHome = selectedGroup?.role === 'ADMIN' || selectedGroup?.role === 'OFFICER'
  const isGroupAdmin = selectedGroup?.role === 'ADMIN'
  const currentMember = members.find(m => m.userId === currentUserId) ?? null
  const isClubOwner = !!selectedGroup && selectedGroup.ownerId === currentUserId
  const nextBookingForUser = currentUserId
    ? bookings
        .filter(b => b.user?.id === currentUserId && bookingStatus(b) !== 'past')
        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())[0] ?? null
    : null
  const availableAircraftCount = selectedGroup?.aircraft.filter(a => a.status === 'Available').length ?? 0

  return (
    <div className="min-h-screen bg-background pt-[44px]">
      {showNewGroup && (
        <NewGroupModal
          onClose={() => setShowNewGroup(false)}
          onCreated={group => {
            setGroups(prev => [...prev, group])
            setSelectedGroupId(group.id)
            setShowNewGroup(false)
          }}
        />
      )}

      {showNewBooking && selectedGroup && (
        <NewBookingModal
          group={selectedGroup}
          onClose={() => setShowNewBooking(false)}
          onCreated={booking => {
            setBookings(prev =>
              [...prev, booking].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
            )
            setShowNewBooking(false)
            toast.success('Booking confirmed', {
              description: `${aircraftDisplayName(booking.aircraft)} · ${formatDate(booking.startTime)} ${formatTime(booking.startTime)}–${formatTime(booking.endTime)}`,
            })
            setActiveTab('bookings')
            setSelectedBooking(booking)
          }}
        />
      )}

      {selectedBooking && selectedGroupId && (
        <BookingDetailDialog
          booking={selectedBooking}
          currentUserId={currentUserId}
          isGroupAdmin={isGroupAdmin}
          groupId={selectedGroupId}
          onClose={() => setSelectedBooking(null)}
          onCancelled={bookingId => {
            setBookings(prev => prev.filter(b => b.id !== bookingId))
          }}
        />
      )}

      {selectedMaintenance && (
        <MaintenanceDetailDialog
          item={selectedMaintenance}
          isGroupAdmin={isGroupAdmin}
          onClose={() => setSelectedMaintenance(null)}
          onUpdated={updated => {
            setMaintenance(prev => prev.map(m => (m.id === updated.id ? updated : m)))
            setSelectedMaintenance(updated)
          }}
        />
      )}

      <main className="mx-auto max-w-[1600px] p-6">
        {/* Header */}
        <div className="flex flex-col gap-4 pb-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h1 className="text-xl font-semibold">Flying Club</h1>
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/flying-club/active">
                <Button variant="outline" size="sm">
                  <Plane className="mr-2 h-4 w-4" />
                  Active Flights
                  {todaysBookings.length > 0 && (
                    <Badge variant="default" className="ml-2 bg-emerald-500">{todaysBookings.length}</Badge>
                  )}
                </Button>
              </Link>
              {groups.length > 1 && (
                <select
                  value={selectedGroupId || ''}
                  onChange={e => setSelectedGroupId(e.target.value)}
                  className="h-8 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              )}
              <Button size="sm" variant="outline" onClick={() => window.location.href = '/flying-club/admin'}>
                <Settings className="mr-2 h-4 w-4" />
                Club Admin
              </Button>
              <Button size="sm" onClick={() => setShowNewGroup(true)}>
                <Plus className="mr-2 h-4 w-4" />
                New Group
              </Button>
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex gap-0 overflow-x-auto rounded-md border border-border bg-card">
            {(['home', 'dashboard', 'calendar', 'bookings', 'aircraft', 'flights', 'maintenance', 'billing', 'members'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`relative shrink-0 px-4 py-2.5 text-xs font-medium whitespace-nowrap transition-colors border-b-2 ${
                  activeTab === tab
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Loading */}
        {groupsLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Empty state */}
        {!groupsLoading && groups.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-20 text-center">
              <div className="rounded-full bg-muted p-4 mb-4">
                <Users className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No flying clubs yet</h3>
              <p className="text-sm text-muted-foreground mb-4">Create a group to start scheduling flights and tracking club aircraft.</p>
              <Button onClick={() => setShowNewGroup(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Your First Group
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ---- HOME ---- */}
        {hasGroups && activeTab === 'home' && selectedGroup && (
          <ClubHomeView
            groupId={selectedGroup.id}
            canManage={canManageHome}
            currentUserId={currentUserId}
            maintenance={maintenance}
            fleetSize={selectedGroup.aircraft.length}
            availableCount={availableAircraftCount}
            nextBooking={nextBookingForUser}
            posts={posts}
            postsLoading={postsLoading}
            postsError={postsError}
            setPosts={setPosts}
            documents={documents}
            documentsLoading={documentsLoading}
            documentsError={documentsError}
            setDocuments={setDocuments}
            blockOuts={blockOuts}
            blockOutsLoading={blockOutsLoading}
            blockOutsError={blockOutsError}
          />
        )}

        {/* ---- DASHBOARD ---- */}
        {hasGroups && activeTab === 'dashboard' && (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Aircraft</CardTitle>
                  <Plane className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{selectedGroup?.aircraft.length ?? '—'}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {selectedGroup?.aircraft.filter(a => a.status === 'Available').length ?? 0} available
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Upcoming Bookings</CardTitle>
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{bookingsLoading ? '…' : upcomingBookings.length}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {todaysBookings.length > 0 ? `${todaysBookings.length} today` : 'None scheduled today'}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active Members</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{membersLoading ? '…' : (members.length || '—')}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {members.filter(m => m.role === 'ADMIN').length} admin{members.filter(m => m.role === 'ADMIN').length !== 1 ? 's' : ''}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Maintenance Items</CardTitle>
                  <Wrench className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${maintenance.length > 0 ? 'text-destructive' : ''}`}>
                    {logsLoading ? '…' : maintenance.length}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {maintenance.filter(m => m.isGrounded).length} aircraft grounded
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Groups overview */}
            <div className="grid gap-6 lg:grid-cols-2">
              {groups.map(group => (
                <Card key={group.id} className="flex flex-col">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle>{group.name}</CardTitle>
                        <CardDescription className="mt-1 capitalize">{group.type || 'Flying Club'}</CardDescription>
                      </div>
                      <Badge variant="outline" className="text-xs capitalize">{group.role}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col space-y-4">
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Plane className="h-4 w-4" />
                        <span>{group.aircraft.length} aircraft</span>
                      </div>
                    </div>
                    <Separator />
                    <div className="flex-1 space-y-3">
                      {group.aircraft.length === 0 && (
                        <p className="text-xs text-muted-foreground">No aircraft added yet.</p>
                      )}
                      {group.aircraft.map(a => (
                        <Link
                          key={a.id}
                          href={`/flying-club/aircraft/${a.id}`}
                          className="flex items-center justify-between rounded-lg border border-border p-3 hover:bg-muted/50 transition-colors"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-sm">{a.nNumber}</p>
                              <Badge variant={a.status === 'Available' ? 'secondary' : 'destructive'} className="text-xs">
                                {a.status || 'Unknown'}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">{[a.make, a.model].filter(Boolean).join(' ')}</p>
                          </div>
                          {a.hourlyRate != null && (
                            <p className="text-sm font-semibold">${a.hourlyRate}/hr</p>
                          )}
                        </Link>
                      ))}
                    </div>
                    <Button
                      variant="outline"
                      className="w-full mt-auto"
                      onClick={() => { setSelectedGroupId(group.id); setActiveTab('aircraft') }}
                    >
                      View Group Details
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Upcoming bookings + maintenance */}
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Upcoming Bookings</CardTitle>
                    <Button variant="ghost" size="sm" onClick={() => setActiveTab('bookings')}>View All</Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {bookingsLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
                  {bookingsError && <p className="text-sm text-destructive">{bookingsError}</p>}
                  {!bookingsLoading && !bookingsError && upcomingBookings.length === 0 && (
                    <p className="text-sm text-muted-foreground">No upcoming bookings.</p>
                  )}
                  <div className="space-y-3">
                    {upcomingBookings.map(b => (
                      <div
                        key={b.id}
                        onClick={() => setSelectedBooking(b)}
                        className="flex items-center justify-between rounded-lg border border-border p-3 cursor-pointer transition-colors hover:bg-muted/50"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm">{aircraftDisplayName(b.aircraft)}</p>
                            <span className="text-xs text-muted-foreground">·</span>
                            <p className="text-sm text-muted-foreground">{b.user?.name}</p>
                          </div>
                          <p className="text-xs text-muted-foreground">{b.purpose || 'No purpose specified'}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium">{formatDate(b.startTime)}</p>
                          <p className="text-xs text-muted-foreground">{formatTime(b.startTime)}–{formatTime(b.endTime)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Maintenance Status</CardTitle>
                    <Button variant="ghost" size="sm" onClick={() => setActiveTab('maintenance')}>View All</Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {logsLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
                  {!logsLoading && maintenance.length === 0 && (
                    <p className="text-sm text-muted-foreground">No maintenance items.</p>
                  )}
                  <div className="space-y-3">
                    {maintenance.slice(0, 3).map(m => (
                      <div
                        key={m.id}
                        onClick={() => setSelectedMaintenance(m)}
                        className="flex items-center justify-between rounded-lg border border-border p-3 cursor-pointer transition-colors hover:bg-muted/50"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm">{m.aircraft?.nNumber}</p>
                            <Badge variant={m.isGrounded ? 'destructive' : 'secondary'} className="text-xs">{m.status}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{m.description}</p>
                        </div>
                        <p className="text-sm font-medium">{formatDate(m.reportedDate)}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* ---- CALENDAR ---- */}
        {hasGroups && activeTab === 'calendar' && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Flight Schedule</CardTitle>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline" size="icon"
                    onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm font-medium w-36 text-center">
                    {MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                  </span>
                  <Button
                    variant="outline" size="icon"
                    onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button size="sm" onClick={() => setShowNewBooking(true)} disabled={!selectedGroup || selectedGroup.aircraft.length === 0}>
                    <Plus className="mr-2 h-4 w-4" />
                    Book
                  </Button>
                  {todaysBookings.length > 0 && (
                    <select
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                      onChange={e => {
                        const b = todaysBookings.find(x => x.id === e.target.value)
                        if (b) {
                          setActiveFlight({
                            id: b.id,
                            aircraftId: b.aircraftId,
                            aircraftName: aircraftDisplayName(b.aircraft),
                            userId: b.userId,
                            userName: b.user?.name || 'Unknown',
                            hobbsStart: 0,
                            date: b.startTime?.split('T')[0],
                            time: formatTime(b.startTime),
                          })
                          setShowFlightComplete(true)
                        }
                      }}
                      defaultValue=""
                    >
                      <option value="" disabled>Complete flight…</option>
                      {todaysBookings.map(b => (
                        <option key={b.id} value={b.id}>
                          {aircraftDisplayName(b.aircraft)} – {b.user?.name} ({formatTime(b.startTime)})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
                  {DAYS.map(d => (
                    <div key={d} className="bg-card p-3 text-center">
                      <span className="text-xs font-medium text-muted-foreground">{d}</span>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
                  {getDaysInMonth().map((day, idx) => {
                    const dayBookings = day ? getBookingsForDay(day) : []
                    return (
                      <div
                        key={idx}
                        className={`bg-card min-h-[100px] p-2 ${day ? 'hover:bg-muted/50 cursor-pointer transition-colors' : ''}`}
                      >
                        {day && (
                          <>
                            <span className="text-sm font-medium">{day}</span>
                            {dayBookings.length > 0 && (
                              <div className="mt-2 space-y-1">
                                {dayBookings.slice(0, 3).map(b => (
                                  <div
                                    key={b.id}
                                    onClick={e => { e.stopPropagation(); setSelectedBooking(b) }}
                                    className="rounded bg-primary/10 border border-primary/20 px-2 py-1 cursor-pointer hover:bg-primary/20 transition-colors"
                                  >
                                    <p className="text-xs font-medium text-primary truncate">{b.aircraft?.nNumber}</p>
                                    <p className="text-xs text-muted-foreground">{formatTime(b.startTime)}</p>
                                  </div>
                                ))}
                                {dayBookings.length > 3 && (
                                  <p className="text-xs text-muted-foreground">+{dayBookings.length - 3} more</p>
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
            </CardContent>
          </Card>
        )}

        {/* ---- BOOKINGS ---- */}
        {hasGroups && activeTab === 'bookings' && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>All Bookings</CardTitle>
                <Button
                  size="sm"
                  onClick={() => setShowNewBooking(true)}
                  disabled={!selectedGroup || selectedGroup.aircraft.length === 0}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  New Booking
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {bookingsLoading && <p className="text-sm text-muted-foreground">Loading bookings…</p>}
              {bookingsError && <p className="text-sm text-destructive">{bookingsError}</p>}
              {!bookingsLoading && !bookingsError && bookings.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="rounded-full bg-muted p-4 mb-4">
                    <Calendar className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No bookings yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">Schedule the first flight for your club.</p>
                  <Button onClick={() => setShowNewBooking(true)} disabled={!selectedGroup || selectedGroup.aircraft.length === 0}>
                    <Plus className="mr-2 h-4 w-4" />
                    New Booking
                  </Button>
                </div>
              )}
              <div className="space-y-2">
                {bookings.map(b => {
                  const status = bookingStatus(b)
                  return (
                    <div
                      key={b.id}
                      id={`booking-${b.id}`}
                      onClick={() => setSelectedBooking(b)}
                      className="flex items-center justify-between rounded-lg border border-border p-4 cursor-pointer transition-colors hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                          <Plane className="h-5 w-5 text-primary" />
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm">{aircraftDisplayName(b.aircraft)}</p>
                            <Badge
                              variant={status === 'active' ? 'default' : status === 'past' ? 'secondary' : 'outline'}
                              className={`text-xs ${status === 'active' ? 'bg-emerald-500' : ''}`}
                            >
                              {status}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{b.purpose || 'No purpose specified'}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">{b.user?.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(b.startTime)} · {formatTime(b.startTime)}–{formatTime(b.endTime)}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ---- AIRCRAFT ---- */}
        {hasGroups && activeTab === 'aircraft' && (
          <div className="space-y-4">
            {selectedGroup && selectedGroup.aircraft.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="rounded-full bg-muted p-4 mb-4">
                    <Plane className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No aircraft yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">Add aircraft to your club via Club Admin.</p>
                  <Button onClick={() => window.location.href = '/flying-club/admin'}>
                    <Settings className="mr-2 h-4 w-4" />
                    Go to Club Admin
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {(selectedGroup?.aircraft || []).map(a => (
                  <Card key={a.id}>
                    <Link href={`/flying-club/aircraft/${a.id}`} className="block hover:bg-muted/50 transition-colors rounded-t-xl">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          {a.nNumber}
                          <Badge variant={a.status === 'Available' ? 'secondary' : 'destructive'}>
                            {a.status || 'Unknown'}
                          </Badge>
                        </CardTitle>
                        <CardDescription>
                          {[a.make, a.model].filter(Boolean).join(' ')}
                          {a.nickname ? ` — "${a.nickname}"` : ''}
                        </CardDescription>
                      </CardHeader>
                    </Link>
                    <CardContent className="space-y-4">
                      {a.hourlyRate != null && (
                        <div className="flex items-center gap-1.5 text-sm">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span>${a.hourlyRate}/hr</span>
                        </div>
                      )}
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => setShowNewBooking(true)}
                      >
                        <Calendar className="mr-2 h-4 w-4" />
                        Book
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ---- FLIGHTS ---- */}
        {hasGroups && activeTab === 'flights' && (
          <Card>
            <CardHeader>
              <CardTitle>Flight Logs</CardTitle>
              <CardDescription>Club flight history for {selectedGroup?.name}</CardDescription>
            </CardHeader>
            <CardContent>
              {logsLoading && <p className="text-sm text-muted-foreground">Loading flight logs…</p>}
              {logsError && <p className="text-sm text-destructive">{logsError}</p>}
              {!logsLoading && !logsError && flightLogs.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="rounded-full bg-muted p-4 mb-4">
                    <BookOpen className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No flight logs yet</h3>
                  <p className="text-sm text-muted-foreground">Logs are created when completing a booking.</p>
                </div>
              )}
              <div className="space-y-2">
                {flightLogs.map(log => (
                  <div key={log.id} className="flex items-center justify-between rounded-lg border border-border p-4">
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <Plane className="h-5 w-5 text-primary" />
                      </div>
                      <div className="space-y-1">
                        <p className="font-medium text-sm">{log.aircraft?.nNumber || log.aircraftId}</p>
                        <p className="text-xs text-muted-foreground">{log.user?.name || log.userId}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">{formatDate(log.date)}</p>
                      <p className="text-xs text-muted-foreground">
                        {log.hobbsTime != null && `${fmtNum(log.hobbsTime, 1)} Hobbs`}
                        {log.hobbsTime != null && log.tachTime != null && ' · '}
                        {log.tachTime != null && `${fmtNum(log.tachTime, 1)} Tach`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ---- MAINTENANCE ---- */}
        {hasGroups && activeTab === 'maintenance' && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Maintenance Tracking</CardTitle>
                <Link href="/flying-club/squawks">
                  <Button size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Report Issue
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {logsLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
              {!logsLoading && maintenance.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="rounded-full bg-muted p-4 mb-4">
                    <Wrench className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No maintenance items</h3>
                  <p className="text-sm text-muted-foreground">All aircraft are in good standing.</p>
                </div>
              )}
              <div className="space-y-2">
                {maintenance.map(m => (
                  <div
                    key={m.id}
                    onClick={() => setSelectedMaintenance(m)}
                    className="flex items-center justify-between rounded-lg border border-border p-4 cursor-pointer transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${m.isGrounded ? 'bg-destructive/10' : 'bg-muted'}`}>
                        <Wrench className={`h-5 w-5 ${m.isGrounded ? 'text-destructive' : 'text-muted-foreground'}`} />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{m.aircraft?.nNumber}</p>
                          <Badge variant={m.isGrounded ? 'destructive' : 'secondary'}>{m.status}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{m.description}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">Reported: {formatDate(m.reportedDate)}</p>
                      {m.isGrounded && (
                        <div className="flex items-center justify-end gap-1 mt-1">
                          <AlertCircle className="h-3 w-3 text-destructive" />
                          <p className="text-xs text-destructive">Grounded</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ---- BILLING ---- */}
        {hasGroups && activeTab === 'billing' && (
          <Card>
            <CardHeader>
              <CardTitle>Billing</CardTitle>
              <CardDescription>Club billing and payments</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="rounded-full bg-muted p-4 mb-4">
                  <DollarSign className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Billing</h3>
                <p className="text-sm text-muted-foreground mb-4">Manage dues, payments, and invoices.</p>
                <Link href="/flying-club/billing">
                  <Button>Open Billing</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ---- MEMBERS ---- */}
        {hasGroups && activeTab === 'members' && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Members</CardTitle>
                <Link href={selectedGroupId ? `/flying-club/admin?group=${selectedGroupId}` : '/flying-club/admin'}>
                  <Button size="sm" variant="outline">
                    <Settings className="mr-2 h-4 w-4" />
                    Manage
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {membersLoading && <p className="text-sm text-muted-foreground">Loading members…</p>}
              {membersError && <p className="text-sm text-destructive">{membersError}</p>}
              {!membersLoading && !membersError && members.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="rounded-full bg-muted p-4 mb-4">
                    <Users className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No members found</h3>
                  <p className="text-sm text-muted-foreground">Invite pilots to join your club via Club Admin.</p>
                </div>
              )}
              <div className="space-y-2">
                {members.map(m => (
                  <div key={m.id} className="flex items-center justify-between rounded-lg border border-border p-4">
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                        <span className="text-sm font-semibold text-primary">
                          {(m.user?.name || m.user?.email || '?').charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <p className="font-medium text-sm">{m.user?.name || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground">{m.user?.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={m.role === 'ADMIN' ? 'default' : 'secondary'} className="text-xs">
                        {m.role}
                      </Badge>
                      <p className="text-xs text-muted-foreground hidden sm:block">
                        Joined {formatDate(m.joinedAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              {currentMember && !isClubOwner && (
                <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
                  <p className="text-xs text-muted-foreground">
                    Leaving removes your access to this club&apos;s bookings and records.
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={handleLeaveClub}
                    disabled={leavingClub}
                  >
                    {leavingClub ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : null}
                    Leave club
                  </Button>
                </div>
              )}
              {leaveError && (
                <p className="mt-2 text-xs text-destructive text-right">{leaveError}</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Flight Completion Wizard */}
        {activeFlight && (
          <FlightCompleteWizard
            open={showFlightComplete}
            onOpenChange={setShowFlightComplete}
            flight={activeFlight}
            onComplete={async (data) => {
              console.log('Flight completed:', data)
              setShowFlightComplete(false)
              setActiveFlight(null)
            }}
          />
        )}
      </main>
    </div>
  )
}
