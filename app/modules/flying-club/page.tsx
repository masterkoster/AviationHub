'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Plane,
  Calendar,
  Users,
  Wrench,
  DollarSign,
  Clock,
  AlertCircle,
  CheckCircle2,
  Plus,
  ChevronLeft,
  ChevronRight,
  Search,
  Filter,
  Download,
  MoreVertical,
  MapPin,
  Fuel,
  BookOpen,
  Settings,
  Loader2,
  User,
  Home,
  Copy,
  Mail,
  Trash2,
  UserPlus,
  X
} from "lucide-react"

import BookingCalendar from "@/components/club/BookingCalendar"
import CheckoutPanel from "@/components/club/CheckoutPanel"
import MemberList from "@/components/club/MemberList"
import BillingRunButton from "@/components/club/BillingRunButton"
import { FlightScheduler } from "@/components/scheduler/FlightScheduler"

// Types
interface GroupAircraft {
  id: string
  nNumber: string
  nickname: string | null
  make: string | null
  model: string | null
  year: number | null
  status: string | null
  hourlyRate: number | null
  hobbsHours: number | null
  groupName?: string
}

interface Group {
  id: string
  name: string
  description: string | null
  role: string
  aircraft: GroupAircraft[]
  members?: number
}

interface Booking {
  id: string
  aircraftId: string
  aircraft?: GroupAircraft
  userId: string
  user?: { name: string | null; email: string }
  groupId?: string
  groupName?: string
  source?: 'club' | 'personal'
  startTime: string
  endTime: string
  purpose: string | null
}

interface Maintenance {
  id: string
  aircraftId: string
  aircraft?: GroupAircraft
  description: string
  status: string
  priority: string
  reportedDate: string
  dueDate: string | null
  isGrounded?: boolean
}

interface FlightLog {
  id: string
  aircraftId: string
  aircraft?: GroupAircraft
  userId: string
  user?: { name: string | null }
  date: string
  hobbsTime: number | null
  tachTime: number | null
  notes: string | null
}

interface Member {
  id: string
  userId: string
  user: { id: string; name: string | null; email: string }
  role: string
  joinedAt: string
}

interface Invite {
  id: string
  token: string
  email: string | null
  role: string
  expiresAt: string | null
}

interface BillingData {
  month: string
  year: number
  totalMembers: number
  totalFlights: number
  totalHobbs: number
  totalCost: number
  members: {
    userId: string
    name: string
    email: string
    flights: number
    totalHobbs: number
    totalTach: number
    totalCost: number
    details: { date: string; aircraft: string; hobbs: number; tach: number; cost: number }[]
  }[]
}

interface ChatMessage {
  id: string
  groupId: string
  userId: string
  user: { name: string; initials: string; color: string }
  message: string
  timestamp: string
}

// Demo chat messages
const demoChatMessages: ChatMessage[] = [
  { id: 'c1', groupId: 'demo-1', userId: 'u1', user: { name: 'Frank Miller', initials: 'FM', color: 'bg-primary' }, message: "Hey everyone! Anyone flying this weekend?", timestamp: '2026-02-21T10:30:00' },
  { id: 'c2', groupId: 'demo-1', userId: 'u2', user: { name: 'Sarah Johnson', initials: 'SJ', color: 'bg-green-500' }, message: "I'm thinking Saturday morning for some IFR practice!", timestamp: '2026-02-21T10:45:00' },
  { id: 'c3', groupId: 'demo-1', userId: 'u3', user: { name: 'Mike Wilson', initials: 'MW', color: 'bg-blue-500' }, message: "Count me in! The 182 is available", timestamp: '2026-02-21T11:00:00' },
  { id: 'c4', groupId: 'demo-1', userId: 'u1', user: { name: 'Frank Miller', initials: 'FM', color: 'bg-primary' }, message: "Great! Let's meet at 8am", timestamp: '2026-02-21T11:15:00' },
]

// Demo data
const demoGroups: Group[] = [
  {
    id: 'demo-1',
    name: 'Sky High Flying Club',
    description: 'A welcoming club for pilots of all experience levels',
    role: 'ADMIN',
    aircraft: [
      { id: 'a1', nNumber: 'N172SP', nickname: 'Skyhawk', make: 'Cessna', model: '172S', year: 2025, status: 'Available', hourlyRate: 165, hobbsHours: 98.2 },
      { id: 'a2', nNumber: 'N9876P', nickname: 'Warrior', make: 'Piper', model: 'PA-28-161', year: 2019, status: 'Maintenance', hourlyRate: 145, hobbsHours: 1842.3 }
    ],
    members: 5
  },
  {
    id: 'demo-2',
    name: 'Weekend Warriors',
    description: 'Casual flying group for weekend adventures',
    role: 'MEMBER',
    aircraft: [
      { id: 'a3', nNumber: 'N345AB', nickname: 'Cherokee', make: 'Piper', model: 'PA-32-300', year: 1978, status: 'Available', hourlyRate: 135, hobbsHours: 4890.5 }
    ],
    members: 2
  }
]

const demoBookings: Booking[] = [
  { id: 'b1', aircraftId: 'a1', aircraft: demoGroups[0].aircraft[0], userId: 'u1', user: { name: 'Demo Admin', email: 'demo@test.com' }, startTime: '2026-02-23T14:00', endTime: '2026-02-23T16:00', purpose: 'Local practice' },
  { id: 'b2', aircraftId: 'a3', aircraft: demoGroups[1].aircraft[0], userId: 'u2', user: { name: 'Mike Wilson', email: 'mike@test.com' }, startTime: '2026-02-24T09:00', endTime: '2026-02-24T12:00', purpose: 'Cross country' },
  { id: 'b3', aircraftId: 'a1', aircraft: demoGroups[0].aircraft[0], userId: 'u3', user: { name: 'Sarah Johnson', email: 'sarah@test.com' }, startTime: '2026-02-25T10:30', endTime: '2026-02-25T13:30', purpose: 'IFR practice' }
]

const demoMaintenance: Maintenance[] = [
  { id: 'm1', aircraftId: 'a2', aircraft: demoGroups[0].aircraft[1], description: 'Annual inspection', status: 'In Progress', priority: 'high', reportedDate: '2026-01-15', dueDate: '2026-08-20' },
  { id: 'm2', aircraftId: 'a1', aircraft: demoGroups[0].aircraft[0], description: 'Oil change', status: 'Needed', priority: 'medium', reportedDate: '2026-02-01', dueDate: '2026-03-01' }
]

const demoBillingData: BillingData = {
  month: 'February',
  year: 2026,
  totalMembers: 3,
  totalFlights: 8,
  totalHobbs: 12.5,
  totalCost: 1812.50,
  members: [
    { userId: 'u1', name: 'Demo Admin', email: 'demo@admin.com', flights: 4, totalHobbs: 6.2, totalTach: 5.8, totalCost: 899.00, details: [] },
    { userId: 'u2', name: 'Frank Miller', email: 'frank@demo.com', flights: 2, totalHobbs: 3.5, totalTach: 3.2, totalCost: 507.50, details: [] },
    { userId: 'u3', name: 'Sarah Johnson', email: 'sarah@demo.com', flights: 2, totalHobbs: 2.8, totalTach: 2.5, totalCost: 406.00, details: [] },
  ]
}

const demoMembers: Member[] = [
  { id: 'mb1', userId: 'u1', user: { id: 'u1', name: 'Demo Admin', email: 'demo@admin.com' }, role: 'ADMIN', joinedAt: '2024-01-01' },
  { id: 'mb2', userId: 'u2', user: { id: 'u2', name: 'Frank Miller', email: 'frank@demo.com' }, role: 'MEMBER', joinedAt: '2024-03-15' },
  { id: 'mb3', userId: 'u3', user: { id: 'u3', name: 'Sarah Johnson', email: 'sarah@demo.com' }, role: 'MEMBER', joinedAt: '2024-06-20' },
]

const demoFlightLogs: FlightLog[] = [
  { id: 'fl1', aircraftId: 'a1', aircraft: demoGroups[0].aircraft[0], userId: 'u1', user: { name: 'Demo Admin' }, date: '2026-02-20', hobbsTime: 1.5, tachTime: 1.3, notes: 'Local pattern work' },
  { id: 'fl2', aircraftId: 'a1', aircraft: demoGroups[0].aircraft[0], userId: 'u2', user: { name: 'Frank Miller' }, date: '2026-02-18', hobbsTime: 2.3, tachTime: 2.0, notes: 'Cross country to KSFO' },
]

// Personal demo data (only used for demo when not logged in)
const personalBookings: Booking[] = []

export default function FlyingClubPage() {
  const { data: session, status } = useSession()
  const [activeTab, setActiveTab] = useState('dashboard')
  const [selectedView, setSelectedView] = useState<string>('personal')
  const [groups, setGroups] = useState<Group[]>([])
  const [personalAircraft, setPersonalAircraft] = useState<GroupAircraft[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [maintenance, setMaintenance] = useState<Maintenance[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [flightLogs, setFlightLogs] = useState<FlightLog[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [billingData, setBillingData] = useState<BillingData | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [scheduledWindow, setScheduledWindow] = useState<'7' | '30' | 'all'>('7')
  const [scheduledBookings, setScheduledBookings] = useState<Booking[]>([])
  const [isScheduledLoading, setIsScheduledLoading] = useState(false)
  const [scheduledError, setScheduledError] = useState<string | null>(null)
  
  // Modal states
  const [showNewGroupModal, setShowNewGroupModal] = useState(false)
  const [showAddAircraftModal, setShowAddAircraftModal] = useState(false)
  const [showNewBookingModal, setShowNewBookingModal] = useState(false)
  const [showQuickBookingModal, setShowQuickBookingModal] = useState(false)
  const [schedulerAircraftId, setSchedulerAircraftId] = useState('')
  const [showReportIssueModal, setShowReportIssueModal] = useState(false)
  const [showLogFlightModal, setShowLogFlightModal] = useState(false)
  const [showInviteModal, setShowInviteModal] = useState(false)
  
  // Form states
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState('')
  
  // New Group form
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupDescription, setNewGroupDescription] = useState('')
  const [newGroupDryRate, setNewGroupDryRate] = useState('')
  const [newGroupWetRate, setNewGroupWetRate] = useState('')
  
  // Add Aircraft form
  const [aircraftNNumber, setAircraftNNumber] = useState('')
  const [aircraftNickname, setAircraftNickname] = useState('')
  const [aircraftMake, setAircraftMake] = useState('')
  const [aircraftModel, setAircraftModel] = useState('')
  const [aircraftYear, setAircraftYear] = useState('')
  const [aircraftHourlyRate, setAircraftHourlyRate] = useState('')
  
  // Booking form
  const [bookingAircraftId, setBookingAircraftId] = useState('')
  const [bookingStartTime, setBookingStartTime] = useState('')
  const [bookingEndTime, setBookingEndTime] = useState('')
  const [bookingPurpose, setBookingPurpose] = useState('')
  
  // Maintenance form
  const [maintenanceAircraftId, setMaintenanceAircraftId] = useState('')
  const [maintenanceDescription, setMaintenanceDescription] = useState('')
  const [maintenanceNotes, setMaintenanceNotes] = useState('')
  const [maintenanceGrounded, setMaintenanceGrounded] = useState(false)
  const [maintenancePostToMarketplace, setMaintenancePostToMarketplace] = useState(false)
  const [maintenancePostAnonymously, setMaintenancePostAnonymously] = useState(true)
  
  // Flight Log form
  const [logAircraftId, setLogAircraftId] = useState('')
  const [logDate, setLogDate] = useState('')
  const [logTachStart, setLogTachStart] = useState('')
  const [logTachEnd, setLogTachEnd] = useState('')
  const [logHobbsStart, setLogHobbsStart] = useState('')
  const [logHobbsEnd, setLogHobbsEnd] = useState('')
  const [logNotes, setLogNotes] = useState('')
  
  // Invite form
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('MEMBER')
  const [generatedInviteLink, setGeneratedInviteLink] = useState('')
  
  // Billing state
  const [billingMonth, setBillingMonth] = useState(new Date().getMonth())
  const [billingYear, setBillingYear] = useState(new Date().getFullYear())

  // Fetch user's groups
  useEffect(() => {
    if (status === 'loading') return
    
    async function fetchData() {
      setLoading(true)
      try {
        if (session?.user?.id) {
          // Fetch real groups from API
          const groupsRes = await fetch('/api/groups')
          if (groupsRes.ok) {
            const groupsData = await groupsRes.json()
            setGroups(groupsData)
          }
          // Fetch personal aircraft
          const personalAircraftRes = await fetch('/api/user-aircraft')
          if (personalAircraftRes.ok) {
            const personalAircraftData = await personalAircraftRes.json()
            setPersonalAircraft(personalAircraftData.aircraft || [])
          }
          // Fetch personal + club bookings
          const bookingsRes = await fetch('/api/bookings')
          if (bookingsRes.ok) {
            const bookingsData = await bookingsRes.json()
            const resolvedBookings = Array.isArray(bookingsData)
              ? bookingsData
              : bookingsData.bookings || []
            setBookings(resolvedBookings)
          }
          // Set empty for demo-like state when logged in
          setMaintenance([])
          setMembers([])
          setFlightLogs([])
        } else {
          // Demo mode - only show demo data when NOT logged in
          setGroups(demoGroups)
          setBookings([...personalBookings, ...demoBookings])
          setPersonalAircraft([])
          setMaintenance(demoMaintenance)
          setMembers(demoMembers)
          setFlightLogs(demoFlightLogs)
          setChatMessages(demoChatMessages)
        }
      } catch (error) {
        console.error('Error fetching data:', error)
        if (!session?.user?.id) {
          // Only load demo data on error if not logged in
          setGroups(demoGroups)
          setBookings([...personalBookings, ...demoBookings])
          setPersonalAircraft([])
          setMaintenance(demoMaintenance)
          setMembers(demoMembers)
          setFlightLogs(demoFlightLogs)
        }
      }
      setLoading(false)
    }
    
    fetchData()
  }, [session, status])

  useEffect(() => {
    if (!session?.user?.id) return
    let cancelled = false

    async function loadScheduled() {
      setIsScheduledLoading(true)
      setScheduledError(null)
      try {
        const res = await fetch(`/api/bookings?days=${scheduledWindow}`)
        if (!res.ok) throw new Error('Failed to load scheduled flights')
        const data = await res.json()
        const bookings = Array.isArray(data) ? data : data.bookings || []
        if (!cancelled) setScheduledBookings(bookings)
      } catch (error) {
        console.error('Failed to load scheduled flights', error)
        if (!cancelled) setScheduledError('Failed to load scheduled flights')
      } finally {
        if (!cancelled) setIsScheduledLoading(false)
      }
    }

    loadScheduled()
    return () => {
      cancelled = true
    }
  }, [session?.user?.id, scheduledWindow])

  // Fetch group-specific data when view changes
  useEffect(() => {
    if (!session?.user?.id) return
    if (selectedView === 'personal') {
      // Fetch personal bookings
      fetch('/api/bookings')
        .then(r => r.ok && r.json())
        .then(data => {
          if (!data) return
          const resolvedBookings = Array.isArray(data) ? data : data.bookings || []
          setBookings(resolvedBookings)
        })
      fetch('/api/user-aircraft')
        .then(r => r.ok && r.json())
        .then(data => {
          if (!data) return
          setPersonalAircraft(data.aircraft || [])
        })
      setMaintenance([])
      setMembers([])
      setFlightLogs([])
      setInvites([])
      return
    }
    
    async function fetchGroupData() {
      try {
        const [bookingsRes, membersRes, logsRes, chatRes] = await Promise.all([
          fetch(`/api/groups/${selectedView}/bookings`),
          fetch(`/api/groups/${selectedView}/members`),
          fetch(`/api/groups/${selectedView}/logs`),
          fetch(`/api/groups/${selectedView}/chat`)
        ])
        
        if (bookingsRes.ok) {
          const bookingsData = await bookingsRes.json()
          const resolvedBookings = Array.isArray(bookingsData)
            ? bookingsData
            : bookingsData.bookings || []
          setBookings(resolvedBookings)
        }
        if (membersRes.ok) setMembers(await membersRes.json())
        if (logsRes.ok) {
          const logsData = await logsRes.json()
          setFlightLogs(logsData.logs || [])
          setMaintenance(logsData.maintenance || [])
        }
        if (chatRes.ok) setChatMessages(await chatRes.json())
        
        // Fetch invites if admin
        const group = groups.find(g => g.id === selectedView)
        if (group?.role === 'ADMIN') {
          const invitesRes = await fetch(`/api/groups/${selectedView}/invites`)
          if (invitesRes.ok) setInvites(await invitesRes.json())
        }
      } catch (error) {
        console.error('Error fetching group data:', error)
      }
    }

    fetchGroupData()
  }, [selectedView, session, groups])
  
  // Fetch billing data
  useEffect(() => {
    if (!session?.user?.id || selectedView === 'personal') return
    const group = groups.find(g => g.id === selectedView)
    if (group?.role !== 'ADMIN') return
    
    async function fetchBilling() {
      try {
        const res = await fetch(`/api/billing?groupId=${selectedView}&month=${billingMonth}&year=${billingYear}`)
        if (res.ok) {
          setBillingData(await res.json())
        }
      } catch (error) {
        console.error('Error fetching billing:', error)
      }
    }
    
    if (activeTab === 'billing') {
      fetchBilling()
    }
  }, [activeTab, selectedView, billingMonth, billingYear, session, groups])

  // Send chat message
  const handleSendChat = async () => {
    if (!chatInput.trim() || selectedView === 'personal' || !session?.user?.id) return
    
    try {
      const res = await fetch(`/api/groups/${selectedView}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: chatInput.trim() })
      })
      
      if (res.ok) {
        const newMessage = await res.json()
        setChatMessages([...chatMessages, newMessage])
        setChatInput('')
      } else {
        const error = await res.json()
        alert(error.error || 'Failed to send message')
      }
    } catch (error) {
      console.error('Error sending message:', error)
    }
  }
  
  // Create new group
  const handleCreateGroup = async () => {
    if (isDemo) {
      setFormError('Please sign in to create a group')
      return
    }
    if (!newGroupName.trim()) {
      setFormError('Group name is required')
      return
    }
    
    setFormLoading(true)
    setFormError('')
    
    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newGroupName,
          description: newGroupDescription,
          dryRate: newGroupDryRate ? parseFloat(newGroupDryRate) : null,
          wetRate: newGroupWetRate ? parseFloat(newGroupWetRate) : null,
        })
      })
      
      if (res.ok) {
        const newGroup = await res.json()
        setGroups([...groups, { ...newGroup, role: 'ADMIN', aircraft: [] }])
        setShowNewGroupModal(false)
        setNewGroupName('')
        setNewGroupDescription('')
        setNewGroupDryRate('')
        setNewGroupWetRate('')
        setSelectedView(newGroup.id)
      } else {
        const error = await res.json()
        setFormError(error.error || 'Failed to create group')
      }
    } catch (error) {
      setFormError('Failed to create group')
    }
    
    setFormLoading(false)
  }
  
  // Add aircraft
  const handleAddAircraft = async () => {
    if (isDemo) {
      setFormError('Please sign in to add aircraft')
      return
    }
    if (isPersonal || !selectedView || selectedView === 'personal') {
      setFormError('Please select a flying club first')
      return
    }
    if (!aircraftNNumber.trim()) {
      setFormError('N-Number is required')
      return
    }
    
    setFormLoading(true)
    setFormError('')
    
    try {
      const res = await fetch(`/api/groups/${selectedView}/aircraft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nNumber: aircraftNNumber,
          nickname: aircraftNickname || null,
          make: aircraftMake || null,
          model: aircraftModel || null,
          year: aircraftYear ? parseInt(aircraftYear) : null,
          hourlyRate: aircraftHourlyRate ? parseFloat(aircraftHourlyRate) : null,
        })
      })
      
      if (res.ok) {
        const newAircraft = await res.json()
        // Update groups state
        setGroups(groups.map(g => 
          g.id === selectedView 
            ? { ...g, aircraft: [...g.aircraft, newAircraft] }
            : g
        ))
        setShowAddAircraftModal(false)
        resetAircraftForm()
      } else {
        const error = await res.json()
        setFormError(error.error || 'Failed to add aircraft')
      }
    } catch (error) {
      setFormError('Failed to add aircraft')
    }
    
    setFormLoading(false)
  }
  
  // Create booking
  const handleCreateBooking = async () => {
    if (isDemo) {
      setFormError('Please sign in to create a booking')
      return
    }
    if (!bookingAircraftId || !bookingStartTime || !bookingEndTime) {
      setFormError('Aircraft, start time, and end time are required')
      return
    }
    
    setFormLoading(true)
    setFormError('')
    
    try {
      const isPersonalBooking = isPersonal || selectedView === 'personal'
      const endpoint = isPersonalBooking ? '/api/personal-bookings' : `/api/groups/${selectedView}/bookings`
      const payload = isPersonalBooking
        ? {
            userAircraftId: bookingAircraftId,
            startTime: bookingStartTime,
            endTime: bookingEndTime,
            purpose: bookingPurpose || null,
          }
        : {
            aircraftId: bookingAircraftId,
            startTime: bookingStartTime,
            endTime: bookingEndTime,
            purpose: bookingPurpose || null,
          }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      
      if (res.ok) {
        const newBooking = await res.json()
        setBookings([...bookings, newBooking])
        setShowNewBookingModal(false)
        resetBookingForm()
      } else {
        const error = await res.json()
        setFormError(error.error || 'Failed to create booking')
      }
    } catch (error) {
      setFormError('Failed to create booking')
    }
    
    setFormLoading(false)
  }
  
  // Report maintenance
  const handleReportMaintenance = async () => {
    if (isDemo) {
      setFormError('Please sign in to report issues')
      return
    }
    if (isPersonal || !selectedView || selectedView === 'personal') {
      setFormError('Please select a flying club first')
      return
    }
    if (!maintenanceAircraftId || !maintenanceDescription.trim()) {
      setFormError('Aircraft and description are required')
      return
    }
    
    setFormLoading(true)
    setFormError('')
    
    try {
      const res = await fetch('/api/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aircraftId: maintenanceAircraftId,
          description: maintenanceDescription,
          notes: maintenanceNotes || null,
          groupId: selectedView,
          isGrounded: maintenanceGrounded,
          postToMarketplace: maintenancePostToMarketplace,
          postAnonymously: maintenancePostAnonymously,
        })
      })
      
      if (res.ok) {
        // Refresh maintenance data
        const logsRes = await fetch(`/api/groups/${selectedView}/logs`)
        if (logsRes.ok) {
          const logsData = await logsRes.json()
          setMaintenance(logsData.maintenance || [])
        }
        setShowReportIssueModal(false)
        resetMaintenanceForm()
      } else {
        const error = await res.json()
        setFormError(error.error || 'Failed to report issue')
      }
    } catch (error) {
      setFormError('Failed to report issue')
    }
    
    setFormLoading(false)
  }
  
  // Log flight
  const handleLogFlight = async () => {
    if (isDemo) {
      setFormError('Please sign in to log flights')
      return
    }
    if (isPersonal || !selectedView || selectedView === 'personal') {
      setFormError('Please select a flying club first')
      return
    }
    if (!logAircraftId || !logDate) {
      setFormError('Aircraft and date are required')
      return
    }
    
    setFormLoading(true)
    setFormError('')
    
    try {
      const res = await fetch(`/api/groups/${selectedView}/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aircraftId: logAircraftId,
          date: logDate,
          tachStart: logTachStart ? parseFloat(logTachStart) : null,
          tachEnd: logTachEnd ? parseFloat(logTachEnd) : null,
          hobbsStart: logHobbsStart ? parseFloat(logHobbsStart) : null,
          hobbsEnd: logHobbsEnd ? parseFloat(logHobbsEnd) : null,
          notes: logNotes || null,
        })
      })
      
      if (res.ok) {
        const newLog = await res.json()
        setFlightLogs([newLog, ...flightLogs])
        setShowLogFlightModal(false)
        resetLogFlightForm()
      } else {
        const error = await res.json()
        setFormError(error.error || 'Failed to log flight')
      }
    } catch (error) {
      setFormError('Failed to log flight')
    }
    
    setFormLoading(false)
  }
  
  // Create invite
  const handleCreateInvite = async () => {
    if (isDemo) {
      setFormError('Please sign in to invite members')
      return
    }
    if (isPersonal || !selectedView || selectedView === 'personal') {
      setFormError('Please select a flying club first')
      return
    }
    setFormLoading(true)
    setFormError('')
    
    try {
      const res = await fetch(`/api/groups/${selectedView}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail || null,
          role: inviteRole,
          expiresInDays: 7,
        })
      })
      
      if (res.ok) {
        const invite = await res.json()
        const inviteLink = `${window.location.origin}/join/${invite.token}`
        setGeneratedInviteLink(inviteLink)
        // Refresh invites
        const invitesRes = await fetch(`/api/groups/${selectedView}/invites`)
        if (invitesRes.ok) setInvites(await invitesRes.json())
      } else {
        const error = await res.json()
        setFormError(error.error || 'Failed to create invite')
      }
    } catch (error) {
      setFormError('Failed to create invite')
    }
    
    setFormLoading(false)
  }
  
  // Delete invite
  const handleDeleteInvite = async (inviteId: string) => {
    try {
      const res = await fetch(`/api/groups/${selectedView}/invites?inviteId=${inviteId}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        setInvites(invites.filter(i => i.id !== inviteId))
      }
    } catch (error) {
      console.error('Error deleting invite:', error)
    }
  }
  
  // Remove member
  const handleRemoveMember = async (memberId: string) => {
    if (!confirm('Are you sure you want to remove this member?')) return
    
    try {
      const res = await fetch(`/api/groups/${selectedView}/members?memberId=${memberId}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        setMembers(members.filter(m => m.id !== memberId))
      }
    } catch (error) {
      console.error('Error removing member:', error)
    }
  }
  
  // Reset forms
  const resetAircraftForm = () => {
    setAircraftNNumber('')
    setAircraftNickname('')
    setAircraftMake('')
    setAircraftModel('')
    setAircraftYear('')
    setAircraftHourlyRate('')
    setFormError('')
  }
  
  const resetBookingForm = () => {
    setBookingAircraftId('')
    setBookingStartTime('')
    setBookingEndTime('')
    setBookingPurpose('')
    setFormError('')
  }
  
  const resetMaintenanceForm = () => {
    setMaintenanceAircraftId('')
    setMaintenanceDescription('')
    setMaintenanceNotes('')
    setMaintenanceGrounded(false)
    setMaintenancePostToMarketplace(false)
    setMaintenancePostAnonymously(true)
    setFormError('')
  }
  
  const resetLogFlightForm = () => {
    setLogAircraftId('')
    setLogDate('')
    setLogTachStart('')
    setLogTachEnd('')
    setLogHobbsStart('')
    setLogHobbsEnd('')
    setLogNotes('')
    setFormError('')
  }
  
  const resetInviteForm = () => {
    setInviteEmail('')
    setInviteRole('MEMBER')
    setGeneratedInviteLink('')
    setFormError('')
  }
  
  // Open booking modal with pre-selected date/aircraft
  const isDemo = !session?.user?.id
  const isPersonal = selectedView === 'personal'
  const selectedGroup = groups.find(g => g.id === selectedView)
  const isAdmin = selectedGroup?.role === 'ADMIN' || (isDemo && !isPersonal)
  
  // Helper to check if actions are allowed (show buttons but may need login)
  const canPerformActions = !isPersonal // Actions are allowed when a club is selected
  
  // Filter data based on selected view
  const displayAircraft = isPersonal ? personalAircraft : (selectedGroup?.aircraft || [])
  const displayBookings = isPersonal 
    ? bookings.filter(b => b.source !== 'club')
    : bookings.filter(b => displayAircraft.some(a => a.id === b.aircraftId))
  const displayMaintenance = isPersonal ? [] : maintenance
  const displayMembers = isPersonal ? [] : members
  const displayFlightLogs = isPersonal ? [] : flightLogs

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-[1600px] p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">Flying Club</h1>
              <p className="text-muted-foreground mt-1">Manage your aviation group and aircraft</p>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={selectedView}
                onChange={(e) => setSelectedView(e.target.value)}
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm min-w-[200px]"
              >
                <option value="personal">👤 Personal</option>
                <optgroup label="✈️ Flying Clubs">
                  {(isDemo ? demoGroups : groups).map(group => (
                    <option key={group.id} value={group.id}>{group.name}</option>
                  ))}
                </optgroup>
              </select>
              <Button
                size="sm"
                variant="secondary"
                asChild
                className="hidden sm:inline-flex"
                disabled={isPersonal && !isDemo}
              >
                <Link href="/modules/flying-club/manage">Manage</Link>
              </Button>
              {/* New Group button - always visible */}
              <Button size="sm" type="button" onClick={() => setShowNewGroupModal(true)}>
                <Plus className="mr-1 h-3 w-3" />
                New Group
              </Button>
              <Dialog open={showNewGroupModal} onOpenChange={(open) => { setShowNewGroupModal(open); if (!open) setFormError('') }}>
                <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create New Flying Club</DialogTitle>
                      <DialogDescription>
                        Set up a new flying club to manage aircraft, members, and bookings.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="groupName">Club Name *</Label>
                        <Input 
                          id="groupName" 
                          value={newGroupName} 
                          onChange={(e) => setNewGroupName(e.target.value)}
                          placeholder="e.g., Sky High Flying Club"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="groupDescription">Description</Label>
                        <Textarea 
                          id="groupDescription" 
                          value={newGroupDescription} 
                          onChange={(e) => setNewGroupDescription(e.target.value)}
                          placeholder="A brief description of your club..."
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="dryRate">Dry Rate ($/hr)</Label>
                          <Input 
                            id="dryRate" 
                            type="number"
                            value={newGroupDryRate} 
                            onChange={(e) => setNewGroupDryRate(e.target.value)}
                            placeholder="e.g., 120"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="wetRate">Wet Rate ($/hr)</Label>
                          <Input 
                            id="wetRate" 
                            type="number"
                            value={newGroupWetRate} 
                            onChange={(e) => setNewGroupWetRate(e.target.value)}
                            placeholder="e.g., 145"
                          />
                        </div>
                      </div>
                      {formError && (
                        <p className="text-sm text-destructive">{formError}</p>
                      )}
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowNewGroupModal(false)}>Cancel</Button>
                      <Button onClick={handleCreateGroup} disabled={formLoading}>
                        {formLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Create Club
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
            </div>
          </div>

          {/* Tabs */}
          <div className="mt-6 flex gap-1 border-b border-border overflow-x-auto">
            {(['dashboard', 'calendar', 'bookings', 'scheduled', 'aircraft', 'logbook', 'flights', 'maintenance', 'billing', 'members'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors relative ${
                  activeTab === tab
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab === 'logbook' ? 'Logbook' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                {activeTab === tab && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                )}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-[1600px] p-6">
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* Stats Overview */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card 
                className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50"
                onClick={() => setActiveTab('aircraft')}
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Aircraft</CardTitle>
                  <div className="rounded-full p-2 bg-primary/10 hover:bg-primary/20 transition-colors">
                    <Plane className="h-4 w-4 text-primary" />
                  </div>
                </CardHeader>
                <CardContent>
            <div className="text-2xl font-bold">{displayAircraft.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {displayAircraft.filter(a => a.status === 'Available').length} available
            </p>
                </CardContent>
              </Card>

              <Card 
                className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50"
                onClick={() => setActiveTab('bookings')}
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Upcoming Bookings</CardTitle>
                  <div className="rounded-full p-2 bg-blue-500/10 hover:bg-blue-500/20 transition-colors">
                    <Calendar className="h-4 w-4 text-blue-500" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{displayBookings.length}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {displayBookings.length > 0 ? `Next: ${new Date(displayBookings[0]?.startTime || '').toLocaleDateString()}` : 'No bookings'}
                  </p>
                </CardContent>
              </Card>

              <Card 
                className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50"
                onClick={() => setActiveTab('members')}
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active Members</CardTitle>
                  <div className="rounded-full p-2 bg-green-500/10 hover:bg-green-500/20 transition-colors">
                    <Users className="h-4 w-4 text-green-500" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{isPersonal ? 1 : displayMembers.length}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {isPersonal ? 'Personal account' : `${displayMembers.filter(m => m.role === 'ADMIN').length} admins`}
                  </p>
                </CardContent>
              </Card>

              <Card 
                className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50"
                onClick={() => setActiveTab('maintenance')}
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Maintenance Items</CardTitle>
                  <div className={`rounded-full p-2 transition-colors ${displayMaintenance.length > 0 ? 'bg-destructive/10 hover:bg-destructive/20' : 'bg-orange-500/10 hover:bg-orange-500/20'}`}>
                    <Wrench className={`h-4 w-4 ${displayMaintenance.length > 0 ? 'text-destructive' : 'text-orange-500'}`} />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${displayMaintenance.length > 0 ? 'text-destructive' : ''}`}>
                    {displayMaintenance.length}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {displayMaintenance.filter(m => m.priority === 'high').length} high priority
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Groups Overview - Only show for clubs */}
            {!isPersonal && (
            <div className="grid gap-6 lg:grid-cols-2">
              {/* First column: Groups */}
              {(selectedView === 'all' ? groups : [selectedGroup].filter(Boolean)).map((group) => group && (
                <Card key={group.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle>{group.name}</CardTitle>
                        <CardDescription className="mt-1">{group.description}</CardDescription>
                      </div>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Plane className="h-4 w-4" />
                        <span>{group.aircraft.length} aircraft</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Users className="h-4 w-4" />
                        <span>{displayMembers.length || group.members} members</span>
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">Aircraft</p>
                        {isAdmin && (
                          <Button variant="ghost" size="sm" type="button" onClick={() => setShowAddAircraftModal(true)}>
                            <Plus className="h-3 w-3 mr-1" />
                            Add
                          </Button>
                        )}
                      </div>
                      {group.aircraft.map((aircraft) => (
                        <div key={aircraft.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-sm">{aircraft.nNumber}</p>
                              <Badge variant={aircraft.status === 'Available' ? 'secondary' : 'destructive'} className="text-xs">
                                {aircraft.status}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {aircraft.year} {aircraft.make} {aircraft.model}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold">${aircraft.hourlyRate}/hr</p>
                            <p className="text-xs text-muted-foreground">{aircraft.hobbsHours} hrs</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    <Button variant="outline" className="w-full" onClick={() => setActiveTab('aircraft')}>
                      View All Aircraft
                    </Button>
                  </CardContent>
                </Card>
              ))}

              {/* Second column: Group Chat when only 1 or fewer clubs */}
              {(selectedView === 'all' ? groups : [selectedGroup].filter(Boolean)).length < 2 && (
                <Card className="flex flex-col h-[500px]">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">Group Chat</CardTitle>
                        <CardDescription>Chat with club members</CardDescription>
                      </div>
                      <Button variant="ghost" size="sm">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col p-0">
                    {/* Chat Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                      {chatMessages.length > 0 ? (
                        chatMessages.map((msg) => (
                          <div key={msg.id} className="flex gap-3">
                            <div className={`h-8 w-8 rounded-full flex items-center justify-center text-white text-xs ${msg.user.color || 'bg-primary'}`}>
                              {msg.user.initials}
                            </div>
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium">{msg.user.name}</p>
                                <span className="text-xs text-muted-foreground">{new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                              </div>
                              <p className="text-sm text-muted-foreground bg-muted p-2 rounded-lg rounded-tl-none">{msg.message}</p>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center text-muted-foreground py-8">
                          <p className="text-sm">No messages yet</p>
                          <p className="text-xs">Start a conversation with your club</p>
                        </div>
                      )}
                    </div>
                    
                    {/* Chat Input */}
                    <div className="p-3 border-t">
                      <div className="flex gap-2">
                        <Input 
                          placeholder="Type a message..." 
                          className="flex-1"
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && handleSendChat()}
                          disabled={!session?.user?.id || selectedView === 'personal'}
                        />
                        <Button 
                          size="sm" 
                          disabled={!session?.user?.id || selectedView === 'personal' || !chatInput.trim()}
                          onClick={handleSendChat}
                        >
                          Send
                        </Button>
                      </div>
                      {selectedView === 'personal' ? (
                        <p className="text-xs text-muted-foreground mt-2 text-center">Select a club to chat with members</p>
                      ) : !session?.user?.id && (
                        <p className="text-xs text-muted-foreground mt-2 text-center">Sign in to chat</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
            )}

            {/* Upcoming Bookings, Maintenance & Checkout */}
            <div className="grid gap-6 xl:grid-cols-[2fr,1fr]">
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>Upcoming Bookings</CardTitle>
                      <Button variant="ghost" size="sm" onClick={() => setActiveTab('bookings')}>View All</Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {displayBookings.slice(0, 5).map((booking) => (
                        <div key={booking.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-sm">{booking.aircraft?.nNumber || booking.aircraftId}</p>
                              <span className="text-xs text-muted-foreground">•</span>
                              <p className="text-sm text-muted-foreground">{booking.user?.name || 'Unknown'}</p>
                            </div>
                            <p className="text-xs text-muted-foreground">{booking.purpose}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium">{booking.startTime ? new Date(booking.startTime).toLocaleDateString() : 'N/A'}</p>
                            <p className="text-xs text-muted-foreground">{booking.startTime && booking.endTime ? `${new Date(booking.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - ${new Date(booking.endTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}` : 'N/A'}</p>
                          </div>
                        </div>
                      ))}
                      {displayBookings.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">No upcoming bookings</p>
                      )}
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
                    <div className="space-y-3">
                      {displayMaintenance.slice(0, 5).map((item) => (
                        <div key={item.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-sm">{item.aircraft?.nNumber || item.aircraftId}</p>
                              <Badge variant={item.status === 'In Progress' ? 'default' : 'secondary'} className="text-xs">
                                {item.status}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">{item.description}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium">Due: {item.dueDate || 'N/A'}</p>
                            {item.priority === 'high' && (
                              <div className="flex items-center justify-end gap-1 mt-1">
                                <AlertCircle className="h-3 w-3 text-destructive" />
                                <p className="text-xs text-destructive">High Priority</p>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                      {displayMaintenance.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">No maintenance items</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {!isPersonal && selectedGroup ? (
                <CheckoutPanel groupId={selectedView} userId={session?.user?.id as string | undefined} />
              ) : (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    Sign in and select a club to use mobile checkout.
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}

        {activeTab === 'calendar' && (
          <div className="space-y-4">
            {isPersonal ? (
              <Card>
                <CardHeader>
                  <CardTitle>Flight Schedule</CardTitle>
                  <CardDescription>Select a flying club to view its shared schedule.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    The calendar is only available for club aircraft. Switch to one of your clubs or create a new club to begin managing shared bookings.
                  </p>
                </CardContent>
              </Card>
            ) : selectedGroup ? (
              <BookingCalendar groupId={selectedView} isAdmin={isAdmin} />
            ) : (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground">
                  Select a club to view its calendar.
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {activeTab === 'aircraft' && (
          <div className="space-y-4">
            {isAdmin && canPerformActions && (
              <div className="flex justify-end">
                <Button onClick={() => setShowAddAircraftModal(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Aircraft
                </Button>
              </div>
            )}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {displayAircraft.map((aircraft) => (
                <Card key={aircraft.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          {aircraft.nNumber}
                          <Badge variant={aircraft.status === 'Available' ? 'secondary' : 'destructive'}>
                            {aircraft.status}
                          </Badge>
                        </CardTitle>
                        <CardDescription className="mt-1">
                          {aircraft.year} {aircraft.make} {aircraft.model}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-1.5">
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                        <span>${aircraft.hourlyRate}/hr</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span>{aircraft.hobbsHours} hrs</span>
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Next Maintenance</span>
                        <span className="font-medium">250 hrs</span>
                      </div>
                      <Progress value={75} className="h-2" />
                    </div>

                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        className="flex-1"
                        onClick={() => {
                          if (canPerformActions) {
                            const now = new Date()
                            const startIso = now.toISOString().slice(0, 16)
                            const endIso = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString().slice(0, 16)
                            setBookingAircraftId(aircraft.id)
                            setSchedulerAircraftId(aircraft.id)
                            setBookingStartTime(startIso)
                            setBookingEndTime(endIso)
                            setBookingPurpose('')
                            setShowQuickBookingModal(true)
                          }
                        }}
                        disabled={aircraft.status !== 'Available' || isPersonal}
                      >
                        <Calendar className="mr-2 h-4 w-4" />
                        Book
                      </Button>
                      <Button variant="outline" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'bookings' && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>All Bookings</CardTitle>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm">
                    <Filter className="mr-2 h-4 w-4" />
                    Filter
                  </Button>
                  {canPerformActions && (
                    <Button size="sm" type="button" onClick={() => setShowNewBookingModal(true)}>
                      <Plus className="mr-2 h-4 w-4" />
                      New Booking
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {displayBookings.map((booking) => (
                  <div key={booking.id} className="flex items-center justify-between rounded-lg border border-border p-4">
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <Plane className="h-5 w-5 text-primary" />
                      </div>
                      <div className="space-y-1">
                        <p className="font-medium text-sm">{booking.aircraft?.nNumber || booking.aircraftId}</p>
                        <p className="text-xs text-muted-foreground">{booking.purpose}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-sm font-medium">{booking.user?.name || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground">{booking.startTime ? new Date(booking.startTime).toLocaleDateString() : 'N/A'}</p>
                      </div>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                {displayBookings.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">No bookings yet</p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === 'scheduled' && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Scheduled Flights</h2>
                <p className="text-xs text-muted-foreground">Your upcoming flights across personal and club aircraft</p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  value={scheduledWindow}
                  onChange={(e) => setScheduledWindow(e.target.value as '7' | '30' | 'all')}
                >
                  <option value="7">Next 7 days</option>
                  <option value="30">Next 30 days</option>
                  <option value="all">All upcoming</option>
                </select>
                <Button size="sm" variant="outline" onClick={() => setActiveTab('bookings')}>
                  View Calendar
                </Button>
              </div>
            </div>

            {scheduledError && <div className="text-xs text-destructive">{scheduledError}</div>}
            {isScheduledLoading && !scheduledError && <div className="text-xs text-muted-foreground">Loading…</div>}

            <Card>
              <CardContent className="p-0">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Aircraft</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Start</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">End</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Purpose</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {scheduledBookings.length === 0 && !isScheduledLoading ? (
                      <tr>
                        <td className="px-4 py-6 text-center text-muted-foreground" colSpan={5}>
                          No scheduled flights
                        </td>
                      </tr>
                    ) : (
                      scheduledBookings.map((booking) => (
                        <tr key={booking.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-foreground">{booking.aircraft?.nNumber || 'Aircraft'}</span>
                              <Badge variant="outline" className="text-[10px]">
                                {booking.groupName ? `Club: ${booking.groupName}` : 'Personal'}
                              </Badge>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {[booking.aircraft?.make, booking.aircraft?.model].filter(Boolean).join(' ') || '—'}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {new Date(booking.startTime).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {new Date(booking.endTime).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{booking.purpose || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </>
        )}

        {activeTab === 'maintenance' && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Maintenance Tracking</CardTitle>
                {canPerformActions && (
                  <>
                  <Button size="sm" type="button" onClick={() => setShowReportIssueModal(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Report Issue
                  </Button>
                  <Dialog open={showReportIssueModal} onOpenChange={(open) => { setShowReportIssueModal(open); if (!open) resetMaintenanceForm() }}>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Report Maintenance Issue</DialogTitle>
                        <DialogDescription>
                          Report a maintenance issue or squawk for an aircraft.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="maintenanceAircraft">Aircraft *</Label>
                          <select
                            id="maintenanceAircraft"
                            value={maintenanceAircraftId}
                            onChange={(e) => setMaintenanceAircraftId(e.target.value)}
                            className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm"
                          >
                            <option value="">Select aircraft...</option>
                            {displayAircraft.map(aircraft => (
                              <option key={aircraft.id} value={aircraft.id}>
                                {aircraft.nNumber} - {aircraft.make} {aircraft.model}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="description">Description *</Label>
                          <Textarea 
                            id="description" 
                            value={maintenanceDescription} 
                            onChange={(e) => setMaintenanceDescription(e.target.value)}
                            placeholder="Describe the issue..."
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Quick Select</Label>
                          <div className="flex flex-wrap gap-2">
                            {['Oil top-up needed', 'Low tire pressure', 'Rough idle', 'Alternator issue', 'Radio static'].map(issue => (
                              <Button 
                                key={issue}
                                variant="outline" 
                                size="sm"
                                onClick={() => setMaintenanceDescription(issue)}
                              >
                                {issue}
                              </Button>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="notes">Additional Notes</Label>
                          <Textarea 
                            id="notes" 
                            value={maintenanceNotes} 
                            onChange={(e) => setMaintenanceNotes(e.target.value)}
                            placeholder="Any additional details..."
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="grounded"
                            checked={maintenanceGrounded}
                            onChange={(e) => setMaintenanceGrounded(e.target.checked)}
                            className="h-4 w-4"
                          />
                          <Label htmlFor="grounded" className="text-sm font-normal">
                            Ground aircraft (prevents new bookings)
                          </Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="postToMarketplace"
                            checked={maintenancePostToMarketplace}
                            onChange={(e) => setMaintenancePostToMarketplace(e.target.checked)}
                            className="h-4 w-4"
                          />
                          <Label htmlFor="postToMarketplace" className="text-sm font-normal">
                            Post to mechanic marketplace
                          </Label>
                        </div>
                        {maintenancePostToMarketplace && (
                          <div className="flex items-center gap-2 pl-6">
                            <input
                              type="checkbox"
                              id="postAnonymous"
                              checked={maintenancePostAnonymously}
                              onChange={(e) => setMaintenancePostAnonymously(e.target.checked)}
                              className="h-4 w-4"
                            />
                            <Label htmlFor="postAnonymous" className="text-sm font-normal">
                              Hide my identity
                            </Label>
                          </div>
                        )}
                        {formError && (
                          <p className="text-sm text-destructive">{formError}</p>
                        )}
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setShowReportIssueModal(false)}>Cancel</Button>
                        <Button onClick={handleReportMaintenance} disabled={formLoading}>
                          {formLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                          Report Issue
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  </>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {displayMaintenance.map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-lg border border-border p-4">
                    <div className="flex items-center gap-4">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                        item.priority === 'high' ? 'bg-destructive/10' : 'bg-muted'
                      }`}>
                        <Wrench className={`h-5 w-5 ${item.priority === 'high' ? 'text-destructive' : 'text-muted-foreground'}`} />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{item.aircraft?.nNumber || item.aircraftId}</p>
                          <Badge variant={item.status === 'In Progress' ? 'default' : 'secondary'}>
                            {item.status}
                          </Badge>
                          {item.isGrounded && (
                            <Badge variant="destructive">Grounded</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{item.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-sm font-medium">Due: {item.dueDate || 'N/A'}</p>
                        {item.priority === 'high' && (
                          <div className="flex items-center justify-end gap-1 mt-1">
                            <AlertCircle className="h-3 w-3 text-destructive" />
                            <p className="text-xs text-destructive">High Priority</p>
                          </div>
                        )}
                      </div>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                {displayMaintenance.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">No maintenance items</p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {(activeTab === 'flights' || activeTab === 'logbook') && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Flight Logs</CardTitle>
                {canPerformActions && (
                  <>
                  <Button size="sm" type="button" onClick={() => setShowLogFlightModal(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Log Flight
                  </Button>
                  <Dialog open={showLogFlightModal} onOpenChange={(open) => { setShowLogFlightModal(open); if (!open) resetLogFlightForm() }}>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Log Flight</DialogTitle>
                        <DialogDescription>
                          Record your flight details.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="logAircraft">Aircraft *</Label>
                            <select
                              id="logAircraft"
                              value={logAircraftId}
                              onChange={(e) => setLogAircraftId(e.target.value)}
                              className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm"
                            >
                              <option value="">Select aircraft...</option>
                              {displayAircraft.map(aircraft => (
                                <option key={aircraft.id} value={aircraft.id}>
                                  {aircraft.nNumber}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="logDate">Date *</Label>
                            <Input 
                              id="logDate" 
                              type="date"
                              value={logDate} 
                              onChange={(e) => setLogDate(e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="tachStart">Tach Start</Label>
                            <Input 
                              id="tachStart" 
                              type="number"
                              step="0.1"
                              value={logTachStart} 
                              onChange={(e) => setLogTachStart(e.target.value)}
                              placeholder="e.g., 1234.5"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="tachEnd">Tach End</Label>
                            <Input 
                              id="tachEnd" 
                              type="number"
                              step="0.1"
                              value={logTachEnd} 
                              onChange={(e) => setLogTachEnd(e.target.value)}
                              placeholder="e.g., 1236.0"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="hobbsStart">Hobbs Start</Label>
                            <Input 
                              id="hobbsStart" 
                              type="number"
                              step="0.1"
                              value={logHobbsStart} 
                              onChange={(e) => setLogHobbsStart(e.target.value)}
                              placeholder="e.g., 456.7"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="hobbsEnd">Hobbs End</Label>
                            <Input 
                              id="hobbsEnd" 
                              type="number"
                              step="0.1"
                              value={logHobbsEnd} 
                              onChange={(e) => setLogHobbsEnd(e.target.value)}
                              placeholder="e.g., 458.5"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="logNotes">Notes</Label>
                          <Textarea 
                            id="logNotes" 
                            value={logNotes} 
                            onChange={(e) => setLogNotes(e.target.value)}
                            placeholder="Route, weather, remarks..."
                          />
                        </div>
                        {formError && (
                          <p className="text-sm text-destructive">{formError}</p>
                        )}
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setShowLogFlightModal(false)}>Cancel</Button>
                        <Button onClick={handleLogFlight} disabled={formLoading}>
                          {formLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                          Log Flight
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  </>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {displayFlightLogs.map((log) => (
                  <div key={log.id} className="flex items-center justify-between rounded-lg border border-border p-4">
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <BookOpen className="h-5 w-5 text-primary" />
                      </div>
                      <div className="space-y-1">
                        <p className="font-medium text-sm">{log.aircraft?.nNumber || log.aircraftId}</p>
                        <p className="text-xs text-muted-foreground">{log.notes || 'No notes'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-sm font-medium">{log.user?.name || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(log.date).toLocaleDateString()} • {log.hobbsTime || 0}h Hobbs
                        </p>
                      </div>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                {displayFlightLogs.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="rounded-full bg-muted p-4 mb-4">
                      <BookOpen className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">No flight logs yet</h3>
                    <p className="text-sm text-muted-foreground mb-4">Get started by logging your first flight</p>
                    {canPerformActions && (
                      <Button onClick={() => setShowLogFlightModal(true)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Log Flight
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === 'billing' && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Monthly Billing</CardTitle>
                <div className="flex items-center gap-2">
                  <select
                    value={billingMonth}
                    onChange={(e) => setBillingMonth(parseInt(e.target.value))}
                    className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
                  >
                    {MONTHS.map((month, i) => (
                      <option key={i} value={i}>{month}</option>
                    ))}
                  </select>
                  <select
                    value={billingYear}
                    onChange={(e) => setBillingYear(parseInt(e.target.value))}
                    className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
                  >
                    {[2024, 2025, 2026].map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                  <Button variant="outline" size="sm">
                    <Download className="mr-2 h-4 w-4" />
                    Export
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {!isAdmin ? (
                <p className="text-sm text-muted-foreground text-center py-8">Only admins can view billing</p>
              ) : billingData || isDemo ? (
                <div className="space-y-6">
                  {isAdmin && !isPersonal && !isDemo && (
                    <BillingRunButton groupId={selectedView} clubName={selectedGroup?.name} />
                  )}

                  {/* Summary */}
                  <div className="grid grid-cols-4 gap-4">
                    <div className="rounded-lg border p-4">
                      <p className="text-sm text-muted-foreground">Total Members</p>
                      <p className="text-2xl font-bold">{(billingData || demoBillingData).totalMembers}</p>
                    </div>
                    <div className="rounded-lg border p-4">
                      <p className="text-sm text-muted-foreground">Total Flights</p>
                      <p className="text-2xl font-bold">{(billingData || demoBillingData).totalFlights}</p>
                    </div>
                    <div className="rounded-lg border p-4">
                      <p className="text-sm text-muted-foreground">Total Hobbs</p>
                      <p className="text-2xl font-bold">{(billingData || demoBillingData).totalHobbs.toFixed(1)}h</p>
                    </div>
                    <div className="rounded-lg border p-4">
                      <p className="text-sm text-muted-foreground">Total Billed</p>
                      <p className="text-2xl font-bold">${(billingData || demoBillingData).totalCost.toFixed(2)}</p>
                    </div>
                  </div>
                  
                  {/* Member breakdown */}
                  <div className="space-y-2">
                    {(billingData || demoBillingData).members.map((member) => (
                      <div key={member.userId} className="rounded-lg border p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{member.name}</p>
                            <p className="text-sm text-muted-foreground">{member.email}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold">${member.totalCost.toFixed(2)}</p>
                            <p className="text-sm text-muted-foreground">
                              {member.flights} flights • {member.totalHobbs.toFixed(1)}h
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="rounded-full bg-muted p-4 mb-4">
                    <DollarSign className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No billing data</h3>
                  <p className="text-sm text-muted-foreground">No flights recorded for this period</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === 'members' && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Members</CardTitle>
                {isAdmin && canPerformActions && (
                  <>
                  <Button size="sm" type="button" onClick={() => setShowInviteModal(true)}>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Invite Member
                  </Button>
                  <Dialog open={showInviteModal} onOpenChange={(open) => { setShowInviteModal(open); if (!open) resetInviteForm() }}>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Invite Member</DialogTitle>
                        <DialogDescription>
                          Create an invite link or send directly to an email.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="inviteEmail">Email (optional)</Label>
                          <Input 
                            id="inviteEmail" 
                            type="email"
                            value={inviteEmail} 
                            onChange={(e) => setInviteEmail(e.target.value)}
                            placeholder="member@example.com"
                          />
                          <p className="text-xs text-muted-foreground">Leave blank to generate a shareable link</p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="inviteRole">Role</Label>
                          <select
                            id="inviteRole"
                            value={inviteRole}
                            onChange={(e) => setInviteRole(e.target.value)}
                            className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm"
                          >
                            <option value="MEMBER">Member</option>
                            <option value="ADMIN">Admin</option>
                          </select>
                        </div>
                        {generatedInviteLink && (
                          <div className="space-y-2">
                            <Label>Invite Link</Label>
                            <div className="flex gap-2">
                              <Input value={generatedInviteLink} readOnly />
                              <Button 
                                variant="outline" 
                                size="icon"
                                onClick={() => {
                                  navigator.clipboard.writeText(generatedInviteLink)
                                  alert('Copied to clipboard!')
                                }}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        )}
                        {formError && (
                          <p className="text-sm text-destructive">{formError}</p>
                        )}
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setShowInviteModal(false)}>Close</Button>
                        <Button onClick={handleCreateInvite} disabled={formLoading}>
                          {formLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                          {generatedInviteLink ? 'Generate New Link' : 'Create Invite'}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  </>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isPersonal ? (
                <p className="text-sm text-muted-foreground text-center py-8">Select a club to view members</p>
              ) : (
                <div className="space-y-4">
                  <MemberList
                    groupId={selectedView}
                    isAdmin={isAdmin}
                    onInviteClick={canPerformActions && isAdmin ? () => setShowInviteModal(true) : undefined}
                  />

                  {isAdmin && invites.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Pending Invites</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {invites.map((invite) => (
                          <div key={invite.id} className="flex items-center justify-between rounded-lg border border-dashed border-border p-3">
                            <div className="flex items-center gap-3">
                              <Mail className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <p className="text-sm">{invite.email || 'Open invite link'}</p>
                                <p className="text-xs text-muted-foreground">
                                  {invite.role} • Expires {invite.expiresAt ? new Date(invite.expiresAt).toLocaleDateString() : 'Never'}
                                </p>
                              </div>
                            </div>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={() => handleDeleteInvite(invite.id)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </main>
      
      {/* New Booking Modal (used from calendar/aircraft) */}
      <Dialog open={showNewBookingModal} onOpenChange={(open) => { setShowNewBookingModal(open); if (!open) resetBookingForm() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Booking</DialogTitle>
            <DialogDescription>
              Book an aircraft for your flight.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="bookingAircraft2">Aircraft *</Label>
              <select
                id="bookingAircraft2"
                value={bookingAircraftId}
                onChange={(e) => setBookingAircraftId(e.target.value)}
                className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm"
              >
                <option value="">Select aircraft...</option>
                {displayAircraft.filter(a => a.status === 'Available').map(aircraft => (
                  <option key={aircraft.id} value={aircraft.id}>
                    {aircraft.nNumber} - {aircraft.make} {aircraft.model}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startTime2">Start Time *</Label>
                <Input 
                  id="startTime2" 
                  type="datetime-local"
                  value={bookingStartTime} 
                  onChange={(e) => setBookingStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endTime2">End Time *</Label>
                <Input 
                  id="endTime2" 
                  type="datetime-local"
                  value={bookingEndTime} 
                  onChange={(e) => setBookingEndTime(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="purpose2">Purpose</Label>
              <Input 
                id="purpose2" 
                value={bookingPurpose} 
                onChange={(e) => setBookingPurpose(e.target.value)}
                placeholder="e.g., Cross country, Pattern work, IFR practice"
              />
            </div>
            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewBookingModal(false)}>Cancel</Button>
            <Button onClick={handleCreateBooking} disabled={formLoading}>
              {formLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create Booking
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Booking Modal (from aircraft tab) */}
      <Dialog open={showQuickBookingModal} onOpenChange={(open) => { setShowQuickBookingModal(open); if (!open) resetBookingForm() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule a Flight</DialogTitle>
            <DialogDescription>Book this club aircraft.</DialogDescription>
          </DialogHeader>
          <FlightScheduler
            initialMode="club"
            initialGroupId={selectedView}
            initialAircraftId={schedulerAircraftId}
            lockMode
            lockGroup
            hideModeToggle
            onSuccess={() => {
              setShowQuickBookingModal(false)
              setScheduledBookings(bookings)
            }}
          />
        </DialogContent>
      </Dialog>
      
      {/* Add Aircraft Modal */}
      <Dialog open={showAddAircraftModal} onOpenChange={(open) => { setShowAddAircraftModal(open); if (!open) resetAircraftForm() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Aircraft</DialogTitle>
            <DialogDescription>
              Add a new aircraft to your flying club.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="nNumber">N-Number *</Label>
              <Input 
                id="nNumber" 
                value={aircraftNNumber} 
                onChange={(e) => setAircraftNNumber(e.target.value.toUpperCase())}
                placeholder="e.g., N172SP"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nickname">Nickname</Label>
              <Input 
                id="nickname" 
                value={aircraftNickname} 
                onChange={(e) => setAircraftNickname(e.target.value)}
                placeholder="e.g., Skyhawk"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="make">Make</Label>
                <Input 
                  id="make" 
                  value={aircraftMake} 
                  onChange={(e) => setAircraftMake(e.target.value)}
                  placeholder="e.g., Cessna"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="model">Model</Label>
                <Input 
                  id="model" 
                  value={aircraftModel} 
                  onChange={(e) => setAircraftModel(e.target.value)}
                  placeholder="e.g., 172S"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="year">Year</Label>
                <Input 
                  id="year" 
                  type="number"
                  value={aircraftYear} 
                  onChange={(e) => setAircraftYear(e.target.value)}
                  placeholder="e.g., 2020"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="hourlyRate">Hourly Rate ($)</Label>
                <Input 
                  id="hourlyRate" 
                  type="number"
                  value={aircraftHourlyRate} 
                  onChange={(e) => setAircraftHourlyRate(e.target.value)}
                  placeholder="e.g., 145"
                />
              </div>
            </div>
            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddAircraftModal(false)}>Cancel</Button>
            <Button onClick={handleAddAircraft} disabled={formLoading}>
              {formLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Add Aircraft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
