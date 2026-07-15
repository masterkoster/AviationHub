'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  Plane, Users, Wrench, DollarSign, Clock, AlertTriangle, CheckCircle2,
  ChevronRight, Search, Download, Plus, Settings, Bell, Shield,
  Calendar, FileText, BarChart3, BookOpen, Fuel, MapPin, CreditCard,
  UserCheck, UserX, ToggleLeft, Megaphone, Lock, Sliders, Mail,
  RefreshCw, MoreHorizontal, TrendingUp, TrendingDown, Activity
} from "lucide-react"
import { AreaChart, Area, BarChart, Bar, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts"

// ── Mock data (used as fallback until APIs wired) ─────────────────────────────

const mockClub = {
  name: "Sky High Flying Club",
  icao: "KBOS",
  founded: "2018",
  members: 24,
  aircraft: 4,
  plan: "Pro",
}

const mockMembers = [
  { id: 1, name: "James Carter",    email: "james@example.com",  role: "Owner",   status: "Active",    hours: 412.3, balance: 0,     joined: "Jan 2020", medical: "May 2025" },
  { id: 2, name: "Sarah Johnson",   email: "sarah@example.com",  role: "Instructor", status: "Active", hours: 890.1, balance: -120,  joined: "Mar 2020", medical: "Aug 2025" },
  { id: 3, name: "Mike Wilson",     email: "mike@example.com",   role: "Member",  status: "Active",    hours: 67.4,  balance: 240,   joined: "Jun 2021", medical: "Oct 2024" },
  { id: 4, name: "Emily Davis",     email: "emily@example.com",  role: "Member",  status: "Active",    hours: 134.8, balance: 0,     joined: "Sep 2021", medical: "Dec 2024" },
  { id: 5, name: "Tom Reynolds",    email: "tom@example.com",    role: "Member",  status: "Suspended", hours: 22.1,  balance: -480,  joined: "Feb 2022", medical: "Mar 2025" },
  { id: 6, name: "Lisa Park",       email: "lisa@example.com",   role: "Admin",   status: "Active",    hours: 203.5, balance: 60,    joined: "Apr 2022", medical: "Jun 2025" },
  { id: 7, name: "Dan Ortega",      email: "dan@example.com",    role: "Member",  status: "Pending",   hours: 0,     balance: 0,     joined: "Feb 2024", medical: "—" },
]

const mockAircraft = [
  { id: "a1", nNumber: "N172SP", nickname: "Skyhawk",  make: "Cessna",  model: "172S",       year: 2021, status: "Available",   rate: 165, hobbs: 98.2,   nextMx: "Mar 15, 2024", mxHours: 8.5 },
  { id: "a2", nNumber: "N9876P", nickname: "Warrior",  make: "Piper",   model: "PA-28-161",  year: 2019, status: "Maintenance", rate: 145, hobbs: 1842.3, nextMx: "Now",          mxHours: 0 },
  { id: "a3", nNumber: "N345AB", nickname: "Cherokee", make: "Piper",   model: "PA-32-300",  year: 1978, status: "Available",   rate: 135, hobbs: 4890.5, nextMx: "Jun 20, 2024", mxHours: 98.2 },
  { id: "a4", nNumber: "N5501X", nickname: "Arrow",    make: "Piper",   model: "PA-28R-201", year: 2003, status: "Reserved",    rate: 175, hobbs: 2201.7, nextMx: "Aug 10, 2024", mxHours: 156 },
]

const mockDispatched = [
  { id: "d1", pilot: "Sarah Johnson", aircraft: "N172SP", departed: "14:02",  eta: "16:30", route: "KBOS → KALB → KBOS", fuel: 28, status: "Airborne" },
  { id: "d2", pilot: "Emily Davis",   aircraft: "N5501X", departed: "13:45",  eta: "15:45", route: "KBOS → KMVY",         fuel: 18, status: "Airborne" },
]

const mockAwaitingDispatch = [
  { id: "w1", pilot: "Mike Wilson",  aircraft: "N345AB", plannedDep: "17:30", route: "KBOS → KACK",  filed: "10:22 AM" },
  { id: "w2", pilot: "Dan Ortega",   aircraft: "N172SP", plannedDep: "18:00", route: "KBOS Local",   filed: "12:55 PM" },
]

const mockPastFlights = [
  { id: "f1", pilot: "James Carter",  aircraft: "N172SP", date: "Feb 22", hobbs: 1.8,  route: "KBOS → KEDU → KBOS",  cost: 297 },
  { id: "f2", pilot: "Sarah Johnson", aircraft: "N345AB", date: "Feb 21", hobbs: 2.5,  route: "KBOS → KALB → KBOS",  cost: 338 },
  { id: "f3", pilot: "Lisa Park",     aircraft: "N172SP", date: "Feb 20", hobbs: 1.2,  route: "KBOS Local",           cost: 198 },
  { id: "f4", pilot: "Emily Davis",   aircraft: "N5501X", date: "Feb 19", hobbs: 3.1,  route: "KBOS → KPVD → KBOS",  cost: 543 },
  { id: "f5", pilot: "Mike Wilson",   aircraft: "N172SP", date: "Feb 18", hobbs: 1.0,  route: "KBOS Local",           cost: 165 },
]

const mockMaintenance = [
  { id: "m1", aircraft: "N9876P", item: "Annual Inspection",   status: "In Progress", due: "Mar 15", priority: "high",   shop: "Boston Avionics" },
  { id: "m2", aircraft: "N172SP", item: "Oil Change",          status: "Due",         due: "Mar 1",  priority: "urgent", shop: "—" },
  { id: "m3", aircraft: "N345AB", item: "100-Hour Inspection", status: "Scheduled",   due: "Jun 20", priority: "medium", shop: "Logan FBO" },
  { id: "m4", aircraft: "N5501X", item: "ELT Battery",         status: "OK",          due: "Aug 10", priority: "low",    shop: "—" },
]

const mockPendingFuelExpenses = [
  { id: "f1", pilot: "Sarah Johnson", aircraft: "N172SP", date: "Feb 22", gallons: 18.5, pricePerGal: 5.89, total: 108.97, status: "PENDING", submittedAt: "Feb 22, 2026 4:30 PM" },
  { id: "f2", pilot: "Mike Wilson", aircraft: "N345AB", date: "Feb 21", gallons: 22.3, pricePerGal: 5.75, total: 128.23, status: "PENDING", submittedAt: "Feb 21, 2026 6:15 PM" },
  { id: "f3", pilot: "Emily Davis", aircraft: "N5501X", date: "Feb 19", gallons: 35.0, pricePerGal: 5.95, total: 208.25, status: "PENDING", submittedAt: "Feb 19, 2026 8:45 PM" },
  { id: "f4", pilot: "James Carter", aircraft: "N172SP", date: "Feb 18", gallons: 16.2, pricePerGal: 5.89, total: 95.42, status: "APPROVED", submittedAt: "Feb 18, 2026 3:20 PM" },
]

const mockPendingMaintenanceIssues = [
  { id: "mx1", pilot: "Sarah Johnson", aircraft: "N172SP", date: "Feb 22", issue: "Low oil pressure indication during climb", category: "Engine", isPlaneSpecific: true, severity: "high", status: "Pending Review", flightId: "flt-001" },
  { id: "mx2", pilot: "Mike Wilson", aircraft: "N345AB", date: "Feb 20", issue: "Landing gear retract light intermittent", category: "Avionics", isPlaneSpecific: true, severity: "medium", status: "Pending Review", flightId: "flt-002" },
  { id: "mx3", pilot: "Emily Davis", aircraft: "N172SP", date: "Feb 18", issue: "Flap actuator making noise", category: "Airframe", isPlaneSpecific: false, severity: "low", status: "Pending Review", flightId: "flt-003" },
]

// Maintenance history for each aircraft
const mockMaintenanceHistory = {
  "N172SP": [
    { id: "h1", date: "Feb 15, 2026", item: "Oil Change", type: "Scheduled", status: "Completed", cost: 150, hobbs: 1250.0, shop: "Self" },
    { id: "h2", date: "Jan 20, 2026", item: "Annual Inspection", type: "Scheduled", status: "Completed", cost: 2800, hobbs: 1200.5, shop: "Boston Avionics" },
    { id: "h3", date: "Dec 5, 2025", item: "Altimeter Calibration", type: "AD Compliance", status: "Completed", cost: 450, hobbs: 1150.2, shop: "Boston Avionics" },
    { id: "h4", date: "Oct 18, 2025", item: "Brake Pad Replacement", type: "Unscheduled", status: "Completed", cost: 380, hobbs: 1100.0, shop: "Logan FBO" },
    { id: "h5", date: "Aug 22, 2025", item: "100-Hour Inspection", type: "Scheduled", status: "Completed", cost: 1850, hobbs: 1000.3, shop: "Boston Avionics" },
  ],
  "N345AB": [
    { id: "h1", date: "Jan 10, 2026", item: "Annual Inspection", type: "Scheduled", status: "Completed", cost: 3200, hobbs: 4890.5, shop: "Pittsburgh Aviation" },
    { id: "h2", date: "Nov 15, 2025", item: "Engine Overhaul", type: "Major", status: "Completed", cost: 18500, hobbs: 4500.0, shop: "Continental Motors" },
    { id: "h3", date: "Sep 3, 2025", item: "Fuel Selector Repair", type: "Unscheduled", status: "Completed", cost: 275, hobbs: 4200.2, shop: "Pittsburgh Aviation" },
  ],
  "N9876P": [
    { id: "h1", date: "Mar 1, 2026", item: "Annual Inspection", type: "Scheduled", status: "In Progress", cost: 0, hobbs: 1842.3, shop: "Boston Avionics" },
    { id: "h2", date: "Aug 15, 2025", item: "100-Hour Inspection", type: "Scheduled", status: "Completed", cost: 1650, hobbs: 1700.0, shop: "Boston Avionics" },
    { id: "h3", date: "Jun 20, 2025", item: "New Tires", type: "Scheduled", status: "Completed", cost: 320, hobbs: 1600.5, shop: "Logan FBO" },
  ],
  "N5501X": [
    { id: "h1", date: "Dec 10, 2025", item: "Annual Inspection", type: "Scheduled", status: "Completed", cost: 3500, hobbs: 2201.7, shop: "Garmin Service" },
    { id: "h2", date: "Jul 22, 2025", item: "GPS Update", type: "AD Compliance", status: "Completed", cost: 850, hobbs: 2000.0, shop: "Garmin Service" },
  ],
}

const mockBilling = [
  { id: "b1", member: "Mike Wilson",   type: "Flight",          aircraft: "N172SP", date: "Feb 22", amount: 297,  status: "Paid" },
  { id: "b2", member: "Tom Reynolds",  type: "Monthly Dues",    aircraft: "—",      date: "Feb 1",  amount: 120,  status: "Overdue" },
  { id: "b3", member: "Emily Davis",   type: "Flight",          aircraft: "N5501X", date: "Feb 19", amount: 543,  status: "Paid" },
  { id: "b4", member: "Dan Ortega",    type: "Joining Fee",     aircraft: "—",      date: "Feb 10", amount: 500,  status: "Paid" },
  { id: "b5", member: "Tom Reynolds",  type: "Flight",          aircraft: "N172SP", date: "Jan 28", amount: 198,  status: "Overdue" },
]

const flightHoursData = [
  { month: "Sep", hours: 42 }, { month: "Oct", hours: 56 }, { month: "Nov", hours: 38 },
  { month: "Dec", hours: 61 }, { month: "Jan", hours: 49 }, { month: "Feb", hours: 58 },
]

const revenueData = [
  { month: "Sep", revenue: 6800 }, { month: "Oct", revenue: 8900 }, { month: "Nov", revenue: 6100 },
  { month: "Dec", revenue: 9600 }, { month: "Jan", revenue: 7400 }, { month: "Feb", revenue: 9200 },
]

// ── Types ──────────────────────────────────────────────────────────────────────

type Tab =
  | "overview"
  | "awaiting-dispatch" | "currently-dispatched" | "past-flights"
  | "members" | "instructors" | "administrators" | "groups"
  | "aircraft" | "items" | "adjustments" | "forms"
  | "billing" | "invoices"
  | "fuel-approvals" | "maintenance-reviews"
  | "general-settings" | "member-settings" | "schedule-settings"
  | "notification-settings" | "add-ons"

type NavItem  = { id: Tab; label: string }
type NavGroup = { label: string; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Flights",
    items: [
      { id: "overview",              label: "Overview" },
      { id: "awaiting-dispatch",     label: "Awaiting Dispatch" },
      { id: "currently-dispatched",  label: "Currently Dispatched" },
      { id: "past-flights",          label: "Past Flights" },
    ],
  },
  {
    label: "Approvals",
    items: [
      { id: "fuel-approvals",        label: "Fuel Expenses" },
      { id: "maintenance-reviews",   label: "Maintenance Issues" },
    ],
  },
  {
    label: "People",
    items: [
      { id: "members",        label: "Members" },
      { id: "instructors",    label: "Instructors" },
      { id: "administrators", label: "Administrators" },
      { id: "groups",         label: "Groups" },
    ],
  },
  {
    label: "Resources",
    items: [
      { id: "aircraft",    label: "Aircraft" },
      { id: "items",       label: "Items" },
      { id: "adjustments", label: "Adjustments" },
      { id: "forms",       label: "Forms" },
    ],
  },
  {
    label: "Billing",
    items: [
      { id: "billing",  label: "Transactions" },
      { id: "invoices", label: "Invoices" },
    ],
  },
  {
    label: "Settings",
    items: [
      { id: "general-settings",      label: "General Settings" },
      { id: "member-settings",       label: "Member Settings" },
      { id: "schedule-settings",     label: "Schedule Settings" },
      { id: "notification-settings", label: "Notification Settings" },
      { id: "add-ons",               label: "Add-ons" },
    ],
  },
]

// ── Helpers ────────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    Active:      "bg-chart-2/10 text-chart-2 border-chart-2/30",
    Available:   "bg-chart-2/10 text-chart-2 border-chart-2/30",
    Airborne:    "bg-primary/10  text-primary  border-primary/30",
    Paid:        "bg-chart-2/10 text-chart-2 border-chart-2/30",
    Maintenance: "bg-chart-3/10 text-chart-3 border-chart-3/30",
    "In Progress":"bg-chart-3/10 text-chart-3 border-chart-3/30",
    Reserved:    "bg-chart-4/10 text-chart-4 border-chart-4/30",
    Scheduled:   "bg-chart-4/10 text-chart-4 border-chart-4/30",
    Suspended:   "bg-destructive/10 text-destructive border-destructive/30",
    Overdue:     "bg-destructive/10 text-destructive border-destructive/30",
    Due:         "bg-destructive/10 text-destructive border-destructive/30",
    urgent:      "bg-destructive/10 text-destructive border-destructive/30",
    Pending:     "bg-muted text-muted-foreground border-border",
    Admin:       "bg-primary/10  text-primary  border-primary/30",
    Treasurer:   "bg-primary/10  text-primary  border-primary/30",
    OK:          "bg-chart-2/10 text-chart-2 border-chart-2/30",
    low:         "bg-muted text-muted-foreground border-border",
    medium:      "bg-chart-3/10 text-chart-3 border-chart-3/30",
    high:        "bg-destructive/10 text-destructive border-destructive/30",
  }
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${map[status] ?? "bg-muted text-muted-foreground border-border"}`}>
      {status}
    </span>
  )
}

function PipelineStage({
  label,
  value,
  sublabel,
  progress,
}: {
  label: string
  value: string
  sublabel: string
  progress: number
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="text-sm font-medium">{value}</p>
          <p className="text-[11px] text-muted-foreground">{sublabel}</p>
        </div>
        <div className="h-2 w-14 rounded-full bg-muted/50 overflow-hidden">
          <div
            className="h-full rounded-full bg-primary animate-pulse"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
      <div className="mt-2">
        <Progress value={progress} className="h-1.5" />
      </div>
    </div>
  )
}

function PlaceholderPanel({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 py-24 text-center">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 max-w-xs text-xs text-muted-foreground">{description}</p>
    </div>
  )
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function ClubAdminPage() {
  const { data: session } = useSession()

  const [activeTab, setActiveTab] = useState<Tab>("overview")
  const [memberSearch, setMemberSearch] = useState("")
  const [selectedAircraft, setSelectedAircraft] = useState<string | null>(null)
  const [groupId, setGroupId] = useState<string | null>(null)
  const [adminGroups, setAdminGroups] = useState<any[]>([])
  const [showGroupPicker, setShowGroupPicker] = useState(false)
  const [isGroupsLoading, setIsGroupsLoading] = useState(false)

  // Live data state (with mock fallbacks)
  const [club, setClub] = useState(mockClub)
  const [members, setMembers] = useState<any[]>(mockMembers)
  const [aircraft, setAircraft] = useState<any[]>(mockAircraft)
  const [awaitingDispatch, setAwaitingDispatch] = useState<any[]>(mockAwaitingDispatch)
  const [dispatched, setDispatched] = useState<any[]>(mockDispatched)
  const [pastFlights, setPastFlights] = useState<any[]>(mockPastFlights)
  const [billing, setBilling] = useState<any[]>(mockBilling)
  const [fuelExpenses, setFuelExpenses] = useState<any[]>(mockPendingFuelExpenses)
  const [maintenanceIssues, setMaintenanceIssues] = useState<any[]>(mockPendingMaintenanceIssues)
  const [maintenanceHistory, setMaintenanceHistory] = useState<Record<string, any[]>>(mockMaintenanceHistory as any)

  // Loading / error flags
  const [isMembersLoading, setIsMembersLoading] = useState(false)
  const [membersError, setMembersError] = useState<string | null>(null)
  const [membersRefreshTick, setMembersRefreshTick] = useState(0)

  // Invites
  const [invites, setInvites] = useState<any[]>([])
  const [showInviteDialog, setShowInviteDialog] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState("MEMBER")
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [isInviteSubmitting, setIsInviteSubmitting] = useState(false)

  // Manage member
  const [manageMember, setManageMember] = useState<any | null>(null)
  const [manageError, setManageError] = useState<string | null>(null)
  const [isManageSubmitting, setIsManageSubmitting] = useState(false)

  const [isFuelLoading, setIsFuelLoading] = useState(false)
  const [fuelError, setFuelError] = useState<string | null>(null)
  const [fuelActionId, setFuelActionId] = useState<string | null>(null)

  const [isIssuesLoading, setIsIssuesLoading] = useState(false)
  const [issuesError, setIssuesError] = useState<string | null>(null)
  const [maintenanceActionId, setMaintenanceActionId] = useState<string | null>(null)

  const [isBillingLoading, setIsBillingLoading] = useState(false)
  const [billingError, setBillingError] = useState<string | null>(null)

  const [isFlightsLoading, setIsFlightsLoading] = useState(false)
  const [flightsError, setFlightsError] = useState<string | null>(null)

  const [isHistoryLoading, setIsHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [pipelineTick, setPipelineTick] = useState(0)

  // Determine admin group
  useEffect(() => {
    let cancelled = false

    async function loadGroups() {
      try {
        setIsGroupsLoading(true)
        const res = await fetch("/api/groups")
        if (!res.ok) return
        const data = await res.json()
        const groups = Array.isArray(data) ? data : data?.groups
        if (!Array.isArray(groups) || groups.length === 0) return

        const eligible = groups.filter((g: any) => g.role === "ADMIN" || g.role === "OWNER")
        const candidates = eligible.length > 0 ? eligible : groups
        if (cancelled) return

        setAdminGroups(candidates)

        const storedGroupId = typeof window !== 'undefined'
          ? window.localStorage.getItem('clubAdminGroupId')
          : null
        const storedGroup = storedGroupId
          ? candidates.find((g: any) => g.id === storedGroupId)
          : null

        if (storedGroup) {
          setGroupId(storedGroup.id)
          setClub(prev => ({
            ...prev,
            name: storedGroup.name ?? prev.name,
          }))
          return
        }

        if (candidates.length === 1) {
          const selected = candidates[0]
          setGroupId(selected.id)
          setClub(prev => ({
            ...prev,
            name: selected.name ?? prev.name,
          }))
          if (typeof window !== 'undefined') {
            window.localStorage.setItem('clubAdminGroupId', selected.id)
          }
        } else if (candidates.length > 1) {
          setShowGroupPicker(true)
        }
      } catch (err) {
        console.error("Failed to load groups for admin page", err)
      } finally {
        if (!cancelled) setIsGroupsLoading(false)
      }
    }

    loadGroups()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setPipelineTick(prev => (prev + 7) % 100)
    }, 1200)
    return () => clearInterval(interval)
  }, [])

  function handleSelectGroup(group: any) {
    setGroupId(group.id)
    setClub(prev => ({
      ...prev,
      name: group.name ?? prev.name,
    }))
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('clubAdminGroupId', group.id)
    }
    setShowGroupPicker(false)
  }

  // Members
  useEffect(() => {
    if (!groupId) return
    let cancelled = false

    async function loadMembers() {
      try {
        setIsMembersLoading(true)
        setMembersError(null)

        const res = await fetch(`/api/groups/${groupId}/members`)
        if (!res.ok) throw new Error(`Failed to fetch members: ${res.status}`)
        const data = await res.json()
        const nextMembers = (Array.isArray(data) ? data : []).map((m: any) => ({
          id: m.id,
          userId: m.userId,
          name: m.user?.name || m.user?.email || "Unknown",
          email: m.user?.email ?? "—",
          role: m.role === "ADMIN" ? "Admin" : m.role === "TREASURER" ? "Treasurer" : m.role === "INSTRUCTOR" ? "Instructor" : "Member",
          rawRole: m.role,
          status: "Active",
          hours: null,
          balance: 0,
          medical: "—",
          joined: m.joinedAt ? new Date(m.joinedAt).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : "—",
        }))
        if (!cancelled) setMembers(nextMembers)
      } catch (err) {
        console.error("Failed to load members", err)
        if (!cancelled) {
          setMembersError("Failed to load members. Showing sample data.")
          setMembers(mockMembers)
        }
      } finally {
        if (!cancelled) setIsMembersLoading(false)
      }
    }

    async function loadInvites() {
      try {
        const res = await fetch(`/api/groups/${groupId}/invites`)
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) setInvites(Array.isArray(data) ? data : [])
      } catch (err) {
        console.error("Failed to load invites", err)
      }
    }

    loadMembers()
    loadInvites()
    return () => {
      cancelled = true
    }
  }, [groupId, membersRefreshTick])

  // Aircraft
  useEffect(() => {
    if (!groupId) return
    let cancelled = false

    async function loadAircraft() {
      try {
        const res = await fetch(`/api/admin/aircraft?groupId=${groupId}`)
        if (!res.ok) throw new Error(`Failed to fetch aircraft: ${res.status}`)
        const data = await res.json()
        if (!cancelled) setAircraft(data)
      } catch (err) {
        console.error("Failed to load aircraft", err)
        if (!cancelled) setAircraft(mockAircraft)
      }
    }

    loadAircraft()
    return () => {
      cancelled = true
    }
  }, [groupId])

  // Flights (awaiting, dispatched, past)
  useEffect(() => {
    if (!groupId) return
    let cancelled = false

    async function loadFlights() {
      try {
        setIsFlightsLoading(true)
        setFlightsError(null)

        const [pastRes, dispatchedRes, awaitingRes] = await Promise.all([
          fetch(`/api/admin/flights?groupId=${groupId}&type=past`),
          fetch(`/api/admin/flights?groupId=${groupId}&type=dispatched`),
          fetch(`/api/admin/flights?groupId=${groupId}&type=awaiting`),
        ])

        if (!pastRes.ok || !dispatchedRes.ok || !awaitingRes.ok) {
          throw new Error("Failed to fetch flights")
        }

        const [pastData, dispatchedData, awaitingData] = await Promise.all([
          pastRes.json(),
          dispatchedRes.json(),
          awaitingRes.json(),
        ])

        if (cancelled) return
        setPastFlights(Array.isArray(pastData) ? pastData : pastData.flights ?? [])
        setDispatched(Array.isArray(dispatchedData) ? dispatchedData : dispatchedData.flights ?? [])
        setAwaitingDispatch(Array.isArray(awaitingData) ? awaitingData : awaitingData.flights ?? [])
      } catch (err) {
        console.error("Failed to load flights", err)
        if (!cancelled) {
          setFlightsError("Failed to load flights. Showing sample data.")
          setPastFlights(mockPastFlights)
          setDispatched(mockDispatched)
          setAwaitingDispatch(mockAwaitingDispatch)
        }
      } finally {
        if (!cancelled) setIsFlightsLoading(false)
      }
    }

    loadFlights()
    return () => {
      cancelled = true
    }
  }, [groupId])

  // Billing
  useEffect(() => {
    if (!groupId) return
    let cancelled = false

    async function loadBilling() {
      try {
        setIsBillingLoading(true)
        setBillingError(null)

        const res = await fetch(`/api/admin/billing?groupId=${groupId}`)
        if (!res.ok) throw new Error(`Failed to fetch billing: ${res.status}`)
        const data = await res.json()
        if (!cancelled) {
          const tx = Array.isArray(data) ? data : data.transactions ?? []
          setBilling(tx)
        }
      } catch (err) {
        console.error("Failed to load billing", err)
        if (!cancelled) {
          setBillingError("Failed to load billing. Showing sample data.")
          setBilling(mockBilling)
        }
      } finally {
        if (!cancelled) setIsBillingLoading(false)
      }
    }

    loadBilling()
    return () => {
      cancelled = true
    }
  }, [groupId])

  // Fuel expenses
  useEffect(() => {
    if (!groupId) return
    let cancelled = false

    async function loadFuelExpenses() {
      try {
        setIsFuelLoading(true)
        setFuelError(null)

        const res = await fetch(`/api/admin/fuel-expenses?groupId=${groupId}`)
        if (!res.ok) throw new Error(`Failed to fetch fuel expenses: ${res.status}`)
        const data = await res.json()
        const expenses = Array.isArray(data) ? data : data.expenses ?? []
        if (!cancelled) setFuelExpenses(expenses)
      } catch (err) {
        console.error("Failed to load fuel expenses", err)
        if (!cancelled) {
          setFuelError("Failed to load fuel expenses. Showing sample data.")
          setFuelExpenses(mockPendingFuelExpenses)
        }
      } finally {
        if (!cancelled) setIsFuelLoading(false)
      }
    }

    loadFuelExpenses()
    return () => {
      cancelled = true
    }
  }, [groupId])

  // Maintenance issues
  useEffect(() => {
    if (!groupId) return
    let cancelled = false

    async function loadIssues() {
      try {
        setIsIssuesLoading(true)
        setIssuesError(null)

        const res = await fetch(`/api/admin/maintenance/issues?groupId=${groupId}`)
        if (!res.ok) throw new Error(`Failed to fetch maintenance issues: ${res.status}`)
        const data = await res.json()
        const issues = Array.isArray(data) ? data : data.issues ?? []
        if (!cancelled) setMaintenanceIssues(issues)
      } catch (err) {
        console.error("Failed to load maintenance issues", err)
        if (!cancelled) {
          setIssuesError("Failed to load maintenance issues. Showing sample data.")
          setMaintenanceIssues(mockPendingMaintenanceIssues)
        }
      } finally {
        if (!cancelled) setIsIssuesLoading(false)
      }
    }

    loadIssues()
    return () => {
      cancelled = true
    }
  }, [groupId])

  // Maintenance history for selected aircraft
  useEffect(() => {
    if (!selectedAircraft) return
    const nNumber = selectedAircraft
    let cancelled = false

    async function loadHistory() {
      try {
        setIsHistoryLoading(true)
        setHistoryError(null)

        const res = await fetch(
          `/api/admin/maintenance/history?nNumber=${encodeURIComponent(nNumber)}`
        )
        if (!res.ok) throw new Error(`Failed to fetch history: ${res.status}`)
        const data = await res.json()
        const history = Array.isArray(data) ? data : data.history ?? []

        if (!cancelled) {
          setMaintenanceHistory(prev => ({
            ...prev,
            [nNumber]: history,
          }))
        }
      } catch (err) {
        console.error("Failed to load maintenance history", err)
        if (!cancelled) {
          setHistoryError("Failed to load maintenance history. Showing sample data if available.")
        }
      } finally {
        if (!cancelled) setIsHistoryLoading(false)
      }
    }

    loadHistory()
    return () => {
      cancelled = true
    }
  }, [selectedAircraft])

  async function handleFuelAction(id: string, action: "approve" | "deny") {
    try {
      setFuelActionId(id)
      setFuelError(null)

      const res = await fetch(`/api/admin/fuel-expenses/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) throw new Error(`Failed to ${action} fuel expense`)

      setFuelExpenses(prev =>
        prev.map(f =>
          f.id === id
            ? {
                ...f,
                status: action === "approve" ? "APPROVED" : "DENIED",
                approvedAt:
                  action === "approve" ? new Date().toISOString() : f.approvedAt,
              }
            : f,
        ),
      )
    } catch (err) {
      console.error("Fuel approval action failed", err)
      setFuelError("Action failed. Please try again.")
    } finally {
      setFuelActionId(null)
    }
  }

  async function handleMaintenanceAction(
    id: string,
    action: "dismiss" | "create-work-order",
  ) {
    try {
      setMaintenanceActionId(id)
      setIssuesError(null)

      const res = await fetch(`/api/admin/maintenance/issues/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) throw new Error(`Failed to ${action} maintenance issue`)

      const updated = await res.json()
      const issue = updated.issue ?? updated

      setMaintenanceIssues(prev =>
        prev.map(i => (i.id === id ? { ...i, ...issue } : i)),
      )
    } catch (err) {
      console.error("Maintenance action failed", err)
      setIssuesError("Action failed. Please try again.")
    } finally {
      setMaintenanceActionId(null)
    }
  }

  async function handleCreateInvite() {
    if (!groupId) return
    setIsInviteSubmitting(true)
    setInviteError(null)
    try {
      const res = await fetch(`/api/groups/${groupId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim() || null, role: inviteRole }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "Failed to create invite")
      setInviteLink(`${window.location.origin}/join/${data.token}`)
      setMembersRefreshTick(t => t + 1)
    } catch (err: any) {
      setInviteError(err?.message || "Failed to create invite")
    } finally {
      setIsInviteSubmitting(false)
    }
  }

  async function handleCancelInvite(inviteId: string) {
    if (!groupId) return
    try {
      const res = await fetch(`/api/groups/${groupId}/invites?inviteId=${inviteId}`, { method: "DELETE" })
      if (res.ok) setInvites(prev => prev.filter(i => i.id !== inviteId))
    } catch (err) {
      console.error("Failed to cancel invite", err)
    }
  }

  async function handleChangeRole(newRole: string) {
    if (!groupId || !manageMember) return
    setIsManageSubmitting(true)
    setManageError(null)
    try {
      const res = await fetch(`/api/groups/${groupId}/members`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: manageMember.id, role: newRole }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || "Failed to update role")
      setManageMember(null)
      setMembersRefreshTick(t => t + 1)
    } catch (err: any) {
      setManageError(err?.message || "Failed to update role")
    } finally {
      setIsManageSubmitting(false)
    }
  }

  async function handleRemoveMember() {
    if (!groupId || !manageMember) return
    if (!window.confirm(`Remove ${manageMember.name} from the club?`)) return
    setIsManageSubmitting(true)
    setManageError(null)
    try {
      const res = await fetch(`/api/groups/${groupId}/members?memberId=${manageMember.id}`, { method: "DELETE" })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || "Failed to remove member")
      setManageMember(null)
      setMembersRefreshTick(t => t + 1)
    } catch (err: any) {
      setManageError(err?.message || "Failed to remove member")
    } finally {
      setIsManageSubmitting(false)
    }
  }

  function openInviteDialog() {
    setInviteEmail("")
    setInviteRole("MEMBER")
    setInviteLink(null)
    setInviteError(null)
    setShowInviteDialog(true)
  }

  const filteredMembers = members.filter(m =>
    (m.name ?? "").toLowerCase().includes(memberSearch.toLowerCase()) ||
    (m.email ?? "").toLowerCase().includes(memberSearch.toLowerCase())
  )

  const activeLabel = NAV_GROUPS.flatMap(g => g.items).find(i => i.id === activeTab)?.label ?? ""

  return (
    <div className="flex min-h-screen bg-background pt-[44px]">

      <Dialog
        open={showGroupPicker}
        onOpenChange={(open) => {
          if (!open && !groupId) return
          setShowGroupPicker(open)
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Select a club to manage</DialogTitle>
            <DialogDescription>
              You have admin access to multiple clubs. Choose the one you want to manage.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {adminGroups.map((group) => (
              <button
                key={group.id}
                onClick={() => handleSelectGroup(group)}
                className="flex w-full items-center justify-between rounded-md border border-border px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
              >
                <span className="font-medium">{group.name}</span>
                <Badge variant="outline" className="text-[10px]">{group.role}</Badge>
              </button>
            ))}
            {isGroupsLoading && (
              <p className="text-xs text-muted-foreground">Loading clubs…</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── SIDEBAR ────────────────────────────────────────────────────────────── */}
      <aside className="fixed top-[44px] left-0 h-[calc(100vh-44px)] w-56 shrink-0 overflow-y-auto border-r border-border bg-card">
        {/* Club identity */}
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded bg-primary">
              <Shield className="h-4 w-4 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold leading-tight">{club.name}</p>
              <p className="text-[10px] text-muted-foreground">Club Admin</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="py-1">
          {NAV_GROUPS.map((group, gi) => (
            <div key={group.label} className={gi > 0 ? "mt-0.5 border-t border-border pt-0.5" : ""}>
              <p className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                {group.label}
              </p>
              {group.items.map((item) => {
                const isActive = activeTab === item.id
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`flex w-full items-center justify-between px-4 py-2.5 text-xs font-medium transition-colors ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground hover:bg-muted"
                    }`}
                  >
                    {item.label}
                    <ChevronRight className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-primary-foreground/60" : "text-muted-foreground/40"}`} />
                  </button>
                )
              })}
            </div>
          ))}
        </nav>
      </aside>

      {/* ── MAIN ───────────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto ml-[224px]">

        {/* Top bar */}
        <div className="sticky top-0 z-30 flex h-11 items-center justify-between border-b border-border bg-card/95 px-6 backdrop-blur">
          <h1 className="text-sm font-semibold">{activeLabel}</h1>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs">
              <Download className="h-3 w-3" /> Export
            </Button>
            <Button size="sm" className="h-7 gap-1.5 text-xs">
              <Plus className="h-3 w-3" /> Add New
            </Button>
          </div>
        </div>

        <div className="p-6 space-y-6">

          {/* ── OVERVIEW ─────────────────────────────────────────────────────── */}
          {activeTab === "overview" && (
            <>
              {/* KPI row */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { label: "Total Members", value: "24", sub: "+2 this month",   icon: Users,       trend: "up" },
                  { label: "Aircraft",      value: "4",  sub: "1 in maintenance", icon: Plane,       trend: "neutral" },
                  { label: "Hours Flown",   value: "58", sub: "this month",       icon: Clock,       trend: "up" },
                  { label: "Revenue",       value: "$9,200", sub: "+12% vs last month", icon: DollarSign, trend: "up" },
                ].map((kpi) => (
                  <Card key={kpi.label}>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-xs font-medium text-muted-foreground">{kpi.label}</CardTitle>
                      <kpi.icon className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold">{kpi.value}</p>
                      <p className={`mt-0.5 flex items-center gap-1 text-xs ${kpi.trend === "up" ? "text-chart-2" : "text-muted-foreground"}`}>
                        {kpi.trend === "up" && <TrendingUp className="h-3 w-3" />}
                        {kpi.sub}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Charts */}
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Flight Hours — Last 6 Months</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="min-h-[200px]">
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={flightHoursData}>
                        <defs>
                          <linearGradient id="gh" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                        <XAxis dataKey="month" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, color: "#f1f5f9" }} />
                        <Area type="monotone" dataKey="hours" stroke="#3b82f6" strokeWidth={2} fill="url(#gh)" />
                      </AreaChart>
                    </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Club Revenue — Last 6 Months</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="min-h-[200px]">
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={revenueData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                        <XAxis dataKey="month" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, color: "#f1f5f9" }} />
                        <Bar dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Pipeline visualization */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Data Pipeline</CardTitle>
                  <CardDescription>Live processing across ingestion → validation → storage → analytics → export</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 lg:grid-cols-5">
                    <PipelineStage
                      label="Ingestion"
                      value={`${members.length} events/min`}
                      sublabel="source: logbook + club"
                      progress={(pipelineTick + 10) % 100}
                    />
                    <PipelineStage
                      label="Validation"
                      value={`${Math.max(1, Math.floor(members.length * 0.9))} checks`}
                      sublabel="schema + compliance"
                      progress={(pipelineTick + 30) % 100}
                    />
                    <PipelineStage
                      label="Storage"
                      value={`${aircraft.length} tables`}
                      sublabel="SQL + object store"
                      progress={(pipelineTick + 50) % 100}
                    />
                    <PipelineStage
                      label="Analytics"
                      value={`${pastFlights.length} reports`}
                      sublabel="totals + trends"
                      progress={(pipelineTick + 70) % 100}
                    />
                    <PipelineStage
                      label="Export"
                      value={`${billing.length} feeds`}
                      sublabel="PDF + CSV + API"
                      progress={(pipelineTick + 90) % 100}
                    />
                  </div>

                  <div className="mt-4 rounded-md border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
                    Animated pipeline reflects current club activity. Values update as live data loads.
                  </div>
                </CardContent>
              </Card>

              {/* Alerts */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Attention Required</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {[
                    { icon: AlertTriangle, color: "text-destructive", msg: "N172SP oil change overdue — 2.3 hrs remaining" },
                    { icon: AlertTriangle, color: "text-chart-3",     msg: "Tom Reynolds account suspended — $480 overdue balance" },
                    { icon: Bell,          color: "text-primary",     msg: "2 flights awaiting dispatch approval" },
                    { icon: UserCheck,     color: "text-chart-2",     msg: "Dan Ortega membership pending approval" },
                  ].map((a, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-lg border border-border p-3">
                      <a.icon className={`h-4 w-4 shrink-0 ${a.color}`} />
                      <p className="text-xs">{a.msg}</p>
                      <Button size="sm" variant="ghost" className="ml-auto h-6 text-xs">Review</Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </>
          )}

          {/* ── AWAITING DISPATCH ─────────────────────────────────────────────── */}
          {activeTab === "awaiting-dispatch" && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">Awaiting Dispatch ({awaitingDispatch.length})</CardTitle>
                    <CardDescription className="text-xs">
                      Flights filed and pending release by a dispatcher
                      {flightsError && (
                        <span className="ml-2 text-destructive">{flightsError}</span>
                      )}
                      {isFlightsLoading && !flightsError && (
                        <span className="ml-2 text-muted-foreground">Loading…</span>
                      )}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {awaitingDispatch.map((f) => (
                    <div key={f.id} className="flex items-center justify-between rounded-lg border border-border p-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{f.pilot}</p>
                          <Badge variant="outline" className="text-xs">{f.aircraft}</Badge>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{f.route}</span>
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />Dep: {f.plannedDep}</span>
                          <span>Filed: {f.filed}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" className="h-7 text-xs">Deny</Button>
                        <Button size="sm" className="h-7 text-xs">Dispatch</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── CURRENTLY DISPATCHED ─────────────────────────────────────────── */}
          {activeTab === "currently-dispatched" && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">Currently Dispatched ({dispatched.length})</CardTitle>
                    <CardDescription className="text-xs">
                      Flights currently airborne with an active dispatch release
                      {flightsError && (
                        <span className="ml-2 text-destructive">{flightsError}</span>
                      )}
                      {isFlightsLoading && !flightsError && (
                        <span className="ml-2 text-muted-foreground">Loading…</span>
                      )}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {dispatched.map((f) => (
                    <div key={f.id} className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 p-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 animate-pulse rounded-full bg-chart-2" />
                          <p className="text-sm font-medium">{f.pilot}</p>
                          <Badge variant="outline" className="text-xs">{f.aircraft}</Badge>
                          <StatusBadge status={f.status} />
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{f.route}</span>
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />Dep: {f.departed}</span>
                          <span>ETA: {f.eta}</span>
                          <span className="flex items-center gap-1"><Fuel className="h-3 w-3" />{f.fuel} gal planned</span>
                        </div>
                      </div>
                      <Button size="sm" variant="outline" className="h-7 text-xs">Close Out</Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── PAST FLIGHTS ─────────────────────────────────────────────────── */}
          {activeTab === "past-flights" && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">Past Flights</CardTitle>
                    <CardDescription className="text-xs">
                      Complete flight history for the club
                      {flightsError && (
                        <span className="ml-2 text-destructive">{flightsError}</span>
                      )}
                      {isFlightsLoading && !flightsError && (
                        <span className="ml-2 text-muted-foreground">Loading…</span>
                      )}
                    </CardDescription>
                  </div>
                  <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs">
                    <Download className="h-3 w-3" /> Export CSV
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        {["Pilot", "Aircraft", "Date", "Hobbs", "Route", "Cost", ""].map(h => (
                          <th key={h} className="pb-2 pr-4 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pastFlights.map((f) => (
                        <tr key={f.id} className="border-b border-border/50 last:border-0">
                          <td className="py-2.5 pr-4 font-medium">{f.pilot}</td>
                          <td className="py-2.5 pr-4"><Badge variant="outline" className="text-xs">{f.aircraft}</Badge></td>
                          <td className="py-2.5 pr-4 text-muted-foreground">{f.date}</td>
                          <td className="py-2.5 pr-4">{f.hobbs} hrs</td>
                          <td className="py-2.5 pr-4 text-muted-foreground">{f.route}</td>
                          <td className="py-2.5 pr-4 font-medium">${f.cost}</td>
                          <td className="py-2.5">
                            <Button size="sm" variant="ghost" className="h-6 text-xs">View</Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── MEMBERS ──────────────────────────────────────────────────────── */}
          {activeTab === "members" && (
            <>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">Members ({members.length})</CardTitle>
                    <CardDescription className="text-xs">
                      All club members and their standing
                      {membersError && (
                        <span className="ml-2 text-destructive">{membersError}</span>
                      )}
                      {isMembersLoading && !membersError && (
                        <span className="ml-2 text-muted-foreground">Loading…</span>
                      )}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <input
                        value={memberSearch}
                        onChange={e => setMemberSearch(e.target.value)}
                        placeholder="Search members..."
                        className="h-7 w-48 rounded-md border border-input bg-background pl-8 pr-3 text-xs outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>
                    <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={openInviteDialog} disabled={!groupId}>
                      <Plus className="h-3 w-3" /> Invite
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        {["Name", "Role", "Status", "Hours", "Balance", "Medical", "Joined", ""].map(h => (
                          <th key={h} className="pb-2 pr-4 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMembers.map((m) => (
                        <tr key={m.id} className="border-b border-border/50 last:border-0">
                          <td className="py-2.5 pr-4">
                            <div>
                              <p className="font-medium">{m.name}</p>
                              <p className="text-muted-foreground">{m.email}</p>
                            </div>
                          </td>
                          <td className="py-2.5 pr-4"><StatusBadge status={m.role} /></td>
                          <td className="py-2.5 pr-4"><StatusBadge status={m.status} /></td>
                          <td className="py-2.5 pr-4">{m.hours == null ? "—" : `${m.hours} hrs`}</td>
                          <td className={`py-2.5 pr-4 font-medium ${m.balance < 0 ? "text-destructive" : m.balance > 0 ? "text-chart-2" : ""}`}>
                            {m.balance < 0 ? `-$${Math.abs(m.balance)}` : m.balance > 0 ? `+$${m.balance}` : "$0"}
                          </td>
                          <td className="py-2.5 pr-4 text-muted-foreground">{m.medical}</td>
                          <td className="py-2.5 pr-4 text-muted-foreground">{m.joined}</td>
                          <td className="py-2.5">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 text-xs"
                              onClick={() => { setManageError(null); setManageMember(m) }}
                              disabled={!groupId || !m.userId}
                            >
                              Manage
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {invites.length > 0 && (
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle className="text-sm">Pending Invites ({invites.length})</CardTitle>
                  <CardDescription className="text-xs">Invitations that have not been accepted yet</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border">
                          {["Email", "Role", "Expires", "Sent", ""].map(h => (
                            <th key={h} className="pb-2 pr-4 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {invites.map((inv) => (
                          <tr key={inv.id} className="border-b border-border/50 last:border-0">
                            <td className="py-2.5 pr-4 font-medium">{inv.email || "Open invite link"}</td>
                            <td className="py-2.5 pr-4"><StatusBadge status={inv.role === "ADMIN" ? "Admin" : inv.role === "TREASURER" ? "Treasurer" : "Member"} /></td>
                            <td className="py-2.5 pr-4 text-muted-foreground">
                              {inv.expiresAt ? new Date(inv.expiresAt).toLocaleDateString() : "Never"}
                            </td>
                            <td className="py-2.5 pr-4 text-muted-foreground">
                              {inv.createdAt ? new Date(inv.createdAt).toLocaleDateString() : "—"}
                            </td>
                            <td className="py-2.5">
                              <div className="flex items-center gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 text-xs"
                                  onClick={() => navigator.clipboard.writeText(`${window.location.origin}/join/${inv.token}`)}
                                >
                                  Copy link
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 text-xs text-destructive hover:text-destructive"
                                  onClick={() => handleCancelInvite(inv.id)}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Invite dialog */}
            <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Invite a member</DialogTitle>
                  <DialogDescription>
                    Send an email-specific invite, or leave the email blank to generate a shareable link.
                  </DialogDescription>
                </DialogHeader>
                {inviteLink ? (
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">Invite created. Share this link:</p>
                    <div className="flex items-center gap-2">
                      <input
                        readOnly
                        value={inviteLink}
                        className="h-8 flex-1 rounded-md border border-input bg-muted/40 px-2 text-xs outline-none"
                        onFocus={e => e.currentTarget.select()}
                      />
                      <Button size="sm" className="h-8 text-xs" onClick={() => navigator.clipboard.writeText(inviteLink)}>
                        Copy
                      </Button>
                    </div>
                    <div className="flex justify-end">
                      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setShowInviteDialog(false)}>
                        Done
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium">Email (optional)</label>
                      <input
                        type="email"
                        value={inviteEmail}
                        onChange={e => setInviteEmail(e.target.value)}
                        placeholder="pilot@example.com"
                        className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium">Role</label>
                      <select
                        value={inviteRole}
                        onChange={e => setInviteRole(e.target.value)}
                        className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="MEMBER">Member</option>
                        <option value="TREASURER">Treasurer</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                    </div>
                    {inviteError && <p className="text-xs text-destructive">{inviteError}</p>}
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setShowInviteDialog(false)}>
                        Cancel
                      </Button>
                      <Button size="sm" className="h-8 text-xs" onClick={handleCreateInvite} disabled={isInviteSubmitting}>
                        {isInviteSubmitting ? "Creating…" : "Create invite"}
                      </Button>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>

            {/* Manage member dialog */}
            <Dialog open={!!manageMember} onOpenChange={(open) => { if (!open) setManageMember(null) }}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Manage {manageMember?.name}</DialogTitle>
                  <DialogDescription>{manageMember?.email}</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Role</label>
                    <select
                      value={manageMember?.rawRole ?? "MEMBER"}
                      onChange={e => handleChangeRole(e.target.value)}
                      disabled={isManageSubmitting}
                      className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="MEMBER">Member</option>
                      <option value="TREASURER">Treasurer</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                    <p className="text-[11px] text-muted-foreground">Changing the role saves immediately.</p>
                  </div>
                  {manageError && <p className="text-xs text-destructive">{manageError}</p>}
                  <Separator />
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">Remove this member from the club</p>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-8 text-xs"
                      onClick={handleRemoveMember}
                      disabled={isManageSubmitting}
                    >
                      {isManageSubmitting ? "Working…" : "Remove member"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            </>
          )}

          {/* ── AIRCRAFT ─────────────────────────────────────────────────────── */}
          {activeTab === "aircraft" && selectedAircraft && (
            <>
              {/* Back button */}
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setSelectedAircraft(null)}
                className="mb-4"
              >
                <ChevronRight className="h-4 w-4 rotate-180 mr-1" />
                Back to Aircraft List
              </Button>

              {/* Maintenance History for selected aircraft */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Wrench className="h-4 w-4" />
                        Maintenance History: {selectedAircraft}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Complete maintenance records for this aircraft
                        {historyError && (
                          <span className="ml-2 text-destructive">{historyError}</span>
                        )}
                        {isHistoryLoading && !historyError && (
                          <span className="ml-2 text-muted-foreground">Loading…</span>
                        )}
                      </CardDescription>
                    </div>
                    <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs">
                      <Download className="h-3 w-3" /> Export
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border">
                          {["Date", "Item", "Type", "Status", "Hobbs", "Shop", "Cost", ""].map(h => (
                            <th key={h} className="pb-2 pr-4 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(maintenanceHistory as any)[selectedAircraft]?.map((record: any) => (
                          <tr key={record.id} className="border-b border-border/50 last:border-0">
                            <td className="py-2.5 pr-4">{record.date}</td>
                            <td className="py-2.5 pr-4 font-medium">{record.item}</td>
                            <td className="py-2.5 pr-4">
                              <Badge variant="outline" className="text-xs">{record.type}</Badge>
                            </td>
                            <td className="py-2.5 pr-4">
                              <StatusBadge status={record.status} />
                            </td>
                            <td className="py-2.5 pr-4 text-muted-foreground">{record.hobbs}</td>
                            <td className="py-2.5 pr-4 text-muted-foreground">{record.shop}</td>
                            <td className="py-2.5 pr-4 font-medium">${record.cost.toLocaleString()}</td>
                            <td className="py-2.5">
                              <Button size="sm" variant="ghost" className="h-6 text-xs">Details</Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Summary stats */}
              <div className="grid gap-4 sm:grid-cols-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs text-muted-foreground">Total Maintenance Cost</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">
                      ${(maintenanceHistory as any)[selectedAircraft]?.reduce((sum: number, r: any) => sum + r.cost, 0).toLocaleString() || 0}
                    </p>
                    <p className="text-xs text-muted-foreground">All time</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs text-muted-foreground">Maintenance Events</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{(maintenanceHistory as any)[selectedAircraft]?.length || 0}</p>
                    <p className="text-xs text-muted-foreground">Recorded</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs text-muted-foreground">Average Cost/Event</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">
                      ${Math.round((maintenanceHistory as any)[selectedAircraft]?.reduce((sum: number, r: any) => sum + r.cost, 0) / ((maintenanceHistory as any)[selectedAircraft]?.length || 1)) || 0}
                    </p>
                    <p className="text-xs text-muted-foreground">Per event</p>
                  </CardContent>
                </Card>
              </div>
            </>
          )}

          {activeTab === "aircraft" && !selectedAircraft && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">Club Aircraft ({aircraft.length})</CardTitle>
                    <CardDescription className="text-xs">Fleet management and status overview</CardDescription>
                  </div>
                  <Button size="sm" className="h-7 gap-1.5 text-xs">
                    <Plus className="h-3 w-3" /> Add Aircraft
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  {aircraft.map((ac) => (
                    <div key={ac.id} className="rounded-lg border border-border p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold">{ac.nNumber}</p>
                            <p className="text-sm text-muted-foreground">"{ac.nickname}"</p>
                          </div>
                          <p className="text-xs text-muted-foreground">{ac.year} {ac.make} {ac.model}</p>
                        </div>
                        <StatusBadge status={ac.status} />
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="rounded-md bg-muted/50 p-2">
                          <p className="text-muted-foreground">Rate</p>
                          <p className="font-semibold">${ac.rate}/hr</p>
                        </div>
                        <div className="rounded-md bg-muted/50 p-2">
                          <p className="text-muted-foreground">Hobbs</p>
                          <p className="font-semibold">{ac.hobbs} hrs</p>
                        </div>
                        <div className={`rounded-md p-2 ${ac.mxHours < 10 ? "bg-destructive/10" : "bg-muted/50"}`}>
                          <p className="text-muted-foreground">Next MX</p>
                          <p className={`font-semibold ${ac.mxHours < 10 ? "text-destructive" : ""}`}>{ac.nextMx}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="h-7 flex-1 text-xs">Edit</Button>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="h-7 flex-1 text-xs"
                          onClick={() => setSelectedAircraft(ac.nNumber)}
                        >
                          <Wrench className="h-3 w-3 mr-1" />
                          History
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 flex-1 text-xs">Logbook</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── BILLING / TRANSACTIONS ────────────────────────────────────────── */}
          {activeTab === "billing" && (
            <>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: "Outstanding Balance", value: "-$600", sub: "2 members overdue", color: "text-destructive" },
              { label: "Collected This Month", value: "$9,200", sub: "from flights & dues", color: "text-chart-2" },
              { label: "Pending Invoices", value: "3", sub: "awaiting payment", color: "text-chart-3" },
            ].map((s) => (
                  <Card key={s.label}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs text-muted-foreground">{s.label}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                      <p className="text-xs text-muted-foreground">{s.sub}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">Recent Transactions</CardTitle>
                    <CardDescription className="text-xs">
                      {billingError && (
                        <span className="text-destructive">{billingError}</span>
                      )}
                      {isBillingLoading && !billingError && (
                        <span className="text-muted-foreground">Loading…</span>
                      )}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border">
                          {["Member", "Type", "Aircraft", "Date", "Amount", "Status", ""].map(h => (
                            <th key={h} className="pb-2 pr-4 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {billing.map((t) => (
                          <tr key={t.id} className="border-b border-border/50 last:border-0">
                            <td className="py-2.5 pr-4 font-medium">{t.member}</td>
                            <td className="py-2.5 pr-4 text-muted-foreground">{t.type}</td>
                            <td className="py-2.5 pr-4">{t.aircraft !== "—" ? <Badge variant="outline" className="text-xs">{t.aircraft}</Badge> : "—"}</td>
                            <td className="py-2.5 pr-4 text-muted-foreground">{t.date}</td>
                            <td className="py-2.5 pr-4 font-medium">${t.amount}</td>
                            <td className="py-2.5 pr-4"><StatusBadge status={t.status} /></td>
                            <td className="py-2.5">
                              <Button size="sm" variant="ghost" className="h-6 text-xs">View</Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {/* ── GENERAL SETTINGS ────────────────────────────────────────────── */}
          {activeTab === "general-settings" && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Club Information</CardTitle>
                  <CardDescription className="text-xs">Basic details visible to all members</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {[
                    { label: "Club Name",        value: club.name,   type: "text" },
                    { label: "Home Airport ICAO", value: club.icao,   type: "text" },
                    { label: "Founded",           value: club.founded, type: "text" },
                  ].map((f) => (
                    <div key={f.label} className="grid grid-cols-3 items-center gap-4">
                      <label className="text-xs font-medium text-muted-foreground">{f.label}</label>
                      <input defaultValue={f.value} className="col-span-2 h-8 rounded-md border border-input bg-background px-3 text-xs outline-none focus:ring-1 focus:ring-ring" />
                    </div>
                  ))}
                  <div className="flex justify-end pt-2">
                    <Button size="sm" className="h-7 text-xs">Save Changes</Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Booking Rules</CardTitle>
                  <CardDescription className="text-xs">Control how members can schedule aircraft</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    { label: "Max advance booking (days)", value: "30" },
                    { label: "Min notice required (hours)", value: "2" },
                    { label: "Max booking duration (hours)", value: "8" },
                    { label: "Max bookings per member per week", value: "5" },
                  ].map((r) => (
                    <div key={r.label} className="grid grid-cols-3 items-center gap-4">
                      <label className="col-span-2 text-xs font-medium text-muted-foreground">{r.label}</label>
                      <input defaultValue={r.value} type="number" className="h-8 rounded-md border border-input bg-background px-3 text-xs outline-none focus:ring-1 focus:ring-ring" />
                    </div>
                  ))}
                  <div className="flex justify-end pt-2">
                    <Button size="sm" className="h-7 text-xs">Save Changes</Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ── FUEL APPROVALS ───────────────────────────────────────────────────── */}
          {activeTab === "fuel-approvals" && (
            <>
              {/* Summary cards */}
              <div className="grid gap-4 sm:grid-cols-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs text-muted-foreground">Pending Approval</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold text-chart-3">{fuelExpenses.filter(f => f.status === "PENDING").length}</p>
                    <p className="text-xs text-muted-foreground">expenses waiting</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs text-muted-foreground">Total Pending</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">${fuelExpenses.filter(f => f.status === "PENDING").reduce((sum, f) => sum + f.total, 0).toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">fuel expenses</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs text-muted-foreground">This Month</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {/* TODO: Replace with real month stats from API */}
                    <p className="text-2xl font-bold text-chart-2">$540.87</p>
                    <p className="text-xs text-muted-foreground">approved fuel</p>
                  </CardContent>
                </Card>
              </div>

              {/* Pending expenses list */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm">Pending Fuel Expenses</CardTitle>
                      <CardDescription className="text-xs">
                        Review and approve fuel expenses submitted after flights
                        {fuelError && (
                          <span className="ml-2 text-destructive">{fuelError}</span>
                        )}
                        {isFuelLoading && !fuelError && (
                          <span className="ml-2 text-muted-foreground">Loading</span>
                        )}
                      </CardDescription>
                    </div>
                    <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs">
                      <Download className="h-3 w-3" /> Export
                    </Button>
                  </div>
                </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                    {fuelExpenses.filter(f => f.status === "PENDING").map((fuel) => (
                      <div key={fuel.id} className="flex items-center justify-between rounded-lg border border-border p-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{fuel.pilot}</p>
                            <Badge variant="outline" className="text-xs">{fuel.aircraft}</Badge>
                            <StatusBadge status="Pending" />
                          </div>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{fuel.date}</span>
                            <span className="flex items-center gap-1"><Fuel className="h-3 w-3" />{fuel.gallons} gal @ ${fuel.pricePerGal}/gal</span>
                            <span>Submitted: {fuel.submittedAt}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-sm font-bold">${fuel.total.toFixed(2)}</p>
                          </div>
                        <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              disabled={isFuelLoading || fuelActionId === fuel.id}
                              onClick={() => handleFuelAction(fuel.id, 'deny')}
                            >
                              Deny
                            </Button>
                            <Button
                              size="sm"
                              className="h-7 text-xs"
                              disabled={isFuelLoading || fuelActionId === fuel.id}
                              onClick={() => handleFuelAction(fuel.id, 'approve')}
                            >
                              Approve
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Approved history */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Recently Approved</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border">
                          {["Pilot", "Aircraft", "Date", "Gallons", "Rate", "Total", "Status", "Approved"].map(h => (
                            <th key={h} className="pb-2 pr-4 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {fuelExpenses.filter(f => f.status === "APPROVED").map((fuel) => (
                          <tr key={fuel.id} className="border-b border-border/50 last:border-0">
                            <td className="py-2.5 pr-4 font-medium">{fuel.pilot}</td>
                            <td className="py-2.5 pr-4"><Badge variant="outline" className="text-xs">{fuel.aircraft}</Badge></td>
                            <td className="py-2.5 pr-4 text-muted-foreground">{fuel.date}</td>
                            <td className="py-2.5 pr-4">{fuel.gallons}</td>
                            <td className="py-2.5 pr-4 text-muted-foreground">${fuel.pricePerGal}</td>
                            <td className="py-2.5 pr-4 font-medium">${fuel.total.toFixed(2)}</td>
                            <td className="py-2.5 pr-4"><StatusBadge status="Approved" /></td>
                            <td className="py-2.5 pr-4 text-muted-foreground">{fuel.approvedAt ? new Date(fuel.approvedAt).toLocaleDateString() : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {/* ── MAINTENANCE REVIEWS ────────────────────────────────────────────── */}
          {activeTab === "maintenance-reviews" && (
            <>
              {/* Summary cards */}
              <div className="grid gap-4 sm:grid-cols-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs text-muted-foreground">Pending Review</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold text-chart-3">{maintenanceIssues.length}</p>
                    <p className="text-xs text-muted-foreground">issues reported</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs text-muted-foreground">High Priority</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold text-destructive">{maintenanceIssues.filter(m => m.severity === "high").length}</p>
                    <p className="text-xs text-muted-foreground">require attention</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs text-muted-foreground">Plane-Specific</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold text-chart-4">{maintenanceIssues.filter(m => m.isPlaneSpecific).length}</p>
                    <p className="text-xs text-muted-foreground">need inspection</p>
                  </CardContent>
                </Card>
              </div>

              {/* Pending issues list */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-sm">Maintenance Issues Requiring Review</CardTitle>
                        <CardDescription className="text-xs">
                          Plane-specific issues reported by pilots after flights
                          {issuesError && (
                            <span className="ml-2 text-destructive">{issuesError}</span>
                          )}
                          {isIssuesLoading && !issuesError && (
                            <span className="ml-2 text-muted-foreground">Loading…</span>
                          )}
                        </CardDescription>
                      </div>
                    <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs">
                      <Download className="h-3 w-3" /> Export
                    </Button>
                  </div>
                </CardHeader>
                  <CardContent>
                  <div className="space-y-3">
                    {maintenanceIssues.map((issue) => (
                      <div key={issue.id} className={`flex items-center justify-between rounded-lg border p-4 ${issue.severity === "high" ? "border-destructive/50 bg-destructive/5" : "border-border"}`}>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{issue.pilot}</p>
                            <Badge variant="outline" className="text-xs">{issue.aircraft}</Badge>
                            <Badge variant={issue.severity === "high" ? "destructive" : issue.severity === "medium" ? "default" : "secondary"} className="text-xs">
                              {issue.severity === "high" ? "High" : issue.severity === "medium" ? "Medium" : "Low"}
                            </Badge>
                            {issue.isPlaneSpecific && (
                              <Badge variant="outline" className="border-chart-4/50 text-chart-4 text-xs">Plane-Specific</Badge>
                            )}
                            {!issue.isPlaneSpecific && (
                              <Badge variant="outline" className="border-muted-foreground/30 text-muted-foreground text-xs">Generic</Badge>
                            )}
                          </div>
                          <p className="text-sm">{issue.issue}</p>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{issue.date}</span>
                            <span className="flex items-center gap-1"><Wrench className="h-3 w-3" />{issue.category}</span>
                            <span>Flight: {issue.flightId}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            disabled={isIssuesLoading || maintenanceActionId === issue.id}
                            onClick={() => handleMaintenanceAction(issue.id, "dismiss")}
                          >
                            Dismiss
                          </Button>
                          <Button
                            size="sm"
                            className="h-7 text-xs"
                            disabled={isIssuesLoading || maintenanceActionId === issue.id}
                            onClick={() => handleMaintenanceAction(issue.id, "create-work-order")}
                          >
                            Create Work Order
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Info card */}
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <div className="rounded-full bg-primary/10 p-2">
                      <Wrench className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold">How Maintenance Reviews Work</h4>
                      <p className="mt-1 text-xs text-muted-foreground">
                        When pilots report issues during flight completion, they can mark them as "Plane-Specific" (affecting only that aircraft) 
                        or "Generic" (could apply to any aircraft). Plane-specific issues require admin review and may generate work orders. 
                        Generic issues are logged for general tracking but don't require immediate action.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {/* ── PLACEHOLDER SECTIONS ────────────────────────────────────────── */}
          {activeTab === "instructors" && <PlaceholderPanel title="Instructors" description="Manage CFIs and CFIIs who can log dual instruction in club aircraft." />}
          {activeTab === "administrators" && <PlaceholderPanel title="Administrators" description="Manage club admins, owners, and dispatch roles." />}
          {activeTab === "groups" && <PlaceholderPanel title="Groups" description="Segment members into groups for permissions, rates, and access rules." />}
          {activeTab === "items" && <PlaceholderPanel title="Items" description="Billable line items such as fuel, instruction charges, and add-ons." />}
          {activeTab === "adjustments" && <PlaceholderPanel title="Adjustments" description="Manual credits and debits applied to member account balances." />}
          {activeTab === "forms" && <PlaceholderPanel title="Forms" description="Pre-flight and post-flight forms required for dispatch and closeout." />}
          {activeTab === "invoices" && <PlaceholderPanel title="Invoices" description="Generate and send invoices to members for dues, flights, and fees." />}
          {activeTab === "member-settings" && <PlaceholderPanel title="Member Settings" description="Configure self-registration, required documents, and profile fields." />}
          {activeTab === "schedule-settings" && <PlaceholderPanel title="Schedule Settings" description="Set operating hours, blackout dates, and scheduling constraints." />}

          {/* ── NOTIFICATION SETTINGS ────────────────────────────────────────── */}
          {activeTab === "notification-settings" && (
            <div className="space-y-6">
              {/* Email Notifications */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Email Notifications</CardTitle>
                  <CardDescription className="text-xs">Configure what email alerts members receive</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {[
                    { id: "booking-confirmed", label: "Booking Confirmed", description: "When a flight is booked", enabled: true },
                    { id: "booking-reminder", label: "Flight Reminder", description: "24 hours before scheduled flight", enabled: true },
                    { id: "maintenance-alert", label: "Maintenance Alerts", description: "When aircraft maintenance is due", enabled: true },
                    { id: "billing-reminder", label: "Billing Reminders", description: "Due invoices and overdue balances", enabled: true },
                    { id: "club-announcements", label: "Club Announcements", description: "News and updates from club admins", enabled: false },
                    { id: "weather-alerts", label: "Weather Alerts", description: "METAR/TAF changes at home airport", enabled: false },
                  ].map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium">{item.label}</p>
                        <p className="text-xs text-muted-foreground">{item.description}</p>
                      </div>
                      <button 
                        className={`relative h-6 w-11 rounded-full transition-colors ${item.enabled ? 'bg-primary' : 'bg-muted'}`}
                        onClick={() => alert(`Toggle ${item.label} - Demo only`)}
                      >
                        <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${item.enabled ? 'left-6' : 'left-1'}`} />
                      </button>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Push Notifications */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Push Notifications</CardTitle>
                  <CardDescription className="text-xs">Mobile app push notification preferences</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {[
                    { id: "flight-dispatched", label: "Flight Dispatched", description: "When your flight is released", enabled: true },
                    { id: "flight-landing", label: "Flight Completed", description: "When aircraft lands", enabled: true },
                    { id: "maintenance-grounded", label: "Aircraft Grounded", description: "When aircraft becomes unavailable", enabled: true },
                    { id: "schedule-changes", label: "Schedule Changes", description: "When bookings are modified", enabled: false },
                  ].map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium">{item.label}</p>
                        <p className="text-xs text-muted-foreground">{item.description}</p>
                      </div>
                      <button 
                        className={`relative h-6 w-11 rounded-full transition-colors ${item.enabled ? 'bg-primary' : 'bg-muted'}`}
                        onClick={() => alert(`Toggle ${item.label} - Demo only`)}
                      >
                        <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${item.enabled ? 'left-6' : 'left-1'}`} />
                      </button>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Notification Timing */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Notification Timing</CardTitle>
                  <CardDescription className="text-xs">When to send daily/weekly summaries</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-xs font-medium">Daily Summary Time</label>
                      <select className="h-8 w-full rounded-md border border-input bg-background px-3 text-xs">
                        <option>6:00 AM</option>
                        <option>7:00 AM</option>
                        <option selected>8:00 AM</option>
                        <option>9:00 AM</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium">Weekly Report Day</label>
                      <select className="h-8 w-full rounded-md border border-input bg-background px-3 text-xs">
                        <option>Monday</option>
                        <option selected>Wednesday</option>
                        <option>Friday</option>
                        <option>Saturday</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">Weekly Flight Summary</p>
                      <p className="text-xs text-muted-foreground">Send weekly recap of flight hours and expenses</p>
                    </div>
                    <button className="relative h-6 w-11 rounded-full bg-primary">
                      <span className="absolute top-1 left-6 h-4 w-4 rounded-full bg-white" />
                    </button>
                  </div>
                </CardContent>
              </Card>

              {/* Save Button */}
              <div className="flex justify-end">
                <Button size="sm" className="h-8 text-xs">Save Notification Settings</Button>
              </div>
            </div>
          )}

          {activeTab === "add-ons" && <PlaceholderPanel title="Add-ons" description="Enable premium features: weather briefings, ATIS, fuel ordering, and more." />}

        </div>
      </div>
    </div>
  )
}
