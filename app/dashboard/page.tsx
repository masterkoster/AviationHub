'use client'

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FlightScheduler } from "@/components/scheduler/FlightScheduler"
import { Separator } from "@/components/ui/separator"
import { 
  Plane, 
  MapPin,
  Wind,
  Fuel,
  Cloud,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Settings,
  Bell,
  Search,
  FileText,
  Wrench,
  GraduationCap,
  Gauge,
  ArrowRight,
  Eye,
  Edit,
  Plus,
  X,
  LayoutDashboard,
  EyeOff,
  Loader2,
  Navigation,
  User,
  ExternalLink,
  Mail
} from "lucide-react"
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip } from "recharts"
import { FlightCompleteWizard } from "@/components/flight-complete/FlightCompleteWizard"

// Demo data markers - TODO: Connect to real database tables
// - LogbookEntry table for flight hours
// - FlightPlan table for saved plans  
// - UserAircraft table for maintenance
// - PilotProfile for home airport
// - NEW TABLE NEEDED: Credential tracking (medical, flight review, etc)
// - NEW API NEEDED: Weather/METAR integration

// Widget definitions
type WidgetType = 
  | 'airport-weather'
  | 'quick-alerts'
  | 'flight-hours'
  | 'upcoming-flights'
  | 'maintenance'
  | 'currency'
  | 'flight-plans'

const WIDGET_INFO: Record<WidgetType, { name: string; description: string }> = {
  'airport-weather': { name: 'Home Airport Weather', description: 'Current conditions at your home airport' },
  'quick-alerts': { name: 'Quick Alerts', description: 'Scheduled maintenance, next flight, and hours' },
  'flight-hours': { name: 'Flight Hours Chart', description: 'Your flying activity over time' },
  'upcoming-flights': { name: 'Upcoming Flights', description: 'Your scheduled flights and lessons' },
  'maintenance': { name: 'Aircraft Maintenance', description: 'Due maintenance items' },
  'currency': { name: 'Currency & Licenses', description: 'Credential expiration tracking' },
  'flight-plans': { name: 'Saved Flight Plans', description: 'Quick access to your routes' },
}

// Flight hours data is computed from logbook entries

// Currency data loaded from /api/logbook/currency/progress

export default function PilotDashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [groupId, setGroupId] = useState<string | null>(null)
  const [groupIds, setGroupIds] = useState<string[]>([])
  const [customizeMode, setCustomizeMode] = useState(false)
  const [visibleWidgets, setVisibleWidgets] = useState<WidgetType[]>([
    'airport-weather',
    'quick-alerts',
    'flight-hours',
    'upcoming-flights',
    'maintenance',
    'currency',
    'flight-plans',
  ])

  // Modal/selection state
  const [selectedFlightPlan, setSelectedFlightPlan] = useState<any>(null)
  const [selectedMaintenanceItem, setSelectedMaintenanceItem] = useState<any>(null)
  const [selectedCurrencyItem, setSelectedCurrencyItem] = useState<any>(null)
  const [showFlightComplete, setShowFlightComplete] = useState(false)
  const [activeFlight, setActiveFlight] = useState<{id: string; aircraftId: string; aircraftName: string; userId: string; userName: string; hobbsStart?: number} | null>(null)
  const [scheduledWindow, setScheduledWindow] = useState<'7' | '30' | 'all'>('7')
  const [scheduledFlights, setScheduledFlights] = useState<any[]>([])
  const [isScheduledLoading, setIsScheduledLoading] = useState(false)
  const [scheduledError, setScheduledError] = useState<string | null>(null)
  const [showScheduler, setShowScheduler] = useState(false)
  const [scheduledRefreshKey, setScheduledRefreshKey] = useState(0)
  const [showNextFlightModal, setShowNextFlightModal] = useState(false)
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false)
  const [showLogbookModal, setShowLogbookModal] = useState(false)
  const [maintenanceItems, setMaintenanceItems] = useState<any[]>([])
  const [maintenanceError, setMaintenanceError] = useState<string | null>(null)
  const [maintenanceLoading, setMaintenanceLoading] = useState(false)
  const [logbookEntries, setLogbookEntries] = useState<any[]>([])
  const [logbookError, setLogbookError] = useState<string | null>(null)
  const [logbookLoading, setLogbookLoading] = useState(false)
  const [homeAirportIcao, setHomeAirportIcao] = useState<string | null>(null)
  const [homeAirportName, setHomeAirportName] = useState<string | null>(null)
  const [homeWeather, setHomeWeather] = useState<any | null>(null)
  const [homeWeatherUpdatedAt, setHomeWeatherUpdatedAt] = useState<string | null>(null)
  const [homeWeatherError, setHomeWeatherError] = useState<string | null>(null)
  const [homeWeatherLoading, setHomeWeatherLoading] = useState(false)
  const [fuelPrice, setFuelPrice] = useState<number | null>(null)
  const [fuelPriceUpdatedAt, setFuelPriceUpdatedAt] = useState<string | null>(null)
  const [fuelPriceError, setFuelPriceError] = useState<string | null>(null)
  const [fuelPriceLoading, setFuelPriceLoading] = useState(false)
  const [communityFuelPrice, setCommunityFuelPrice] = useState<number | null>(null)
  const [communityFuelUpdatedAt, setCommunityFuelUpdatedAt] = useState<string | null>(null)
  const [communityFuelError, setCommunityFuelError] = useState<string | null>(null)
  const [communityFuelLoading, setCommunityFuelLoading] = useState(false)
  const [mechanicUnread, setMechanicUnread] = useState(0)
  const [showMechanicNotice, setShowMechanicNotice] = useState(false)
  const [lastMechanicUnread, setLastMechanicUnread] = useState(0)

  const [currencyItems, setCurrencyItems] = useState<any[]>([])
  const [currencyLoading, setCurrencyLoading] = useState(false)
  const [currencyError, setCurrencyError] = useState<string | null>(null)
  const [savedFlightPlans, setSavedFlightPlans] = useState<any[]>([])
  const [flightPlansLoading, setFlightPlansLoading] = useState(false)
  const [flightPlansError, setFlightPlansError] = useState<string | null>(null)

  const flightHoursData = logbookEntries.reduce((acc: any[], entry: any) => {
    const date = entry?.date ? new Date(entry.date) : null
    if (!date || Number.isNaN(date.getTime())) return acc
    const key = date.toLocaleString('en-US', { month: 'short' })
    const existing = acc.find((item) => item.month === key)
    const hours = Number(entry.totalTime || 0)
    if (existing) {
      existing.hours += hours
    } else {
      acc.push({ month: key, hours })
    }
    return acc
  }, [])

  // Load preferences from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('dashboard-widgets')
    if (saved) {
      try {
        setVisibleWidgets(JSON.parse(saved))
      } catch (e) {
        console.error('[v0] Failed to parse saved widgets:', e)
      }
    }
  }, [])

  // Save preferences to localStorage
  useEffect(() => {
    localStorage.setItem('dashboard-widgets', JSON.stringify(visibleWidgets))
  }, [visibleWidgets])

  useEffect(() => {
    let cancelled = false

    async function loadGroups() {
      try {
        const res = await fetch('/api/groups')
        if (!res.ok) return
        const data = await res.json()
        if (!Array.isArray(data) || data.length === 0) return

        const adminGroup =
          data.find((g: any) => g.role === 'ADMIN' || g.role === 'OWNER') ?? data[0]

        const ids = data.map((g: any) => g.id).filter(Boolean)
        setGroupIds(ids)

        if (!adminGroup || cancelled) return
        setGroupId(adminGroup.id)
      } catch (error) {
        console.error('Failed to load groups for dashboard', error)
      }
    }

    loadGroups()
    return () => {
      cancelled = true
    }
  }, [])

  const handleOpenFlightComplete = async () => {
    if (!groupId) {
      alert('Please join or select a flying club to complete a flight')
      return
    }

    try {
      const res = await fetch(`/api/clubs/${groupId}/flights/active`)
      if (!res.ok) {
        const error = await res.json()
        alert(error.error || 'Failed to load active flights')
        return
      }

      const active = await res.json()
      if (!Array.isArray(active) || active.length === 0) {
        const now = new Date()
        const upcoming = scheduledFlights.find((f) => {
          if (!f?.startTime || !f?.endTime) return false
          const start = new Date(f.startTime)
          const end = new Date(f.endTime)
          return start <= now && end >= now && f.groupId
        })

        if (!upcoming) {
          const nextClub = scheduledFlights.find((f) => f?.groupId)
          if (!nextClub) {
            alert('No active flights found')
            return
          }

          const hobbsStartInput = window.prompt('Enter Hobbs start time to check out this flight')
          const hobbsStart = hobbsStartInput ? Number(hobbsStartInput) : NaN
          if (!hobbsStart || Number.isNaN(hobbsStart)) {
            alert('Valid Hobbs start time is required')
            return
          }

          const checkoutRes = await fetch(`/api/clubs/${nextClub.groupId}/flights/checkout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              aircraftId: nextClub.aircraftId,
              hobbsStart,
              notes: nextClub.purpose || null,
            }),
          })

          if (!checkoutRes.ok) {
            const error = await checkoutRes.json()
            alert(error.error || 'Failed to start flight')
            return
          }

          const checkout = await checkoutRes.json()
          const flight = checkout.flight

          setActiveFlight({
            id: flight.id,
            aircraftId: flight.aircraftId,
            aircraftName: flight.aircraft?.nNumber
              ? `${flight.aircraft.nNumber}${flight.aircraft.name ? ` (${flight.aircraft.name})` : ''}`
              : 'Unknown Aircraft',
            userId: flight.user?.id ?? session?.user?.id ?? 'unknown',
            userName: flight.user?.name ?? session?.user?.name ?? 'Pilot',
            hobbsStart: flight.hobbsStart ? Number(flight.hobbsStart) : undefined,
          })
          setShowFlightComplete(true)
          return
        }

        const hobbsStartInput = window.prompt('Enter Hobbs start time to check out this flight')
        const hobbsStart = hobbsStartInput ? Number(hobbsStartInput) : NaN
        if (!hobbsStart || Number.isNaN(hobbsStart)) {
          alert('Valid Hobbs start time is required')
          return
        }

        const checkoutRes = await fetch(`/api/clubs/${upcoming.groupId}/flights/checkout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            aircraftId: upcoming.aircraftId,
            hobbsStart,
            notes: upcoming.purpose || null,
          }),
        })

        if (!checkoutRes.ok) {
          const error = await checkoutRes.json()
          alert(error.error || 'Failed to start flight')
          return
        }

        const checkout = await checkoutRes.json()
        const flight = checkout.flight

        setActiveFlight({
          id: flight.id,
          aircraftId: flight.aircraftId,
          aircraftName: flight.aircraft?.nNumber
            ? `${flight.aircraft.nNumber}${flight.aircraft.name ? ` (${flight.aircraft.name})` : ''}`
            : 'Unknown Aircraft',
          userId: flight.user?.id ?? session?.user?.id ?? 'unknown',
          userName: flight.user?.name ?? session?.user?.name ?? 'Pilot',
          hobbsStart: flight.hobbsStart ? Number(flight.hobbsStart) : undefined,
        })
        setShowFlightComplete(true)
        return
      }

      const sessionUserId = session?.user?.id
      const myFlight = sessionUserId
        ? active.find((f: any) => f.user?.id === sessionUserId || f.userId === sessionUserId)
        : null

      const flight = myFlight ?? active[0]

      setActiveFlight({
        id: flight.id,
        aircraftId: flight.aircraftId,
        aircraftName: flight.aircraft?.nNumber
          ? `${flight.aircraft.nNumber}${flight.aircraft.name ? ` (${flight.aircraft.name})` : ''}`
          : 'Unknown Aircraft',
        userId: flight.user?.id ?? flight.userId ?? sessionUserId ?? 'unknown',
        userName: flight.user?.name ?? session?.user?.name ?? 'Pilot',
        hobbsStart: flight.hobbsStart ? Number(flight.hobbsStart) : undefined,
      })
      setShowFlightComplete(true)
    } catch (error) {
      console.error('Failed to open flight completion wizard', error)
      alert('Failed to load active flights')
    }
  }

  useEffect(() => {
    if (!session?.user?.id) return
    if (groupIds.length === 0) return
    let cancelled = false

    async function loadScheduled() {
      try {
        setIsScheduledLoading(true)
        setScheduledError(null)
        const res = await fetch(`/api/bookings?days=${scheduledWindow}`)
        if (!res.ok) throw new Error('Failed to load bookings')
        const data = await res.json()
        if (cancelled) return

        const bookings = Array.isArray(data) ? data : data.bookings || []
        setScheduledFlights(bookings)
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
  }, [session?.user?.id, groupIds, scheduledWindow, scheduledRefreshKey])

  useEffect(() => {
    if (!session?.user?.id) return
    let cancelled = false

    async function loadMaintenance() {
      try {
        setMaintenanceLoading(true)
        setMaintenanceError(null)
        const res = await fetch('/api/maintenance')
        if (!res.ok) throw new Error('Failed to load maintenance')
        const data = await res.json()
        if (!cancelled) setMaintenanceItems(Array.isArray(data) ? data : data.items || [])
      } catch (error) {
        console.error('Failed to load maintenance', error)
        if (!cancelled) setMaintenanceError('Failed to load maintenance')
      } finally {
        if (!cancelled) setMaintenanceLoading(false)
      }
    }

    loadMaintenance()
    return () => {
      cancelled = true
    }
  }, [session?.user?.id])

  useEffect(() => {
    if (!session?.user?.id) return
    let cancelled = false

    async function loadCurrency() {
      try {
        setCurrencyLoading(true)
        setCurrencyError(null)
        const res = await fetch('/api/logbook/currency/progress')
        if (!res.ok) throw new Error('Failed to load currency')
        const data = await res.json()
        if (cancelled) return
        const items = (data?.progress || []).map((rule: any, idx: number) => {
          const nextDue = rule.nextDueAt ? new Date(rule.nextDueAt) : null
          const daysRemaining = nextDue ? Math.ceil((nextDue.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null
          const status = rule.status === 'expired' ? 'expired' : rule.status === 'expiring' ? 'warning' : 'ok'
          return {
            id: rule.code || idx,
            type: rule.name,
            requirement: rule.progress?.map((p: any) => `${p.completed}/${p.required} ${p.unit}`).join(', '),
            expiryDate: nextDue ? nextDue.toLocaleDateString() : 'N/A',
            daysRemaining,
            status,
            authority: rule.authority,
          }
        })
        setCurrencyItems(items)
      } catch (error) {
        console.error('Failed to load currency', error)
        if (!cancelled) setCurrencyError('Failed to load currency')
      } finally {
        if (!cancelled) setCurrencyLoading(false)
      }
    }

    loadCurrency()
    return () => {
      cancelled = true
    }
  }, [session?.user?.id])

  useEffect(() => {
    if (!session?.user?.id) return
    let cancelled = false

    async function loadFlightPlans() {
      try {
        setFlightPlansLoading(true)
        setFlightPlansError(null)
        const res = await fetch('/api/flight-plans')
        if (!res.ok) throw new Error('Failed to load flight plans')
        const data = await res.json()
        if (cancelled) return
        const plans = Array.isArray(data?.flightPlans) ? data.flightPlans : []
        const mapped = plans.slice(0, 5).map((plan: any) => {
          const route = plan.route || [plan.departureIcao, plan.arrivalIcao].filter(Boolean).join(' → ')
          const distance = plan.distanceNm || plan.distance || null
          const duration = plan.estimatedTime || plan.duration || '—'
          return {
            id: plan.id,
            name: plan.name || 'Flight Plan',
            distance,
            duration,
            route: route || 'Direct',
            lastUpdated: plan.updatedAt ? new Date(plan.updatedAt).toLocaleDateString() : '—',
          }
        })
        setSavedFlightPlans(mapped)
      } catch (error) {
        console.error('Failed to load flight plans', error)
        if (!cancelled) setFlightPlansError('Failed to load flight plans')
      } finally {
        if (!cancelled) setFlightPlansLoading(false)
      }
    }

    loadFlightPlans()
    return () => {
      cancelled = true
    }
  }, [session?.user?.id])

  useEffect(() => {
    if (!homeAirportIcao) return
    let cancelled = false

    async function loadFuelPrice() {
      try {
        setFuelPriceLoading(true)
        setFuelPriceError(null)
        const communityRes = fetch(`/api/fuel-prices/community?icaos=${encodeURIComponent(homeAirportIcao ?? '')}`)
        const priceRes = fetch(`/api/fuel-price?icao=${encodeURIComponent(homeAirportIcao ?? '')}`)

        const [priceResponse, communityResponse] = await Promise.all([priceRes, communityRes])

        if (priceResponse.ok) {
          const data = await priceResponse.json()
          if (!cancelled) {
            setFuelPrice(typeof data?.price100ll === 'number' ? data.price100ll : null)
            setFuelPriceUpdatedAt(data?.lastReported || data?.updatedAt || null)
          }
        } else if (!cancelled) {
          setFuelPriceError('Failed to load airport fuel price')
        }

        if (communityResponse.ok) {
          const communityData = await communityResponse.json()
          const community = Array.isArray(communityData?.prices)
            ? communityData.prices.find((p: any) => p.icao === homeAirportIcao && p.fuelType === '100LL')
            : null
          if (!cancelled) {
            setCommunityFuelPrice(typeof community?.price === 'number' ? community.price : null)
            setCommunityFuelUpdatedAt(community?.purchaseDate || null)
          }
        } else if (!cancelled) {
          setCommunityFuelError('Failed to load community price')
        }
      } catch (error) {
        console.error('Failed to load fuel price', error)
        if (!cancelled) {
          setFuelPriceError('Failed to load fuel price')
          setCommunityFuelError('Failed to load community price')
        }
      } finally {
        if (!cancelled) setFuelPriceLoading(false)
        if (!cancelled) setCommunityFuelLoading(false)
      }
    }

    loadFuelPrice()
    return () => {
      cancelled = true
    }
  }, [homeAirportIcao])

  useEffect(() => {
    let cancelled = false

    async function loadUnread() {
      try {
        const res = await fetch('/api/mechanics/quotes/unread')
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) {
          const unread = typeof data?.unread === 'number' ? data.unread : 0
          setMechanicUnread(unread)
          if (unread > lastMechanicUnread) {
            setShowMechanicNotice(true)
          }
          setLastMechanicUnread(unread)
        }
      } catch (error) {
        console.error('Failed to load mechanic unread count', error)
      }
    }

    loadUnread()
    const interval = setInterval(loadUnread, 60000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [lastMechanicUnread])

  useEffect(() => {
    if (!session?.user?.id) return
    let cancelled = false

    async function loadHomeAirport() {
      try {
        setHomeWeatherLoading(true)
        setHomeWeatherError(null)

        const profileRes = await fetch('/api/profile')
        if (!profileRes.ok) throw new Error('Failed to load profile')
        const profileData = await profileRes.json()
        const profile = profileData?.profile

        const icao = profile?.homeAirport || null
        const name = profile?.homeAirportName || null

        if (!icao) {
          if (!cancelled) {
            setHomeAirportIcao(null)
            setHomeAirportName(null)
            setHomeWeather(null)
            setHomeWeatherUpdatedAt(null)
          }
          return
        }

        if (!cancelled) {
          setHomeAirportIcao(icao)
          setHomeAirportName(name)
        }

        const weatherRes = await fetch(`/api/weather?icao=${encodeURIComponent(icao)}`)
        if (!weatherRes.ok) throw new Error('Failed to load weather')
        const weatherData = await weatherRes.json()
        const metar = Array.isArray(weatherData?.data) ? weatherData.data[0] : weatherData?.data

        if (!cancelled) {
          setHomeWeather(metar || null)
          setHomeWeatherUpdatedAt(weatherData?.fetchedAt || null)
        }
      } catch (error) {
        console.error('Failed to load home airport weather', error)
        if (!cancelled) setHomeWeatherError('Failed to load home airport')
      } finally {
        if (!cancelled) setHomeWeatherLoading(false)
      }
    }

    loadHomeAirport()
    return () => {
      cancelled = true
    }
  }, [session?.user?.id])

  // Save home airport to localStorage when it changes (for persistence)
  useEffect(() => {
    if (homeAirportIcao) {
      localStorage.setItem('homeAirport', JSON.stringify({
        icao: homeAirportIcao,
        name: homeAirportName,
        savedAt: new Date().toISOString()
      }))
    }
  }, [homeAirportIcao, homeAirportName])

  // Load home airport from localStorage on mount for instant display
  useEffect(() => {
    if (!homeAirportIcao && session?.user?.id) {
      const saved = localStorage.getItem('homeAirport')
      if (saved) {
        try {
          const data = JSON.parse(saved)
          // Show saved airport while profile loads
          if (data.icao) {
            setHomeAirportIcao(data.icao)
            setHomeAirportName(data.name)
          }
        } catch (e) {}
      }
    }
  }, [homeAirportIcao, session?.user?.id])

  useEffect(() => {
    if (!session?.user?.id) return
    let cancelled = false

    async function loadLogbook() {
      try {
        setLogbookLoading(true)
        setLogbookError(null)
        const res = await fetch('/api/logbook')
        if (!res.ok) throw new Error('Failed to load logbook')
        const data = await res.json()
        const entries = Array.isArray(data) ? data : data.entries || []
        if (!cancelled) setLogbookEntries(entries)
      } catch (error) {
        console.error('Failed to load logbook', error)
        if (!cancelled) setLogbookError('Failed to load logbook')
      } finally {
        if (!cancelled) setLogbookLoading(false)
      }
    }

    loadLogbook()
    return () => {
      cancelled = true
    }
  }, [session?.user?.id])

  const toggleWidget = (widget: WidgetType) => {
    setVisibleWidgets(prev => 
      prev.includes(widget) 
        ? prev.filter(w => w !== widget)
        : [...prev, widget]
    )
  }

  const isWidgetVisible = (widget: WidgetType) => visibleWidgets.includes(widget)


  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Sign In Required</CardTitle>
            <CardDescription>Please sign in to view your pilot dashboard</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/api/auth/signin">Sign In</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-16 z-40 border-b border-border bg-card/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="flex h-16 items-center gap-4 px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Plane className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold">Pilot Dashboard</span>
          </div>
          
          <div className="ml-auto flex items-center gap-4">
            <div className="relative hidden md:block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                placeholder="Search flights, plans..."
                className="h-9 w-64 rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
              />
            </div>
            <Button 
              variant={customizeMode ? "default" : "ghost"} 
              size="sm"
              onClick={() => setCustomizeMode(!customizeMode)}
              className="gap-2"
            >
              <LayoutDashboard className="h-4 w-4" />
              <span className="hidden md:inline">
                {customizeMode ? 'Done' : 'Customize'}
              </span>
            </Button>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              {mechanicUnread > 0 && (
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-destructive" />
              )}
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/profile" className="gap-2">
                <User className="h-4 w-4" />
                <span className="hidden md:inline">Profile</span>
              </Link>
            </Button>
            <Button variant="ghost" size="icon" asChild>
              <Link href="/settings">
                <Settings className="h-5 w-5" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-6">
        <div className="mx-auto max-w-[1600px] space-y-6">
          {/* Welcome Section */}
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold tracking-tight">Welcome back, Captain!</h1>
            <p className="text-muted-foreground">
              {"Here's your flight status and what needs your attention."}
            </p>
          </div>

          {showMechanicNotice && mechanicUnread > 0 && (
            <Card className="border-primary/40 bg-primary/5">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-sm">New mechanic responses</CardTitle>
                    <CardDescription>
                      You have {mechanicUnread} unread response{mechanicUnread > 1 ? 's' : ''}.
                    </CardDescription>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setShowMechanicNotice(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Button size="sm" onClick={() => router.push('/mechanics/inbox')}>Open Inbox</Button>
              </CardContent>
            </Card>
          )}

          {/* Customize Mode Panel */}
          {customizeMode && (
            <Card className="border-primary">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2">
                      <LayoutDashboard className="h-5 w-5 text-primary" />
                      Customize Dashboard
                    </CardTitle>
                    <CardDescription>
                      Show or hide widgets to personalize your dashboard
                    </CardDescription>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => setCustomizeMode(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {(Object.keys(WIDGET_INFO) as WidgetType[]).map((widget) => {
                    const info = WIDGET_INFO[widget]
                    const visible = isWidgetVisible(widget)
                    return (
                      <button
                        key={widget}
                        onClick={() => toggleWidget(widget)}
                        className={`flex items-start gap-3 rounded-lg border p-4 text-left transition-all hover:bg-muted/50 ${
                          visible 
                            ? 'border-primary bg-primary/5' 
                            : 'border-border bg-background opacity-60'
                        }`}
                      >
                        <div className={`mt-1 rounded-md p-1.5 ${
                          visible ? 'bg-primary text-primary-foreground' : 'bg-muted'
                        }`}>
                          {visible ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : (
                            <EyeOff className="h-4 w-4" />
                          )}
                        </div>
                        <div className="flex-1 space-y-1">
                          <p className="text-sm font-medium leading-none">{info.name}</p>
                          <p className="text-xs text-muted-foreground">{info.description}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Home Airport Weather & Info */}
          {isWidgetVisible('airport-weather') && (
          <Card className="border-primary/50">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-primary" />
                    {homeAirportIcao ? `Home Airport - ${homeAirportIcao}${homeAirportName ? ` (${homeAirportName})` : ''}` : 'Home Airport not set'}
                  </CardTitle>
                  <CardDescription>
                    Current conditions and information
                    {homeWeatherError && <span className="ml-2 text-destructive">{homeWeatherError}</span>}
                    {homeWeatherLoading && !homeWeatherError && <span className="ml-2 text-muted-foreground">Loading…</span>}
                  </CardDescription>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {homeWeatherUpdatedAt ? `Updated ${new Date(homeWeatherUpdatedAt).toLocaleTimeString()}` : '—'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Cloud className="h-4 w-4" />
                    Weather
                  </div>
                  <div className="space-y-1">
                    <div className="text-2xl font-bold">
                      {typeof homeWeather?.temp === 'number'
                        ? `${Math.round((homeWeather.temp * 9) / 5 + 32)}°F`
                        : '—'}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {homeWeather?.wxString
                        || (homeWeather?.clouds?.[0]?.cover && homeWeather?.clouds?.[0]?.base
                          ? `${homeWeather.clouds[0].cover} clouds at ${homeWeather.clouds[0].base}ft`
                          : homeWeather?.rawOb || 'No METAR data')}
                    </p>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Wind className="h-4 w-4" />
                    Winds
                  </div>
                  <div className="space-y-1">
                    <div className="text-2xl font-bold">
                      {homeWeatherLoading
                        ? '—'
                        : homeWeather?.windDir && homeWeather?.windSpeed
                          ? `${homeWeather.windDir}° @ ${homeWeather.windSpeed}kt`
                          : homeWeatherError ? '—' : 'No wind data'}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {homeWeather?.windGust ? `Gusting to ${homeWeather.windGust}kt` : ' '}
                    </p>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Gauge className="h-4 w-4" />
                    Altimeter
                  </div>
                  <div className="space-y-1">
                    <div className="text-2xl font-bold">
                      {homeWeather?.altim ? Number(homeWeather.altim).toFixed(2) : '—'}
                    </div>
                    <p className="text-xs text-muted-foreground">inHg</p>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Fuel className="h-4 w-4" />
                    Fuel Price (100LL)
                  </div>
                  <div className="space-y-1">
                    <div className="space-y-1">
                      <div className="text-2xl font-bold">
                        {fuelPriceLoading
                          ? '—'
                          : typeof fuelPrice === 'number'
                            ? `$${fuelPrice.toFixed(2)}`
                            : '—'}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Airport price {fuelPriceUpdatedAt ? `• ${new Date(fuelPriceUpdatedAt).toLocaleDateString()}` : '• No airport price'}
                      </p>
                      <div className="text-sm font-medium">
                        {communityFuelLoading
                          ? '—'
                          : typeof communityFuelPrice === 'number'
                            ? `$${communityFuelPrice.toFixed(2)}`
                            : '—'}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Community price {communityFuelUpdatedAt ? `• ${new Date(communityFuelUpdatedAt).toLocaleDateString()}` : '• No community price'}
                      </p>
                      {fuelPriceError && <p className="text-[11px] text-destructive">{fuelPriceError}</p>}
                      {communityFuelError && <p className="text-[11px] text-destructive">{communityFuelError}</p>}
                    </div>
                  </div>
                </div>
              </div>
              {!homeAirportIcao && (
                <div className="mt-4 rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                  Set your home airport in your profile to see live METAR data.
                </div>
              )}
            </CardContent>
          </Card>
          )}

          {/* Alerts & Important Items */}
            {isWidgetVisible('quick-alerts') && (
            <div className="grid gap-4 lg:grid-cols-3">
              {maintenanceItems.length > 0 && (
            <Card className="border-destructive/50 bg-destructive/5">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    <CardTitle className="text-base">Scheduled Maintenance</CardTitle>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setShowMaintenanceModal(true)}>
                      <Search className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => router.push('/modules/flying-club?tab=maintenance')}>
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {maintenanceLoading ? (
                    <p className="text-xs text-muted-foreground">Loading maintenance…</p>
                  ) : maintenanceError ? (
                    <p className="text-xs text-destructive">{maintenanceError}</p>
                  ) : (
                    <>
                      <p className="text-sm font-medium">{maintenanceItems[0]?.description || maintenanceItems[0]?.item || 'Maintenance needed'}</p>
                      <p className="text-xs text-muted-foreground">
                        {maintenanceItems[0]?.nNumber || maintenanceItems[0]?.aircraft || 'Aircraft'}
                      </p>
                    </>
                  )}
                  <div className="text-xs text-muted-foreground">
                    Use the icons above to view details or open full page.
                  </div>
                </div>
              </CardContent>
            </Card>
            )}
            
            <Card className="border-chart-3/50 bg-chart-3/5">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-chart-3" />
                    <CardTitle className="text-base">Next Flight</CardTitle>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setShowNextFlightModal(true)}>
                      <Search className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => router.push('/modules/flying-club?tab=scheduled')}>
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {scheduledFlights.length > 0 ? (
                    <>
                      <p className="text-sm font-medium">
                        {scheduledFlights[0]?.aircraft?.nNumber || 'Upcoming flight'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(scheduledFlights[0].startTime).toLocaleString()}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">No upcoming flights</p>
                  )}
                  <div className="text-xs text-muted-foreground">
                    Use the icons above to view details or open full page.
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-primary/40 bg-primary/5">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Mail className="h-5 w-5 text-primary" />
                    <CardTitle className="text-base">Mechanic Inbox</CardTitle>
                    {mechanicUnread > 0 && (
                      <Badge variant="destructive" className="text-[10px]">
                        {mechanicUnread} new
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => router.push('/mechanics/inbox')}>
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <p className="text-sm">Review mechanic quotes and messages.</p>
                  <p className="text-xs text-muted-foreground">Accept or decline responses from mechanics.</p>
                  <Button size="sm" variant="outline" className="w-full" onClick={() => router.push('/mechanics/inbox')}>
                    Open Inbox
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Complete Flight Button */}
            <Card className="border-emerald-500/50 bg-emerald-500/10">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Plane className="h-5 w-5 text-emerald-500" />
                  <CardTitle className="text-base">Complete Flight</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <p className="text-sm">Just finished flying?</p>
                  <p className="text-xs text-muted-foreground">Log your flight, add fuel expenses, and report any issues</p>
                  <Button 
                    size="sm" 
                    className="w-full bg-emerald-500 hover:bg-emerald-600" 
                    onClick={handleOpenFlightComplete}
                  >
                    Complete Flight
                  </Button>
                </div>
              </CardContent>
            </Card>
            
            <Card className="border-chart-2/50 bg-chart-2/5">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-chart-2" />
                    <CardTitle className="text-base">Flight Hours</CardTitle>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setShowLogbookModal(true)}>
                      <Search className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => router.push('/modules/logbook')}>
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {logbookLoading ? (
                    <p className="text-xs text-muted-foreground">Loading logbook…</p>
                  ) : logbookError ? (
                    <p className="text-xs text-destructive">{logbookError}</p>
                  ) : logbookEntries.length > 0 ? (
                    <>
                      <p className="text-2xl font-bold">
                        {Number(logbookEntries[0]?.totalTime || 0).toFixed(1)} hrs
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Last flight on {new Date(logbookEntries[0].date).toLocaleDateString()}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">No logbook entries</p>
                  )}
                  <div className="text-xs text-muted-foreground">
                    Use the icons above to view details or open full page.
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          )}

          {/* Flight Hours & Upcoming Items */}
          <div className="grid gap-4 lg:grid-cols-7">
            {isWidgetVisible('flight-hours') && (
            <Card className="lg:col-span-4">
              <CardHeader>
                <CardTitle>Flight Hours</CardTitle>
                <CardDescription>Your flying activity over the past 6 months</CardDescription>
              </CardHeader>
              <CardContent className="pl-2">
                <div className="min-h-[300px]">
                  {logbookEntries.length === 0 ? (
                    <div className="flex h-[300px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                      <span>No flying? :( schedule now!</span>
                      <Button size="sm" variant="outline" onClick={() => setShowScheduler(true)}>
                        Open Scheduler
                      </Button>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart data={flightHoursData}>
                        <defs>
                          <linearGradient id="colorHours" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                        <XAxis 
                          dataKey="month" 
                          tick={{ fill: '#94a3b8', fontSize: 12 }}
                          stroke="#475569"
                        />
                        <YAxis 
                          tick={{ fill: '#94a3b8', fontSize: 12 }}
                          stroke="#475569"
                          label={{ value: 'Hours', angle: -90, position: 'insideLeft', fill: '#94a3b8' }}
                        />
                        <RechartsTooltip 
                          contentStyle={{ 
                            backgroundColor: '#1e293b',
                            border: '1px solid #334155',
                            borderRadius: '8px',
                            color: '#f1f5f9'
                          }}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="hours" 
                          stroke="#3b82f6" 
                          strokeWidth={2}
                          fillOpacity={1} 
                          fill="url(#colorHours)" 
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
                {logbookEntries.length > 0 && (
                  <div className="mt-4 flex items-center justify-between rounded-lg bg-muted/50 p-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Hours (Last 6 months)</p>
                      <p className="text-2xl font-bold">
                        {flightHoursData.reduce((sum: number, item: any) => sum + Number(item.hours || 0), 0).toFixed(1)} hrs
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Average per Month</p>
                      <p className="text-2xl font-bold">
                        {(flightHoursData.reduce((sum: number, item: any) => sum + Number(item.hours || 0), 0) / Math.max(flightHoursData.length, 1)).toFixed(1)} hrs
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            )}

            {isWidgetVisible('upcoming-flights') && (
            <Card className="lg:col-span-3">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Upcoming Flights</CardTitle>
                    <CardDescription>
                      Your schedule
                      {scheduledError && <span className="ml-2 text-destructive">{scheduledError}</span>}
                      {isScheduledLoading && !scheduledError && <span className="ml-2 text-muted-foreground">Loading…</span>}
                    </CardDescription>
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
                    <Button size="sm" variant="outline" onClick={() => setShowScheduler(true)}>
                      <Plus className="mr-1 h-4 w-4" />
                      Add
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {scheduledFlights.length === 0 && !isScheduledLoading ? (
                    <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                      No upcoming flights scheduled
                    </div>
                  ) : (
                    scheduledFlights.map((flight) => (
                      <div key={flight.id} className="space-y-2 rounded-lg border border-border p-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <Plane className="h-4 w-4 text-chart-2" />
                            <div>
                              <p className="text-sm font-medium leading-none">
                                {flight.aircraft?.nNumber || 'Aircraft'}
                                {flight.aircraft?.nickname ? ` (${flight.aircraft.nickname})` : ''}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">{flight.purpose || 'Scheduled flight'}</p>
                            </div>
                          </div>
                          <Badge variant="outline" className="text-[10px]">
                            {flight.groupName ? `Club: ${flight.groupName}` : 'Personal'}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(flight.startTime).toLocaleDateString()}
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(flight.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            {' – '}
                            {new Date(flight.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                        <Badge variant="outline" className="text-xs">{flight.aircraft?.nNumber || 'Aircraft'}</Badge>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
            )}
          </div>

          <Dialog open={showScheduler} onOpenChange={setShowScheduler}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Schedule a Flight</DialogTitle>
                <DialogDescription>
                  Choose personal or flying club scheduling. Availability updates automatically.
                </DialogDescription>
              </DialogHeader>
              <FlightScheduler onSuccess={() => {
                setShowScheduler(false)
                setScheduledRefreshKey((prev) => prev + 1)
              }} />
            </DialogContent>
          </Dialog>

          {maintenanceItems.length > 0 && (
          <Dialog open={showMaintenanceModal} onOpenChange={setShowMaintenanceModal}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Scheduled Maintenance</DialogTitle>
                <DialogDescription>Review scheduled maintenance items.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                {maintenanceLoading ? (
                  <p className="text-sm text-muted-foreground">Loading maintenance…</p>
                ) : maintenanceError ? (
                  <p className="text-sm text-destructive">{maintenanceError}</p>
                ) : maintenanceItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No urgent maintenance items.</p>
                ) : (
                  maintenanceItems.slice(0, 5).map((item) => (
                    <div key={item.id} className="rounded-md border border-border p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{item.description || 'Maintenance item'}</p>
                          <p className="text-xs text-muted-foreground">{item.nNumber || 'Aircraft'}</p>
                        </div>
                        <Badge variant="outline" className="text-[10px]">{item.status || 'NEEDED'}</Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </DialogContent>
          </Dialog>
          )}

          <Dialog open={showNextFlightModal} onOpenChange={setShowNextFlightModal}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Next Flight</DialogTitle>
                <DialogDescription>Review your upcoming flight details.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                {scheduledFlights.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No upcoming flights scheduled.</p>
                ) : (
                  scheduledFlights.slice(0, 5).map((flight) => (
                    <div key={flight.id} className="rounded-md border border-border p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">
                            {flight.aircraft?.nNumber || 'Aircraft'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(flight.startTime).toLocaleString()} — {new Date(flight.endTime).toLocaleString()}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-[10px]">
                          {flight.groupName ? `Club: ${flight.groupName}` : 'Personal'}
                        </Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={showLogbookModal} onOpenChange={setShowLogbookModal}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Logbook</DialogTitle>
                <DialogDescription>Recent logbook entries.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                {logbookLoading ? (
                  <p className="text-sm text-muted-foreground">Loading logbook…</p>
                ) : logbookError ? (
                  <p className="text-sm text-destructive">{logbookError}</p>
                ) : logbookEntries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No logbook entries yet.</p>
                ) : (
                  logbookEntries.slice(0, 5).map((entry) => (
                    <div key={entry.id} className="rounded-md border border-border p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">
                            {entry.aircraft || 'Flight'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(entry.date).toLocaleDateString()} • {Number(entry.totalTime || 0).toFixed(1)} hrs
                          </p>
                        </div>
                        <Badge variant="outline" className="text-[10px]">Logbook</Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </DialogContent>
          </Dialog>

          {/* Maintenance & Currency */}
          <div className="grid gap-4 lg:grid-cols-2">
            {isWidgetVisible('maintenance') && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Aircraft Maintenance</CardTitle>
                    <CardDescription>Due items for N12345</CardDescription>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => router.push('/modules/flying-club?tab=maintenance')}>
                    <Wrench className="mr-1 h-4 w-4" />
                    Manage
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {maintenanceItems.map((item, index) => (
                    <div key={item.id}>
                      <div className="space-y-2 rounded-lg border border-border p-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium">{item.item}</p>
                              <Badge variant="outline" className={item.maintenanceType === 'CLUB' ? 'border-blue-500/50 text-blue-600 text-xs' : 'border-purple-500/50 text-purple-600 text-xs'}>
                                {item.maintenanceType === 'CLUB' ? 'Club' : 'Personal'}
                              </Badge>
                              <Badge 
                                variant={item.status === 'urgent' ? 'destructive' : item.status === 'warning' ? 'default' : 'secondary'}
                                className="text-xs"
                              >
                                {item.status === 'urgent' ? 'Urgent' : item.status === 'warning' ? 'Soon' : 'OK'}
                              </Badge>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">Due: {item.dueDate}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-muted-foreground">
                            {typeof item.hoursRemaining === 'number'
                              ? `${item.hoursRemaining.toFixed(1)} hours remaining`
                              : 'Hours remaining unavailable'}
                          </p>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => router.push('/modules/flying-club?tab=maintenance')}>
                            Details
                            <ArrowRight className="ml-1 h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      {index < maintenanceItems.length - 1 && <Separator className="my-3" />}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            )}

            {isWidgetVisible('currency') && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Currency & Licenses</CardTitle>
                    <CardDescription>
                      Keep your credentials current
                      {currencyError && <span className="ml-2 text-destructive">{currencyError}</span>}
                      {currencyLoading && !currencyError && <span className="ml-2 text-muted-foreground">Loading…</span>}
                    </CardDescription>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => router.push('/profile')}>
                    <FileText className="mr-1 h-4 w-4" />
                    View All
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {currencyItems.length === 0 && !currencyLoading ? (
                    <div className="text-xs text-muted-foreground">No currency data available</div>
                  ) : currencyItems.map((item, index) => (
                    <div key={item.id}>
                      <div className="space-y-2 rounded-lg border border-border p-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium">{item.type}</p>
                              <Badge 
                                variant={item.status === 'warning' ? 'default' : item.status === 'expired' ? 'destructive' : 'secondary'}
                                className="text-xs"
                              >
                                {item.status === 'expired' ? 'Expired' : item.status === 'warning' ? 'Expiring Soon' : 'Current'}
                              </Badge>
                            </div>
                            {item.class && <p className="mt-1 text-xs text-muted-foreground">{item.class}</p>}
                            {item.requirement && <p className="mt-1 text-xs text-muted-foreground">{item.requirement}</p>}
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-muted-foreground">
                            Expires: {item.expiryDate}
                            {typeof item.daysRemaining === 'number' ? ` (${item.daysRemaining} days)` : ''}
                          </p>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => router.push('/profile')}>
                            Renew
                            <ArrowRight className="ml-1 h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      {index < currencyItems.length - 1 && <Separator className="my-3" />}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            )}
          </div>

          {/* Saved Flight Plans */}
            {isWidgetVisible('flight-plans') && (
            <Card>
              <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Saved Flight Plans</CardTitle>
                      <CardDescription>
                        Quick access to your routes
                        {flightPlansError && <span className="ml-2 text-destructive">{flightPlansError}</span>}
                        {flightPlansLoading && !flightPlansError && <span className="ml-2 text-muted-foreground">Loading…</span>}
                      </CardDescription>
                    </div>
                    <Button size="sm" variant="default" onClick={() => router.push('/modules/fuel-saver')}>
                      <Plus className="mr-1 h-4 w-4" />
                      New Plan
                    </Button>
                  </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {savedFlightPlans.length === 0 && !flightPlansLoading ? (
                    <div className="text-xs text-muted-foreground">No saved flight plans</div>
                  ) : savedFlightPlans.map((plan) => (
                    <div key={plan.id} className="flex items-center justify-between rounded-lg border border-border p-4 transition-colors hover:bg-muted/50">
                      <div className="flex items-start gap-3">
                        <div className="mt-1 rounded-lg bg-primary/10 p-2">
                          <Navigation className="h-5 w-5 text-primary" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-medium leading-none">{plan.name}</p>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span>{plan.distance ? `${plan.distance} nm` : '—'}</span>
                            <span>{plan.duration || '—'}</span>
                            <span>{plan.route || '—'}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">Updated {plan.lastUpdated}</p>
                        </div>
                      </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="ghost" onClick={() => router.push(`/modules/fuel-saver/view/${plan.id}`)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => router.push(`/modules/fuel-saver?edit=${plan.id}`)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          )}
        </div>

        {/* Flight Completion Wizard */}
          {activeFlight && (
            <FlightCompleteWizard
              open={showFlightComplete}
              onOpenChange={setShowFlightComplete}
              flight={activeFlight}
              onComplete={async (data) => {
                if (!groupId) {
                  alert('Please join or select a flying club to complete a flight')
                  return
                }

                try {
                  const res = await fetch(`/api/clubs/${groupId}/flights/complete`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      flightLogId: data.flightId,
                      hobbsEnd: data.hobbsEnd,
                      notes: data.notes || null,
                    }),
                  })

                  if (!res.ok) {
                    const error = await res.json()
                    alert(error.error || 'Failed to complete flight')
                    return
                  }

                  const result = await res.json()
                  const flight = result.flight
                  if (flight?.hobbsTime && flight?.calculatedCost) {
                    alert(`Flight complete! Hobbs: ${Number(flight.hobbsTime).toFixed(1)}, Cost: $${Number(flight.calculatedCost).toFixed(2)}`)
                  } else {
                    alert('Flight complete!')
                  }
                  setActiveFlight(null)
                } catch (error) {
                  console.error('Failed to complete flight', error)
                  alert('Failed to complete flight')
                }
              }}
            />
          )}
      </main>
    </div>
  )
}
