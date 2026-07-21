'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import { cloudApi } from '@/apps/desktop/src/lib/cloud-api'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Wrench, Plus, Loader2, AlertTriangle, CheckCircle, Plane, X, CloudOff, ArrowLeft,
} from 'lucide-react'

// ---- Types ----

interface ClubAircraft {
  id: string
  nNumber: string
  nickname: string | null
  customName: string | null
  make: string | null
  model: string | null
}

interface Group {
  id: string
  name: string
  aircraft: ClubAircraft[]
}

interface OpenSquawk {
  id: string
  description: string
  status: string | null
  category: string | null
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | null
  isGrounded: boolean
  reportedDate: string | null
  reportedByName: string | null
  aircraftId: string
  aircraftLabel: string
}

const CATEGORIES = ['Engine', 'Airframe', 'Avionics', 'Prop', 'Electrical', 'Oil', 'Interior', 'OTHER']

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) } catch { return iso }
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

function acLabel(a: { nNumber: string; nickname?: string | null }) {
  return a.nNumber + (a.nickname ? ` (${a.nickname})` : '')
}

// ---- Report Squawk Form ----

function ReportSquawkForm({
  group,
  defaultAircraftId,
  onClose,
  onReported,
}: {
  group: Group
  defaultAircraftId: string | null
  onClose: () => void
  onReported: () => void
}) {
  const [aircraftId, setAircraftId] = useState(defaultAircraftId || group.aircraft[0]?.id || '')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('OTHER')
  const [severity, setSeverity] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('LOW')
  const [isGrounded, setIsGrounded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!aircraftId || !description.trim()) return
    setSaving(true)
    setError(null)
    try {
      const { ok, data } = await cloudApi.reportMaintenanceItem({
        organizationId: group.id,
        clubAircraftId: aircraftId,
        description: description.trim(),
        category,
        severity,
        isGrounded,
      })
      if (!ok) {
        setError((data && (data as { error?: string }).error) || 'Failed to report squawk')
        return
      }
      onReported()
    } catch {
      setError('Network error — check your connection and try again')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Report Squawk</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-4">
          <div>
            <Label className="text-sm font-medium">Aircraft</Label>
            <select
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={aircraftId}
              onChange={e => setAircraftId(e.target.value)}
            >
              {group.aircraft.map(a => (
                <option key={a.id} value={a.id}>{acLabel(a)}{a.make ? ` – ${a.make} ${a.model}` : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-sm font-medium">Description</Label>
            <Textarea
              className="mt-1"
              placeholder="Describe the issue…"
              value={description}
              onChange={e => setDescription(e.target.value)}
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-sm font-medium">Category</Label>
              <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={category} onChange={e => setCategory(e.target.value)}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-sm font-medium">Severity</Label>
              <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={severity} onChange={e => setSeverity(e.target.value as 'LOW' | 'MEDIUM' | 'HIGH')}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isGrounded} onChange={e => setIsGrounded(e.target.checked)} className="rounded" />
            Ground this aircraft
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving || !aircraftId || !description.trim()}>
              {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Reporting…</> : 'Report Squawk'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---- Main Page ----

export default function DesktopSquawksPage() {
  const { cloudUser, initializing } = useDesktopAuth()
  const searchParams = useSearchParams()
  const presetGroupId = searchParams.get('groupId')
  const presetAircraftId = searchParams.get('aircraftId')

  const [groups, setGroups] = useState<Group[]>([])
  const [groupsLoading, setGroupsLoading] = useState(true)
  const [connectionError, setConnectionError] = useState(false)
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)

  const [squawks, setSquawks] = useState<OpenSquawk[]>([])
  const [squawksLoading, setSquawksLoading] = useState(false)
  const [squawksError, setSquawksError] = useState<string | null>(null)

  const [showReportForm, setShowReportForm] = useState(false)

  const selectedGroup = groups.find(g => g.id === selectedGroupId) ?? null

  const loadGroups = useCallback(async () => {
    setGroupsLoading(true)
    setConnectionError(false)
    try {
      const { ok, data } = await cloudApi.getGroups()
      if (!ok) {
        setConnectionError(true)
        return
      }
      const list: Group[] = Array.isArray(data) ? data : []
      setGroups(list)
      if (list.length > 0) {
        setSelectedGroupId(prev => prev ?? (presetGroupId && list.some(g => g.id === presetGroupId) ? presetGroupId : list[0].id))
      }
    } catch {
      setConnectionError(true)
    } finally {
      setGroupsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadSquawks = useCallback(async (group: Group) => {
    setSquawksLoading(true)
    setSquawksError(null)
    try {
      const results = await Promise.all(
        group.aircraft.map(async a => {
          try {
            const { ok, data } = await cloudApi.getGroupAircraftProfile(group.id, a.id)
            if (!ok) return []
            const openSquawks = Array.isArray((data as { openSquawks?: unknown[] })?.openSquawks) ? (data as { openSquawks: unknown[] }).openSquawks : []
            return openSquawks.map((sq: any): OpenSquawk => ({
              id: sq.id,
              description: sq.description,
              status: sq.status,
              category: sq.category,
              severity: sq.severity,
              isGrounded: sq.isGrounded,
              reportedDate: sq.reportedDate,
              reportedByName: sq.reportedByName,
              aircraftId: a.id,
              aircraftLabel: acLabel(a),
            }))
          } catch {
            return []
          }
        })
      )
      const flat = results.flat().sort((a, b) => {
        if (a.isGrounded !== b.isGrounded) return a.isGrounded ? -1 : 1
        return (b.reportedDate || '').localeCompare(a.reportedDate || '')
      })
      setSquawks(flat)
    } catch {
      setSquawksError('Failed to load squawks')
    } finally {
      setSquawksLoading(false)
    }
  }, [])

  useEffect(() => {
    if (initializing || !cloudUser) return
    loadGroups()
  }, [initializing, cloudUser, loadGroups])

  useEffect(() => {
    if (!selectedGroup) return
    loadSquawks(selectedGroup)
  }, [selectedGroup, loadSquawks])

  const stats = useMemo(() => ({
    total: squawks.length,
    grounded: squawks.filter(s => s.isGrounded).length,
    inProgress: squawks.filter(s => s.status === 'IN_PROGRESS').length,
  }), [squawks])

  if (initializing) {
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
          <Wrench className="h-7 w-7 text-primary" />
        </div>
        <h2 className="text-lg font-semibold">Squawks</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Flying Club requires a cloud account. Sign in from the Flying Club home page to report or view squawks.
        </p>
        <Link href="/desktop/flying-club"><Button size="sm">Go to Flying Club</Button></Link>
      </div>
    )
  }

  if (groupsLoading) {
    return (
      <div className="flex h-full items-center justify-center p-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
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
          Squawks are stored in the cloud and couldn&apos;t be reached. Check your connection and try again.
        </p>
        <Button size="sm" variant="outline" onClick={() => loadGroups()}>Retry</Button>
      </div>
    )
  }

  if (groups.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
        <Plane className="h-10 w-10 text-muted-foreground/50" />
        <h2 className="text-lg font-semibold">No flying clubs yet</h2>
        <p className="max-w-sm text-sm text-muted-foreground">Join or create a flying club to report squawks.</p>
        <Link href="/desktop/flying-club"><Button size="sm" variant="outline">Go to Flying Club</Button></Link>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {showReportForm && selectedGroup && (
        <ReportSquawkForm
          group={selectedGroup}
          defaultAircraftId={presetAircraftId}
          onClose={() => setShowReportForm(false)}
          onReported={() => {
            setShowReportForm(false)
            loadSquawks(selectedGroup)
          }}
        />
      )}

      <Link href="/desktop/flying-club" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" />
        Back to Flying Club
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2"><Wrench className="h-5 w-5" />Squawks</h1>
          <p className="text-sm text-muted-foreground">Report and track open aircraft issues</p>
        </div>
        <div className="flex items-center gap-2">
          {groups.length > 1 && (
            <select
              value={selectedGroupId || ''}
              onChange={e => setSelectedGroupId(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          )}
          <Button
            size="sm"
            onClick={() => setShowReportForm(true)}
            disabled={!selectedGroup || selectedGroup.aircraft.length === 0}
          >
            <Plus className="mr-2 h-4 w-4" />Report Issue
          </Button>
        </div>
      </div>

      {selectedGroup && selectedGroup.aircraft.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Plane className="h-8 w-8 text-muted-foreground mb-3" />
            <h3 className="text-sm font-semibold mb-1">No aircraft in this club</h3>
            <p className="text-xs text-muted-foreground">Add aircraft from the web app to start reporting squawks.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 grid-cols-3">
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">Open</p>
              <p className="text-xl font-bold">{squawksLoading ? '…' : stats.total}</p>
            </div>
            <div className="rounded-lg border border-blue-500/30 bg-card p-3">
              <p className="text-xs text-muted-foreground">In Progress</p>
              <p className="text-xl font-bold text-blue-600">{squawksLoading ? '…' : stats.inProgress}</p>
            </div>
            <div className="rounded-lg border border-red-500/30 bg-card p-3">
              <p className="text-xs text-muted-foreground">Grounded</p>
              <p className="text-xl font-bold text-red-600">{squawksLoading ? '…' : stats.grounded}</p>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Open Squawks</CardTitle>
              <CardDescription>{selectedGroup?.name}</CardDescription>
            </CardHeader>
            <CardContent>
              {squawksLoading ? (
                <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : squawksError ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <AlertTriangle className="h-6 w-6 text-destructive mb-2" />
                  <p className="text-sm text-destructive">{squawksError}</p>
                </div>
              ) : squawks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <CheckCircle className="h-7 w-7 text-green-500/70 mb-2" />
                  <p className="text-sm text-muted-foreground">No open squawks — the fleet is in good standing.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {squawks.map(sq => (
                    <div key={sq.id} className={`p-3 rounded-lg border ${sq.isGrounded ? 'border-red-500/50 bg-red-500/5' : 'bg-card'}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-sm font-medium font-mono">{sq.aircraftLabel}</span>
                            <Badge className={`text-xs border ${severityBadgeClass(sq.severity)}`}>{sq.severity || 'LOW'}</Badge>
                            {sq.isGrounded && <Badge variant="destructive" className="text-xs">GROUNDED</Badge>}
                          </div>
                          <p className="text-sm">{sq.description}</p>
                          <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-muted-foreground">
                            <span>{fmtDate(sq.reportedDate)}</span>
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
        </>
      )}
    </div>
  )
}
