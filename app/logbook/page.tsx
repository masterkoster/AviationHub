'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useSession, signIn } from 'next-auth/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Plane, Download, Plus, FileText, ShieldCheck, Upload } from 'lucide-react'
import type { Authority, LogbookEntry, LogbookPreferences, StartingTotals } from '@/lib/logbook/types'
import {
  createLogbookEntry,
  fetchCurrencyProgress,
  fetchLogbookEntries,
  fetchPreferences,
  fetchStartingTotals,
  refreshCurrency,
  savePreferences as savePreferencesApi,
  saveStartingTotals as saveStartingTotalsApi,
  voidLogbookEntry,
  unvoidLogbookEntry,
} from '@/lib/logbook/api'
import { LogbookHeader } from '@/app/logbook/components/LogbookHeader'
import { LogbookSummaryCards } from '@/app/logbook/components/LogbookSummaryCards'

const TAB_KEYS = [
  'add',
  'search',
  'totals',
  'currency',
  'analysis',
  'download',
  'import',
  'starting-totals',
  'check-flights',
  'print-view',
  'pending',
  'preferences',
] as const

type TabKey = typeof TAB_KEYS[number]

function LogbookContent() {
  const { data: session, status } = useSession()
  const searchParams = useSearchParams()
  const initialTab = (searchParams.get('tab') as TabKey) || 'add'
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab)

  const [entries, setEntries] = useState<LogbookEntry[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [startingTotals, setStartingTotals] = useState<StartingTotals | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const [authority, setAuthority] = useState<Authority>('FAA')
  const [formData, setFormData] = useState({
    date: '',
    aircraft: '',
    routeFrom: '',
    routeTo: '',
    isSimulator: false,
    trainingDeviceId: '',
    trainingDeviceLocation: '',
    safetyPilotName: '',
    requiresSafetyPilot: false,
    totalTime: '',
    picTime: '',
    sicTime: '',
    soloTime: '',
    dualGiven: '',
    dualReceived: '',
    nightTime: '',
    instrumentTime: '',
    actualInstrumentTime: '',
    simulatedInstrumentTime: '',
    groundTrainingReceived: '',
    simTrainingReceived: '',
    crossCountryTime: '',
    dayLandings: '0',
    nightLandings: '0',
    isDay: true,
    isNight: false,
    conditions: '',
    remarks: '',
    isPending: false,
  })

  const [filters, setFilters] = useState({ year: 'all', aircraft: 'all', search: '' })
  const [showVoided, setShowVoided] = useState(false)
  const [voidingId, setVoidingId] = useState<string | null>(null)
  const [currencyProgress, setCurrencyProgress] = useState<any[]>([])
  const [openDialog, setOpenDialog] = useState<null | 'add' | 'import' | 'starting-totals' | 'print'>(null)
  const [preferences, setPreferences] = useState<LogbookPreferences>({
    timeDisplayFormat: 'decimal-1-2',
    sumTimeMode: 'whole-minutes',
    preferredTimeZone: 'UTC',
    dateInterpretation: 'local',
    showInstructorTime: true,
    showSicTime: true,
    showHobbsTach: false,
    autoFillTimes: true,
    autoFillLandings: true,
    includeHeliports: false,
    estimateNight: false,
    roundNearestTenth: false,
    nightStartRule: 'civil-twilight',
    nightLandingRule: 'sunset-plus-60',
    totalsByCategoryClass: true,
    totalsByModel: false,
    totalsByModelFamily: false,
    totalsByFeatures: true,
    currencyAuthorities: 'FAA,EASA',
    currencyByCategory: true,
    currencyByModel: false,
    allowNightTouchAndGo: true,
    requireDayLandings: false,
    expiredCurrencyDisplay: 'forever',
    maintenanceDueWindowDays: 90,
    notifyCurrencyWeekly: false,
    notifyCurrencyOnExpiry: true,
    notifyTotalsWeekly: false,
    notifyTotalsMonthly: false,
  })

  useEffect(() => {
    if (!formData.date) {
      setFormData((prev) => ({ ...prev, date: new Date().toISOString().split('T')[0] }))
    }
  }, [formData.date])

  useEffect(() => {
    if (status !== 'authenticated') return
    loadEntries()
    loadStartingTotals()
    loadCurrencyProgress()
    loadPreferences()
  }, [status])

  useEffect(() => {
    if (TAB_KEYS.includes(initialTab)) setActiveTab(initialTab)
  }, [initialTab])

  const loadEntries = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchLogbookEntries(50, null, showVoided)
      setEntries(Array.isArray(data.entries) ? data.entries : [])
      setNextCursor(data.nextCursor ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load logbook')
    } finally {
      setLoading(false)
    }
  }

  // Reload entries when showVoided changes
  useEffect(() => {
    loadEntries()
  }, [showVoided])

  const getFieldErrors = () => {
    const nextErrors: Record<string, string> = {}
    if (!formData.date) nextErrors.date = 'Required'
    if (!formData.totalTime) nextErrors.totalTime = 'Required'
    if (!formData.isSimulator && !formData.routeFrom) nextErrors.routeFrom = 'Required'
    if (!formData.isSimulator && !formData.routeTo) nextErrors.routeTo = 'Required'
    if (formData.isSimulator && !formData.trainingDeviceId) nextErrors.trainingDeviceId = 'Required'
    if (formData.isSimulator && !formData.trainingDeviceLocation) nextErrors.trainingDeviceLocation = 'Required'
    if (formData.requiresSafetyPilot && !formData.safetyPilotName) nextErrors.safetyPilotName = 'Required'
    if (parseFloat(formData.instrumentTime) > 0 && !formData.actualInstrumentTime && !formData.simulatedInstrumentTime) {
      nextErrors.instrumentBreakdown = 'Required'
    }
    return nextErrors
  }

  const toNumber = (value: string) => (Number.isFinite(parseFloat(value)) ? parseFloat(value) : 0)
  const toInt = (value: string) => (Number.isFinite(parseInt(value, 10)) ? parseInt(value, 10) : 0)

  const loadMoreEntries = async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const data = await fetchLogbookEntries(50, nextCursor)
      const newEntries = Array.isArray(data.entries) ? data.entries : []
      setEntries((prev) => [...prev, ...newEntries])
      setNextCursor(data.nextCursor ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more entries')
    } finally {
      setLoadingMore(false)
    }
  }

  const loadStartingTotals = async () => {
    try {
      const data = await fetchStartingTotals()
      setStartingTotals(data.totals ?? null)
    } catch {
      setStartingTotals(null)
    }
  }

  const loadCurrencyProgress = async () => {
    try {
      const data = await fetchCurrencyProgress()
      setCurrencyProgress(data.progress || [])
    } catch {
      setCurrencyProgress([])
    }
  }

  const loadPreferences = async () => {
    try {
      const data = await fetchPreferences()
      if (data.preferences) setPreferences({ ...preferences, ...data.preferences })
    } catch {
      // noop
    }
  }

  const savePreferences = async (next: LogbookPreferences) => {
    setPreferences(next)
    await savePreferencesApi(next)
  }

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      if (filters.year !== 'all' && new Date(entry.date).getFullYear().toString() !== filters.year) return false
      if (filters.aircraft !== 'all' && entry.aircraft !== filters.aircraft) return false
      if (filters.search) {
        const q = filters.search.toLowerCase()
        return (
          entry.aircraft.toLowerCase().includes(q) ||
          entry.routeFrom.toLowerCase().includes(q) ||
          entry.routeTo.toLowerCase().includes(q) ||
          (entry.remarks || '').toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [entries, filters])

  const totals = useMemo(() => {
    return filteredEntries.reduce(
      (acc, entry) => ({
        totalTime: acc.totalTime + entry.totalTime,
        picTime: acc.picTime + entry.picTime,
        sicTime: acc.sicTime + entry.sicTime,
        soloTime: acc.soloTime + entry.soloTime,
        dualGiven: acc.dualGiven + entry.dualGiven,
        dualReceived: acc.dualReceived + entry.dualReceived,
        nightTime: acc.nightTime + entry.nightTime,
        instrumentTime: acc.instrumentTime + entry.instrumentTime,
        crossCountryTime: acc.crossCountryTime + entry.crossCountryTime,
        dayLandings: acc.dayLandings + entry.dayLandings,
        nightLandings: acc.nightLandings + entry.nightLandings,
      }),
      {
        totalTime: 0,
        picTime: 0,
        sicTime: 0,
        soloTime: 0,
        dualGiven: 0,
        dualReceived: 0,
        nightTime: 0,
        instrumentTime: 0,
        crossCountryTime: 0,
        dayLandings: 0,
        nightLandings: 0,
      }
    )
  }, [filteredEntries])

  const submitEntry = async () => {
    setLoading(true)
    setError(null)
    try {
      const nextErrors = getFieldErrors()

      if (Object.keys(nextErrors).length > 0) {
        setFieldErrors(nextErrors)
        setError('Please complete required fields.')
        setLoading(false)
        return
      }

      setFieldErrors({})

      await createLogbookEntry({
        ...formData,
        authority,
        totalTime: toNumber(formData.totalTime),
        picTime: toNumber(formData.picTime),
        sicTime: toNumber(formData.sicTime),
        soloTime: toNumber(formData.soloTime),
        dualGiven: toNumber(formData.dualGiven),
        dualReceived: toNumber(formData.dualReceived),
        nightTime: toNumber(formData.nightTime),
        instrumentTime: toNumber(formData.instrumentTime),
        actualInstrumentTime: toNumber(formData.actualInstrumentTime),
        simulatedInstrumentTime: toNumber(formData.simulatedInstrumentTime),
        groundTrainingReceived: toNumber(formData.groundTrainingReceived),
        simTrainingReceived: toNumber(formData.simTrainingReceived),
        crossCountryTime: toNumber(formData.crossCountryTime),
        dayLandings: toInt(formData.dayLandings),
        nightLandings: toInt(formData.nightLandings),
      })
      await loadEntries()
      setActiveTab('search')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save entry')
    } finally {
      setLoading(false)
    }
  }

  const isSaveDisabled = () => Object.keys(getFieldErrors()).length > 0

  const handleVoidEntry = async (id: string, reason: string) => {
    setVoidingId(id)
    try {
      await voidLogbookEntry(id, reason)
      await loadEntries()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to void entry')
    } finally {
      setVoidingId(null)
    }
  }

  const handleUnvoidEntry = async (id: string) => {
    setVoidingId(id)
    try {
      await unvoidLogbookEntry(id)
      await loadEntries()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore entry')
    } finally {
      setVoidingId(null)
    }
  }

  const saveStartingTotals = async (totals: StartingTotals) => {
    await saveStartingTotalsApi(totals)
    await loadStartingTotals()
  }

  const formatHours = (value: number) => {
    if (preferences.timeDisplayFormat === 'hhmm') {
      const totalMinutes = Math.round(value * 60)
      const hours = Math.floor(totalMinutes / 60)
      const minutes = totalMinutes % 60
      return `${hours}:${minutes.toString().padStart(2, '0')}`
    }

    if (preferences.timeDisplayFormat === 'decimal-1') return value.toFixed(1)
    if (preferences.timeDisplayFormat === 'decimal-2') return value.toFixed(2)
    return value.toFixed(value % 1 === 0 ? 1 : 2)
  }

  const exportCsv = () => {
    const headers = ['Date', 'Aircraft', 'From', 'To', 'Total', 'PIC', 'SIC', 'Solo', 'Dual Given', 'Dual Received', 'Night', 'Instrument', 'XC', 'Day Landings', 'Night Landings', 'Remarks']
    const rows = filteredEntries.map((entry) => [
      entry.date,
      entry.aircraft,
      entry.routeFrom,
      entry.routeTo,
      formatHours(entry.totalTime),
      formatHours(entry.picTime),
      formatHours(entry.sicTime),
      formatHours(entry.soloTime),
      formatHours(entry.dualGiven),
      formatHours(entry.dualReceived),
      formatHours(entry.nightTime),
      formatHours(entry.instrumentTime),
      formatHours(entry.crossCountryTime),
      entry.dayLandings,
      entry.nightLandings,
      `"${entry.remarks || ''}"`,
    ].join(','))
    const content = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `logbook_export_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
  }

  if (status === 'loading') {
    return <div className="min-h-screen bg-background p-6">Loading…</div>
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <div className="text-5xl mb-4">📘</div>
            <h1 className="text-2xl font-bold mb-2">Logbook</h1>
            <p className="text-muted-foreground mb-6">Sign in to access your logbook, endorsements, and reports.</p>
            <Button onClick={() => signIn()}>Sign In</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const uniqueAircraft = [...new Set(entries.map((e) => e.aircraft))]
  const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i)
  const currencyCounts = currencyProgress.reduce(
    (acc, rule: any) => {
      acc[rule.status] = (acc[rule.status] || 0) + 1
      return acc
    },
    { current: 0, expiring: 0, expired: 0 } as Record<string, number>
  )

  return (
    <div className="space-y-6">
      <LogbookHeader
        onAdd={() => setOpenDialog('add')}
        onImport={() => setOpenDialog('import')}
        onPrint={() => setOpenDialog('print')}
        onRefreshCurrency={async () => {
          await refreshCurrency()
          await loadCurrencyProgress()
          setActiveTab('currency')
        }}
      />

      <LogbookSummaryCards
        totals={totals}
        currencyCounts={currencyCounts}
        formatHours={formatHours}
      />

      {error && <p className="text-sm text-destructive">{error}</p>}

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabKey)}>

          <TabsContent value="add" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Add Flights</CardTitle>
                <CardDescription>Recent flight history.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {entries.slice(0, 6).map((entry) => (
                  <div key={entry.id} className="rounded-md border border-border p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{entry.aircraft} · {entry.routeFrom} → {entry.routeTo}</p>
                        <p className="text-xs text-muted-foreground">{new Date(entry.date).toLocaleDateString()} · {entry.totalTime.toFixed(1)} hrs</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {entry.authority && <Badge variant="secondary">{entry.authority}</Badge>}
                      </div>
                    </div>
                  </div>
                ))}
                <Button onClick={() => setOpenDialog('add')}><Plus className="mr-2 h-4 w-4" /> Add Flight</Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="search" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Search</CardTitle>
                <CardDescription>Filter logbook entries.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-4">
                <Input placeholder="Search" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
                <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={filters.year} onChange={(e) => setFilters({ ...filters, year: e.target.value })}>
                  <option value="all">All Years</option>
                  {years.map((year) => <option key={year} value={year}>{year}</option>)}
                </select>
                <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={filters.aircraft} onChange={(e) => setFilters({ ...filters, aircraft: e.target.value })}>
                  <option value="all">All Aircraft</option>
                  {uniqueAircraft.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
                <label className="flex items-center gap-2 text-sm">
                  <input 
                    type="checkbox" 
                    checked={showVoided} 
                    onChange={(e) => setShowVoided(e.target.checked)}
                    className="h-4 w-4"
                  />
                  Show voided
                </label>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Entries</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
                {!loading && filteredEntries.length === 0 && <p className="text-sm text-muted-foreground">No entries.</p>}
                {filteredEntries.map((entry) => (
                  <Card key={entry.id} className={entry.isVoided ? 'opacity-60 border-dashed' : ''}>
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className={`text-lg font-semibold ${entry.isVoided ? 'line-through text-muted-foreground' : ''}`}>{entry.aircraft}</p>
                            {entry.isVoided && <Badge variant="destructive">VOIDED</Badge>}
                          </div>
                          <p className="text-sm text-muted-foreground">{entry.routeFrom} → {entry.routeTo}</p>
                          <p className="text-xs text-muted-foreground mt-1">{new Date(entry.date).toLocaleDateString()}</p>
                          {entry.isVoided && entry.voidReason && (
                            <p className="text-xs text-destructive mt-1">Void reason: {entry.voidReason}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className={`text-2xl font-semibold ${entry.isVoided ? 'line-through text-muted-foreground' : ''}`}>{formatHours(entry.totalTime)} hrs</p>
                          <div className="mt-2 flex flex-wrap justify-end gap-2">
                            {entry.authority && <Badge variant="secondary">{entry.authority}</Badge>}
                            {entry.isPending && <Badge variant="outline">Pending</Badge>}
                            {entry.nightTime > 0 && <Badge variant="outline">Night</Badge>}
                            {entry.instrumentTime > 0 && <Badge variant="outline">Instrument</Badge>}
                          </div>
                          {!entry.isVoided && (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="mt-2 text-destructive hover:text-destructive"
                              onClick={() => {
                                const reason = prompt('Enter reason for voiding this entry:')
                                if (reason) handleVoidEntry(entry.id, reason)
                              }}
                              disabled={voidingId === entry.id}
                            >
                              {voidingId === entry.id ? 'Voiding...' : 'Void Entry'}
                            </Button>
                          )}
                          {entry.isVoided && (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="mt-2"
                              onClick={() => handleUnvoidEntry(entry.id)}
                              disabled={voidingId === entry.id}
                            >
                              {voidingId === entry.id ? 'Restoring...' : 'Restore Entry'}
                            </Button>
                          )}
                        </div>
                      </div>
                      {entry.remarks && <p className="text-sm text-muted-foreground mt-3">{entry.remarks}</p>}
                    </CardContent>
                  </Card>
                ))}
                {!loading && nextCursor && (
                  <Button variant="outline" onClick={loadMoreEntries} disabled={loadingMore}>
                    {loadingMore ? 'Loading…' : 'Load more'}
                  </Button>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="totals" className="space-y-4">
            {/* Starting Totals - Baseline */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Starting Totals</CardTitle>
                    <CardDescription>Your baseline totals before logged flights.</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setOpenDialog('starting-totals')}>
                    Edit Baseline
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="rounded-md border border-border p-3">
                    <p className="text-xs text-muted-foreground">Total Time</p>
                    <p className="text-lg font-semibold">{startingTotals?.totalTime ? formatHours(startingTotals.totalTime) : '0.0'}</p>
                  </div>
                  <div className="rounded-md border border-border p-3">
                    <p className="text-xs text-muted-foreground">PIC Time</p>
                    <p className="text-lg font-semibold">{startingTotals?.picTime ? formatHours(startingTotals.picTime) : '0.0'}</p>
                  </div>
                  <div className="rounded-md border border-border p-3">
                    <p className="text-xs text-muted-foreground">Night Time</p>
                    <p className="text-lg font-semibold">{startingTotals?.nightTime ? formatHours(startingTotals.nightTime) : '0.0'}</p>
                  </div>
                  <div className="rounded-md border border-border p-3">
                    <p className="text-xs text-muted-foreground">Instrument</p>
                    <p className="text-lg font-semibold">{startingTotals?.instrumentTime ? formatHours(startingTotals.instrumentTime) : '0.0'}</p>
                  </div>
                </div>
                {startingTotals?.asOfDate && (
                  <p className="text-xs text-muted-foreground mt-2">As of: {new Date(startingTotals.asOfDate).toLocaleDateString()}</p>
                )}
              </CardContent>
            </Card>

            {/* Flight Totals */}
            <Card>
              <CardHeader>
                <CardTitle>Flight Totals</CardTitle>
                <CardDescription>Totals from your logged flights.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-3">
                {Object.entries(totals).map(([key, value]) => (
                  <div key={key} className="rounded-md border border-border p-3">
                    <p className="text-xs text-muted-foreground capitalize">{key.replace(/([A-Z])/g, ' $1')}</p>
                    <p className="text-lg font-semibold">{typeof value === 'number' ? formatHours(value) : value}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="currency" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Currency</CardTitle>
                <CardDescription>FAA + EASA currency rules dashboard.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" onClick={async () => {
                  await refreshCurrency()
                  await loadCurrencyProgress()
                }}>
                  <ShieldCheck className="mr-2 h-4 w-4" /> Refresh Currency
                </Button>
                <div className="mt-4 space-y-3">
                  {currencyProgress.length === 0 && (
                    <p className="text-sm text-muted-foreground">No currency data yet.</p>
                  )}
                  {currencyProgress.map((rule) => (
                    <div key={rule.code} className="rounded-md border border-border p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{rule.name}</p>
                          <p className="text-xs text-muted-foreground">{rule.authority}</p>
                        </div>
                        <Badge variant={rule.status === 'current' ? 'secondary' : 'outline'}>{rule.status}</Badge>
                      </div>
                      <div className="mt-3 space-y-2 text-xs">
                        {rule.progress.map((p: any, idx: number) => {
                          const percent = Math.min(100, Math.round((p.completed / Math.max(1, p.required)) * 100))
                          return (
                            <div key={idx}>
                              <div className="flex justify-between">
                                <span>{p.unit}</span>
                                <span>{p.completed} / {p.required}</span>
                              </div>
                              <div className="h-2 rounded-full bg-muted mt-1">
                                <div className="h-2 rounded-full bg-primary" style={{ width: `${percent}%` }} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      {rule.nextDueAt && (
                        <p className="mt-2 text-xs text-muted-foreground">Next due: {new Date(rule.nextDueAt).toLocaleDateString()}</p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analysis" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Analysis</CardTitle>
                <CardDescription>Visualize trends and readiness.</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Charts and analysis will appear here (hours by month, instrument vs night, etc.).</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="download" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Download</CardTitle>
                <CardDescription>Export your logbook.</CardDescription>
              </CardHeader>
              <CardContent className="flex gap-2">
                <Button onClick={exportCsv}><Download className="mr-2 h-4 w-4" />Export CSV</Button>
                <Button variant="outline" onClick={() => setActiveTab('print-view')}><FileText className="mr-2 h-4 w-4" />Print View</Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="import" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Import</CardTitle>
                <CardDescription>Review recent imports and statuses.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">No recent imports. Start a new import to see history.</p>
                <Button onClick={() => setOpenDialog('import')}><Upload className="mr-2 h-4 w-4" />Start Import</Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="starting-totals" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Starting Totals</CardTitle>
                <CardDescription>Set your baseline totals before digital logging.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                <Input placeholder="Total Time" defaultValue={startingTotals?.totalTime ?? ''} readOnly />
                <Button onClick={() => setOpenDialog('starting-totals')}>Update Starting Totals</Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="check-flights" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Check Flights</CardTitle>
                <CardDescription>Validate compliance issues and missing fields.</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Validation engine will flag missing times, endorsements, and currency gaps.</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="print-view" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Print View</CardTitle>
                <CardDescription>FAA and EASA formatted print layouts.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm text-muted-foreground">Preview available in the print dialog.</p>
                <Button variant="outline" onClick={() => setOpenDialog('print')}><FileText className="mr-2 h-4 w-4" />Open Print</Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pending" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Pending Flights</CardTitle>
                <CardDescription>Flights awaiting instructor approval.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {entries.filter((e) => e.isPending).length === 0 && (
                  <p className="text-sm text-muted-foreground">No pending flights.</p>
                )}
                {entries.filter((e) => e.isPending).map((entry) => (
                  <div key={entry.id} className="rounded-md border border-border p-3">
                    <p className="font-medium">{entry.aircraft} · {entry.routeFrom} → {entry.routeTo}</p>
                    <p className="text-xs text-muted-foreground">{new Date(entry.date).toLocaleDateString()}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="preferences" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Flight Entry & Display</CardTitle>
                <CardDescription>Time formats, timezone, and table visibility.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-xs text-muted-foreground">Time display format</label>
                  <select
                    className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={preferences.timeDisplayFormat}
                    onChange={(e) => savePreferences({ ...preferences, timeDisplayFormat: e.target.value })}
                  >
                    <option value="decimal-1-2">Decimal (1 or 2 digits)</option>
                    <option value="decimal-1">Decimal (1 digit)</option>
                    <option value="decimal-2">Decimal (2 digits)</option>
                    <option value="hhmm">HH:MM</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Summation mode</label>
                  <select
                    className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={preferences.sumTimeMode}
                    onChange={(e) => savePreferences({ ...preferences, sumTimeMode: e.target.value })}
                  >
                    <option value="whole-minutes">Whole minutes</option>
                    <option value="hundredths">Hundredths of an hour</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Preferred timezone</label>
                  <select
                    className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={preferences.preferredTimeZone}
                    onChange={(e) => savePreferences({ ...preferences, preferredTimeZone: e.target.value })}
                  >
                    <option value="UTC">UTC</option>
                    <option value="local">Local</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Date interpretation</label>
                  <select
                    className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={preferences.dateInterpretation}
                    onChange={(e) => savePreferences({ ...preferences, dateInterpretation: e.target.value })}
                  >
                    <option value="local">Local date at departure</option>
                    <option value="utc">UTC date at departure</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={preferences.showInstructorTime}
                    onChange={(e) => savePreferences({ ...preferences, showInstructorTime: e.target.checked })}
                  />
                  Show Instructor time in tables
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={preferences.showSicTime}
                    onChange={(e) => savePreferences({ ...preferences, showSicTime: e.target.checked })}
                  />
                  Show SIC time in tables
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={preferences.showHobbsTach}
                    onChange={(e) => savePreferences({ ...preferences, showHobbsTach: e.target.checked })}
                  />
                  Show Hobbs/Tach fields
                </label>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Autofill & Night Rules</CardTitle>
                <CardDescription>Automatic entry rules and night calculations.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={preferences.autoFillTimes}
                    onChange={(e) => savePreferences({ ...preferences, autoFillTimes: e.target.checked })}
                  />
                  Auto-fill time fields
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={preferences.autoFillLandings}
                    onChange={(e) => savePreferences({ ...preferences, autoFillLandings: e.target.checked })}
                  />
                  Auto-fill landings
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={preferences.includeHeliports}
                    onChange={(e) => savePreferences({ ...preferences, includeHeliports: e.target.checked })}
                  />
                  Include heliports
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={preferences.estimateNight}
                    onChange={(e) => savePreferences({ ...preferences, estimateNight: e.target.checked })}
                  />
                  Estimate night time
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={preferences.roundNearestTenth}
                    onChange={(e) => savePreferences({ ...preferences, roundNearestTenth: e.target.checked })}
                  />
                  Round to nearest tenth
                </label>
                <div>
                  <label className="text-xs text-muted-foreground">Night starts</label>
                  <select
                    className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={preferences.nightStartRule}
                    onChange={(e) => savePreferences({ ...preferences, nightStartRule: e.target.value })}
                  >
                    <option value="civil-twilight">End of civil twilight</option>
                    <option value="sunset-plus-30">30 min after sunset</option>
                    <option value="sunset-plus-60">1 hour after sunset</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Night landings occur</label>
                  <select
                    className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={preferences.nightLandingRule}
                    onChange={(e) => savePreferences({ ...preferences, nightLandingRule: e.target.value })}
                  >
                    <option value="sunset-plus-60">1 hour after sunset</option>
                    <option value="civil-twilight">End of civil twilight</option>
                  </select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Totals & Currency</CardTitle>
                <CardDescription>Grouping and currency rule sets.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={preferences.totalsByCategoryClass} onChange={(e) => savePreferences({ ...preferences, totalsByCategoryClass: e.target.checked })} />
                  Totals by category/class
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={preferences.totalsByModel} onChange={(e) => savePreferences({ ...preferences, totalsByModel: e.target.checked })} />
                  Totals by model
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={preferences.totalsByModelFamily} onChange={(e) => savePreferences({ ...preferences, totalsByModelFamily: e.target.checked })} />
                  Totals by model family
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={preferences.totalsByFeatures} onChange={(e) => savePreferences({ ...preferences, totalsByFeatures: e.target.checked })} />
                  Include feature subtotals
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={preferences.currencyByCategory} onChange={(e) => savePreferences({ ...preferences, currencyByCategory: e.target.checked })} />
                  Currency by category/class
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={preferences.currencyByModel} onChange={(e) => savePreferences({ ...preferences, currencyByModel: e.target.checked })} />
                  Currency by model
                </label>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Notifications</CardTitle>
                <CardDescription>Currency and totals summaries.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={preferences.notifyCurrencyWeekly} onChange={(e) => savePreferences({ ...preferences, notifyCurrencyWeekly: e.target.checked })} />
                  Weekly currency summary
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={preferences.notifyCurrencyOnExpiry} onChange={(e) => savePreferences({ ...preferences, notifyCurrencyOnExpiry: e.target.checked })} />
                  Notify when currency expires
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={preferences.notifyTotalsWeekly} onChange={(e) => savePreferences({ ...preferences, notifyTotalsWeekly: e.target.checked })} />
                  Weekly totals
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={preferences.notifyTotalsMonthly} onChange={(e) => savePreferences({ ...preferences, notifyTotalsMonthly: e.target.checked })} />
                  Monthly totals
                </label>
              </CardContent>
            </Card>
          </TabsContent>
      </Tabs>

      <Dialog open={openDialog === 'add'} onOpenChange={(open) => setOpenDialog(open ? 'add' : null)}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Flight</DialogTitle>
            <DialogDescription>Log a new flight with FAA/EASA fields.</DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            {error && <p className="text-sm text-destructive">{error}</p>}

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">General</p>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <Input type="date" value={formData.date} className={fieldErrors.date ? 'border-destructive' : ''} onChange={(e) => setFormData({ ...formData, date: e.target.value })} />
                <Input placeholder="Aircraft / Device" value={formData.aircraft} onChange={(e) => setFormData({ ...formData, aircraft: e.target.value })} />
                <label className="flex items-center gap-2 text-sm md:col-span-2">
                  <input type="checkbox" checked={formData.isSimulator} onChange={(e) => setFormData({ ...formData, isSimulator: e.target.checked })} />
                  Simulator / Flight Training Device session
                </label>
                {!formData.isSimulator && (
                  <>
                    <Input placeholder="From" value={formData.routeFrom} className={fieldErrors.routeFrom ? 'border-destructive' : ''} onChange={(e) => setFormData({ ...formData, routeFrom: e.target.value })} />
                    <Input placeholder="To" value={formData.routeTo} className={fieldErrors.routeTo ? 'border-destructive' : ''} onChange={(e) => setFormData({ ...formData, routeTo: e.target.value })} />
                  </>
                )}
                {formData.isSimulator && (
                  <>
                    <Input placeholder="Training Device ID" value={formData.trainingDeviceId} className={fieldErrors.trainingDeviceId ? 'border-destructive' : ''} onChange={(e) => setFormData({ ...formData, trainingDeviceId: e.target.value })} />
                    <Input placeholder="Training Location" value={formData.trainingDeviceLocation} className={fieldErrors.trainingDeviceLocation ? 'border-destructive' : ''} onChange={(e) => setFormData({ ...formData, trainingDeviceLocation: e.target.value })} />
                  </>
                )}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Experience & Training</p>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <Input placeholder="Total Time" value={formData.totalTime} className={fieldErrors.totalTime ? 'border-destructive' : ''} onChange={(e) => setFormData({ ...formData, totalTime: e.target.value })} />
                <Input placeholder="PIC" value={formData.picTime} onChange={(e) => setFormData({ ...formData, picTime: e.target.value })} />
                <Input placeholder="SIC" value={formData.sicTime} onChange={(e) => setFormData({ ...formData, sicTime: e.target.value })} />
                <Input placeholder="Solo" value={formData.soloTime} onChange={(e) => setFormData({ ...formData, soloTime: e.target.value })} />
                <Input placeholder="Dual Received" value={formData.dualReceived} onChange={(e) => setFormData({ ...formData, dualReceived: e.target.value })} />
                <Input placeholder="Ground Training" value={formData.groundTrainingReceived} onChange={(e) => setFormData({ ...formData, groundTrainingReceived: e.target.value })} />
                <Input placeholder="Sim Training" value={formData.simTrainingReceived} onChange={(e) => setFormData({ ...formData, simTrainingReceived: e.target.value })} />
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Conditions & Landings</p>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                {/* Day/Night condition dropdown */}
                <select 
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={formData.isDay && formData.isNight ? 'both' : formData.isNight ? 'night' : formData.isDay ? 'day' : ''}
                  onChange={(e) => {
                    const val = e.target.value
                    setFormData({ 
                      ...formData, 
                      isDay: val === 'day' || val === 'both',
                      isNight: val === 'night' || val === 'both'
                    })
                  }}
                >
                  <option value="">Select Day/Night</option>
                  <option value="day">Day</option>
                  <option value="night">Night</option>
                  <option value="both">Day & Night</option>
                </select>
                
                {/* Weather conditions dropdown */}
                <select 
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={formData.conditions || ''}
                  onChange={(e) => setFormData({ ...formData, conditions: e.target.value })}
                >
                  <option value="">Select Conditions</option>
                  <option value="VMC">VMC - Visual Meteorological</option>
                  <option value="IMC">IMC - Instrument Meteorological</option>
                  <option value="MVFR">MVFR - Marginal VFR</option>
                  <option value="IFR">IFR - Instrument Flight Rules</option>
                </select>
                
                <Input placeholder="Night" value={formData.nightTime} onChange={(e) => setFormData({ ...formData, nightTime: e.target.value })} />
                <Input placeholder="Instrument" value={formData.instrumentTime} onChange={(e) => setFormData({ ...formData, instrumentTime: e.target.value })} />
                <Input placeholder="Actual Instrument" value={formData.actualInstrumentTime} className={fieldErrors.instrumentBreakdown ? 'border-destructive' : ''} onChange={(e) => setFormData({ ...formData, actualInstrumentTime: e.target.value })} />
                <Input placeholder="Simulated Instrument" value={formData.simulatedInstrumentTime} className={fieldErrors.instrumentBreakdown ? 'border-destructive' : ''} onChange={(e) => setFormData({ ...formData, simulatedInstrumentTime: e.target.value })} />
                <Input placeholder="Cross Country" value={formData.crossCountryTime} onChange={(e) => setFormData({ ...formData, crossCountryTime: e.target.value })} />
                <Input placeholder="Day Landings" value={formData.dayLandings} onChange={(e) => setFormData({ ...formData, dayLandings: e.target.value })} />
                <Input placeholder="Night Landings" value={formData.nightLandings} onChange={(e) => setFormData({ ...formData, nightLandings: e.target.value })} />
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Safety Pilot</p>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <label className="flex items-center gap-2 text-sm md:col-span-2">
                  <input type="checkbox" checked={formData.requiresSafetyPilot} onChange={(e) => setFormData({ ...formData, requiresSafetyPilot: e.target.checked })} />
                  Safety pilot required
                </label>
                {formData.requiresSafetyPilot && (
                  <Input placeholder="Safety Pilot Name" value={formData.safetyPilotName} className={fieldErrors.safetyPilotName ? 'border-destructive' : ''} onChange={(e) => setFormData({ ...formData, safetyPilotName: e.target.value })} />
                )}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notes</p>
              <div className="mt-3 grid gap-4">
                <Textarea placeholder="Remarks" value={formData.remarks} onChange={(e) => setFormData({ ...formData, remarks: e.target.value })} />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={formData.isPending} onChange={(e) => setFormData({ ...formData, isPending: e.target.checked })} />
                  Mark as pending (instructor approval)
                </label>
              </div>
            </div>

            <Button onClick={async () => {
              await submitEntry()
              setOpenDialog(null)
            }} disabled={loading || isSaveDisabled()} className="w-full">
              <Plus className="mr-2 h-4 w-4" /> Save Flight
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={openDialog === 'import'} onOpenChange={(open) => setOpenDialog(open ? 'import' : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start Import</DialogTitle>
            <DialogDescription>Upload CSV, MyFlightbook, ForeFlight, or Garmin exports.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" id="import-source">
              <option value="CSV">CSV/Excel</option>
              <option value="MYFLIGHTBOOK">MyFlightbook</option>
              <option value="FOREFLIGHT">ForeFlight</option>
              <option value="GARMIN">Garmin</option>
            </select>
            <Input type="file" />
            <Button onClick={async () => {
              const source = (document.getElementById('import-source') as HTMLSelectElement)?.value
              await fetch('/api/logbook/imports', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ source, summaryJson: '{}' }),
              })
              setOpenDialog(null)
            }}>
              <Upload className="mr-2 h-4 w-4" />Start Import
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={openDialog === 'starting-totals'} onOpenChange={(open) => setOpenDialog(open ? 'starting-totals' : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Starting Totals</DialogTitle>
            <DialogDescription>Set your baseline totals.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Total Time" defaultValue={startingTotals?.totalTime ?? ''} onBlur={async (e) => {
              await saveStartingTotals({
                totalTime: parseFloat(e.target.value) || 0,
                picTime: startingTotals?.picTime || 0,
                sicTime: startingTotals?.sicTime || 0,
                nightTime: startingTotals?.nightTime || 0,
                instrumentTime: startingTotals?.instrumentTime || 0,
                crossCountryTime: startingTotals?.crossCountryTime || 0,
                landingsDay: startingTotals?.landingsDay || 0,
                landingsNight: startingTotals?.landingsNight || 0,
                asOfDate: startingTotals?.asOfDate || null,
              })
            }} />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={openDialog === 'print'} onOpenChange={(open) => setOpenDialog(open ? 'print' : null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Print Preview</DialogTitle>
            <DialogDescription>FAA and EASA formatted print layouts.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {filteredEntries.slice(0, 20).map((entry) => (
              <div key={entry.id} className="border-b border-border py-2 text-sm">
                    {entry.date} · {entry.aircraft} · {entry.routeFrom} → {entry.routeTo} · {formatHours(entry.totalTime)} hrs
              </div>
            ))}
            <Button variant="outline" onClick={() => window.print()}><FileText className="mr-2 h-4 w-4" />Print</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function LogbookPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background p-6">Loading…</div>}>
      <LogbookContent />
    </Suspense>
  )
}
