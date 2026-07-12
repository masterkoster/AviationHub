'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import ReactMarkdown from 'react-markdown'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import { cloudSignIn } from '@/apps/desktop/src/lib/cloud-session'
import { completeSetup } from '@/desktop/lib/setup'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Plane, Calendar, Users, Wrench, DollarSign, Clock,
  AlertCircle, Plus, ChevronLeft, ChevronRight,
  BookOpen, X, Loader2, Cloud, ArrowRight, ArrowLeft,
  FileText, Download, Trash2, Pin, CheckCircle2,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Create New Group</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
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
              <label className="text-sm font-medium">Name</label>
              <input
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
              <label className="text-sm font-medium">Name *</label>
              <input
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={clubName}
                onChange={e => setClubName(e.target.value)}
                placeholder="e.g. Sky High Flying Club"
                onKeyDown={e => e.key === 'Enter' && handleCreateClub()}
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm font-medium">Club Size</label>
              <select
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
              <label className="text-sm font-medium">Home Airport</label>
              <input
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
              <label className="text-sm font-medium">Website</label>
              <input
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={website}
                onChange={e => setWebsite(e.target.value)}
                placeholder="yourclub.com"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Contact email <span className="font-normal text-muted-foreground">(optional)</span></label>
              <input
                type="email"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={contactEmail}
                onChange={e => setContactEmail(e.target.value)}
                placeholder="info@yourclub.com"
              />
              <p className="mt-1 text-xs text-muted-foreground">Shown publicly so pilots can reach your club</p>
            </div>
            <div>
              <label className="text-sm font-medium">Bio</label>
              <textarea
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
      if (!res.ok) { setError(data.error || 'Failed to create booking'); return }
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
            <label className="text-sm font-medium">Date</label>
            <input type="date" className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Start Time</label>
              <input type="time" className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={startTime} onChange={e => setStartTime(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">End Time</label>
              <input type="time" className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={endTime} onChange={e => setEndTime(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Purpose (optional)</label>
            <input
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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

// ---- ConvertAccountModal ----

function ConvertAccountModal({ open, onClose, prefillName }: {
  open: boolean
  onClose: () => void
  prefillName: string
}) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
        {view === 'convert' ? (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Convert to Online Account</h2>
              <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
            </div>
            <form onSubmit={handleSignup} className="space-y-4">
              <div>
                <label className="text-sm font-medium">Name</label>
                <input
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Your name"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="text-sm font-medium">Email</label>
                <input
                  type="email"
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Username</label>
                <div className="relative mt-1">
                  <input
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
                    {!usernameChecking && usernameAvailable === true && <span className="text-emerald-500 text-sm">✓</span>}
                    {!usernameChecking && usernameAvailable === false && <span className="text-destructive text-sm">✗</span>}
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
                <label className="text-sm font-medium">Password</label>
                <input
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
              <h2 className="text-lg font-semibold">Sign In</h2>
              <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
            </div>
            <form onSubmit={handleSignin} className="space-y-4">
              <div>
                <label className="text-sm font-medium">Username or Email</label>
                <input
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
                <label className="text-sm font-medium">Password</label>
                <input
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Add Aircraft — {group.name}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">N-Number *</label>
            <input
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
              <label className="text-sm font-medium">Make</label>
              <input
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={make}
                onChange={e => setMake(e.target.value)}
                placeholder="Cessna"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Model</label>
              <input
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={model}
                onChange={e => setModel(e.target.value)}
                placeholder="172S"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Nickname</label>
              <input
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={nickname}
                onChange={e => setNickname(e.target.value)}
                placeholder="My Skyhawk"
                maxLength={100}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Custom Name</label>
              <input
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
              <label className="text-sm font-medium">Year</label>
              <input
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
              <label className="text-sm font-medium">Hourly Rate ($)</label>
              <input
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Invite Member — {group.name}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
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
              <label className="text-sm font-medium">Email Address</label>
              <input
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-destructive">Delete {group.name}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-4">
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            This permanently deletes the club, its aircraft records, bookings, and member associations. This cannot be undone.
          </div>
          <div>
            <label className="text-sm font-medium">
              Type <span className="font-mono font-semibold">delete</span> to confirm
            </label>
            <input
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

function NewPostModal({ groupId, onClose, onCreated }: {
  groupId: string
  onClose: () => void
  onCreated: () => void
}) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [pinned, setPinned] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState(false)

  async function handleSubmit() {
    if (!title.trim() || !content.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/groups/${groupId}/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), content, pinned }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to create post'); return }
      onCreated()
    } catch { setError('Network error') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">New Post</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Title</label>
            <input className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={title} onChange={e => setTitle(e.target.value)} placeholder="Announcement title" autoFocus />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Content (Markdown)</label>
              <button type="button" onClick={() => setPreview(!preview)} className="text-xs text-muted-foreground hover:text-foreground underline">
                {preview ? 'Edit' : 'Preview'}
              </button>
            </div>
            {preview ? (
              <div className="mt-1 min-h-[200px] rounded-md border border-input bg-background px-3 py-2 text-sm prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown>{content || '*No content*'}</ReactMarkdown>
              </div>
            ) : (
              <textarea className="mt-1 w-full min-h-[200px] rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" value={content} onChange={e => setContent(e.target.value)} placeholder="Write in Markdown…" />
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} className="rounded" />
            Pin this post
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving || !title.trim() || !content.trim()}>
              {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Posting…</> : 'Publish'}
            </Button>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Upload Document</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">File *</label>
            <input type="file" className="mt-1 w-full text-sm" onChange={e => { const f = e.target.files?.[0]; setFile(f || null); if (f && !name) setName(f.name) }} />
          </div>
          <div>
            <label className="text-sm font-medium">Name</label>
            <input className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={name} onChange={e => setName(e.target.value)} placeholder="Document name" />
          </div>
          <div>
            <label className="text-sm font-medium">Description</label>
            <input className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description" />
          </div>
          <div>
            <label className="text-sm font-medium">Category</label>
            <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={category} onChange={e => setCategory(e.target.value)}>
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
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Auto-dismiss success message
  useEffect(() => {
    if (!successMessage) return
    const t = setTimeout(() => setSuccessMessage(null), 4000)
    return () => clearTimeout(t)
  }, [successMessage])

  // ---- Derived state ----

  const today = new Date().toISOString().split('T')[0]
  const todaysBookings = bookings.filter(b => b.startTime?.split('T')[0] === today)
  const upcomingBookings = bookings.filter(b => bookingStatus(b) !== 'past').slice(0, 5)

  const isAdminOrOfficer = selectedGroup?.role === 'ADMIN' || selectedGroup?.role === 'OFFICER'
  const isOwnerOrAdmin = selectedGroup?.role === 'ADMIN'

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
    'dashboard', 'updates', 'documents', 'calendar', 'bookings', 'aircraft', 'flights', 'maintenance', 'members',
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
          onCreated={() => {
            mutatePosts()
            setShowNewPost(false)
          }}
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
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Flight Schedule</CardTitle>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button>
                  <span className="text-sm font-medium w-36 text-center">{MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear()}</span>
                  <Button variant="outline" size="icon" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4" /></Button>
                  <Button size="sm" onClick={() => setShowNewBooking(true)} disabled={!selectedGroup || selectedGroup.aircraft.length === 0}>
                    <Plus className="mr-2 h-4 w-4" />Book
                  </Button>
                  {todaysBookings.length > 0 && (
                    <select
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                      onChange={e => {
                        const b = todaysBookings.find(x => x.id === e.target.value)
                        if (b) { setActiveFlight({ id: b.id, aircraftId: b.aircraftId, aircraftName: acLabel(b.aircraft), userId: b.userId, userName: b.user?.name || 'Unknown', hobbsStart: 0, date: b.startTime?.split('T')[0], time: fmt(b.startTime, 'time') }); setShowFlightComplete(true) }
                      }}
                      defaultValue=""
                    >
                      <option value="" disabled>Complete flight…</option>
                      {todaysBookings.map(b => <option key={b.id} value={b.id}>{acLabel(b.aircraft)} – {b.user?.name} ({fmt(b.startTime, 'time')})</option>)}
                    </select>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
                  {DAYS.map(d => <div key={d} className="bg-card p-3 text-center"><span className="text-xs font-medium text-muted-foreground">{d}</span></div>)}
                </div>
                <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
                  {getDaysInMonth().map((day, idx) => {
                    const dayBookings = day ? getBookingsForDay(day) : []
                    return (
                      <div key={idx} className={`bg-card min-h-[100px] p-2 ${day ? 'hover:bg-muted/50 cursor-pointer transition-colors' : ''}`}>
                        {day && (
                          <>
                            <span className="text-sm font-medium">{day}</span>
                            {dayBookings.length > 0 && (
                              <div className="mt-2 space-y-1">
                                {dayBookings.slice(0, 3).map(b => (
                                  <div key={b.id} className="rounded bg-primary/10 border border-primary/20 px-2 py-1">
                                    <p className="text-xs font-medium text-primary truncate">{b.aircraft?.nNumber}</p>
                                    <p className="text-xs text-muted-foreground">{fmt(b.startTime, 'time')}</p>
                                  </div>
                                ))}
                                {dayBookings.length > 3 && <p className="text-xs text-muted-foreground">+{dayBookings.length - 3} more</p>}
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
                    <div key={b.id} className="flex items-center justify-between rounded-lg border border-border p-4">
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
                    </div>
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
                      <Badge variant={m.role === 'ADMIN' ? 'default' : 'secondary'} className="text-xs">{m.role}</Badge>
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
