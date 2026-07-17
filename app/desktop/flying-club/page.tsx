'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import ReactMarkdown from 'react-markdown'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import { cloudSignIn } from '@/apps/desktop/src/lib/cloud-session'
import { completeSetup } from '@/desktop/lib/setup'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import ClubScheduleView from './_components/ClubScheduleView'
import { QuickBooksCard } from './_components/quickbooks-card'
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import {
  Plane, Calendar, Users, Wrench, DollarSign, Clock,
  AlertCircle, Plus, ChevronLeft, ChevronRight,
  BookOpen, X, Loader2, Cloud, ArrowRight, ArrowLeft,
  FileText, Download, Trash2, Pin, CheckCircle2, CreditCard, Mail, Circle,
} from "lucide-react"
import { FlightCompleteWizard } from "@/components/flight-complete/FlightCompleteWizard"
import { worstStatus, type InspectionComputed } from "@/lib/club/inspections"

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
  /** NOTE: the bookings API maps this from pilotProfileId — it is NOT a user id.
   *  Use `user.id` to compare against the signed-in user. */
  userId: string
  instructorId: string | null
  startTime: string
  endTime: string
  purpose: string | null
  createdAt?: string | null
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

interface Blockout {
  id: string
  clubAircraftId: string | null
  startTime: string
  endTime: string
  reason?: string | null
}

interface FlightLog {
  id: string
  aircraftId: string
  userId: string
  date: string
  tachTime: number | null
  hobbsTime: number | null
  notes: string | null
  aircraft: { id: string; nNumber: string; customName: string | null; nickname: string | null }
  user: { id: string; name: string; email: string }
}

interface MaintenanceItem {
  id: string
  description: string
  status: string
  isGrounded: boolean
  reportedDate: string
  resolvedDate: string | null
  aircraft: { id: string; nNumber: string; customName: string | null; nickname: string | null }
}

interface Post {
  id: string
  title: string
  content: string
  pinned: boolean
  authorId: string
  createdAt: string
  author: { id: string; name: string; email: string }
}

interface Document {
  id: string
  name: string
  description: string | null
  category: string
  fileSize: number
  uploaderId: string
  createdAt: string
  uploader: { id: string; name: string; email: string }
}

interface LogsResponse {
  logs: FlightLog[]
  maintenance: MaintenanceItem[]
}

// ---- SWR Fetchers ----

async function fetcher(url: string) {
  const res = await fetch(url)
  if (res.status === 403) return []
  if (!res.ok) throw new Error((await res.json()).error || 'Request failed')
  return res.json()
}

async function logsFetcher(url: string): Promise<LogsResponse> {
  const res = await fetch(url)
  if (res.status === 403) return { logs: [], maintenance: [] }
  if (!res.ok) throw new Error((await res.json()).error || 'Request failed')
  return res.json()
}

// ---- Shared modal a11y hook ----
// Escape-to-close for the custom fixed-overlay modals in this file.
function useEscapeToClose(onClose: () => void) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
}

// ---- NewGroupModal ----

type GroupCreateStep = 'choose' | 'partnership' | 'club'
type GroupCreateType = 'partnership' | 'club'

interface AirportSuggestion {
  ident: string
  name: string
  municipality?: string | null
  region?: string | null
}

function NewGroupModal({ onClose, onCreated }: { onClose: () => void; onCreated: (group: Group) => void }) {
  useEscapeToClose(onClose)
  const [step, setStep] = useState<GroupCreateStep>('choose')
  const [selectedType, setSelectedType] = useState<GroupCreateType | null>(null)

  // Partnership form
  const [partnershipName, setPartnershipName] = useState('')

  // Flying club form
  const [clubName, setClubName] = useState('')
  const [sizeBracket, setSizeBracket] = useState('')
  const [homeAirport, setHomeAirport] = useState('')
  const [website, setWebsite] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [description, setDescription] = useState('')
  const [showOnMap, setShowOnMap] = useState(false)

  // Home airport autocomplete
  const [airportSuggestions, setAirportSuggestions] = useState<AirportSuggestion[]>([])
  const [showAirportSuggestions, setShowAirportSuggestions] = useState(false)
  const [airportHighlight, setAirportHighlight] = useState(-1)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Debounced airport suggestion lookup as the user types the home airport
  useEffect(() => {
    const q = homeAirport.trim()
    if (q.length < 2) {
      setAirportSuggestions([])
      setAirportHighlight(-1)
      return
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/airports/search?q=${encodeURIComponent(q)}`)
        if (!res.ok) return
        const data = await res.json()
        setAirportSuggestions(Array.isArray(data) ? data : [])
        setAirportHighlight(-1)
      } catch {
        // Ignore — suggestions are best-effort, free typing still works
      }
    }, 250)
    return () => clearTimeout(timer)
  }, [homeAirport])

  function selectAirport(a: AirportSuggestion) {
    setHomeAirport(a.ident)
    setShowAirportSuggestions(false)
    setAirportSuggestions([])
    setAirportHighlight(-1)
  }

  function handleAirportKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showAirportSuggestions || airportSuggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setAirportHighlight(i => (i + 1) % airportSuggestions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setAirportHighlight(i => (i <= 0 ? airportSuggestions.length - 1 : i - 1))
    } else if (e.key === 'Enter' && airportHighlight >= 0) {
      e.preventDefault()
      selectAirport(airportSuggestions[airportHighlight])
    } else if (e.key === 'Escape') {
      // Close only the suggestion dropdown — don't let Escape bubble up to
      // the modal's escape-to-close listener while suggestions are open.
      e.stopPropagation()
      setShowAirportSuggestions(false)
    }
  }

  const groupTypeOptions: {
    type: GroupCreateType
    icon: React.ComponentType<{ className?: string }>
    title: string
    desc: string
  }[] = [
    { type: 'partnership', icon: Users, title: 'Partnership', desc: 'A few friends who own a plane together and split costs' },
    { type: 'club', icon: Plane, title: 'Flying Club', desc: 'A club with members, scheduling, and billing' },
  ]

  async function handleCreatePartnership() {
    if (!partnershipName.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: partnershipName.trim(), type: 'partnership' }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to create group'); return }
      onCreated({ ...data, aircraft: [], role: 'ADMIN' })
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  async function handleCreateClub() {
    if (!clubName.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: clubName.trim(),
          type: 'club',
          description: description.trim() || undefined,
          website: website.trim() || undefined,
          contactEmail: contactEmail.trim() || undefined,
          homeAirport: homeAirport.trim() || undefined,
          sizeBracket: sizeBracket || undefined,
          showOnMap,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to create group'); return }
      onCreated({ ...data, aircraft: [], role: 'ADMIN' })
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  function goBackToChoose() {
    setStep('choose')
    setError(null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true" aria-labelledby="new-group-modal-title">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 id="new-group-modal-title" className="text-lg font-semibold">Create New Group</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></Button>
        </div>

        {step === 'choose' && (
          <div className="space-y-4">
            <div className="text-center">
              <h3 className="text-lg font-bold">What kind of group is this?</h3>
              <p className="mt-1 text-xs text-muted-foreground">You can change the details later.</p>
            </div>
            <div className="grid gap-3">
              {groupTypeOptions.map(o => (
                <button
                  key={o.type}
                  type="button"
                  onClick={() => setSelectedType(o.type)}
                  className={`flex items-start gap-3 rounded-md border p-4 text-left transition-all ${
                    selectedType === o.type
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-border hover:border-foreground/20 hover:bg-muted/50'
                  }`}
                >
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-md ${
                      selectedType === o.type ? 'bg-primary text-primary-foreground' : 'bg-muted'
                    }`}
                  >
                    <o.icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{o.title}</p>
                    <p className="text-xs text-muted-foreground">{o.desc}</p>
                  </div>
                  {selectedType === o.type && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                </button>
              ))}
            </div>
            <div className="flex justify-end">
              <Button disabled={!selectedType} onClick={() => selectedType && setStep(selectedType)}>
                Continue
              </Button>
            </div>
          </div>
        )}

        {step === 'partnership' && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={goBackToChoose}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
            <div>
              <label htmlFor="ng-partnership-name" className="text-sm font-medium">Name</label>
              <input
                id="ng-partnership-name"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={partnershipName}
                onChange={e => setPartnershipName(e.target.value)}
                placeholder="e.g. N12345 Partners"
                onKeyDown={e => e.key === 'Enter' && handleCreatePartnership()}
                autoFocus
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={handleCreatePartnership} disabled={saving || !partnershipName.trim()}>
                {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating…</> : 'Create Group'}
              </Button>
            </div>
          </div>
        )}

        {step === 'club' && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={goBackToChoose}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
            <div>
              <label htmlFor="ng-club-name" className="text-sm font-medium">Name *</label>
              <input
                id="ng-club-name"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={clubName}
                onChange={e => setClubName(e.target.value)}
                placeholder="e.g. Sky High Flying Club"
                onKeyDown={e => e.key === 'Enter' && handleCreateClub()}
                autoFocus
              />
            </div>
            <div>
              <label htmlFor="ng-club-size" className="text-sm font-medium">Club Size</label>
              <select
                id="ng-club-size"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={sizeBracket}
                onChange={e => setSizeBracket(e.target.value)}
              >
                <option value="">Select…</option>
                <option value="1-5">1–5 members</option>
                <option value="6-15">6–15 members</option>
                <option value="16-40">16–40 members</option>
                <option value="40+">40+ members</option>
              </select>
            </div>
            <div className="relative">
              <label htmlFor="ng-home-airport" className="text-sm font-medium">Home Airport</label>
              <input
                id="ng-home-airport"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-ring"
                value={homeAirport}
                onChange={e => {
                  setHomeAirport(e.target.value.toUpperCase())
                  setShowAirportSuggestions(true)
                }}
                onFocus={() => { if (airportSuggestions.length > 0) setShowAirportSuggestions(true) }}
                onBlur={() => setTimeout(() => setShowAirportSuggestions(false), 150)}
                onKeyDown={handleAirportKeyDown}
                placeholder="e.g. KPTK"
                maxLength={7}
                autoComplete="off"
                role="combobox"
                aria-expanded={showAirportSuggestions && airportSuggestions.length > 0}
                aria-autocomplete="list"
              />
              {showAirportSuggestions && airportSuggestions.length > 0 && (
                <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-md border border-border bg-popover shadow-md">
                  {airportSuggestions.map((a, i) => (
                    <button
                      key={a.ident}
                      type="button"
                      // onMouseDown (not onClick) fires before the input's onBlur closes the dropdown
                      onMouseDown={e => { e.preventDefault(); selectAirport(a) }}
                      onMouseEnter={() => setAirportHighlight(i)}
                      className={`block w-full truncate px-3 py-2 text-left text-sm normal-case ${
                        i === airportHighlight ? 'bg-accent text-accent-foreground' : 'hover:bg-accent hover:text-accent-foreground'
                      }`}
                    >
                      <span className="font-medium">{a.ident}</span>
                      <span className="text-muted-foreground"> — {a.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label htmlFor="ng-website" className="text-sm font-medium">Website</label>
              <input
                id="ng-website"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={website}
                onChange={e => setWebsite(e.target.value)}
                placeholder="yourclub.com"
              />
            </div>
            <div>
              <label htmlFor="ng-contact-email" className="text-sm font-medium">Contact email <span className="font-normal text-muted-foreground">(optional)</span></label>
              <input
                id="ng-contact-email"
                type="email"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={contactEmail}
                onChange={e => setContactEmail(e.target.value)}
                placeholder="info@yourclub.com"
              />
              <p className="mt-1 text-xs text-muted-foreground">Shown publicly so pilots can reach your club</p>
            </div>
            <div>
              <label htmlFor="ng-bio" className="text-sm font-medium">Bio</label>
              <textarea
                id="ng-bio"
                className="mt-1 w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={description}
                onChange={e => setDescription(e.target.value.slice(0, 2000))}
                placeholder="Tell pilots about your club..."
                maxLength={2000}
              />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={showOnMap}
                onChange={e => setShowOnMap(e.target.checked)}
                className="mt-0.5 rounded"
              />
              <span>
                Show my club on the public club map
                <span className="block text-xs text-muted-foreground">
                  Pilots browsing the map can discover your club at its home airport
                </span>
              </span>
            </label>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={handleCreateClub} disabled={saving || !clubName.trim()}>
                {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating…</> : 'Create Group'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ---- NewBookingModal ----

function NewBookingModal({ group, onClose, onCreated }: {
  group: Group
  onClose: () => void
  onCreated: (booking: Booking) => void
}) {
  useEscapeToClose(onClose)
  const [aircraftId, setAircraftId] = useState(group.aircraft[0]?.id || '')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('11:00')
  const [purpose, setPurpose] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Policy blocks (403 airworthiness / 422 scheduling-limit) get a more
  // prominent callout since the message is directly actionable; plain
  // conflicts (409) and other errors keep the simple inline text.
  const [isPolicyError, setIsPolicyError] = useState(false)

  async function handleBook() {
    if (!aircraftId || !date) return
    setSaving(true)
    setError(null)
    setIsPolicyError(false)
    try {
      const startISO = new Date(`${date}T${startTime}:00`).toISOString()
      const endISO = new Date(`${date}T${endTime}:00`).toISOString()
      const res = await fetch(`/api/groups/${group.id}/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aircraftId, startTime: startISO, endTime: endISO, purpose: purpose || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Failed to create booking')
        setIsPolicyError(res.status === 403 || res.status === 422)
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true" aria-labelledby="new-booking-modal-title">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 id="new-booking-modal-title" className="text-lg font-semibold">New Booking — {group.name}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-4">
          <div>
            <label htmlFor="nb-aircraft" className="text-sm font-medium">Aircraft</label>
            <select
              id="nb-aircraft"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
            <label htmlFor="nb-date" className="text-sm font-medium">Date</label>
            <input id="nb-date" type="date" className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="nb-start-time" className="text-sm font-medium">Start Time</label>
              <input id="nb-start-time" type="time" className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={startTime} onChange={e => setStartTime(e.target.value)} />
            </div>
            <div>
              <label htmlFor="nb-end-time" className="text-sm font-medium">End Time</label>
              <input id="nb-end-time" type="time" className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={endTime} onChange={e => setEndTime(e.target.value)} />
            </div>
          </div>
          <div>
            <label htmlFor="nb-purpose" className="text-sm font-medium">Purpose (optional)</label>
            <input
              id="nb-purpose"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={purpose}
              onChange={e => setPurpose(e.target.value)}
              placeholder="e.g. Local practice, cross country…"
            />
          </div>
          {error && isPolicyError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span className="font-medium">{error}</span>
            </div>
          )}
          {error && !isPolicyError && <p className="text-sm text-destructive">{error}</p>}
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

// ---- BookingDetailsModal ----
// Read-only booking details with contextual actions: cancel (owner or club
// admin; blocked for past bookings) and complete-flight (today/past-start,
// routes into the existing FlightCompleteWizard).
//
// Cancellation contract (DELETE /api/groups/{groupId}/bookings/{bookingId}):
// the server requires a JSON `reason` when an admin cancels someone else's
// booking (400 without it) and forwards it in the member's cancellation
// email; for your own booking the note is optional.

function BookingDetailsModal({ booking, groupId, aircraftStatus, isOwn, isAdmin, onClose, onCancelled, onCompleteFlight }: {
  booking: Booking
  groupId: string
  aircraftStatus: string | null
  isOwn: boolean
  isAdmin: boolean
  onClose: () => void
  onCancelled: () => void
  onCompleteFlight: () => void
}) {
  useEscapeToClose(onClose)
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const [reason, setReason] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const status = bookingStatus(booking)
  const isPast = status === 'past'
  const canCancel = !isPast && (isOwn || isAdmin)
  // A note is REQUIRED when cancelling someone else's booking (admin case) —
  // the server 400s without it. Optional for your own booking.
  const reasonRequired = !isOwn

  const now = new Date()
  const start = new Date(booking.startTime)
  const canComplete = start <= now || start.toDateString() === now.toDateString()

  async function handleCancel() {
    if (reasonRequired && !reason.trim()) return
    setCancelling(true)
    setError(null)
    try {
      const res = await fetch(`/api/groups/${groupId}/bookings/${booking.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'Failed to cancel booking'); return }
      onCancelled()
    } catch {
      setError('Network error')
    } finally {
      setCancelling(false)
    }
  }

  const rows: { label: string; value: React.ReactNode }[] = [
    {
      label: 'Aircraft',
      value: (
        <span className="flex items-center gap-2">
          <span className="font-medium">{acLabel(booking.aircraft)}</span>
          <Badge variant={aircraftStatus === 'Available' ? 'secondary' : 'destructive'} className="text-xs">{aircraftStatus || 'Unknown'}</Badge>
        </span>
      ),
    },
    { label: 'Date', value: fmt(booking.startTime, 'date') },
    { label: 'Time', value: `${fmt(booking.startTime, 'time')} – ${fmt(booking.endTime, 'time')}` },
    { label: 'Pilot', value: booking.user?.name || booking.user?.email || 'Unknown' },
    { label: 'Instructor', value: booking.instructor ? (booking.instructor.name || booking.instructor.email) : '—' },
    { label: 'Purpose', value: booking.purpose || '—' },
    // The bookings list API doesn't return createdAt today — show it when present.
    ...(booking.createdAt ? [{ label: 'Created', value: fmt(booking.createdAt, 'date') }] : []),
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true" aria-labelledby="booking-details-modal-title">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 id="booking-details-modal-title" className="text-lg font-semibold">Booking Details</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></Button>
        </div>

        <div className="space-y-1 text-sm">
          {rows.map(r => (
            <div key={r.label} className="flex items-center justify-between gap-4 border-b border-border/60 py-2 last:border-b-0">
              <span className="text-muted-foreground">{r.label}</span>
              <span className="text-right">{r.value}</span>
            </div>
          ))}
          <div className="flex items-center justify-between gap-4 py-2">
            <span className="text-muted-foreground">Status</span>
            <Badge variant={status === 'active' ? 'default' : status === 'past' ? 'secondary' : 'outline'} className={`text-xs capitalize ${status === 'active' ? 'bg-emerald-500' : ''}`}>{status}</Badge>
          </div>
        </div>

        {confirmingCancel ? (
          <div className="mt-4 space-y-3 rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-sm font-medium">
              {isOwn ? 'Cancel this booking?' : `Cancel ${booking.user?.name || 'this member'}'s booking?`}
            </p>
            <div>
              <label htmlFor="bd-cancel-reason" className="text-sm font-medium">
                {reasonRequired ? 'Why is this booking being cancelled? *' : 'Add a note (optional)'}
              </label>
              {reasonRequired && (
                <p className="text-xs text-muted-foreground">The member will receive this note with their cancellation email.</p>
              )}
              <textarea
                id="bd-cancel-reason"
                className="mt-1 w-full min-h-[64px] rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={reason}
                onChange={e => setReason(e.target.value.slice(0, 500))}
                placeholder={reasonRequired ? 'e.g. Aircraft grounded for maintenance' : 'e.g. Weather'}
                maxLength={500}
                autoFocus
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => { setConfirmingCancel(false); setError(null) }}>Keep booking</Button>
              <Button variant="destructive" size="sm" onClick={handleCancel} disabled={cancelling || (reasonRequired && !reason.trim())}>
                {cancelling ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Cancelling…</> : 'Cancel booking'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            {error && <p className="mr-auto text-sm text-destructive">{error}</p>}
            {canCancel && (
              <Button variant="destructive" size="sm" onClick={() => setConfirmingCancel(true)}>
                <Trash2 className="mr-2 h-4 w-4" />Cancel booking
              </Button>
            )}
            {canComplete && (
              <Button size="sm" onClick={onCompleteFlight}>
                <CheckCircle2 className="mr-2 h-4 w-4" />Complete flight
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
          </div>
        )}
      </div>
    </div>
  )
}

// ---- ConvertAccountModal ----

function ConvertAccountModal({ open, onClose, prefillName }: {
  open: boolean
  onClose: () => void
  prefillName: string
}) {
  useEscapeToClose(() => { if (open) onClose() })
  const [view, setView] = useState<'convert' | 'signin'>('convert')

  // Convert form
  const [name, setName] = useState(prefillName)
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null)
  const [usernameChecking, setUsernameChecking] = useState(false)
  const [usernameCheckError, setUsernameCheckError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Sign-in form
  const [signinUsername, setSigninUsername] = useState('')
  const [signinPassword, setSigninPassword] = useState('')
  const [signinError, setSigninError] = useState('')
  const [signingIn, setSigningIn] = useState(false)

  // Debounced username availability check
  useEffect(() => {
    if (!username || username.length < 3) { setUsernameAvailable(null); return }
    const timer = setTimeout(async () => {
      setUsernameChecking(true)
      setUsernameCheckError(false)
      try {
        const res = await fetch(`/api/auth/signup?checkUsername=${encodeURIComponent(username)}`)
        const data = await res.json()
        if (res.ok && !data.error) {
          setUsernameAvailable(data.available)
          setUsernameCheckError(false)
        } else {
          setUsernameAvailable(null)
          setUsernameCheckError(true)
        }
      } catch {
        setUsernameAvailable(null)
        setUsernameCheckError(true)
      } finally {
        setUsernameChecking(false)
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [username])

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setView('convert')
      setName(prefillName)
      setEmail('')
      setUsername('')
      setPassword('')
      setUsernameAvailable(null)
      setUsernameCheckError(false)
      setError(null)
      setSigninUsername('')
      setSigninPassword('')
      setSigninError('')
    }
  }, [open, prefillName])

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    if (!name || !email || !username || !password) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, username, password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to create account'); return }

      // Auto sign in after successful signup
      const signinRes = await cloudSignIn(username, password)
      if (!signinRes.ok) { setError(signinRes.error || 'Sign in failed after account creation'); return }

      try { await completeSetup({ mode: 'cloud' }) } catch { /* ignore in web preview */ }
      window.dispatchEvent(new Event('desktop-auth-changed'))
      onClose()
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  async function handleSignin(e: React.FormEvent) {
    e.preventDefault()
    setSigningIn(true)
    setSigninError('')
    const res = await cloudSignIn(signinUsername, signinPassword)
    setSigningIn(false)
    if (!res.ok) {
      setSigninError(res.error || 'Invalid username or password')
      return
    }
    try { await completeSetup({ mode: 'cloud' }) } catch { /* ignore in web preview */ }
    window.dispatchEvent(new Event('desktop-auth-changed'))
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true" aria-labelledby="convert-account-modal-title">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
        {view === 'convert' ? (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 id="convert-account-modal-title" className="text-lg font-semibold">Convert to Online Account</h2>
              <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></Button>
            </div>
            <form onSubmit={handleSignup} className="space-y-4">
              <div>
                <label htmlFor="ca-name" className="text-sm font-medium">Name</label>
                <input
                  id="ca-name"
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Your name"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label htmlFor="ca-email" className="text-sm font-medium">Email</label>
                <input
                  id="ca-email"
                  type="email"
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>
              <div>
                <label htmlFor="ca-username" className="mb-1.5 block text-sm font-medium">Username</label>
                <div className="relative mt-1">
                  <input
                    id="ca-username"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm pr-8 focus:outline-none focus:ring-2 focus:ring-ring"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="Choose a username"
                    required
                    minLength={3}
                    maxLength={20}
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
                    {usernameChecking && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    {!usernameChecking && usernameAvailable === true && <span className="text-emerald-500 text-sm" role="img" aria-label="Username available">✓</span>}
                    {!usernameChecking && usernameAvailable === false && <span className="text-destructive text-sm" role="img" aria-label="Username taken">✗</span>}
                    {!usernameChecking && usernameCheckError && <span className="text-muted-foreground text-sm" title="Could not verify">?</span>}
                  </span>
                </div>
                {usernameAvailable === false && (
                  <p className="mt-1 text-xs text-destructive">Username already taken</p>
                )}
                {usernameCheckError && (
                  <p className="mt-1 text-xs text-muted-foreground">Could not verify availability</p>
                )}
              </div>
              <div>
                <label htmlFor="ca-password" className="text-sm font-medium">Password</label>
                <input
                  id="ca-password"
                  type="password"
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  required
                  minLength={8}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button className="w-full" type="submit" disabled={saving || usernameAvailable === false || usernameChecking}>
                {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating account…</> : 'Create Online Account'}
              </Button>
            </form>
            <div className="mt-4 text-center text-xs text-muted-foreground">
              Already have an account?{' '}
              <button type="button" onClick={() => { setView('signin'); setError(null) }} className="font-medium underline hover:text-foreground">
                Sign in
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 id="convert-account-modal-title" className="text-lg font-semibold">Sign In</h2>
              <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></Button>
            </div>
            <form onSubmit={handleSignin} className="space-y-4">
              <div>
                <label htmlFor="ca-signin-username" className="text-sm font-medium">Username or Email</label>
                <input
                  id="ca-signin-username"
                  type="text"
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={signinUsername}
                  onChange={e => setSigninUsername(e.target.value)}
                  placeholder="Username or email"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label htmlFor="ca-signin-password" className="text-sm font-medium">Password</label>
                <input
                  id="ca-signin-password"
                  type="password"
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={signinPassword}
                  onChange={e => setSigninPassword(e.target.value)}
                  placeholder="Password"
                  required
                />
              </div>
              {signinError && <p className="text-sm text-destructive">{signinError}</p>}
              <Button className="w-full" type="submit" disabled={signingIn}>
                {signingIn ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Signing in…</> : 'Sign In'}
              </Button>
            </form>
            <div className="mt-4 text-center text-xs text-muted-foreground">
              Don&apos;t have an account?{' '}
              <button type="button" onClick={() => { setView('convert'); setSigninError('') }} className="font-medium underline hover:text-foreground">
                Create one
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ---- Helpers ----

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function fmt(iso: string, mode: 'date' | 'time') {
  try {
    return mode === 'date'
      ? new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
      : new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch { return iso }
}

function bookingStatus(b: Booking): 'past' | 'active' | 'upcoming' {
  const now = new Date()
  const start = new Date(b.startTime)
  const end = new Date(b.endTime)
  if (end < now) return 'past'
  if (start <= now && now <= end) return 'active'
  return 'upcoming'
}

function acLabel(a: { nNumber: string; nickname?: string | null }) {
  return a.nNumber + (a.nickname ? ` (${a.nickname})` : '')
}

// ---- ClubCharts ----
// Dashboard graphs derived from the club's flight logs: monthly hours flown
// over the last 6 months, and total hours by aircraft. Uses hobbs time,
// falling back to tach when hobbs is missing.
const CHART_COLORS = ['#3b82f6', '#22c55e', '#8b5cf6', '#f59e0b', '#14b8a6', '#ef4444']

function ClubCharts({ flightLogs }: { flightLogs: FlightLog[] }) {
  const { monthly, byAircraft, totalHours } = useMemo(() => {
    const hoursOf = (l: FlightLog) => l.hobbsTime ?? l.tachTime ?? 0

    // Last 6 months as ordered buckets (including empty ones)
    const now = new Date()
    const buckets: { key: string; month: string; hours: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      buckets.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        month: d.toLocaleString('default', { month: 'short' }),
        hours: 0,
      })
    }
    const bucketByKey = new Map(buckets.map(b => [b.key, b]))

    const acHours = new Map<string, number>()
    let total = 0
    for (const l of flightLogs) {
      const h = hoursOf(l)
      if (!h) continue
      total += h
      const d = new Date(l.date)
      const b = bucketByKey.get(`${d.getFullYear()}-${d.getMonth()}`)
      if (b) b.hours += h
      const tail = l.aircraft?.nNumber || 'Unknown'
      acHours.set(tail, (acHours.get(tail) ?? 0) + h)
    }

    const byAircraft = [...acHours.entries()]
      .map(([tail, hours]) => ({ tail, hours: Math.round(hours * 10) / 10 }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 6)

    return {
      monthly: buckets.map(b => ({ month: b.month, hours: Math.round(b.hours * 10) / 10 })),
      byAircraft,
      totalHours: Math.round(total * 10) / 10,
    }
  }, [flightLogs])

  if (flightLogs.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Club activity</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No logged flights yet — charts appear once members start logging club flights.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Flight hours</CardTitle>
          <CardDescription>{totalHours} h logged · last 6 months</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={monthly} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="clubHours" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={32} />
              <Tooltip
                formatter={(v) => [`${Number(v ?? 0)} h`, "Hours"]}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--popover))' }}
              />
              <Area type="monotone" dataKey="hours" stroke="#3b82f6" strokeWidth={2} fill="url(#clubHours)" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Hours by aircraft</CardTitle>
          <CardDescription>Total logged time per tail</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={byAircraft} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.25} />
              <XAxis type="number" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="tail" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={64} />
              <Tooltip
                formatter={(v) => [`${Number(v ?? 0)} h`, "Hours"]}
                cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--popover))' }}
              />
              <Bar dataKey="hours" radius={[0, 4, 4, 0]}>
                {byAircraft.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}

// ---- AircraftAirworthinessBadge ----
// Lightweight per-aircraft airworthiness indicator for the fleet list. Only
// mounted for aircraft cards actually rendered (i.e. only while the Aircraft
// tab is open), so this doesn't fan out requests for the whole app — just
// the handful of aircraft in the currently selected club.

function AircraftAirworthinessBadge({ groupId, aircraftId }: { groupId: string; aircraftId: string }) {
  const { data } = useSWR<{ currentTachHours: number | null; inspections: InspectionComputed[] }>(
    `/api/groups/${groupId}/aircraft/${aircraftId}/inspections`,
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 60000 }
  )

  if (!data || !Array.isArray(data.inspections) || data.inspections.length === 0) return null
  const status = worstStatus(data.inspections)
  if (status === 'UNKNOWN') return null

  const cls =
    status === 'OVERDUE' ? 'bg-red-500/10 text-red-600 border-red-500/30'
    : status === 'DUE_SOON' ? 'bg-amber-500/10 text-amber-600 border-amber-500/30'
    : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
  const label =
    status === 'OVERDUE' ? 'Inspections Overdue'
    : status === 'DUE_SOON' ? 'Inspection Due Soon'
    : 'Airworthy'

  return <Badge className={`text-xs border ${cls}`}>{label}</Badge>
}

// ---- AddAircraftModal ----

function AddAircraftModal({ group, onClose, onCreated }: {
  group: Group
  onClose: () => void
  onCreated: (aircraft: ClubAircraft) => void
}) {
  useEscapeToClose(onClose)
  const [nNumber, setNNumber] = useState('')
  const [nickname, setNickname] = useState('')
  const [customName, setCustomName] = useState('')
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [year, setYear] = useState('')
  const [hourlyRate, setHourlyRate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAdd() {
    if (!nNumber.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/groups/${group.id}/aircraft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nNumber: nNumber.trim().toUpperCase(),
          nickname: nickname.trim() || undefined,
          customName: customName.trim() || undefined,
          make: make.trim() || undefined,
          model: model.trim() || undefined,
          year: year ? parseInt(year) : undefined,
          hourlyRate: hourlyRate ? parseFloat(hourlyRate) : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to add aircraft'); return }
      onCreated(data)
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true" aria-labelledby="add-aircraft-modal-title">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 id="add-aircraft-modal-title" className="text-lg font-semibold">Add Aircraft — {group.name}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-4">
          <div>
            <label htmlFor="aa-n-number" className="text-sm font-medium">N-Number *</label>
            <input
              id="aa-n-number"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring uppercase"
              value={nNumber}
              onChange={e => setNNumber(e.target.value)}
              placeholder="N12345"
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              autoFocus
              maxLength={10}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="aa-make" className="text-sm font-medium">Make</label>
              <input
                id="aa-make"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={make}
                onChange={e => setMake(e.target.value)}
                placeholder="Cessna"
              />
            </div>
            <div>
              <label htmlFor="aa-model" className="text-sm font-medium">Model</label>
              <input
                id="aa-model"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={model}
                onChange={e => setModel(e.target.value)}
                placeholder="172S"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="aa-nickname" className="text-sm font-medium">Nickname</label>
              <input
                id="aa-nickname"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={nickname}
                onChange={e => setNickname(e.target.value)}
                placeholder="My Skyhawk"
                maxLength={100}
              />
            </div>
            <div>
              <label htmlFor="aa-custom-name" className="text-sm font-medium">Custom Name</label>
              <input
                id="aa-custom-name"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={customName}
                onChange={e => setCustomName(e.target.value)}
                placeholder="G-BIRD"
                maxLength={255}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="aa-year" className="text-sm font-medium">Year</label>
              <input
                id="aa-year"
                type="number"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={year}
                onChange={e => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="2024"
                min={1900}
                max={2030}
              />
            </div>
            <div>
              <label htmlFor="aa-hourly-rate" className="text-sm font-medium">Hourly Rate ($)</label>
              <input
                id="aa-hourly-rate"
                type="number"
                step="0.01"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={hourlyRate}
                onChange={e => setHourlyRate(e.target.value)}
                placeholder="165.00"
              />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving || !nNumber.trim()}>
              {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Adding…</> : 'Add Aircraft'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---- InviteMemberModal (updated with direct-add + shareable link) ----

function InviteMemberModal({ group, onClose, onAdded }: {
  group: Group
  onClose: () => void
  onAdded?: () => void
}) {
  useEscapeToClose(onClose)
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<
    | { type: 'direct_add'; member: { user: { name?: string; email: string } } }
    | { type: 'invite'; inviteLink: string }
    | null
  >(null)
  const [copied, setCopied] = useState(false)

  async function handleInvite() {
    if (!email.trim()) return
    setSaving(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch(`/api/groups/${group.id}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to send invite'); return }
      setResult(data)
      if (data.type === 'direct_add') {
        onAdded?.()
      }
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  async function copyLink() {
    if (result?.type !== 'invite') return
    try {
      await navigator.clipboard.writeText(result.inviteLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true" aria-labelledby="invite-member-modal-title">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 id="invite-member-modal-title" className="text-lg font-semibold">Invite Member — {group.name}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></Button>
        </div>
        {result?.type === 'direct_add' ? (
          <div className="py-8 text-center space-y-4">
            <div className="text-emerald-500 text-lg font-semibold">
              ✅ {result.member.user.name || result.member.user.email} has been added as a member!
            </div>
            <Button onClick={onClose}>Close</Button>
          </div>
        ) : result?.type === 'invite' ? (
          <div className="py-4 space-y-4">
            <p className="text-sm text-muted-foreground">Invitation created! Share this link:</p>
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={result.inviteLink}
                readOnly
                aria-label="Invite link"
              />
              <Button onClick={copyLink} variant="outline">
                {copied ? 'Link copied!' : 'Copy Link'}
              </Button>
            </div>
            <div className="flex justify-end">
              <Button variant="outline" onClick={onClose}>Close</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label htmlFor="im-email" className="text-sm font-medium">Email Address</label>
              <input
                id="im-email"
                type="email"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="pilot@example.com"
                onKeyDown={e => e.key === 'Enter' && handleInvite()}
                autoFocus
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={handleInvite} disabled={saving || !email.trim()}>
                {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending…</> : 'Send Invite'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ---- DeleteClubModal ----

function DeleteClubModal({ group, onClose, onDeleted }: {
  group: Group
  onClose: () => void
  onDeleted: () => void
}) {
  useEscapeToClose(onClose)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    if (confirmText !== 'delete') return
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch(`/api/groups/${group.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Failed to delete club')
        return
      }
      onDeleted()
    } catch {
      setError('Network error')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true" aria-labelledby="delete-club-modal-title">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 id="delete-club-modal-title" className="text-lg font-semibold text-destructive">Delete {group.name}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-4">
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            This permanently deletes the club, its aircraft records, bookings, and member associations. This cannot be undone.
          </div>
          <div>
            <label htmlFor="dc-confirm" className="text-sm font-medium">
              Type <span className="font-mono font-semibold">delete</span> to confirm
            </label>
            <input
              id="dc-confirm"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-destructive"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder="delete"
              autoFocus
              autoComplete="off"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting || confirmText !== 'delete'}>
              {deleting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Deleting…</> : 'Delete Club'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---- NewPostModal ----

function NewPostModal({ groupId, onClose, onCreated, canEmailNotice }: {
  groupId: string
  onClose: () => void
  onCreated: () => void
  /** Whether the "email this notice" option is offered — the /notify endpoint
   *  is finance-gated (ADMIN/TREASURER), while posting itself is ADMIN/OFFICER. */
  canEmailNotice: boolean
}) {
  useEscapeToClose(onClose)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [pinned, setPinned] = useState(false)
  const [alsoEmail, setAlsoEmail] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [posted, setPosted] = useState(false)

  async function handleSubmit() {
    if (!title.trim() || !content.trim()) return
    setSaving(true)
    setError(null)
    setStatusMessage(null)
    try {
      const res = await fetch(`/api/groups/${groupId}/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), content, pinned }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to create post'); return }
      onCreated()

      if (!canEmailNotice || !alsoEmail) {
        onClose()
        return
      }

      // Keep the modal open just long enough to show combined feedback —
      // the post already succeeded, so only the notify step can still fail.
      setPosted(true)
      try {
        const notifyRes = await fetch(`/api/groups/${groupId}/notify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subject: title.trim(), message: content.trim() }),
        })
        const notifyData = await notifyRes.json().catch(() => ({}))
        if (!notifyRes.ok) {
          setStatusMessage(`Posted · email failed: ${notifyData.error || 'Unable to send'}`)
        } else {
          setStatusMessage(`Posted · emailed to ${notifyData.sent} member${notifyData.sent === 1 ? '' : 's'}${notifyData.failed ? ` (${notifyData.failed} failed)` : ''}`)
        }
      } catch {
        setStatusMessage('Posted · email failed: Network error')
      }
    } catch { setError('Network error') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true" aria-labelledby="new-post-modal-title">
      <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 id="new-post-modal-title" className="text-lg font-semibold">New Post</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-4">
          <div>
            <label htmlFor="np-title" className="text-sm font-medium">Title</label>
            <input id="np-title" className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={title} onChange={e => setTitle(e.target.value)} placeholder="Announcement title" autoFocus />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="np-content" className="text-sm font-medium">Content (Markdown)</label>
              <button type="button" onClick={() => setPreview(!preview)} className="text-xs text-muted-foreground hover:text-foreground underline">
                {preview ? 'Edit' : 'Preview'}
              </button>
            </div>
            {preview ? (
              <div className="mt-1 min-h-[200px] rounded-md border border-input bg-background px-3 py-2 text-sm prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown>{content || '*No content*'}</ReactMarkdown>
              </div>
            ) : (
              <textarea id="np-content" className="mt-1 w-full min-h-[200px] rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" value={content} onChange={e => setContent(e.target.value)} placeholder="Write in Markdown…" />
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} disabled={posted} className="rounded" />
            Pin this post
          </label>
          {canEmailNotice && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={alsoEmail} onChange={e => setAlsoEmail(e.target.checked)} disabled={posted} className="rounded" />
              Also email this notice to all members
            </label>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {posted && !statusMessage && (
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="h-4 w-4 animate-spin" />Posted · sending emails…
            </p>
          )}
          {statusMessage && (
            <p className={`text-sm font-medium flex items-center gap-1.5 ${statusMessage.includes('failed') ? 'text-destructive' : 'text-emerald-600'}`}>
              {!statusMessage.includes('failed') && <CheckCircle2 className="h-4 w-4" />}{statusMessage}
            </p>
          )}
          <div className="flex gap-2 justify-end">
            {posted ? (
              <Button onClick={onClose}>Close</Button>
            ) : (
              <>
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button onClick={handleSubmit} disabled={saving || !title.trim() || !content.trim()}>
                  {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Posting…</> : 'Publish'}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---- UploadDocumentModal ----

function UploadDocumentModal({ groupId, onClose, onCreated }: {
  groupId: string
  onClose: () => void
  onCreated: () => void
}) {
  useEscapeToClose(onClose)
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('general')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleUpload() {
    if (!file) return
    setSaving(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('name', name || file.name)
      formData.append('description', description)
      formData.append('category', category)

      const res = await fetch(`/api/groups/${groupId}/documents`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to upload'); return }
      onCreated()
    } catch { setError('Network error') }
    finally { setSaving(false) }
  }

  const categories = ['general', 'bylaws', 'forms', 'manuals', 'minutes', 'insurance', 'financial', 'other']

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true" aria-labelledby="upload-document-modal-title">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 id="upload-document-modal-title" className="text-lg font-semibold">Upload Document</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-4">
          <div>
            <label htmlFor="ud-file" className="text-sm font-medium">File *</label>
            <input id="ud-file" type="file" className="mt-1 w-full text-sm" onChange={e => { const f = e.target.files?.[0]; setFile(f || null); if (f && !name) setName(f.name) }} />
          </div>
          <div>
            <label htmlFor="ud-name" className="text-sm font-medium">Name</label>
            <input id="ud-name" className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={name} onChange={e => setName(e.target.value)} placeholder="Document name" />
          </div>
          <div>
            <label htmlFor="ud-description" className="text-sm font-medium">Description</label>
            <input id="ud-description" className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description" />
          </div>
          <div>
            <label htmlFor="ud-category" className="text-sm font-medium">Category</label>
            <select id="ud-category" className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={category} onChange={e => setCategory(e.target.value)}>
              {categories.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
            </select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleUpload} disabled={saving || !file}>
              {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Uploading…</> : 'Upload'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---- BookingPolicyCard ----
// Admin-only booking policy editor for the Settings tab. Fetches the
// effective policy (defaults if unset) and PUTs changes back.

interface ClubPolicy {
  maxBookingHours: number | null
  maxAdvanceDays: number | null
  minBookingNoticeHours: number | null
  blockOnOverdueInspection: boolean
  blockOnGroundedSquawk: boolean
  requireCurrencyToBook: boolean
  blockOnUnpaidBalance: boolean
}

function BookingPolicyCard({ groupId }: { groupId: string }) {
  const { data: policy, isLoading, mutate: mutatePolicy } = useSWR<ClubPolicy>(
    `/api/groups/${groupId}/policy`,
    fetcher
  )

  const [maxBookingHours, setMaxBookingHours] = useState('')
  const [maxAdvanceDays, setMaxAdvanceDays] = useState('')
  const [minBookingNoticeHours, setMinBookingNoticeHours] = useState('')
  const [blockOnOverdueInspection, setBlockOnOverdueInspection] = useState(true)
  const [blockOnGroundedSquawk, setBlockOnGroundedSquawk] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Sync local form state whenever the fetched policy changes (group switch, initial load).
  useEffect(() => {
    if (!policy) return
    setMaxBookingHours(policy.maxBookingHours != null ? String(policy.maxBookingHours) : '')
    setMaxAdvanceDays(policy.maxAdvanceDays != null ? String(policy.maxAdvanceDays) : '')
    setMinBookingNoticeHours(policy.minBookingNoticeHours != null ? String(policy.minBookingNoticeHours) : '')
    setBlockOnOverdueInspection(policy.blockOnOverdueInspection)
    setBlockOnGroundedSquawk(policy.blockOnGroundedSquawk)
  }, [policy])

  useEffect(() => {
    if (!saved) return
    const t = setTimeout(() => setSaved(false), 3000)
    return () => clearTimeout(t)
  }, [saved])

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch(`/api/groups/${groupId}/policy`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maxBookingHours: maxBookingHours.trim() === '' ? null : parseFloat(maxBookingHours),
          maxAdvanceDays: maxAdvanceDays.trim() === '' ? null : parseInt(maxAdvanceDays, 10),
          minBookingNoticeHours: minBookingNoticeHours.trim() === '' ? null : parseFloat(minBookingNoticeHours),
          blockOnOverdueInspection,
          blockOnGroundedSquawk,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'Failed to save booking policy'); return }
      mutatePolicy(data, { revalidate: false })
      setSaved(true)
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Booking Policy</CardTitle>
        <CardDescription>Control how members can book aircraft in this club.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="text-sm font-medium">Max booking length (hours)</label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={maxBookingHours}
                  onChange={e => setMaxBookingHours(e.target.value)}
                  placeholder="No limit"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Max advance booking (days)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={maxAdvanceDays}
                  onChange={e => setMaxAdvanceDays(e.target.value)}
                  placeholder="No limit"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Minimum notice (hours)</label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={minBookingNoticeHours}
                  onChange={e => setMinBookingNoticeHours(e.target.value)}
                  placeholder="No limit"
                />
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium">Block booking when a required inspection is overdue</p>
                  <p className="text-xs text-muted-foreground">
                    Members can't reserve an aircraft that has an overdue required inspection.
                  </p>
                </div>
                <Switch checked={blockOnOverdueInspection} onCheckedChange={setBlockOnOverdueInspection} />
              </div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium">Block booking when grounded for maintenance</p>
                  <p className="text-xs text-muted-foreground">
                    Members can't reserve an aircraft that's currently grounded by an open squawk.
                  </p>
                </div>
                <Switch checked={blockOnGroundedSquawk} onCheckedChange={setBlockOnGroundedSquawk} />
              </div>
              <div className="flex items-start justify-between gap-4 opacity-60">
                <div>
                  <p className="font-medium flex items-center gap-2">
                    Require currency to book
                    <Badge variant="secondary" className="text-[10px]">Coming soon</Badge>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Members without current flight review / medical on file won't be able to book.
                  </p>
                </div>
                <Switch checked={false} disabled />
              </div>
              <div className="flex items-start justify-between gap-4 opacity-60">
                <div>
                  <p className="font-medium flex items-center gap-2">
                    Block booking on unpaid balance
                    <Badge variant="secondary" className="text-[10px]">Coming soon</Badge>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Members with an outstanding account balance won't be able to book.
                  </p>
                </div>
                <Switch checked={false} disabled />
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
            {saved && !error && (
              <p className="text-sm font-medium text-emerald-600 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" />Policy saved
              </p>
            )}

            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Save policy'}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ---- PaymentsCard ----
// Finance-only (ADMIN/TREASURER) Stripe Connect status/onboarding card,
// shown in the Billing tab so treasurers can reach it.
// Money model: each club onboards its own Stripe account and members pay the
// club directly — the platform never holds club funds.

interface StripeStatus {
  connected: boolean
  chargesEnabled?: boolean
  detailsSubmitted?: boolean
}

function PaymentsCard({ groupId }: { groupId: string }) {
  const { data: status, isLoading, error: statusError } = useSWR<StripeStatus>(
    `/api/groups/${groupId}/stripe/status`,
    fetcher
  )
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConnect() {
    setConnecting(true)
    setError(null)
    try {
      const res = await fetch(`/api/groups/${groupId}/stripe/onboard`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'Failed to start Stripe onboarding'); return }
      if (data.url) {
        // Popup blockers silently eat window.open — fall back to navigating
        // this tab (Stripe onboarding returns to the app via return_url).
        const popup = window.open(data.url, '_blank')
        if (!popup) window.location.href = data.url
      }
    } catch {
      setError('Network error')
    } finally {
      setConnecting(false)
    }
  }

  const label = !status?.connected
    ? 'Not connected'
    : status.chargesEnabled
      ? 'Ready to accept payments'
      : 'Onboarding incomplete'

  const badgeVariant = !status?.connected ? 'secondary' : status.chargesEnabled ? 'default' : 'secondary'
  const buttonLabel = status?.connected ? 'Resume onboarding' : 'Connect Stripe'

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" />Payments</CardTitle>
        <CardDescription>Accept member payments for statements via Stripe.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Status</span>
              <Badge variant={badgeVariant}>{label}</Badge>
            </div>

            {statusError && <p className="text-sm text-destructive">Failed to load payment status</p>}
            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex items-center justify-between gap-4">
              <p className="text-xs text-muted-foreground">
                Members pay your club directly — AviationHub never holds your funds.
              </p>
              {!status?.chargesEnabled && (
                <Button onClick={handleConnect} disabled={connecting} size="sm" className="shrink-0">
                  {connecting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Connecting…</> : buttonLabel}
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ---- BillingTab ----
// Member statements + finance billing-cycle controls. Members see and pay
// their own invoices; finance roles (ADMIN or TREASURER) also see every
// member's invoices, the billing schedule, the Stripe payments card, and can
// trigger a billing run.

interface InvoiceItemRow {
  id: string
  hobbsHours: number
  hourlyRate: number
  amount: number
  aircraft: string | null
  date: string | null
}

interface InvoiceRow {
  id: string
  totalAmount: number
  status: string
  stripePaymentId: string | null
  pdfUrl: string | null
  sentAt: string | null
  createdAt: string
  items: InvoiceItemRow[]
  member?: { id: string; name: string | null; email: string } | null
}

function money(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function InvoiceStatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase()
  const cls =
    s === 'paid' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
    : s === 'pending' ? 'bg-amber-500/10 text-amber-600 border-amber-500/30'
    : 'bg-muted text-muted-foreground border-border'
  return <Badge className={`text-xs border ${cls}`}>{status.charAt(0).toUpperCase() + status.slice(1)}</Badge>
}

// ---- BillingScheduleCard ----
// Finance-only (ADMIN/TREASURER) controls for when billing cycles run
// automatically and whether members get emailed a statement afterward. Same
// fetch/PUT/saved-indicator pattern as BookingPolicyCard, against the same
// /policy endpoint (treasurers may only write the billing fields there).

interface BillingScheduleSettings {
  billingDayOfMonth: number | null
  emailStatements: boolean
}

const BILLING_DAY_OPTIONS = [1, 5, 10, 15, 20, 25, 28]

function BillingScheduleCard({ groupId }: { groupId: string }) {
  const { data: policy, isLoading, mutate: mutatePolicy } = useSWR<BillingScheduleSettings>(
    `/api/groups/${groupId}/policy`,
    fetcher
  )

  const [billingDayOfMonth, setBillingDayOfMonth] = useState<string>('')
  const [emailStatements, setEmailStatements] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!policy) return
    setBillingDayOfMonth(policy.billingDayOfMonth != null ? String(policy.billingDayOfMonth) : '')
    setEmailStatements(policy.emailStatements)
  }, [policy])

  useEffect(() => {
    if (!saved) return
    const t = setTimeout(() => setSaved(false), 3000)
    return () => clearTimeout(t)
  }, [saved])

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      // The policy PUT expects the full booking-policy payload too; fetch the
      // current values so this save doesn't clobber them.
      const current = await fetch(`/api/groups/${groupId}/policy`).then(r => r.json()).catch(() => ({}))
      const res = await fetch(`/api/groups/${groupId}/policy`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...current,
          billingDayOfMonth: billingDayOfMonth === '' ? null : parseInt(billingDayOfMonth, 10),
          emailStatements,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'Failed to save billing schedule'); return }
      mutatePolicy(data, { revalidate: false })
      setSaved(true)
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Billing schedule</CardTitle>
        <CardDescription>Control when billing cycles run automatically and whether members get emailed.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div>
              <label className="text-sm font-medium">Run automatically on day…</label>
              <select
                className="mt-1 w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={billingDayOfMonth}
                onChange={e => setBillingDayOfMonth(e.target.value)}
              >
                <option value="">Manual only</option>
                {BILLING_DAY_OPTIONS.map(day => (
                  <option key={day} value={day}>{day}</option>
                ))}
              </select>
            </div>

            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium">Email statements to members</p>
                <p className="text-xs text-muted-foreground">
                  After each billing run, email every billed member their statement (with a PDF).
                </p>
              </div>
              <Switch checked={emailStatements} onCheckedChange={setEmailStatements} />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
            {saved && !error && (
              <p className="text-sm font-medium text-emerald-600 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" />Billing schedule saved
              </p>
            )}

            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Save schedule'}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ---- FinanceConsole ----
// Finance-only (ADMIN/TREASURER) roster of every member's flight activity and
// invoice balances, with filtering, multi-select, and targeted email sends
// (plain notice or a personalized billing reminder) via /notify.

interface FinanceAircraftAgg {
  id: string
  nNumber: string | null
  hours: number
}

interface FinanceMember {
  userId: string
  pilotProfileId: string | null
  name: string | null
  email: string
  role: string
  flights: number
  hours: number
  billedInPeriod: number
  outstanding: number
  lastFlight: string | null
  aircraft: FinanceAircraftAgg[]
  oldestUnpaidDays: number | null
}

interface FinanceOverview {
  members: FinanceMember[]
  totals: { members: number; hours: number; billed: number; outstanding: number }
}

type DatePreset = '30d' | '90d' | 'month' | 'custom'

function isoDateOnly(d: Date) {
  return d.toISOString().slice(0, 10)
}

// RFC-4180-style CSV field quoting: wrap in quotes when the value contains a
// comma, quote, or newline; double any embedded quotes.
function csvField(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const BILLING_REMINDER_DEFAULT_SUBJECT = 'Outstanding balance with {club}'
const BILLING_REMINDER_DEFAULT_MESSAGE =
  'Hi {name},\n\nOur records show an outstanding balance of {balance} with {club}. Please log in and settle up when you get a chance.\n\nThanks!'

function FinanceEmailModal({ groupId, selectedCount, userIds, onClose }: {
  groupId: string
  selectedCount: number
  userIds: string[]
  onClose: () => void
}) {
  useEscapeToClose(onClose)
  const [template, setTemplate] = useState<'notice' | 'billing-reminder'>('notice')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ sent: number; failed: number; skipped: number } | null>(null)

  function handleTemplateChange(next: 'notice' | 'billing-reminder') {
    setTemplate(next)
    setResult(null)
    setError(null)
    if (next === 'billing-reminder') {
      setSubject(BILLING_REMINDER_DEFAULT_SUBJECT)
      setMessage(BILLING_REMINDER_DEFAULT_MESSAGE)
    } else {
      setSubject('')
      setMessage('')
    }
  }

  async function handleSend() {
    if (userIds.length === 0 || !subject.trim() || !message.trim()) return
    setSending(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch(`/api/groups/${groupId}/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: subject.trim(), message: message.trim(), template, userIds }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'Failed to send'); return }
      setResult({ sent: data.sent ?? 0, failed: data.failed ?? 0, skipped: data.skipped ?? 0 })
    } catch {
      setError('Network error')
    } finally {
      setSending(false)
    }
  }

  const canSend = userIds.length > 0 && !!subject.trim() && !!message.trim() && !sending

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true" aria-labelledby="finance-email-modal-title">
      <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 id="finance-email-modal-title" className="text-lg font-semibold">Email {selectedCount} member{selectedCount === 1 ? '' : 's'}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Template</label>
            <div className="mt-1 flex gap-1">
              <Button type="button" size="sm" variant={template === 'notice' ? 'default' : 'outline'} onClick={() => handleTemplateChange('notice')}>Notice</Button>
              <Button type="button" size="sm" variant={template === 'billing-reminder' ? 'default' : 'outline'} onClick={() => handleTemplateChange('billing-reminder')}>Billing reminder</Button>
            </div>
          </div>

          {template === 'billing-reminder' && (
            <p className="text-xs text-muted-foreground">
              Merge tokens: <code className="font-mono">{'{name}'}</code>, <code className="font-mono">{'{balance}'}</code>, <code className="font-mono">{'{club}'}</code>.
              Members with no outstanding balance are skipped automatically.
            </p>
          )}

          <div>
            <label htmlFor="fe-subject" className="text-sm font-medium">Subject</label>
            <input
              id="fe-subject"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Subject"
            />
          </div>
          <div>
            <label htmlFor="fe-message" className="text-sm font-medium">Message</label>
            <textarea
              id="fe-message"
              className="mt-1 w-full min-h-[140px] rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Message"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {result && !error && (
            <p className="text-sm font-medium text-emerald-600">
              Sent {result.sent}{result.failed ? `, ${result.failed} failed` : ''}{result.skipped ? `, ${result.skipped} skipped (no balance)` : ''}
            </p>
          )}

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button onClick={handleSend} disabled={!canSend}>
              {sending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending…</> : 'Send'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function FinanceConsole({ groupId, aircraft, clubName }: { groupId: string; aircraft: ClubAircraft[]; clubName: string }) {
  const [preset, setPreset] = useState<DatePreset>('90d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [aircraftFilter, setAircraftFilter] = useState('')
  const [minHours, setMinHours] = useState('')
  const [hasOutstanding, setHasOutstanding] = useState(false)
  const [overdue30, setOverdue30] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showEmailModal, setShowEmailModal] = useState(false)

  useEffect(() => { setSelected(new Set()) }, [groupId])

  const { from, to } = useMemo(() => {
    const now = new Date()
    if (preset === '30d') return { from: isoDateOnly(new Date(now.getTime() - 30 * 86400000)), to: isoDateOnly(now) }
    if (preset === '90d') return { from: isoDateOnly(new Date(now.getTime() - 90 * 86400000)), to: isoDateOnly(now) }
    if (preset === 'month') return { from: isoDateOnly(new Date(now.getFullYear(), now.getMonth(), 1)), to: isoDateOnly(now) }
    return { from: customFrom, to: customTo }
  }, [preset, customFrom, customTo])

  const rangeReady = preset !== 'custom' || (!!customFrom && !!customTo)

  const swrKey = useMemo(() => {
    if (!rangeReady) return null
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    if (aircraftFilter) params.set('aircraftId', aircraftFilter)
    return `/api/groups/${groupId}/finance/overview?${params.toString()}`
  }, [groupId, from, to, aircraftFilter, rangeReady])

  const { data, error, isLoading } = useSWR<FinanceOverview>(swrKey, fetcher)
  const members = data?.members ?? []

  const filtered = useMemo(() => {
    const min = minHours.trim() === '' ? null : parseFloat(minHours)
    return members.filter(m => {
      if (min !== null && !Number.isNaN(min) && m.hours < min) return false
      if (hasOutstanding && !(m.outstanding > 0)) return false
      if (overdue30 && !(m.oldestUnpaidDays !== null && m.oldestUnpaidDays > 30)) return false
      return true
    })
  }, [members, minHours, hasOutstanding, overdue30])

  const filteredTotals = useMemo(() => filtered.reduce((acc, m) => {
    acc.flights += m.flights
    acc.hours += m.hours
    acc.billed += m.billedInPeriod
    acc.outstanding += m.outstanding
    return acc
  }, { flights: 0, hours: 0, billed: 0, outstanding: 0 }), [filtered])

  function toggleOne(userId: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  const allFilteredSelected = filtered.length > 0 && filtered.every(m => selected.has(m.userId))

  // Client-side CSV export of the CURRENT filtered rows.
  function handleExportCsv() {
    if (filtered.length === 0) return
    const header = ['Name', 'Email', 'Role', 'Flights', 'Hours', 'Billed', 'Outstanding', 'OldestUnpaidDays', 'LastFlight', 'Aircraft']
    const lines = [
      header,
      ...filtered.map(m => [
        m.name || '',
        m.email,
        m.role,
        m.flights,
        m.hours.toFixed(1),
        m.billedInPeriod.toFixed(2),
        m.outstanding.toFixed(2),
        m.oldestUnpaidDays ?? '',
        m.lastFlight ? isoDateOnly(new Date(m.lastFlight)) : '',
        m.aircraft.length ? m.aircraft.map(a => `${a.nNumber ?? '?'} ${a.hours.toFixed(1)}h`).join(' · ') : '',
      ]),
    ].map(row => row.map(csvField).join(','))
    const csv = lines.join('\r\n') + '\r\n'

    const clubSlug = clubName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'club'
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `finance-${clubSlug}-${from || 'start'}-${to || 'end'}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  function toggleAllFiltered() {
    setSelected(prev => {
      const next = new Set(prev)
      if (allFilteredSelected) {
        filtered.forEach(m => next.delete(m.userId))
      } else {
        filtered.forEach(m => next.add(m.userId))
      }
      return next
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle>Finance console</CardTitle>
            <CardDescription>Every member's flight activity and balance for {clubName}. Select members to email a notice or billing reminder.</CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" variant="outline" onClick={handleExportCsv} disabled={filtered.length === 0}>
              <Download className="mr-2 h-4 w-4" />Export CSV
            </Button>
            <Button size="sm" onClick={() => setShowEmailModal(true)} disabled={selected.size === 0}>
              <Mail className="mr-2 h-4 w-4" />Email selected ({selected.size})
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Date range</label>
            <div className="mt-1 flex gap-1">
              <Button type="button" size="sm" variant={preset === '30d' ? 'default' : 'outline'} onClick={() => setPreset('30d')}>30d</Button>
              <Button type="button" size="sm" variant={preset === '90d' ? 'default' : 'outline'} onClick={() => setPreset('90d')}>90d</Button>
              <Button type="button" size="sm" variant={preset === 'month' ? 'default' : 'outline'} onClick={() => setPreset('month')}>This month</Button>
              <Button type="button" size="sm" variant={preset === 'custom' ? 'default' : 'outline'} onClick={() => setPreset('custom')}>Custom</Button>
            </div>
          </div>

          {preset === 'custom' && (
            <>
              <div>
                <label className="text-xs font-medium text-muted-foreground">From</label>
                <input type="date" className="mt-1 block rounded-md border border-input bg-background px-2 py-1.5 text-sm" value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">To</label>
                <input type="date" className="mt-1 block rounded-md border border-input bg-background px-2 py-1.5 text-sm" value={customTo} onChange={e => setCustomTo(e.target.value)} />
              </div>
            </>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground">Aircraft</label>
            <select className="mt-1 block rounded-md border border-input bg-background px-2 py-1.5 text-sm" value={aircraftFilter} onChange={e => setAircraftFilter(e.target.value)}>
              <option value="">All aircraft</option>
              {aircraft.map(a => <option key={a.id} value={a.id}>{a.nNumber}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Min hours</label>
            <input
              type="number"
              min="0"
              step="0.1"
              className="mt-1 block w-24 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              value={minHours}
              onChange={e => setMinHours(e.target.value)}
              placeholder="0"
            />
          </div>

          <label className="flex items-center gap-2 pb-1.5 text-sm">
            <input type="checkbox" className="rounded" checked={hasOutstanding} onChange={e => setHasOutstanding(e.target.checked)} />
            Has outstanding balance
          </label>
          <label className="flex items-center gap-2 pb-1.5 text-sm">
            <input type="checkbox" className="rounded" checked={overdue30} onChange={e => setOverdue30(e.target.checked)} />
            Overdue &gt; 30 days
          </label>
        </div>

        {data && (
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="text-xs">{filtered.length} member{filtered.length === 1 ? '' : 's'}</Badge>
            <Badge variant="secondary" className="text-xs">{filteredTotals.hours.toFixed(1)} hrs</Badge>
            <Badge variant="secondary" className="text-xs">${money(filteredTotals.billed)} billed</Badge>
            <Badge variant="secondary" className="text-xs">${money(filteredTotals.outstanding)} outstanding</Badge>
          </div>
        )}

        {!rangeReady ? (
          <p className="text-sm text-muted-foreground">Pick both a start and end date.</p>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-muted p-4 mb-4"><DollarSign className="h-8 w-8 text-muted-foreground" /></div>
            <h3 className="text-lg font-semibold mb-2">Unable to load finance data</h3>
            <p className="text-sm text-muted-foreground">{error?.message || String(error)}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-muted p-4 mb-4"><DollarSign className="h-8 w-8 text-muted-foreground" /></div>
            <h3 className="text-lg font-semibold mb-2">No members match these filters</h3>
            <p className="text-sm text-muted-foreground">Try widening the date range or clearing a filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="w-8 py-2 pr-2">
                    <input type="checkbox" className="rounded" checked={allFilteredSelected} onChange={toggleAllFiltered} aria-label="Select all filtered members" />
                  </th>
                  <th className="py-2 pr-3 font-medium">Member</th>
                  <th className="py-2 pr-3 font-medium">Flights</th>
                  <th className="py-2 pr-3 font-medium">Hours</th>
                  <th className="py-2 pr-3 font-medium">Billed</th>
                  <th className="py-2 pr-3 font-medium">Outstanding</th>
                  <th className="py-2 pr-3 font-medium">Last flight</th>
                  <th className="py-2 pr-3 font-medium">Aircraft</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(m => (
                  <tr key={m.userId} className="border-b border-border/50">
                    <td className="py-2 pr-2">
                      <input type="checkbox" className="rounded" checked={selected.has(m.userId)} onChange={() => toggleOne(m.userId)} aria-label={`Select ${m.name || m.email}`} />
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{m.name || m.email}</span>
                        <Badge variant={m.role === 'ADMIN' || m.role === 'TREASURER' ? 'default' : 'secondary'} className="text-xs capitalize">{m.role.toLowerCase()}</Badge>
                      </div>
                    </td>
                    <td className="py-2 pr-3">{m.flights}</td>
                    <td className="py-2 pr-3">{m.hours.toFixed(1)}</td>
                    <td className="py-2 pr-3">${money(m.billedInPeriod)}</td>
                    <td className={`py-2 pr-3 ${m.outstanding > 0 ? 'text-destructive font-medium' : ''}`}>${money(m.outstanding)}</td>
                    <td className="py-2 pr-3">{m.lastFlight ? fmt(m.lastFlight, 'date') : '—'}</td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">
                      {m.aircraft.length ? m.aircraft.map(a => `${a.nNumber ?? '?'} ${a.hours.toFixed(1)}h`).join(' · ') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border font-medium">
                  <td></td>
                  <td className="py-2 pr-3">Totals</td>
                  <td className="py-2 pr-3">{filteredTotals.flights}</td>
                  <td className="py-2 pr-3">{filteredTotals.hours.toFixed(1)}</td>
                  <td className="py-2 pr-3">${money(filteredTotals.billed)}</td>
                  <td className={`py-2 pr-3 ${filteredTotals.outstanding > 0 ? 'text-destructive' : ''}`}>${money(filteredTotals.outstanding)}</td>
                  <td></td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </CardContent>

      {showEmailModal && (
        <FinanceEmailModal
          groupId={groupId}
          selectedCount={selected.size}
          userIds={Array.from(selected)}
          onClose={() => setShowEmailModal(false)}
        />
      )}
    </Card>
  )
}

function BillingTab({ groupId, isFinance, aircraft, clubName }: { groupId: string; isFinance: boolean; aircraft: ClubAircraft[]; clubName: string }) {
  const { data: myInvoices = [], error: myInvoicesError, isLoading: myInvoicesLoading, mutate: mutateMyInvoices } = useSWR<InvoiceRow[]>(
    `/api/groups/${groupId}/invoices`,
    fetcher,
    { refreshInterval: 15000 }
  )
  const { data: allInvoices = [], isLoading: allInvoicesLoading, mutate: mutateAllInvoices } = useSWR<InvoiceRow[]>(
    isFinance ? `/api/groups/${groupId}/invoices?scope=all` : null,
    fetcher,
    { refreshInterval: 15000 }
  )
  const { data: stripeStatus } = useSWR<StripeStatus>(`/api/groups/${groupId}/stripe/status`, fetcher)

  const [payingId, setPayingId] = useState<string | null>(null)
  const [payErrors, setPayErrors] = useState<Record<string, string>>({})
  const [runningBilling, setRunningBilling] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)
  const [runSuccess, setRunSuccess] = useState<string | null>(null)

  const chargesEnabled = !!stripeStatus?.chargesEnabled

  async function handlePay(invoiceId: string) {
    setPayingId(invoiceId)
    setPayErrors(prev => ({ ...prev, [invoiceId]: '' }))
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/pay`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setPayErrors(prev => ({ ...prev, [invoiceId]: data.error || 'Unable to start payment' }))
        return
      }
      if (data.url) window.location.href = data.url
    } catch {
      setPayErrors(prev => ({ ...prev, [invoiceId]: 'Network error' }))
    } finally {
      setPayingId(null)
    }
  }

  async function handleRunBilling() {
    if (!window.confirm('Run billing cycle now? This generates invoices for all members for flights since the last billing run.')) {
      return
    }
    setRunningBilling(true)
    setRunError(null)
    setRunSuccess(null)
    try {
      const res = await fetch(`/api/clubs/${groupId}/billing/run`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setRunError(data.error || 'Failed to run billing')
        return
      }
      const summary = data.summary
      setRunSuccess(
        summary
          ? `Billed ${summary.successful} of ${summary.totalMembers} member${summary.totalMembers === 1 ? '' : 's'} (${summary.failed} failed).`
          : 'Billing cycle complete.'
      )
      mutateMyInvoices()
      mutateAllInvoices()
    } catch {
      setRunError('Network error')
    } finally {
      setRunningBilling(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>My statements</CardTitle>
          <CardDescription>Your invoices for this club.</CardDescription>
        </CardHeader>
        <CardContent>
          {myInvoicesLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : myInvoicesError ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="rounded-full bg-muted p-4 mb-4"><DollarSign className="h-8 w-8 text-muted-foreground" /></div>
              <h3 className="text-lg font-semibold mb-2">Unable to load statements</h3>
              <p className="text-sm text-muted-foreground">{myInvoicesError?.message || String(myInvoicesError)}</p>
            </div>
          ) : myInvoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="rounded-full bg-muted p-4 mb-4"><DollarSign className="h-8 w-8 text-muted-foreground" /></div>
              <h3 className="text-lg font-semibold mb-2">No statements yet</h3>
              <p className="text-sm text-muted-foreground">They appear after your club runs billing.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {!chargesEnabled && (
                <p className="text-xs text-muted-foreground mb-2">This club isn't accepting online payments yet.</p>
              )}
              {myInvoices.map(inv => {
                const unpaid = inv.status.toLowerCase() !== 'paid'
                return (
                  <div key={inv.id} className="rounded-lg border border-border p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                          <DollarSign className="h-5 w-5 text-primary" />
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm">{fmt(inv.createdAt, 'date')}</p>
                            <InvoiceStatusBadge status={inv.status} />
                          </div>
                          <p className="text-xs text-muted-foreground">{inv.items.length} item{inv.items.length === 1 ? '' : 's'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="text-sm font-semibold">${money(inv.totalAmount)}</p>
                        {unpaid && (
                          <Button
                            size="sm"
                            disabled={!chargesEnabled || payingId === inv.id}
                            onClick={() => handlePay(inv.id)}
                          >
                            {payingId === inv.id ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Starting…</> : 'Pay'}
                          </Button>
                        )}
                      </div>
                    </div>
                    {payErrors[inv.id] && (
                      <p className="text-xs text-destructive mt-2">{payErrors[inv.id]}</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {isFinance && <PaymentsCard groupId={groupId} />}

      {isFinance && <QuickBooksCard groupId={groupId} />}

      {isFinance && <BillingScheduleCard groupId={groupId} />}

      {isFinance && <FinanceConsole groupId={groupId} aircraft={aircraft} clubName={clubName} />}

      {isFinance && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Club billing</CardTitle>
                <CardDescription>Run a billing cycle to invoice members for flights since the last run.</CardDescription>
              </div>
              <Button size="sm" onClick={handleRunBilling} disabled={runningBilling}>
                {runningBilling ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Running…</> : 'Run billing cycle'}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {runError && <p className="text-sm text-destructive mb-3">{runError}</p>}
            {runSuccess && !runError && (
              <p className="text-sm font-medium text-emerald-600 mb-3 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" />{runSuccess}
              </p>
            )}

            {allInvoicesLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : allInvoices.length === 0 ? (
              <p className="text-sm text-muted-foreground">No invoices yet for any member.</p>
            ) : (
              <div className="space-y-2">
                {allInvoices.map(inv => (
                  <div key={inv.id} className="flex items-center justify-between rounded-lg border border-border p-4">
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                        <span className="text-sm font-semibold text-primary">{(inv.member?.name || inv.member?.email || '?').charAt(0).toUpperCase()}</span>
                      </div>
                      <div className="space-y-1">
                        <p className="font-medium text-sm">{inv.member?.name || inv.member?.email || 'Unknown member'}</p>
                        <p className="text-xs text-muted-foreground">{fmt(inv.createdAt, 'date')}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <InvoiceStatusBadge status={inv.status} />
                      <p className="text-sm font-semibold">${money(inv.totalAmount)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ---- ClubSetupChecklist ----
// Admin-only, dismissible "get your club set up" card on the dashboard tab.
// Steps are computed from live data; each jumps to the relevant tab.
// Dismissal is per-club via localStorage ('club-setup-dismissed:{groupId}'),
// and step 5 also honours 'club-policy-reviewed:{groupId}', which the page
// sets whenever an admin opens the Settings tab. Auto-hides once every step
// is complete.

function ClubSetupChecklist({ group, membersCount, onGoToTab }: {
  group: Group
  membersCount: number
  onGoToTab: (tab: string) => void
}) {
  const groupId = group.id
  const [dismissed, setDismissed] = useState(false)
  const [policyReviewed, setPolicyReviewed] = useState(false)

  // localStorage reads happen client-side after mount (and again on club switch).
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(`club-setup-dismissed:${groupId}`) === '1')
      setPolicyReviewed(localStorage.getItem(`club-policy-reviewed:${groupId}`) === '1')
    } catch { /* localStorage unavailable — just show the checklist */ }
  }, [groupId])

  const { data: stripeStatus } = useSWR<StripeStatus>(
    `/api/groups/${groupId}/stripe/status`,
    fetcher,
    { revalidateOnFocus: false }
  )
  const { data: policy } = useSWR<ClubPolicy & BillingScheduleSettings>(
    `/api/groups/${groupId}/policy`,
    fetcher,
    { revalidateOnFocus: false }
  )

  // "Reviewed" also counts if ANY booking-policy field differs from the
  // defaults (limits null, both block toggles on) — they clearly looked at it.
  const policyDiffers = !!policy && (
    policy.maxBookingHours != null ||
    policy.maxAdvanceDays != null ||
    policy.minBookingNoticeHours != null ||
    policy.blockOnOverdueInspection === false ||
    policy.blockOnGroundedSquawk === false
  )

  const steps: { key: string; label: string; done: boolean; tab: string }[] = [
    { key: 'aircraft', label: 'Add your first aircraft', done: group.aircraft.length > 0, tab: 'aircraft' },
    { key: 'members', label: 'Invite members', done: membersCount > 1, tab: 'members' },
    { key: 'stripe', label: 'Connect Stripe payments', done: !!stripeStatus?.chargesEnabled, tab: 'billing' },
    { key: 'billing-day', label: 'Set a billing day', done: policy?.billingDayOfMonth != null, tab: 'billing' },
    { key: 'policy', label: 'Review your booking policy', done: policyDiffers || policyReviewed, tab: 'settings' },
  ]
  const doneCount = steps.filter(s => s.done).length

  // Wait for both fetches so a fully-set-up club doesn't get a flash of an
  // incomplete checklist; hide when dismissed or everything is done.
  if (dismissed || !stripeStatus || !policy || doneCount === steps.length) return null

  function dismiss() {
    try { localStorage.setItem(`club-setup-dismissed:${groupId}`, '1') } catch { /* ignore */ }
    setDismissed(true)
  }

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Get your club set up</CardTitle>
            <CardDescription>{doneCount} of {steps.length} complete</CardDescription>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={dismiss} aria-label="Dismiss setup checklist">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="space-y-1">
          {steps.map(step => (
            <li key={step.key}>
              <button
                type="button"
                onClick={() => onGoToTab(step.tab)}
                className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/50"
              >
                {step.done ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
                ) : (
                  <Circle className="h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden="true" />
                )}
                <span className={step.done ? 'text-muted-foreground line-through decoration-muted-foreground/40' : ''}>
                  {step.label}
                </span>
                <span className="sr-only">{step.done ? '(done)' : '(not done)'}</span>
                {!step.done && <ArrowRight className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground/60" aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

// ---- Page ----

export default function FlyingClubPage() {
  const { mode, cloudUser, initializing, localUser } = useDesktopAuth()
  const [activeTab, setActiveTab] = useState('dashboard')
  const [currentMonth, setCurrentMonth] = useState(new Date())

  // ---- SWR data fetching ----

  const { data: groups = [], error: groupsError, isLoading: groupsLoading, mutate: mutateGroups } = useSWR<Group[]>('/api/groups', { fetcher, refreshInterval: 15000 })
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const selectedGroup = groups.find(g => g.id === selectedGroupId) ?? null

  // Set initial selected group when groups load
  useEffect(() => {
    if (groups.length > 0 && !selectedGroupId) {
      setSelectedGroupId(groups[0].id)
    }
  }, [groups, selectedGroupId])

  const { data: bookings = [], error: bookingsError, isLoading: bookingsLoading, mutate: mutateBookings } = useSWR<Booking[]>(
    selectedGroupId ? `/api/groups/${selectedGroupId}/bookings` : null,
    { fetcher, refreshInterval: 15000 }
  )

  const { data: blockouts = [] } = useSWR<Blockout[]>(
    selectedGroupId ? `/api/groups/${selectedGroupId}/blockouts` : null,
    { fetcher, refreshInterval: 15000 }
  )

  const { data: members = [], error: membersError, isLoading: membersLoading, mutate: mutateMembers } = useSWR<Member[]>(
    selectedGroupId ? `/api/groups/${selectedGroupId}/members` : null,
    { fetcher, refreshInterval: 15000 }
  )

  const { data: logsData, error: logsError, isLoading: logsLoading, mutate: mutateLogs } = useSWR<LogsResponse>(
    selectedGroupId ? `/api/groups/${selectedGroupId}/logs` : null,
    { fetcher: logsFetcher, refreshInterval: 15000 }
  )

  const { data: posts = [], mutate: mutatePosts } = useSWR<Post[]>(
    selectedGroupId ? `/api/groups/${selectedGroupId}/posts` : null,
    { fetcher, refreshInterval: 15000 }
  )

  const { data: documents = [], mutate: mutateDocuments } = useSWR<Document[]>(
    selectedGroupId ? `/api/groups/${selectedGroupId}/documents` : null,
    { fetcher, refreshInterval: 15000 }
  )

  const flightLogs = logsData?.logs ?? []
  const maintenance = logsData?.maintenance ?? []

  // ---- Modal state ----

  const [showNewGroup, setShowNewGroup] = useState(false)
  const [showNewBooking, setShowNewBooking] = useState(false)
  const [showAddAircraft, setShowAddAircraft] = useState(false)
  const [showInviteMember, setShowInviteMember] = useState(false)

  const [showFlightComplete, setShowFlightComplete] = useState(false)
  const [activeFlight, setActiveFlight] = useState<{
    id: string; aircraftId: string; aircraftName: string
    userId: string; userName: string; hobbsStart?: number; date?: string; time?: string
  } | null>(null)

  const [showNewPost, setShowNewPost] = useState(false)
  const [showUploadDocument, setShowUploadDocument] = useState(false)
  const [showDeleteClub, setShowDeleteClub] = useState(false)
  const [detailsBooking, setDetailsBooking] = useState<Booking | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Auto-dismiss success message
  useEffect(() => {
    if (!successMessage) return
    const t = setTimeout(() => setSuccessMessage(null), 4000)
    return () => clearTimeout(t)
  }, [successMessage])

  // Opening the Settings tab counts as "reviewed the booking policy" for the
  // setup checklist (see ClubSetupChecklist step 5).
  useEffect(() => {
    if (activeTab === 'settings' && selectedGroupId) {
      try { localStorage.setItem(`club-policy-reviewed:${selectedGroupId}`, '1') } catch { /* ignore */ }
    }
  }, [activeTab, selectedGroupId])

  // Route a booking into the FlightCompleteWizard (from the details modal).
  function startCompleteFlight(b: Booking) {
    setActiveFlight({
      id: b.id,
      aircraftId: b.aircraftId,
      aircraftName: acLabel(b.aircraft),
      userId: b.userId,
      userName: b.user?.name || 'Unknown',
      hobbsStart: 0,
      date: b.startTime?.split('T')[0],
      time: fmt(b.startTime, 'time'),
    })
    setShowFlightComplete(true)
  }

  // ---- Derived state ----

  const today = new Date().toISOString().split('T')[0]
  const todaysBookings = bookings.filter(b => b.startTime?.split('T')[0] === today)
  const upcomingBookings = bookings.filter(b => bookingStatus(b) !== 'past').slice(0, 5)

  const isAdminOrOfficer = selectedGroup?.role === 'ADMIN' || selectedGroup?.role === 'OFFICER'
  const isOwnerOrAdmin = selectedGroup?.role === 'ADMIN'
  // Finance functions (billing runs, all-member invoices, Stripe, schedule,
  // email notices) are open to the TREASURER role as well as ADMIN.
  const isFinance = selectedGroup?.role === 'ADMIN' || selectedGroup?.role === 'TREASURER'

  function getDaysInMonth() {
    const y = currentMonth.getFullYear(), m = currentMonth.getMonth()
    const firstDay = new Date(y, m, 1), lastDay = new Date(y, m + 1, 0)
    const days: (number | null)[] = []
    for (let i = 0; i < firstDay.getDay(); i++) days.push(null)
    for (let i = 1; i <= lastDay.getDate(); i++) days.push(i)
    return days
  }

  function getBookingsForDay(day: number) {
    const y = currentMonth.getFullYear()
    const m = String(currentMonth.getMonth() + 1).padStart(2, '0')
    const d = String(day).padStart(2, '0')
    return bookings.filter(b => b.startTime?.split('T')[0] === `${y}-${m}-${d}`)
  }

  const hasGroups = !groupsLoading && groups.length > 0
  const tabs = [
    'dashboard', 'updates', 'documents', 'calendar', 'bookings', 'aircraft', 'flights', 'maintenance', 'billing', 'members',
    ...(isOwnerOrAdmin ? ['settings'] : []),
  ]

  const [showConvertModal, setShowConvertModal] = useState(false)

  if (!initializing && !cloudUser) {
    return (
      <div className="min-h-screen bg-background pt-[44px] flex items-center justify-center">
        <div className="w-full max-w-sm mx-4">
          <div className="rounded-xl border border-border bg-card p-8 shadow-sm text-center">
            <div className="flex justify-center mb-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
                <Cloud className="h-7 w-7 text-primary" />
              </div>
            </div>
            <h2 className="text-lg font-bold mb-2">Flying Club</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Flying Club syncs in real time with other members and requires a cloud account.
            </p>
            <Button className="w-full" size="lg" onClick={() => setShowConvertModal(true)}>
              <ArrowRight className="mr-2 h-4 w-4" />
              Convert to Online Account
            </Button>
          </div>
        </div>

        <ConvertAccountModal
          open={showConvertModal}
          onClose={() => setShowConvertModal(false)}
          prefillName={mode === 'local' ? localUser?.name || '' : ''}
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pt-[44px]">
      {/* Modals */}
      {showNewGroup && (
        <NewGroupModal
          onClose={() => setShowNewGroup(false)}
          onCreated={g => {
            mutateGroups()
            setSelectedGroupId(g.id)
            setShowNewGroup(false)
            setSuccessMessage(`"${g.name}" created! Add aircraft to start flying.`)
            setActiveTab('aircraft')
          }}
        />
      )}
      {showNewBooking && selectedGroup && (
        <NewBookingModal
          group={selectedGroup}
          onClose={() => setShowNewBooking(false)}
          onCreated={b => {
            mutateBookings()
            setShowNewBooking(false)
          }}
        />
      )}

      {showNewPost && selectedGroup && (
        <NewPostModal
          groupId={selectedGroup.id}
          onClose={() => setShowNewPost(false)}
          onCreated={() => mutatePosts()}
          canEmailNotice={isFinance}
        />
      )}

      {showUploadDocument && selectedGroup && (
        <UploadDocumentModal
          groupId={selectedGroup.id}
          onClose={() => setShowUploadDocument(false)}
          onCreated={() => {
            mutateDocuments()
            setShowUploadDocument(false)
          }}
        />
      )}

      <main className="mx-auto max-w-[1600px] p-6">
        {/* Header */}
        <div className="flex flex-col gap-4 pb-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h1 className="text-xl font-semibold">Flying Club</h1>
            <div className="flex flex-wrap items-center gap-3">
              {groups.length > 1 && (
                <select
                  value={selectedGroupId || ''}
                  onChange={e => setSelectedGroupId(e.target.value)}
                  className="h-8 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              )}
              <Button size="sm" onClick={() => setShowNewGroup(true)}>
                <Plus className="mr-2 h-4 w-4" />
                New Group
              </Button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-0 overflow-x-auto rounded-md border border-border bg-card">
            {tabs.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`relative shrink-0 px-4 py-2.5 text-xs font-medium whitespace-nowrap transition-colors border-b-2 ${
                  activeTab === tab ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Success notification */}
        {successMessage && (
          <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-700 flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            {successMessage}
          </div>
        )}

        {/* Loading */}
        {groupsLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Connection error — distinct from "no clubs yet" so it isn't mistaken for an empty state */}
        {!groupsLoading && groupsError && groups.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-20 text-center">
              <div className="rounded-full bg-muted p-4 mb-4">
                <Cloud className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Flying Club needs a connection</h3>
              <p className="text-sm text-muted-foreground mb-4">Club data is stored in the cloud and couldn&apos;t be reached. Check your connection and try again.</p>
              <Button variant="outline" onClick={() => mutateGroups()}>Retry</Button>
            </CardContent>
          </Card>
        )}

        {/* Empty state */}
        {!groupsLoading && !groupsError && groups.length === 0 && (
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

        {/* ---- DASHBOARD ---- */}
        {hasGroups && activeTab === 'dashboard' && (
          <div className="space-y-6">
            {isOwnerOrAdmin && selectedGroup && (
              <ClubSetupChecklist
                group={selectedGroup}
                membersCount={members.length}
                onGoToTab={setActiveTab}
              />
            )}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Aircraft</CardTitle>
                  <Plane className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{selectedGroup?.aircraft.length ?? '—'}</div>
                  <p className="text-xs text-muted-foreground mt-1">{selectedGroup?.aircraft.filter(a => a.status === 'Available').length ?? 0} available</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Upcoming Bookings</CardTitle>
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{bookingsLoading ? '…' : upcomingBookings.length}</div>
                  <p className="text-xs text-muted-foreground mt-1">{todaysBookings.length > 0 ? `${todaysBookings.length} today` : 'None today'}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Members</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{membersLoading ? '…' : (members.length || '—')}</div>
                  <p className="text-xs text-muted-foreground mt-1">{members.filter(m => m.role === 'ADMIN').length} admin{members.filter(m => m.role === 'ADMIN').length !== 1 ? 's' : ''}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Maintenance</CardTitle>
                  <Wrench className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${maintenance.length > 0 ? 'text-destructive' : ''}`}>{logsLoading ? '…' : maintenance.length}</div>
                  <p className="text-xs text-muted-foreground mt-1">{maintenance.filter(m => m.isGrounded).length} grounded</p>
                </CardContent>
              </Card>
            </div>

            {/* Activity charts */}
            <ClubCharts flightLogs={flightLogs} />

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
                      <div className="flex items-center gap-1.5"><Plane className="h-4 w-4" /><span>{group.aircraft.length} aircraft</span></div>
                    </div>
                    <Separator />
                    <div className="flex-1 space-y-3">
                      {group.aircraft.length === 0 && <p className="text-xs text-muted-foreground">No aircraft added yet.</p>}
                      {group.aircraft.map(a => (
                        <Link
                          key={a.id}
                          href={`/desktop/flying-club/aircraft/${a.id}`}
                          className="flex items-center justify-between rounded-lg border border-border p-3 hover:bg-muted/50 transition-colors"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-sm">{a.nNumber}</p>
                              <Badge variant={a.status === 'Available' ? 'secondary' : 'destructive'} className="text-xs">{a.status || 'Unknown'}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">{[a.make, a.model].filter(Boolean).join(' ')}</p>
                          </div>
                          {a.hourlyRate != null && <p className="text-sm font-semibold">${a.hourlyRate}/hr</p>}
                        </Link>
                      ))}
                    </div>
                    <Button variant="outline" className="w-full mt-auto" onClick={() => { setSelectedGroupId(group.id); setActiveTab('aircraft') }}>
                      View Aircraft
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Upcoming Bookings</CardTitle>
                    <Button variant="ghost" size="sm" onClick={() => setActiveTab('bookings')}>View All</Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {bookingsLoading ? (
                    <p className="text-sm text-muted-foreground">Loading…</p>
                  ) : bookingsError ? (
                    <p className="text-sm text-muted-foreground">Unable to load bookings.</p>
                  ) : upcomingBookings.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No upcoming bookings.</p>
                  ) : null}
                  <div className="space-y-3">
                    {upcomingBookings.map(b => (
                      <div key={b.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm">{acLabel(b.aircraft)}</p>
                            <span className="text-xs text-muted-foreground">·</span>
                            <p className="text-sm text-muted-foreground">{b.user?.name}</p>
                          </div>
                          <p className="text-xs text-muted-foreground">{b.purpose || 'No purpose specified'}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium">{fmt(b.startTime, 'date')}</p>
                          <p className="text-xs text-muted-foreground">{fmt(b.startTime, 'time')}–{fmt(b.endTime, 'time')}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Maintenance</CardTitle>
                    <Button variant="ghost" size="sm" onClick={() => setActiveTab('maintenance')}>View All</Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {logsLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
                  {!logsLoading && maintenance.length === 0 && <p className="text-sm text-muted-foreground">No maintenance items.</p>}
                  <div className="space-y-3">
                    {maintenance.slice(0, 3).map(m => (
                      <div key={m.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm">{m.aircraft?.nNumber}</p>
                            <Badge variant={m.isGrounded ? 'destructive' : 'secondary'} className="text-xs">{m.status}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{m.description}</p>
                        </div>
                        <p className="text-sm font-medium">{fmt(m.reportedDate, 'date')}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* ---- UPDATES ---- */}
        {hasGroups && activeTab === 'updates' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Updates</h2>
              {isAdminOrOfficer && (
                <Button size="sm" onClick={() => setShowNewPost(true)}>
                  <Plus className="mr-2 h-4 w-4" />New Post
                </Button>
              )}
            </div>

            {posts.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="rounded-full bg-muted p-4 mb-4"><BookOpen className="h-8 w-8 text-muted-foreground" /></div>
                  <h3 className="text-lg font-semibold mb-2">No updates yet</h3>
                  <p className="text-sm text-muted-foreground">Check back later for club announcements and news.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {[...posts]
                  .sort((a, b) => {
                    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
                    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                  })
                  .map(post => (
                    <Card key={post.id}>
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            {post.pinned && <Pin className="h-4 w-4 text-primary shrink-0" />}
                            <CardTitle className="text-base">{post.title}</CardTitle>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-muted-foreground">{fmt(post.createdAt, 'date')}</span>
                            {(isAdminOrOfficer || post.authorId === cloudUser?.id) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                aria-label={`Delete post "${post.title}"`}
                                onClick={async () => {
                                  await fetch(`/api/groups/${selectedGroupId}/posts/${post.id}`, { method: 'DELETE' })
                                  mutatePosts()
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                        <CardDescription className="text-xs">by {post.author?.name || post.author?.email}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                          <ReactMarkdown>{post.content}</ReactMarkdown>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* ---- DOCUMENTS ---- */}
        {hasGroups && activeTab === 'documents' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Documents</h2>
              {isAdminOrOfficer && (
                <Button size="sm" onClick={() => setShowUploadDocument(true)}>
                  <Plus className="mr-2 h-4 w-4" />Upload Document
                </Button>
              )}
            </div>

            {documents.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="rounded-full bg-muted p-4 mb-4"><FileText className="h-8 w-8 text-muted-foreground" /></div>
                  <h3 className="text-lg font-semibold mb-2">No documents yet</h3>
                  <p className="text-sm text-muted-foreground">Upload bylaws, forms, manuals, and other club documents.</p>
                </CardContent>
              </Card>
            ) : (
              (() => {
                const grouped = documents.reduce<Record<string, Document[]>>((acc, doc) => {
                  const cat = doc.category || 'general'
                  if (!acc[cat]) acc[cat] = []
                  acc[cat].push(doc)
                  return acc
                }, {})
                return Object.entries(grouped).map(([category, docs]) => (
                  <div key={category} className="space-y-3">
                    <h3 className="text-sm font-medium text-muted-foreground capitalize">{category}</h3>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {docs.map(doc => (
                        <Card key={doc.id}>
                          <CardHeader className="pb-3">
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-2 min-w-0">
                                <FileText className="h-5 w-5 text-primary shrink-0" />
                                <div className="min-w-0">
                                  <CardTitle className="text-sm truncate">{doc.name}</CardTitle>
                                </div>
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-2">
                            {doc.description && (
                              <p className="text-xs text-muted-foreground line-clamp-2">{doc.description}</p>
                            )}
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>{(doc.fileSize / 1024).toFixed(1)} KB</span>
                              <span>{fmt(doc.createdAt, 'date')}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">by {doc.uploader?.name || doc.uploader?.email}</p>
                            <div className="flex gap-2 pt-1">
                              <a
                                href={`/api/groups/${selectedGroupId}/documents/${doc.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex flex-1 items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                              >
                                <Download className="mr-1.5 h-3 w-3" />
                                Download
                              </a>
                              {(isAdminOrOfficer || doc.uploaderId === cloudUser?.id) && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  aria-label={`Delete document "${doc.name}"`}
                                  onClick={async () => {
                                    await fetch(`/api/groups/${selectedGroupId}/documents/${doc.id}`, { method: 'DELETE' })
                                    mutateDocuments()
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                ))
              })()
            )}
          </div>
        )}

        {/* ---- CALENDAR ---- */}
        {hasGroups && activeTab === 'calendar' && (
          <ClubScheduleView
            aircraft={(selectedGroup?.aircraft ?? []).map(a => ({
              id: a.id,
              nNumber: a.nNumber,
              nickname: a.nickname,
              customName: a.customName,
              status: a.status,
            }))}
            bookings={bookings.map(b => ({
              id: b.id,
              aircraftId: b.aircraftId,
              startTime: b.startTime,
              endTime: b.endTime,
              purpose: b.purpose,
              user: b.user ? { id: b.user.id, name: b.user.name } : null,
              instructor: b.instructor ? { id: b.instructor.id, name: b.instructor.name } : null,
            }))}
            blockouts={blockouts}
            onBook={() => setShowNewBooking(true)}
            onSelectBooking={(id) => {
              // Open the booking details modal — the FlightCompleteWizard
              // stays reachable via the modal's "Complete flight" action.
              const b = bookings.find(x => x.id === id)
              if (b) setDetailsBooking(b)
            }}
            onSelectAircraft={(id) => { window.location.href = `/desktop/flying-club/aircraft/${id}` }}
          />
        )}

        {/* ---- BOOKINGS ---- */}
        {hasGroups && activeTab === 'bookings' && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>All Bookings</CardTitle>
                <Button size="sm" onClick={() => setShowNewBooking(true)} disabled={!selectedGroup || selectedGroup.aircraft.length === 0}>
                  <Plus className="mr-2 h-4 w-4" />New Booking
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {bookingsLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : bookingsError ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="rounded-full bg-muted p-4 mb-4"><Calendar className="h-8 w-8 text-muted-foreground" /></div>
                  <h3 className="text-lg font-semibold mb-2">Unable to load bookings</h3>
                  <p className="text-sm text-muted-foreground">{bookingsError?.message || String(bookingsError)}</p>
                </div>
              ) : bookings.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="rounded-full bg-muted p-4 mb-4"><Calendar className="h-8 w-8 text-muted-foreground" /></div>
                  <h3 className="text-lg font-semibold mb-2">No bookings yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">Schedule the first flight for your club.</p>
                  <Button onClick={() => setShowNewBooking(true)} disabled={!selectedGroup || selectedGroup.aircraft.length === 0}><Plus className="mr-2 h-4 w-4" />New Booking</Button>
                </div>
              ) : (
                <div className="space-y-2">
                {bookings.map(b => {
                  const status = bookingStatus(b)
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setDetailsBooking(b)}
                      className="flex w-full items-center justify-between rounded-lg border border-border p-4 text-left hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><Plane className="h-5 w-5 text-primary" /></div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm">{acLabel(b.aircraft)}</p>
                            <Badge variant={status === 'active' ? 'default' : status === 'past' ? 'secondary' : 'outline'} className={`text-xs ${status === 'active' ? 'bg-emerald-500' : ''}`}>{status}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{b.purpose || 'No purpose'}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">{b.user?.name}</p>
                        <p className="text-xs text-muted-foreground">{fmt(b.startTime, 'date')} · {fmt(b.startTime, 'time')}–{fmt(b.endTime, 'time')}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ---- AIRCRAFT ---- */}
        {hasGroups && activeTab === 'aircraft' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Aircraft</h2>
              <Button size="sm" onClick={() => setShowAddAircraft(true)}>
                <Plus className="mr-2 h-4 w-4" />Add Aircraft
              </Button>
            </div>

            {selectedGroup && selectedGroup.aircraft.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="rounded-full bg-muted p-4 mb-4"><Plane className="h-8 w-8 text-muted-foreground" /></div>
                  <h3 className="text-lg font-semibold mb-2">No aircraft yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">Add aircraft to your club to start booking.</p>
                  <Button onClick={() => setShowAddAircraft(true)}>
                    <Plus className="mr-2 h-4 w-4" />Add Your First Aircraft
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {(selectedGroup?.aircraft || []).map(a => (
                  <Card key={a.id}>
                    <Link href={`/desktop/flying-club/aircraft/${a.id}`} className="block hover:bg-muted/50 transition-colors rounded-t-xl">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 flex-wrap">
                          {a.nNumber}
                          <Badge variant={a.status === 'Available' ? 'secondary' : 'destructive'}>{a.status || 'Unknown'}</Badge>
                          {selectedGroup && <AircraftAirworthinessBadge groupId={selectedGroup.id} aircraftId={a.id} />}
                        </CardTitle>
                        <CardDescription>{[a.make, a.model].filter(Boolean).join(' ')}{a.nickname ? ` — "${a.nickname}"` : ''}</CardDescription>
                      </CardHeader>
                    </Link>
                    <CardContent className="space-y-4">
                      {a.hourlyRate != null && (
                        <div className="flex items-center gap-1.5 text-sm"><Clock className="h-4 w-4 text-muted-foreground" /><span>${a.hourlyRate}/hr</span></div>
                      )}
                      <Button variant="outline" className="w-full" onClick={() => setShowNewBooking(true)}>
                        <Calendar className="mr-2 h-4 w-4" />Book
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {showAddAircraft && selectedGroup && (
              <AddAircraftModal
                group={selectedGroup}
                onClose={() => setShowAddAircraft(false)}
                onCreated={ac => {
                  mutateGroups()
                  setShowAddAircraft(false)
                }}
              />
            )}
          </div>
        )}

        {/* ---- FLIGHTS ---- */}
        {hasGroups && activeTab === 'flights' && (
          <Card>
            <CardHeader>
              <CardTitle>Flight Logs</CardTitle>
              <CardDescription>Club flight history</CardDescription>
            </CardHeader>
            <CardContent>
              {logsLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
              {logsError && <p className="text-sm text-destructive">{logsError?.message || String(logsError)}</p>}
              {!logsLoading && !logsError && flightLogs.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="rounded-full bg-muted p-4 mb-4"><BookOpen className="h-8 w-8 text-muted-foreground" /></div>
                  <h3 className="text-lg font-semibold mb-2">No flight logs yet</h3>
                  <p className="text-sm text-muted-foreground">Logs are created when completing a booking.</p>
                </div>
              )}
              <div className="space-y-2">
                {flightLogs.map(log => (
                  <div key={log.id} className="flex items-center justify-between rounded-lg border border-border p-4">
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><Plane className="h-5 w-5 text-primary" /></div>
                      <div className="space-y-1">
                        <p className="font-medium text-sm">{log.aircraft?.nNumber || log.aircraftId}</p>
                        <p className="text-xs text-muted-foreground">{log.user?.name || log.userId}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">{fmt(log.date, 'date')}</p>
                      <p className="text-xs text-muted-foreground">
                        {log.hobbsTime != null && `${log.hobbsTime.toFixed(1)} Hobbs`}
                        {log.hobbsTime != null && log.tachTime != null && ' · '}
                        {log.tachTime != null && `${log.tachTime.toFixed(1)} Tach`}
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
                <CardTitle>Maintenance</CardTitle>
                <Link href="/desktop/flying-club/squawks">
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
                  <div className="rounded-full bg-muted p-4 mb-4"><Wrench className="h-8 w-8 text-muted-foreground" /></div>
                  <h3 className="text-lg font-semibold mb-2">No maintenance items</h3>
                  <p className="text-sm text-muted-foreground">All aircraft are in good standing.</p>
                </div>
              )}
              <div className="space-y-2">
                {maintenance.map(m => (
                  <div key={m.id} className="flex items-center justify-between rounded-lg border border-border p-4">
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
                      <p className="text-sm font-medium">Reported: {fmt(m.reportedDate, 'date')}</p>
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
        {hasGroups && activeTab === 'billing' && selectedGroup && (
          <BillingTab groupId={selectedGroup.id} isFinance={isFinance} aircraft={selectedGroup.aircraft} clubName={selectedGroup.name} />
        )}

        {/* ---- MEMBERS ---- */}
        {hasGroups && activeTab === 'members' && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Members</CardTitle>
                <Button size="sm" onClick={() => setShowInviteMember(true)}>
                  <Plus className="mr-2 h-4 w-4" />Invite Member
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {membersLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : membersError ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="rounded-full bg-muted p-4 mb-4"><Users className="h-8 w-8 text-muted-foreground" /></div>
                  <h3 className="text-lg font-semibold mb-2">Unable to load members</h3>
                  <p className="text-sm text-muted-foreground">{membersError?.message || String(membersError)}</p>
                </div>
              ) : members.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="rounded-full bg-muted p-4 mb-4"><Users className="h-8 w-8 text-muted-foreground" /></div>
                  <h3 className="text-lg font-semibold mb-2">No members found</h3>
                  <p className="text-sm text-muted-foreground mb-4">Invite pilots to join your club.</p>
                  <Button onClick={() => setShowInviteMember(true)}>
                    <Plus className="mr-2 h-4 w-4" />Invite Your First Member
                  </Button>
                </div>
              ) : (
              <div className="space-y-2">
                {members.map(m => (
                  <div key={m.id} className="flex items-center justify-between rounded-lg border border-border p-4">
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                        <span className="text-sm font-semibold text-primary">{(m.user?.name || m.user?.email || '?').charAt(0).toUpperCase()}</span>
                      </div>
                      <div className="space-y-1">
                        <p className="font-medium text-sm">{m.user?.name || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground">{m.user?.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={m.role === 'ADMIN' || m.role === 'TREASURER' ? 'default' : 'secondary'} className="text-xs capitalize">
                        {m.role.toLowerCase()}
                      </Badge>
                      <p className="text-xs text-muted-foreground hidden sm:block">Joined {fmt(m.joinedAt, 'date')}</p>
                    </div>
                  </div>
                ))}
              </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ---- SETTINGS ---- */}
        {hasGroups && activeTab === 'settings' && isOwnerOrAdmin && selectedGroup && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Club Settings</CardTitle>
                <CardDescription>Basic details for {selectedGroup.name}.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between border-b border-border py-2">
                  <span className="text-muted-foreground">Name</span>
                  <span className="font-medium">{selectedGroup.name}</span>
                </div>
                <div className="flex items-center justify-between border-b border-border py-2">
                  <span className="text-muted-foreground">Type</span>
                  <span className="font-medium capitalize">{selectedGroup.type}</span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-muted-foreground">Your Role</span>
                  <Badge variant="default" className="text-xs">{selectedGroup.role}</Badge>
                </div>
              </CardContent>
            </Card>

            <BookingPolicyCard groupId={selectedGroup.id} />

            {/* PaymentsCard lives in the Billing tab so treasurers can reach it. */}

            <Card className="border-destructive/40">
              <CardHeader>
                <CardTitle className="text-destructive">Danger Zone</CardTitle>
                <CardDescription>Irreversible actions for this club.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-3 rounded-lg border border-destructive/30 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium">Delete this club</p>
                    <p className="text-xs text-muted-foreground">
                      Permanently deletes the club, its aircraft records, bookings, and member associations.
                    </p>
                  </div>
                  <Button variant="destructive" size="sm" onClick={() => setShowDeleteClub(true)}>
                    <Trash2 className="mr-2 h-4 w-4" />Delete Club
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {showInviteMember && selectedGroup && (
          <InviteMemberModal
            group={selectedGroup}
            onClose={() => setShowInviteMember(false)}
            onAdded={() => mutateMembers()}
          />
        )}

        {showDeleteClub && selectedGroup && (
          <DeleteClubModal
            group={selectedGroup}
            onClose={() => setShowDeleteClub(false)}
            onDeleted={() => {
              const deletedId = selectedGroup.id
              const deletedName = selectedGroup.name
              const remaining = groups.filter(g => g.id !== deletedId)
              mutateGroups(remaining, { revalidate: true })
              setSelectedGroupId(remaining[0]?.id ?? null)
              setActiveTab('dashboard')
              setShowDeleteClub(false)
              setSuccessMessage(`"${deletedName}" was deleted.`)
            }}
          />
        )}

        {detailsBooking && selectedGroup && (
          <BookingDetailsModal
            booking={detailsBooking}
            groupId={selectedGroup.id}
            aircraftStatus={selectedGroup.aircraft.find(a => a.id === detailsBooking.aircraftId)?.status ?? null}
            // Own-booking identity: the row's userId is a pilotProfileId, so
            // compare the joined user record against the signed-in cloud user.
            isOwn={!!cloudUser?.id && detailsBooking.user?.id === cloudUser.id}
            isAdmin={isOwnerOrAdmin}
            onClose={() => setDetailsBooking(null)}
            onCancelled={() => {
              setDetailsBooking(null)
              mutateBookings()
              setSuccessMessage('Booking cancelled.')
            }}
            onCompleteFlight={() => {
              const b = detailsBooking
              setDetailsBooking(null)
              startCompleteFlight(b)
            }}
          />
        )}

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
