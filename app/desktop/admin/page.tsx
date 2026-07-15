'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  AlertTriangle,
  Search,
  Loader2,
  ShieldAlert,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  UserCog,
  KeyRound,
  Mail,
  Check,
  X,
  Clock,
  Activity,
  BarChart3,
  Plane,
  Building2,
  DollarSign,
  TrendingUp,
  Filter,
  XCircle,
  Plus,
} from 'lucide-react'

// ── Types ───────────────────────────────────────────────────────

interface Stats {
  totalUsers: number
  freeUsers: number
  proUsers: number
  newUsers30Days: number
  openErrorReports: number
  totalFlightPlans: number
  totalGroups: number
  totalAircraft: number
  listingActive: number
  listingPending: number
  listingFlagged: number
  listingSold: number
  estimatedAnnualRevenue: number
  estimatedMRR: number
}

interface AdminUser {
  id: string
  email: string
  name: string | null
  username: string | null
  tier: string
  role: string
  createdAt: string
  updatedAt: string
  flightPlanCount: number
  clubCount: number
  status: string
  hours: number
  club: string
  joined: string
}

interface UserDetail {
  id: string
  email: string
  name: string | null
  username: string | null
  tier: string
  role: string
  homeState: string | null
  stripeCustomerId: string | null
  subscriptionEnd: string | null
  createdAt: string
  updatedAt: string
  flightPlanCount: number
  clubCount: number
  errorReports: Array<{
    id: string
    title: string
    status: string
    createdAt: string
  }>
}

interface ErrorReport {
  id: string
  title: string
  description?: string
  status: string
  severity?: string
  url?: string
  userEmail: string | null
  userName: string | null
  createdAt: string
  updatedAt: string
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

// ── Helpers ─────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  open: 'text-red-600 bg-red-500/10 border-red-500/20',
  in_progress: 'text-amber-600 bg-amber-500/10 border-amber-500/20',
  resolved: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20',
  closed: 'text-muted-foreground bg-muted border-border',
}

const ROLE_BADGES: Record<string, string> = {
  owner: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  admin: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  user: 'bg-muted text-muted-foreground border-border',
}

const TIER_BADGES: Record<string, string> = {
  pro: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  free: 'bg-muted text-muted-foreground border-border',
}

function getStatusColor(status: string): string {
  return STATUS_COLORS[status] || STATUS_COLORS.open
}

function getRoleBadge(role: string): string {
  return ROLE_BADGES[role] || ROLE_BADGES.user
}

function getTierBadge(tier: string): string {
  return TIER_BADGES[tier] || TIER_BADGES.free
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    })
  } catch { return dateStr }
}

function formatCurrency(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Stat Card ───────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, accent }: {
  icon: typeof BarChart3
  label: string
  value: string | number
  sub?: string
  accent?: string
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary/20">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className={`text-2xl font-bold ${accent || 'text-foreground'}`}>{value}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
        <div className={`rounded-lg p-2.5 ${accent ? 'bg-primary/5' : 'bg-muted'}`}>
          <Icon className={`h-5 w-5 ${accent || 'text-muted-foreground'}`} />
        </div>
      </div>
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────

interface AdminClub {
  id: string
  name: string
  ownerId: string
  createdAt: string
  members: number
  aircraft: number
  plan: string
  revenue: number
  status: string
}

interface ClubDetailMember {
  id: string
  userId: string
  role: string
  joinedAt: string | null
  user: { id: string; name: string | null; email: string; username: string | null }
}

interface ClubDetailAircraft {
  id: string
  make: string | null
  model: string | null
  nickname: string | null
  customName: string | null
  nNumber: string | null
  status: string | null
  hourlyRate: number | null
  year: number | null
}

interface ClubDetail {
  id: string
  name: string
  description: string | null
  type: string
  publicSlug: string | null
  ownerId: string
  owner: { id: string; name: string | null; email: string; username: string | null }
  createdAt: string
  stats: { members: number; aircraft: number; bookings: number }
  members: ClubDetailMember[]
  aircraft: ClubDetailAircraft[]
}

type Tab = 'overview' | 'users' | 'errors' | 'clubs'

export default function AdminPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [authCheck, setAuthCheck] = useState<'loading' | 'authorized' | 'denied'>('loading')

  // Stats
  const [stats, setStats] = useState<Stats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [statsError, setStatsError] = useState('')

  // Users
  const [users, setUsers] = useState<AdminUser[]>([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [usersError, setUsersError] = useState('')
  const [userSearch, setUserSearch] = useState('')
  const [userPage, setUserPage] = useState(1)
  const [userPagination, setUserPagination] = useState<Pagination | null>(null)

  // User detail modal
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [userDetail, setUserDetail] = useState<UserDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [resetPasswordEmail, setResetPasswordEmail] = useState('')
  const [resetPasswordResult, setResetPasswordResult] = useState<{ ok: boolean; msg: string } | null>(null)

  // Error reports
  const [errors, setErrors] = useState<ErrorReport[]>([])
  const [errorsLoading, setErrorsLoading] = useState(true)
  const [errorsError, setErrorsError] = useState('')
  const [errorStatusFilter, setErrorStatusFilter] = useState('all')
  const [errorPage, setErrorPage] = useState(1)
  const [errorPagination, setErrorPagination] = useState<Pagination | null>(null)
  const [errorStatusCounts, setErrorStatusCounts] = useState<Record<string, number>>({})

  // Add user modal
  const [showAddUser, setShowAddUser] = useState(false)
  const [addUserForm, setAddUserForm] = useState({ username: '', email: '', password: '', name: '', role: 'user', tier: 'free' })
  const [addUserLoading, setAddUserLoading] = useState(false)
  const [addUserError, setAddUserError] = useState('')
  const [addUserSuccess, setAddUserSuccess] = useState('')

  // Clubs
  const [clubs, setClubs] = useState<AdminClub[]>([])
  const [clubsLoading, setClubsLoading] = useState(true)
  const [clubsError, setClubsError] = useState('')
  const [clubSearch, setClubSearch] = useState('')

  // Club detail modal
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null)
  const [clubDetail, setClubDetail] = useState<ClubDetail | null>(null)
  const [clubDetailLoading, setClubDetailLoading] = useState(false)
  const [clubDetailError, setClubDetailError] = useState('')

  // ── Read tab from query param ───────────────────────────────

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const tabParam = params.get('tab')
    if (tabParam === 'users' || tabParam === 'errors' || tabParam === 'clubs') {
      setActiveTab(tabParam)
    }
  }, [])

  // ── Auth Check ──────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/auth/session')
      .then(r => r.json())
      .then(data => {
        const role = data?.user?.role
        if (role === 'admin' || role === 'owner') {
          setAuthCheck('authorized')
        } else {
          setAuthCheck('denied')
          setTimeout(() => router.replace('/desktop/dashboard'), 2000)
        }
      })
      .catch(() => {
        setAuthCheck('denied')
        setTimeout(() => router.replace('/desktop/dashboard'), 2000)
      })
  }, [router])

  // ── Data Fetching ───────────────────────────────────────────

  const fetchStats = useCallback(async () => {
    setStatsLoading(true)
    setStatsError('')
    try {
      const res = await fetch('/api/admin/stats')
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to load stats')
      setStats(await res.json())
    } catch (err) {
      setStatsError(err instanceof Error ? err.message : 'Failed to load stats')
    } finally {
      setStatsLoading(false)
    }
  }, [])

  const fetchUsers = useCallback(async (search: string, page: number) => {
    setUsersLoading(true)
    setUsersError('')
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' })
      if (search) params.set('search', search)
      const res = await fetch(`/api/admin/users?${params}`)
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to load users')
      const data = await res.json()
      setUsers(data.users)
      setUserPagination(data.pagination)
    } catch (err) {
      setUsersError(err instanceof Error ? err.message : 'Failed to load users')
    } finally {
      setUsersLoading(false)
    }
  }, [])

  const fetchErrors = useCallback(async (status: string, page: number) => {
    setErrorsLoading(true)
    setErrorsError('')
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' })
      if (status && status !== 'all') params.set('status', status)
      const res = await fetch(`/api/admin/error-reports?${params}`)
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to load error reports')
      const data = await res.json()
      setErrors(data.reports)
      setErrorPagination(data.pagination)
      setErrorStatusCounts(data.statusCounts || {})
    } catch (err) {
      setErrorsError(err instanceof Error ? err.message : 'Failed to load error reports')
    } finally {
      setErrorsLoading(false)
    }
  }, [])

  const fetchUserDetail = useCallback(async (userId: string) => {
    setDetailLoading(true)
    setResetPasswordResult(null)
    setResetPasswordEmail('')
    try {
      const res = await fetch(`/api/admin/users/${userId}`)
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to load user')
      const data = await res.json()
      setUserDetail(data.user)
    } catch (err) {
      console.error('Failed to load user detail:', err)
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const fetchClubs = useCallback(async (search: string) => {
    setClubsLoading(true)
    setClubsError('')
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      const res = await fetch(`/api/admin/clubs?${params}`)
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to load clubs')
      const data = await res.json()
      setClubs(data.clubs || [])
    } catch (err) {
      setClubsError(err instanceof Error ? err.message : 'Failed to load clubs')
    } finally {
      setClubsLoading(false)
    }
  }, [])

  const fetchClubDetail = useCallback(async (clubId: string) => {
    setClubDetailLoading(true)
    setClubDetailError('')
    setClubDetail(null)
    try {
      const res = await fetch(`/api/admin/clubs/${clubId}`)
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to load club detail')
      const data = await res.json()
      setClubDetail(data.club)
    } catch (err) {
      setClubDetailError(err instanceof Error ? err.message : 'Failed to load club detail')
    } finally {
      setClubDetailLoading(false)
    }
  }, [])

  async function updateClubMemberRole(clubId: string, memberId: string, role: string) {
    try {
      const res = await fetch(`/api/groups/${clubId}/members`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId, role }),
      })
      if (!res.ok) throw new Error('Failed to update member role')
      if (clubDetail && clubDetail.id === clubId) {
        setClubDetail({
          ...clubDetail,
          members: clubDetail.members.map(m =>
            m.id === memberId ? { ...m, role } : m
          ),
        })
      }
    } catch { /* ignore */ }
  }

  // ── Effects ─────────────────────────────────────────────────

  useEffect(() => {
    if (authCheck !== 'authorized') return
    if (activeTab === 'overview') fetchStats()
    else if (activeTab === 'users') fetchUsers(userSearch, userPage)
    else if (activeTab === 'errors') fetchErrors(errorStatusFilter, errorPage)
    else if (activeTab === 'clubs') fetchClubs('')
  }, [authCheck, activeTab, fetchStats, fetchUsers, fetchErrors, fetchClubs, userSearch, userPage, errorStatusFilter, errorPage])

  // Reset pagination when tab changes
  function switchTab(tab: Tab) {
    setActiveTab(tab)
    if (tab === 'users') { setUserPage(1); setUserSearch('') }
    if (tab === 'errors') { setErrorPage(1); setErrorStatusFilter('all') }
    if (tab === 'clubs') { setClubSearch('') }
  }

  function searchUsers() { setUserPage(1); fetchUsers(userSearch, 1) }

  // ── Add User ────────────────────────────────────────────────

  async function handleAddUser() {
    setAddUserLoading(true)
    setAddUserError('')
    setAddUserSuccess('')
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addUserForm),
      })
      const data = await res.json()
      if (!res.ok) {
        setAddUserError(data.error || 'Failed to create user')
        return
      }
      setAddUserSuccess(`User "${data.user.username}" created successfully!`)
      setAddUserForm({ username: '', email: '', password: '', name: '', role: 'user', tier: 'free' })
      fetchUsers(userSearch, userPage)
      setTimeout(() => { setShowAddUser(false); setAddUserSuccess('') }, 1500)
    } catch {
      setAddUserError('Network error')
    } finally {
      setAddUserLoading(false)
    }
  }

  // ── Admin password reset ────────────────────────────────────

  async function handleAdminResetPassword() {
    if (!selectedUserId || !resetPasswordEmail || resetPasswordEmail.length < 6) return
    setResetPasswordResult(null)
    try {
      const res = await fetch(`/api/admin/users/${selectedUserId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: resetPasswordEmail }),
      })
      const data = await res.json()
      if (res.ok) {
        setResetPasswordResult({ ok: true, msg: `Password changed to "${resetPasswordEmail}"` })
      } else {
        setResetPasswordResult({ ok: false, msg: data.error || 'Failed' })
      }
    } catch {
      setResetPasswordResult({ ok: false, msg: 'Network error' })
    }
  }

  // ── Update user tier / role ─────────────────────────────────

  async function updateUserTier(userId: string, tier: string) {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
      })
      if (!res.ok) throw new Error('Failed to update tier')
      if (userDetail && userDetail.id === userId) {
        setUserDetail({ ...userDetail, tier })
      }
      fetchUsers(userSearch, userPage)
    } catch { /* ignore */ }
  }

  async function updateUserRole(userId: string, role: string) {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      if (!res.ok) throw new Error('Failed to update role')
      if (userDetail && userDetail.id === userId) {
        setUserDetail({ ...userDetail, role })
      }
      fetchUsers(userSearch, userPage)
    } catch { /* ignore */ }
  }

  // ── Error detail modal state ────────────────────────────────

  const [selectedReport, setSelectedReport] = useState<ErrorReport | null>(null)
  const [resolutionText, setResolutionText] = useState('')

  // ── Update error report status ──────────────────────────────

  async function updateErrorStatus(id: string, status: string) {
    try {
      await fetch('/api/admin/error-reports', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      fetchErrors(errorStatusFilter, errorPage)
    } catch { /* ignore */ }
  }

  // ── Loading / Denied states ─────────────────────────────────

  if (authCheck === 'loading') {
    return (
      <div className="flex min-h-full items-center justify-center p-8">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-sm text-muted-foreground">Checking access...</p>
        </div>
      </div>
    )
  }

  if (authCheck === 'denied') {
    return (
      <div className="flex min-h-full items-center justify-center p-8">
        <div className="max-w-sm text-center space-y-4 rounded-xl border border-border bg-card p-8 shadow-sm">
          <ShieldAlert className="h-12 w-12 mx-auto text-destructive" />
          <h1 className="text-lg font-bold">Admin access required</h1>
          <p className="text-sm text-muted-foreground">
            You do not have permission to access this page. Redirecting to dashboard...
          </p>
        </div>
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-7xl p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-primary" />
            Admin
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Platform management &amp; oversight
          </p>
        </div>
        <button
          onClick={() => {
            if (activeTab === 'overview') fetchStats()
            else if (activeTab === 'users') fetchUsers(userSearch, userPage)
            else if (activeTab === 'errors') fetchErrors(errorStatusFilter, errorPage)
            else if (activeTab === 'clubs') fetchClubs(clubSearch)
          }}
          className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-border bg-muted/30 p-1 w-fit">
        {([
          { id: 'overview' as Tab, label: 'Overview', icon: LayoutDashboard },
          { id: 'users' as Tab, label: 'Users', icon: Users },
          { id: 'errors' as Tab, label: 'Errors', icon: AlertTriangle },
          { id: 'clubs' as Tab, label: 'Clubs', icon: Building2 },
        ]).map(tab => (
          <button
            key={tab.id}
            onClick={() => switchTab(tab.id)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Overview ──────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {statsLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : statsError ? (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-8 text-center">
              <XCircle className="h-8 w-8 mx-auto text-destructive mb-2" />
              <p className="text-sm text-destructive font-medium">Failed to load statistics</p>
              <p className="text-xs text-muted-foreground mt-1">{statsError}</p>
              <button onClick={fetchStats} className="mt-3 text-xs text-primary hover:underline">Retry</button>
            </div>
          ) : stats ? (
            <>
              {/* Metrics grid */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard icon={Users} label="Total Users" value={stats.totalUsers} sub={`${stats.newUsers30Days} new (30d)`} accent="text-primary" />
                <StatCard icon={TrendingUp} label="Pro Users" value={stats.proUsers} sub={`${((stats.proUsers / Math.max(stats.totalUsers, 1)) * 100).toFixed(1)}% conversion`} accent="text-emerald-500" />
                <StatCard icon={AlertTriangle} label="Open Errors" value={stats.openErrorReports} accent="text-red-500" />
                <StatCard icon={Activity} label="Active Listings" value={stats.listingActive} sub={`${stats.listingPending} pending`} />
              </div>
              {/* Secondary metrics */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <StatCard icon={Plane} label="Flight Plans" value={stats.totalFlightPlans} />
                <StatCard icon={Building2} label="Organizations" value={stats.totalGroups} />
                <StatCard icon={Plane} label="Aircraft" value={stats.totalAircraft} />
              </div>
              {/* Revenue */}
              <div className="grid gap-4 sm:grid-cols-2">
                <StatCard icon={DollarSign} label="Est. Annual Revenue" value={formatCurrency(stats.estimatedAnnualRevenue)} sub={`${stats.proUsers} × $39.99/yr`} accent="text-emerald-500" />
                <StatCard icon={BarChart3} label="Est. Monthly Recurring" value={formatCurrency(stats.estimatedMRR)} accent="text-blue-500" />
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* ── Tab: Users ─────────────────────────────────────────── */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          {/* Search */}
          <div className="flex gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') searchUsers() }}
                placeholder="Search by name, email, or username..."
                className="w-full rounded-md border border-input bg-background pl-8 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <button
              onClick={searchUsers}
              className="rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Search
            </button>
            <button
              onClick={() => { setShowAddUser(true); setAddUserError(''); setAddUserSuccess('') }}
              className="flex items-center gap-1 rounded-md border border-border bg-card px-4 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add User
            </button>
          </div>

          {/* Table */}
          {usersLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : usersError ? (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-8 text-center">
              <p className="text-sm text-destructive font-medium">{usersError}</p>
              <button onClick={() => fetchUsers(userSearch, userPage)} className="mt-2 text-xs text-primary hover:underline">Retry</button>
            </div>
          ) : users.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-12 text-center">
              <Users className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium">No users found</p>
              <p className="text-xs text-muted-foreground mt-1">
                {userSearch ? 'Try a different search term.' : 'No users have signed up yet.'}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="text-left px-4 py-3 font-medium text-xs uppercase tracking-wider text-muted-foreground">Name</th>
                      <th className="text-left px-4 py-3 font-medium text-xs uppercase tracking-wider text-muted-foreground">Email</th>
                      <th className="text-left px-4 py-3 font-medium text-xs uppercase tracking-wider text-muted-foreground">Role</th>
                      <th className="text-left px-4 py-3 font-medium text-xs uppercase tracking-wider text-muted-foreground">Tier</th>
                      <th className="text-left px-4 py-3 font-medium text-xs uppercase tracking-wider text-muted-foreground">Hours</th>
                      <th className="text-left px-4 py-3 font-medium text-xs uppercase tracking-wider text-muted-foreground">Joined</th>
                      <th className="text-right px-4 py-3 font-medium text-xs uppercase tracking-wider text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {users.map(user => (
                      <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-medium">{user.name || user.username || '—'}</td>
                        <td className="px-4 py-3 text-muted-foreground">{user.email}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase ${getRoleBadge(user.role)}`}>
                            {user.role}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase ${getTierBadge(user.tier)}`}>
                            {user.tier}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{user.hours.toFixed(1)}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{formatDate(user.joined)}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => {
                              setSelectedUserId(user.id)
                              fetchUserDetail(user.id)
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted transition-colors"
                          >
                            <UserCog className="h-3 w-3" />
                            Manage
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {userPagination && userPagination.totalPages > 1 && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <p>Showing {(userPagination.page - 1) * userPagination.limit + 1}&ndash;{Math.min(userPagination.page * userPagination.limit, userPagination.total)} of {userPagination.total}</p>
                  <div className="flex gap-1">
                    <button
                      disabled={userPagination.page <= 1}
                      onClick={() => { setUserPage(p => p - 1); fetchUsers(userSearch, userPage - 1) }}
                      className="rounded border border-border px-2 py-1 hover:bg-muted disabled:opacity-30 transition-colors"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                      disabled={userPagination.page >= userPagination.totalPages}
                      onClick={() => { setUserPage(p => p + 1); fetchUsers(userSearch, userPage + 1) }}
                      className="rounded border border-border px-2 py-1 hover:bg-muted disabled:opacity-30 transition-colors"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Tab: Error Reports ──────────────────────────────────── */}
      {activeTab === 'errors' && (
        <div className="space-y-4">
          {/* Filter chips */}
          <div className="flex gap-2 flex-wrap">
            {['all', 'open', 'in_progress', 'resolved', 'closed'].map(status => {
              const count = status === 'all'
                ? Object.values(errorStatusCounts).reduce((a, b) => a + b, 0)
                : (errorStatusCounts[status] || 0)
              return (
                <button
                  key={status}
                  onClick={() => { setErrorStatusFilter(status); setErrorPage(1) }}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                    errorStatusFilter === status
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {status === 'in_progress' ? 'In Progress' : status.charAt(0).toUpperCase() + status.slice(1)}
                  <span className="ml-1.5 opacity-70">({count})</span>
                </button>
              )
            })}
          </div>

          {errorsLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : errorsError ? (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-8 text-center">
              <p className="text-sm text-destructive font-medium">{errorsError}</p>
              <button onClick={() => fetchErrors(errorStatusFilter, errorPage)} className="mt-2 text-xs text-primary hover:underline">Retry</button>
            </div>
          ) : errors.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-12 text-center">
              <AlertTriangle className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium">No error reports</p>
              <p className="text-xs text-muted-foreground mt-1">
                {errorStatusFilter !== 'all' ? `No ${errorStatusFilter} reports.` : 'No errors have been reported.'}
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {errors.map(report => (
                  <div
                    key={report.id}
                    onClick={() => { setSelectedReport(report); setResolutionText('') }}
                    className="rounded-xl border border-border bg-card p-4 shadow-sm cursor-pointer hover:border-primary/20 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-medium ${getStatusColor(report.status)}`}>
                            {report.status.replace('_', ' ')}
                          </span>
                          <p className="text-sm font-medium truncate">{report.title}</p>
                        </div>
                        {report.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{report.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {report.userEmail || 'Unknown'}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDate(report.createdAt)}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {report.status === 'open' && (
                          <button
                            onClick={e => { e.stopPropagation(); updateErrorStatus(report.id, 'in_progress') }}
                            className="rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-amber-600 hover:bg-amber-500/5 transition-colors"
                            title="Mark in progress"
                          >
                            <Activity className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {(report.status === 'open' || report.status === 'in_progress') && (
                          <button
                            onClick={e => { e.stopPropagation(); updateErrorStatus(report.id, 'resolved') }}
                            className="rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-emerald-600 hover:bg-emerald-500/5 transition-colors"
                            title="Resolve"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          onClick={e => { e.stopPropagation(); updateErrorStatus(report.id, 'closed') }}
                          className="rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted transition-colors"
                          title="Close"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {errorPagination && errorPagination.totalPages > 1 && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <p>Showing {(errorPagination.page - 1) * errorPagination.limit + 1}&ndash;{Math.min(errorPagination.page * errorPagination.limit, errorPagination.total)} of {errorPagination.total}</p>
                  <div className="flex gap-1">
                    <button
                      disabled={errorPagination.page <= 1}
                      onClick={() => { setErrorPage(p => p - 1); fetchErrors(errorStatusFilter, errorPage - 1) }}
                      className="rounded border border-border px-2 py-1 hover:bg-muted disabled:opacity-30"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                      disabled={errorPagination.page >= errorPagination.totalPages}
                      onClick={() => { setErrorPage(p => p + 1); fetchErrors(errorStatusFilter, errorPage + 1) }}
                      className="rounded border border-border px-2 py-1 hover:bg-muted disabled:opacity-30"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Tab: Clubs ──────────────────────────────────────────── */}
      {activeTab === 'clubs' && (
        <div className="space-y-4">
          {/* Search */}
          <div className="flex gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={clubSearch}
                onChange={e => setClubSearch(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') fetchClubs(clubSearch) }}
                placeholder="Search clubs by name..."
                className="w-full rounded-md border border-input bg-background pl-8 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <button
              onClick={() => fetchClubs(clubSearch)}
              className="rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Search
            </button>
          </div>

          {clubsLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : clubsError ? (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-8 text-center">
              <p className="text-sm text-destructive font-medium">{clubsError}</p>
              <button onClick={() => fetchClubs(clubSearch)} className="mt-2 text-xs text-primary hover:underline">Retry</button>
            </div>
          ) : clubs.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-12 text-center">
              <Building2 className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium">No clubs found</p>
              <p className="text-xs text-muted-foreground mt-1">
                {clubSearch ? 'Try a different search term.' : 'No flying clubs have been created yet.'}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="text-left px-4 py-3 font-medium text-xs uppercase tracking-wider text-muted-foreground">Club Name</th>
                      <th className="text-left px-4 py-3 font-medium text-xs uppercase tracking-wider text-muted-foreground">Owner</th>
                      <th className="text-left px-4 py-3 font-medium text-xs uppercase tracking-wider text-muted-foreground">Members</th>
                      <th className="text-left px-4 py-3 font-medium text-xs uppercase tracking-wider text-muted-foreground">Aircraft</th>
                      <th className="text-left px-4 py-3 font-medium text-xs uppercase tracking-wider text-muted-foreground">Plan</th>
                      <th className="text-left px-4 py-3 font-medium text-xs uppercase tracking-wider text-muted-foreground">Created</th>
                      <th className="text-right px-4 py-3 font-medium text-xs uppercase tracking-wider text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {clubs.map(club => (
                      <tr key={club.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-medium">{club.name}</td>
                        <td className="px-4 py-3 text-muted-foreground">{club.ownerId ? `${club.ownerId.slice(0, 8)}...` : '—'}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 text-sm">
                            <Users className="h-3.5 w-3.5 text-muted-foreground" />
                            {club.members}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 text-sm">
                            <Plane className="h-3.5 w-3.5 text-muted-foreground" />
                            {club.aircraft}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase ${
                            club.plan === 'Pro' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-muted text-muted-foreground border-border'
                          }`}>
                            {club.plan}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{formatDate(club.createdAt)}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => {
                              setSelectedClubId(club.id)
                              fetchClubDetail(club.id)
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted transition-colors"
                          >
                            <Building2 className="h-3 w-3" />
                            Manage
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Club Detail Modal ──────────────────────────────────── */}
      {selectedClubId && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4" onClick={() => { setSelectedClubId(null); setClubDetail(null) }}>
          <div
            className="w-full max-w-2xl rounded-xl border border-border bg-card shadow-2xl max-h-[85vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-6 py-4 shrink-0">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                {clubDetail?.name || 'Club Details'}
              </h2>
              <button onClick={() => { setSelectedClubId(null); setClubDetail(null) }} className="rounded-md p-1 text-muted-foreground hover:bg-muted transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            {clubDetailLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : clubDetailError ? (
              <div className="p-8 text-center">
                <p className="text-sm text-destructive font-medium">{clubDetailError}</p>
                <button onClick={() => fetchClubDetail(selectedClubId)} className="mt-2 text-xs text-primary hover:underline">Retry</button>
              </div>
            ) : clubDetail ? (
              <div className="px-6 py-4 space-y-5 overflow-y-auto">
                {/* Overview stats */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
                    <p className="text-2xl font-bold text-primary">{clubDetail.stats.members}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Members</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
                    <p className="text-2xl font-bold text-primary">{clubDetail.stats.aircraft}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Aircraft</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
                    <p className="text-2xl font-bold text-primary">{clubDetail.stats.bookings}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Bookings</p>
                  </div>
                </div>

                {/* Owner info */}
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Owner</p>
                  <p className="text-sm font-medium">
                    {clubDetail.owner.name || clubDetail.owner.username || clubDetail.owner.email}
                  </p>
                  <p className="text-xs text-muted-foreground">{clubDetail.owner.email}</p>
                </div>

                {/* Description */}
                {clubDetail.description && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Description</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3">{clubDetail.description}</p>
                  </div>
                )}

                {/* Members */}
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" />
                    Members ({clubDetail.members.length})
                  </p>
                  {clubDetail.members.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No members.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-60 overflow-y-auto">
                      {clubDetail.members.map(m => (
                        <div key={m.id} className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
                              {(m.user.name || m.user.email || '?').charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-medium truncate">{m.user.name || m.user.username || m.user.email}</p>
                              <p className="text-[10px] text-muted-foreground truncate">{m.user.email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <select
                              value={m.role}
                              onChange={e => updateClubMemberRole(clubDetail.id, m.id, e.target.value)}
                              className="rounded border border-border bg-background px-2 py-1 text-[11px] outline-none focus:ring-1 focus:ring-ring"
                            >
                              <option value="MEMBER">Member</option>
                              <option value="PILOT">Pilot</option>
                              <option value="INSTRUCTOR">Instructor</option>
                              <option value="TREASURER">Treasurer</option>
                              <option value="ADMIN">Admin</option>
                            </select>
                            <span className="text-[10px] text-muted-foreground">
                              {m.joinedAt ? formatDate(m.joinedAt) : ''}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Aircraft */}
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Plane className="h-3.5 w-3.5" />
                    Aircraft ({clubDetail.aircraft.length})
                  </p>
                  {clubDetail.aircraft.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No aircraft registered.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-60 overflow-y-auto">
                      {clubDetail.aircraft.map(a => (
                        <div key={a.id} className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <Plane className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <div className="min-w-0">
                              <p className="text-xs font-medium truncate">
                                {a.customName || a.nickname || `${a.make || ''} ${a.model || ''}`.trim() || 'Unnamed Aircraft'}
                              </p>
                              {a.nNumber && (
                                <p className="text-[10px] text-muted-foreground">N-Number: {a.nNumber}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0 text-[11px] text-muted-foreground">
                            {a.hourlyRate && <span>${a.hourlyRate}/hr</span>}
                            <span className={`inline-block h-1.5 w-1.5 rounded-full ${a.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* ── User Detail Modal ──────────────────────────────────── */}
      {selectedUserId && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4" onClick={() => setSelectedUserId(null)}>
          <div
            className="w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <UserCog className="h-5 w-5 text-primary" />
                User Details
              </h2>
              <button onClick={() => setSelectedUserId(null)} className="rounded-md p-1 text-muted-foreground hover:bg-muted transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            {detailLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : userDetail ? (
              <div className="px-6 py-4 space-y-5">
                {/* Detail fields */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-xs text-muted-foreground block">Name</span><span className="font-medium">{userDetail.name || '—'}</span></div>
                  <div><span className="text-xs text-muted-foreground block">Username</span><span className="font-medium">{userDetail.username || '—'}</span></div>
                  <div><span className="text-xs text-muted-foreground block">Email</span><span className="font-medium">{userDetail.email}</span></div>
                  <div><span className="text-xs text-muted-foreground block">Role</span><span className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase ${getRoleBadge(userDetail.role)}`}>{userDetail.role}</span></div>
                  <div><span className="text-xs text-muted-foreground block">Tier</span><span className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase ${getTierBadge(userDetail.tier)}`}>{userDetail.tier}</span></div>
                  <div><span className="text-xs text-muted-foreground block">Joined</span><span className="font-medium">{formatDate(userDetail.createdAt)}</span></div>
                  <div><span className="text-xs text-muted-foreground block">Home State</span><span className="font-medium">{userDetail.homeState || '—'}</span></div>
                  <div><span className="text-xs text-muted-foreground block">Sub. End</span><span className="font-medium">{userDetail.subscriptionEnd ? formatDate(userDetail.subscriptionEnd) : '—'}</span></div>
                </div>

                {/* Tier / Role editing */}
                <div className="border-t border-border pt-4 space-y-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Tier</p>
                    <div className="flex gap-2">
                      {['free', 'pro', 'proplus'].map(t => (
                        <button
                          key={t}
                          onClick={() => updateUserTier(userDetail.id, t)}
                          className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                            userDetail.tier === t
                              ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                              : 'border-border text-muted-foreground hover:bg-muted'
                          }`}
                        >
                          {t === 'proplus' ? 'Pro+' : t.charAt(0).toUpperCase() + t.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Role</p>
                    <div className="flex gap-2">
                      {['user', 'admin'].map(r => (
                        <button
                          key={r}
                          onClick={() => updateUserRole(userDetail.id, r)}
                          className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                            userDetail.role === r
                              ? 'bg-blue-500/10 text-blue-600 border-blue-500/30'
                              : 'border-border text-muted-foreground hover:bg-muted'
                          }`}
                        >
                          {r.charAt(0).toUpperCase() + r.slice(1)}
                        </button>
                      ))}
                      {userDetail.role === 'owner' && (
                        <span className="rounded-md border border-purple-500/30 bg-purple-500/10 px-3 py-1.5 text-xs font-medium text-purple-600">
                          Owner
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Error reports */}
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Recent Error Reports</p>
                  {userDetail.errorReports.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No errors reported.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {userDetail.errorReports.map(er => (
                        <div key={er.id} className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`inline-block h-1.5 w-1.5 rounded-full ${er.status === 'open' ? 'bg-red-500' : er.status === 'in_progress' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                            <span className="text-xs truncate">{er.title}</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground shrink-0">{formatDate(er.createdAt)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Admin password reset */}
                <div className="border-t border-border pt-4">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Reset Password</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={resetPasswordEmail}
                      onChange={e => setResetPasswordEmail(e.target.value)}
                      placeholder="Enter new password..."
                      className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                    <button
                      onClick={handleAdminResetPassword}
                      disabled={resetPasswordEmail.length < 6}
                      className="flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      Set
                    </button>
                  </div>
                  {resetPasswordResult && (
                    <p className={`mt-2 text-xs ${resetPasswordResult.ok ? 'text-emerald-600' : 'text-destructive'}`}>
                      {resetPasswordResult.msg}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-sm text-muted-foreground">Could not load user details.</div>
            )}
          </div>
        </div>
      )}

      {/* ── Add User Modal ──────────────────────────────────────── */}
      {showAddUser && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4" onClick={() => setShowAddUser(false)}>
          <div
            className="w-full max-w-md rounded-xl border border-border bg-card shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Plus className="h-5 w-5 text-primary" />
                Add User
              </h2>
              <button onClick={() => setShowAddUser(false)} className="rounded-md p-1 text-muted-foreground hover:bg-muted transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Form */}
            <form
              onSubmit={e => { e.preventDefault(); handleAddUser() }}
              className="px-6 py-4 space-y-4"
            >
              {/* Success message */}
              {addUserSuccess && (
                <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-600 font-medium">
                  {addUserSuccess}
                </div>
              )}

              {/* Error message */}
              {addUserError && (
                <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive font-medium">
                  {addUserError}
                </div>
              )}

              {/* Username */}
              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1 block">Username *</label>
                <input
                  type="text"
                  value={addUserForm.username}
                  onChange={e => setAddUserForm(f => ({ ...f, username: e.target.value }))}
                  placeholder="e.g. john_doe"
                  required
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* Email */}
              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1 block">Email *</label>
                <input
                  type="email"
                  value={addUserForm.email}
                  onChange={e => setAddUserForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="e.g. john@example.com"
                  required
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* Password */}
              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1 block">Password *</label>
                <input
                  type="text"
                  value={addUserForm.password}
                  onChange={e => setAddUserForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="Min. 6 characters"
                  required
                  minLength={6}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* Name (optional) */}
              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1 block">Display Name</label>
                <input
                  type="text"
                  value={addUserForm.name}
                  onChange={e => setAddUserForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Optional"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* Role & Tier */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1 block">Role</label>
                  <select
                    value={addUserForm.role}
                    onChange={e => setAddUserForm(f => ({ ...f, role: e.target.value }))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1 block">Tier</label>
                  <select
                    value={addUserForm.tier}
                    onChange={e => setAddUserForm(f => ({ ...f, tier: e.target.value }))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="free">Free</option>
                    <option value="pro">Pro</option>
                    <option value="proplus">Pro+</option>
                  </select>
                </div>
              </div>

              {/* Submit */}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddUser(false)}
                  className="rounded-md border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addUserLoading || !addUserForm.username || !addUserForm.email || !addUserForm.password}
                  className="flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {addUserLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  Create User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Error Report Detail Modal ──────────────────────────── */}
      {selectedReport && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4" onClick={() => { setSelectedReport(null); setResolutionText('') }}>
          <div
            className="w-full max-w-2xl rounded-xl border border-border bg-card shadow-2xl max-h-[85vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-6 py-4 shrink-0">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-primary" />
                Error Report
              </h2>
              <button onClick={() => { setSelectedReport(null); setResolutionText('') }} className="rounded-md p-1 text-muted-foreground hover:bg-muted transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-4 space-y-5 overflow-y-auto">
              {/* Status */}
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Status</p>
                <div className="flex gap-2">
                  {['open', 'in_progress', 'resolved', 'closed'].map(s => (
                    <button
                      key={s}
                      onClick={() => {
                        updateErrorStatus(selectedReport.id, s)
                        setSelectedReport({ ...selectedReport, status: s })
                      }}
                      className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                        selectedReport.status === s
                          ? s === 'open' ? 'bg-red-500/10 text-red-600 border-red-500/30'
                            : s === 'in_progress' ? 'bg-amber-500/10 text-amber-600 border-amber-500/30'
                            : s === 'resolved' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                            : 'bg-muted text-muted-foreground border-border'
                          : 'border-border text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      {s === 'in_progress' ? 'In Progress' : s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Title */}
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Title</p>
                <p className="text-sm font-medium">{selectedReport.title}</p>
              </div>

              {/* Description */}
              {selectedReport.description && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Description</p>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3">{selectedReport.description}</p>
                </div>
              )}

              {/* Side info */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-xs text-muted-foreground block">Reported by</span>
                  <span className="font-medium">{selectedReport.userEmail || selectedReport.userName || 'Anonymous'}</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Date</span>
                  <span className="font-medium">{formatDate(selectedReport.createdAt)}</span>
                </div>
                {selectedReport.url && (
                  <div className="col-span-2">
                    <span className="text-xs text-muted-foreground block">URL</span>
                    <a href={selectedReport.url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline break-all">
                      {selectedReport.url}
                    </a>
                  </div>
                )}
                {selectedReport.severity && (
                  <div>
                    <span className="text-xs text-muted-foreground block">Severity</span>
                    <span className="font-medium capitalize">{selectedReport.severity}</span>
                  </div>
                )}
              </div>

              {/* Resolution */}
              <div className="border-t border-border pt-4">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Resolution Notes</p>
                <textarea
                  value={resolutionText}
                  onChange={e => setResolutionText(e.target.value)}
                  placeholder="Add resolution notes here..."
                  rows={3}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
                />
                <button
                  onClick={async () => {
                    try {
                      await fetch('/api/admin/error-reports', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: selectedReport.id, status: 'resolved', resolution: resolutionText }),
                      })
                      setSelectedReport({ ...selectedReport, status: 'resolved' })
                      setResolutionText('')
                      fetchErrors(errorStatusFilter, errorPage)
                    } catch { /* ignore */ }
                  }}
                  disabled={!resolutionText.trim()}
                  className="mt-2 flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors"
                >
                  <Check className="h-3.5 w-3.5" />
                  Resolve with Notes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
