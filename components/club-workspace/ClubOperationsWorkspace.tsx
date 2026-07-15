'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  CircleDollarSign,
  Clock3,
  Plane,
  RefreshCw,
  UsersRound,
  Wrench,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ClubWorkspaceShell, type ClubWorkspaceView } from './ClubWorkspaceShell'

type Aircraft = {
  id: string
  nNumber: string
  nickname?: string | null
  customName?: string | null
  make?: string | null
  model?: string | null
  status?: string | null
  hourlyRate?: number | null
}

type Club = {
  id: string
  name: string
  role?: string
  aircraft: Aircraft[]
}

type Booking = {
  id: string
  startTime: string
  endTime: string
  purpose?: string | null
  aircraft?: Aircraft | null
  user?: { name?: string | null } | null
}

type Maintenance = {
  id: string
  description: string
  status?: string | null
  severity?: string | null
  isGrounded?: boolean
  reportedDate: string
  aircraft?: Aircraft | null
}

type FinanceMember = {
  userId: string
  name?: string | null
  email?: string | null
  role?: string | null
  user?: { name?: string | null; email?: string | null } | null
  flights?: number
  hours?: number
  billedInPeriod?: number
  outstanding?: number
  oldestUnpaidDays?: number | null
}

type Finance = {
  members: FinanceMember[]
  totals: {
    members: number
    hours: number
    billed: number
    outstanding: number
  }
}

type LogsResponse = {
  maintenance: Maintenance[]
}

const viewCopy: Record<ClubWorkspaceView, { title: string; subtitle: string }> = {
  overview: {
    title: 'Club overview',
    subtitle: 'A live picture of the fleet, schedule, members, and money.',
  },
  dispatch: {
    title: 'Dispatch board',
    subtitle: 'Review the current schedule before each aircraft leaves the ramp.',
  },
  bookings: {
    title: 'Bookings',
    subtitle: 'See every scheduled aircraft reservation in one place.',
  },
  aircraft: {
    title: 'Aircraft',
    subtitle: 'Fleet availability, hourly rates, and maintenance signals.',
  },
  maintenance: {
    title: 'Maintenance',
    subtitle: 'Open discrepancies and grounding conditions that need attention.',
  },
  members: {
    title: 'Members',
    subtitle: 'Who belongs to the club and their activity this period.',
  },
  finances: {
    title: 'Finances',
    subtitle: 'Billing health and member balances for club administrators.',
  },
  reports: {
    title: 'Reports',
    subtitle: 'Operational reporting will live here as the workspace grows.',
  },
  messages: {
    title: 'Messages',
    subtitle: 'Keep club communication tied to the operational record.',
  },
  documents: {
    title: 'Documents',
    subtitle: 'Club documents and policies will be available here.',
  },
  settings: {
    title: 'Club settings',
    subtitle: 'Manage the club configuration and operating rules.',
  },
}

function aircraftName(aircraft?: Aircraft | null) {
  if (!aircraft) return 'Unassigned aircraft'
  return aircraft.customName || aircraft.nickname || aircraft.nNumber
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatCurrency(value?: number | null) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value ?? 0)
}

function statusVariant(status?: string | null) {
  const normalized = status?.toLowerCase() ?? ''
  if (normalized.includes('ground') || normalized.includes('critical')) return 'destructive' as const
  if (normalized.includes('maintenance') || normalized.includes('open')) return 'outline' as const
  return 'secondary' as const
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Plane
  label: string
  value: string | number
  detail: string
}) {
  return (
    <Card className="gap-4 py-5">
      <CardContent className="px-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
          </div>
          <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
            <Icon className="size-5" />
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  )
}

function EmptyView({ message, href = '/flying-club' }: { message: string; href?: string }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
        <div className="rounded-full bg-primary/10 p-3 text-primary">
          <Plane className="size-6" />
        </div>
        <p className="mt-4 max-w-md text-sm text-muted-foreground">{message}</p>
        <Button asChild variant="outline" className="mt-5">
          <Link href={href}>Open current club tools <ArrowUpRight className="size-4" /></Link>
        </Button>
      </CardContent>
    </Card>
  )
}

export function ClubOperationsWorkspace() {
  const [clubs, setClubs] = useState<Club[]>([])
  const [selectedClubId, setSelectedClubId] = useState('')
  const [activeView, setActiveView] = useState<ClubWorkspaceView>('overview')
  const [bookings, setBookings] = useState<Booking[]>([])
  const [maintenance, setMaintenance] = useState<Maintenance[]>([])
  const [members, setMembers] = useState<FinanceMember[]>([])
  const [finance, setFinance] = useState<Finance | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState('')

  const selectedClub = useMemo(
    () => clubs.find((club) => club.id === selectedClubId) ?? null,
    [clubs, selectedClubId],
  )

  const loadWorkspace = useCallback(async (refresh = false) => {
    if (refresh) setIsRefreshing(true)
    else setIsLoading(true)
    setError('')

    try {
      const clubsResponse = await fetch('/api/groups')
      if (!clubsResponse.ok) throw new Error('Could not load your flying clubs.')
      const nextClubs = await clubsResponse.json() as Club[]
      setClubs(nextClubs)

      const nextClubId = selectedClubId && nextClubs.some((club) => club.id === selectedClubId)
        ? selectedClubId
        : nextClubs[0]?.id ?? ''
      setSelectedClubId(nextClubId)

      if (!nextClubId) {
        setBookings([])
        setMaintenance([])
        setMembers([])
        setFinance(null)
        return
      }

      const [bookingsResponse, logsResponse, financeResponse] = await Promise.all([
        fetch('/api/groups/' + nextClubId + '/bookings'),
        fetch('/api/groups/' + nextClubId + '/logs'),
        fetch('/api/groups/' + nextClubId + '/finance/overview'),
      ])

      if (bookingsResponse.ok) setBookings(await bookingsResponse.json() as Booking[])
      if (logsResponse.ok) {
        const logs = await logsResponse.json() as LogsResponse
        setMaintenance(logs.maintenance ?? [])
      }
      if (financeResponse.ok) {
        const financeData = await financeResponse.json() as Finance
        setFinance(financeData)
        setMembers(financeData.members ?? [])
      } else {
        setFinance(null)
        const membersResponse = await fetch('/api/groups/' + nextClubId + '/members')
        if (membersResponse.ok) {
          const groupMembers = await membersResponse.json() as FinanceMember[]
          setMembers(groupMembers.map((member) => ({
            ...member,
            name: member.name || member.user?.name,
            email: member.email || member.user?.email,
          })))
        }
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load the club workspace.')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [selectedClubId])

  useEffect(() => {
    void loadWorkspace()
  }, [loadWorkspace])

  const now = Date.now()
  const upcomingBookings = useMemo(
    () => bookings.filter((booking) => new Date(booking.endTime).getTime() >= now)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()),
    [bookings, now],
  )
  const activeSchedule = useMemo(
    () => bookings.filter((booking) => new Date(booking.startTime).getTime() <= now && new Date(booking.endTime).getTime() >= now),
    [bookings, now],
  )
  const openMaintenance = useMemo(
    () => maintenance.filter((item) => item.status?.toLowerCase() !== 'resolved' && !item.resolvedDate),
    [maintenance],
  )

  const renderOverview = () => (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Plane} label="Fleet available" value={selectedClub?.aircraft.filter((aircraft) => aircraft.status === 'Available').length ?? 0} detail={(selectedClub?.aircraft.length ?? 0) + ' aircraft in the club'} />
        <MetricCard icon={CalendarDays} label="Upcoming bookings" value={upcomingBookings.length} detail="Scheduled reservations from now"} />
        <MetricCard icon={Wrench} label="Open maintenance" value={openMaintenance.length} detail={openMaintenance.some((item) => item.isGrounded) ? 'A grounding condition needs attention' : 'No grounded aircraft reported'} />
        <MetricCard icon={UsersRound} label="Members" value={finance?.totals.members ?? members.length} detail="Active members visible to you"} />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.85fr]">
        <Card>
          <CardHeader>
            <CardTitle>Upcoming schedule</CardTitle>
            <CardDescription>The next reservations across the fleet.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {upcomingBookings.slice(0, 5).map((booking) => (
              <div key={booking.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <p className="font-medium">{aircraftName(booking.aircraft)}</p>
                  <p className="truncate text-sm text-muted-foreground">{booking.user?.name ?? 'Club member'} · {booking.purpose || 'Flight'}</p>
                </div>
                <p className="shrink-0 text-right text-sm text-muted-foreground">{formatDate(booking.startTime)}</p>
              </div>
            ))}
            {upcomingBookings.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No upcoming bookings yet.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Fleet status</CardTitle>
            <CardDescription>Availability from your club record.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(selectedClub?.aircraft ?? []).slice(0, 5).map((aircraft) => (
              <div key={aircraft.id} className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{aircraftName(aircraft)}</p>
                  <p className="text-sm text-muted-foreground">{aircraft.nNumber}{aircraft.make ? ' · ' + aircraft.make : ''}</p>
                </div>
                <Badge variant={statusVariant(aircraft.status)}>{aircraft.status || 'Unknown'}</Badge>
              </div>
            ))}
            {(selectedClub?.aircraft.length ?? 0) === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Add an aircraft to start dispatching.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  )

  const renderDispatch = () => (
    <Card>
      <CardHeader>
        <CardTitle>Current schedule</CardTitle>
        <CardDescription>This is schedule status, not a replacement for a formal dispatch release.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {activeSchedule.map((booking) => (
          <div key={booking.id} className="flex items-center justify-between gap-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
            <div><p className="font-medium">{aircraftName(booking.aircraft)}</p><p className="text-sm text-muted-foreground">{booking.user?.name ?? 'Club member'} · Ends {formatDate(booking.endTime)}</p></div>
            <Badge>Scheduled now</Badge>
          </div>
        ))}
        {activeSchedule.length === 0 && <EmptyView message="No aircraft are scheduled right now. Bookings will appear here at their scheduled time." />}
      </CardContent>
    </Card>
  )

  const renderBookings = () => (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div><CardTitle>Bookings</CardTitle><CardDescription>Reservations currently recorded for this club.</CardDescription></div>
        <Button asChild><Link href="/flying-club">New booking <ArrowUpRight className="size-4" /></Link></Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {upcomingBookings.map((booking) => (
          <div key={booking.id} className="grid gap-2 rounded-lg border p-4 sm:grid-cols-[1fr_auto]">
            <div><p className="font-medium">{aircraftName(booking.aircraft)}</p><p className="text-sm text-muted-foreground">{booking.user?.name ?? 'Club member'} · {booking.purpose || 'Flight'}</p></div>
            <p className="text-sm text-muted-foreground sm:text-right">{formatDate(booking.startTime)} – {formatDate(booking.endTime)}</p>
          </div>
        ))}
        {upcomingBookings.length === 0 && <EmptyView message="No future bookings were found for this club." />}
      </CardContent>
    </Card>
  )

  const renderAircraft = () => (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {(selectedClub?.aircraft ?? []).map((aircraft) => (
        <Card key={aircraft.id} className="gap-4 py-5">
          <CardHeader className="px-5"><div className="flex items-start justify-between gap-3"><div><CardTitle>{aircraftName(aircraft)}</CardTitle><CardDescription>{aircraft.nNumber}{aircraft.make ? ' · ' + aircraft.make : ''}{aircraft.model ? ' ' + aircraft.model : ''}</CardDescription></div><Badge variant={statusVariant(aircraft.status)}>{aircraft.status || 'Unknown'}</Badge></div></CardHeader>
          <CardContent className="px-5"><p className="text-sm text-muted-foreground">Hourly rate</p><p className="mt-1 text-xl font-semibold">{aircraft.hourlyRate ? formatCurrency(aircraft.hourlyRate) + '/hr' : 'Not set'}</p></CardContent>
        </Card>
      ))}
      {(selectedClub?.aircraft.length ?? 0) === 0 && <div className="md:col-span-2 xl:col-span-3"><EmptyView message="This club does not have aircraft in the shared fleet yet." /></div>}
    </div>
  )

  const renderMaintenance = () => (
    <Card>
      <CardHeader><CardTitle>Open maintenance</CardTitle><CardDescription>Records flagged from club flight and maintenance history.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        {openMaintenance.map((item) => (
          <div key={item.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="font-medium">{item.description}</p><p className="text-sm text-muted-foreground">{aircraftName(item.aircraft)} · Reported {formatDate(item.reportedDate)}</p></div>
            <div className="flex gap-2"><Badge variant={statusVariant(item.severity)}>{item.severity || item.status || 'Open'}</Badge>{item.isGrounded && <Badge variant="destructive">Grounded</Badge>}</div>
          </div>
        ))}
        {openMaintenance.length === 0 && <EmptyView href="/flying-club/squawks" message="No unresolved maintenance items were found. You can report a new squawk from the current club tools." />}
      </CardContent>
    </Card>
  )

  const renderMembers = () => (
    <Card>
      <CardHeader><CardTitle>Members</CardTitle><CardDescription>Membership and activity visible from the current finance scope.</CardDescription></CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        {members.map((member) => (
          <div key={member.userId} className="rounded-lg border p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-medium">{member.name || member.email || 'Club member'}</p><p className="text-sm text-muted-foreground">{member.email}</p></div><Badge variant="outline">{member.role || 'Member'}</Badge></div>{typeof member.hours === 'number' && <p className="mt-3 text-sm text-muted-foreground">{member.flights ?? 0} flights · {member.hours.toFixed(1)} hours</p>}</div>
        ))}
        {members.length === 0 && <div className="md:col-span-2"><EmptyView message="Member details are restricted to club administrators and treasurers in the current API." /></div>}
      </CardContent>
    </Card>
  )

  const renderFinances = () => {
    if (!finance) return <EmptyView href="/flying-club/billing" message="Finance information is limited to club administrators and treasurers. Open the current billing tools to review your permitted scope." />
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard icon={CircleDollarSign} label="Billed this period" value={formatCurrency(finance.totals.billed)} detail={finance.totals.hours.toFixed(1) + ' recorded fleet hours'} />
          <MetricCard icon={AlertTriangle} label="Outstanding" value={formatCurrency(finance.totals.outstanding)} detail="Member balances awaiting payment" />
          <MetricCard icon={UsersRound} label="Members billed" value={finance.totals.members} detail="Members in the finance report" />
        </div>
        <Card>
          <CardHeader><CardTitle>Member balances</CardTitle><CardDescription>Use the current billing tools to create invoices and take payment.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {finance.members.map((member) => <div key={member.userId} className="flex items-center justify-between gap-4 rounded-lg border p-4"><div><p className="font-medium">{member.name || member.email || 'Club member'}</p><p className="text-sm text-muted-foreground">{member.flights ?? 0} flights · {member.hours?.toFixed(1) ?? '0.0'} hours</p></div><div className="text-right"><p className="font-semibold">{formatCurrency(member.outstanding)}</p><p className="text-xs text-muted-foreground">{member.oldestUnpaidDays ? member.oldestUnpaidDays + ' days overdue' : 'Current'}</p></div></div>)}
          </CardContent>
        </Card>
      </div>
    )
  }

  const renderView = () => {
    if (isLoading) return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-36 rounded-xl" />)}</div>
    if (error) return <EmptyView message={error} />
    if (!selectedClub) return <EmptyView message="Create or join a club in the current Flying Club tools, then return here for the operational workspace." />
    if (activeView === 'overview') return renderOverview()
    if (activeView === 'dispatch') return renderDispatch()
    if (activeView === 'bookings') return renderBookings()
    if (activeView === 'aircraft') return renderAircraft()
    if (activeView === 'maintenance') return renderMaintenance()
    if (activeView === 'members') return renderMembers()
    if (activeView === 'finances') return renderFinances()
    return <EmptyView message={viewCopy[activeView].subtitle} />
  }

  return (
    <ClubWorkspaceShell activeView={activeView} onViewChange={setActiveView} clubName={selectedClub?.name || 'Flying Club'}>
      <div className="space-y-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div><p className="text-sm font-medium text-primary">Flying Club</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">{viewCopy[activeView].title}</h1><p className="mt-2 text-sm text-muted-foreground">{viewCopy[activeView].subtitle}</p></div>
          <div className="flex items-center gap-2">
            <select aria-label="Choose club" value={selectedClubId} onChange={(event) => setSelectedClubId(event.target.value)} className="h-9 max-w-52 rounded-md border bg-background px-3 text-sm" disabled={clubs.length === 0}>
              {clubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
              {clubs.length === 0 && <option value="">No club selected</option>}
            </select>
            <Button variant="outline" size="icon" onClick={() => void loadWorkspace(true)} disabled={isRefreshing} aria-label="Refresh workspace"><RefreshCw className={'size-4 ' + (isRefreshing ? 'animate-spin' : '')} /></Button>
          </div>
        </div>
        {renderView()}
      </div>
    </ClubWorkspaceShell>
  )
}
