'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, Loader2, History, Ban, AlertTriangle, Save } from 'lucide-react'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import {
  getLocalFlightById,
  updateLocalFlight,
  voidLocalFlight,
  getLocalFlightHistory,
  listLocalAircraftOptions,
  resolveLocalLogbookUserId,
  type LocalFlightFull,
  type LocalFlightHistory,
  type UpdateLocalFlightInput,
} from '@/apps/desktop/src/lib/local-logbook'
import { getCloudSession } from '@/apps/desktop/src/lib/cloud-session'
import { cloudApi } from '@/apps/desktop/src/lib/cloud-api'
import { notifySaved, notifyError } from '@/desktop/lib/toast-helpers'
import { toast } from '@/components/ui/use-toast'

type AircraftOption = { id: string; nNumber: string; nickname?: string | null }

const FIELDS = [
  { key: 'picTime', label: 'PIC', step: '0.1' },
  { key: 'sicTime', label: 'SIC', step: '0.1' },
  { key: 'nightTime', label: 'Night', step: '0.1' },
  { key: 'instrumentTime', label: 'Instrument', step: '0.1' },
  { key: 'crossCountryTime', label: 'Cross-Country', step: '0.1' },
  { key: 'soloTime', label: 'Solo', step: '0.1' },
  { key: 'dualReceived', label: 'Dual Rec.', step: '0.1' },
  { key: 'dualGiven', label: 'Dual Given', step: '0.1' },
  { key: 'simulatedInstrumentTime', label: 'Sim. IFR', step: '0.1' },
] as const

type TimeKey = (typeof FIELDS)[number]['key']

const INPUT_CLASS =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}

function formatHistoryDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function formatFieldName(name: string | null): string {
  if (!name) return ''
  const map: Record<string, string> = {
    date: 'Date', aircraft: 'Aircraft', routeFrom: 'From', routeTo: 'To',
    totalTime: 'Total Time', picTime: 'PIC', sicTime: 'SIC', nightTime: 'Night',
    instrumentTime: 'Instrument', crossCountryTime: 'Cross-Country', soloTime: 'Solo',
    dualReceived: 'Dual Received', dualGiven: 'Dual Given',
    simulatedInstrumentTime: 'Sim IFR', landingsDay: 'Day Landings',
    landingsNight: 'Night Landings', isSimulator: 'Simulator', remarks: 'Remarks',
  }
  return map[name] ?? name
}

export default function DesktopEditFlightPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const { mode, localUser, cloudUser } = useDesktopAuth()

  const [flight, setFlight] = useState<LocalFlightFull | null>(null)
  const [history, setHistory] = useState<LocalFlightHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [voiding, setVoiding] = useState(false)
  const [showVoidForm, setShowVoidForm] = useState(false)
  const [voidReason, setVoidReason] = useState('')
  const [error, setError] = useState('')

  const [date, setDate] = useState('')
  const [aircraft, setAircraft] = useState('')
  const [aircraftId, setAircraftId] = useState('')
  const [aircraftList, setAircraftList] = useState<AircraftOption[]>([])
  const [useManualAircraft, setUseManualAircraft] = useState(false)
  const [routeFrom, setRouteFrom] = useState('')
  const [routeTo, setRouteTo] = useState('')
  const [totalTime, setTotalTime] = useState('')
  const [dayLandings, setDayLandings] = useState('')
  const [nightLandings, setNightLandings] = useState('')
  const [isSimulator, setIsSimulator] = useState(false)
  const [remarks, setRemarks] = useState('')
  const [times, setTimes] = useState<Record<TimeKey, string>>({} as Record<TimeKey, string>)

  const setField = (key: TimeKey, val: string) => setTimes((prev) => ({ ...prev, [key]: val }))

  useEffect(() => {
    let cancelled = false
    async function loadAircraftList() {
      const rows: AircraftOption[] = []
      try {
        const localId = await resolveLocalLogbookUserId({ mode, localUserId: localUser?.id, cloudUser })
        const localAircraft = await listLocalAircraftOptions(localId)
        for (const a of localAircraft) rows.push({ id: a.id, nNumber: a.nNumber, nickname: a.nickname })
      } catch {
        // ignore local list errors
      }
      try {
        const session = await getCloudSession()
        if (session.authenticated) {
          const cloudAircraft = await cloudApi.getAircraft()
          for (const a of cloudAircraft) rows.push(a)
        }
      } catch {
        // ignore cloud list errors
      }
      const deduped = new Map<string, AircraftOption>()
      for (const a of rows) {
        const key = a.nNumber.toUpperCase()
        if (!deduped.has(key)) deduped.set(key, a)
      }
      if (!cancelled) setAircraftList(Array.from(deduped.values()))
    }
    loadAircraftList()
    return () => { cancelled = true }
  }, [mode, localUser?.id, cloudUser])

  // Once the flight and the saved-aircraft list are both loaded, try to match
  // the flight's aircraft text to a saved plane so the dropdown pre-selects it.
  useEffect(() => {
    if (!flight) return
    const match = aircraftList.find((a) => a.nNumber.toUpperCase() === flight.aircraft.toUpperCase())
    if (match) {
      setAircraftId(match.id)
      setUseManualAircraft(false)
    } else {
      setAircraftId('')
      setUseManualAircraft(aircraftList.length > 0)
    }
  }, [flight, aircraftList])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [f, h] = await Promise.all([
        getLocalFlightById(id),
        getLocalFlightHistory(id),
      ])
      if (!f) {
        setError('Flight not found.')
        return
      }
      setFlight(f)
      setHistory(h)

      const rawDate = f.date.includes('T') ? f.date.split('T')[0] : f.date
      setDate(rawDate)
      setAircraft(f.aircraft)
      setRouteFrom(f.routeFrom)
      setRouteTo(f.routeTo)
      setTotalTime(f.totalTime > 0 ? String(f.totalTime) : '')
      setDayLandings(f.landingsDay > 0 ? String(f.landingsDay) : '')
      setNightLandings(f.landingsNight > 0 ? String(f.landingsNight) : '')
      setIsSimulator(f.isSimulator)
      setRemarks(f.remarks || '')
      setTimes({
        picTime: f.picTime > 0 ? String(f.picTime) : '',
        sicTime: f.sicTime > 0 ? String(f.sicTime) : '',
        nightTime: f.nightTime > 0 ? String(f.nightTime) : '',
        instrumentTime: f.instrumentTime > 0 ? String(f.instrumentTime) : '',
        crossCountryTime: f.crossCountryTime > 0 ? String(f.crossCountryTime) : '',
        soloTime: f.soloTime > 0 ? String(f.soloTime) : '',
        dualReceived: f.dualReceived > 0 ? String(f.dualReceived) : '',
        dualGiven: f.dualGiven > 0 ? String(f.dualGiven) : '',
        simulatedInstrumentTime: f.simulatedInstrumentTime > 0 ? String(f.simulatedInstrumentTime) : '',
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load flight')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  async function handleSave() {
    if (!flight || !localUser) return
    if (!aircraft.trim()) { setError('Aircraft is required'); return }
    if (!totalTime || parseFloat(totalTime) <= 0) { setError('Total time must be greater than 0'); return }

    setSaving(true)
    setError('')
    try {
      const input: UpdateLocalFlightInput = {
        date: date ? new Date(`${date}T12:00:00Z`).toISOString() : undefined,
        aircraft: aircraft.trim().toUpperCase(),
        routeFrom: routeFrom.trim().toUpperCase(),
        routeTo: routeTo.trim().toUpperCase(),
        totalTime: parseFloat(totalTime) || 0,
        picTime: parseFloat(times.picTime || '0') || 0,
        sicTime: parseFloat(times.sicTime || '0') || 0,
        nightTime: parseFloat(times.nightTime || '0') || 0,
        instrumentTime: parseFloat(times.instrumentTime || '0') || 0,
        crossCountryTime: parseFloat(times.crossCountryTime || '0') || 0,
        soloTime: parseFloat(times.soloTime || '0') || 0,
        dualReceived: parseFloat(times.dualReceived || '0') || 0,
        dualGiven: parseFloat(times.dualGiven || '0') || 0,
        simulatedInstrumentTime: parseFloat(times.simulatedInstrumentTime || '0') || 0,
        landingsDay: parseInt(dayLandings) || 0,
        landingsNight: parseInt(nightLandings) || 0,
        isSimulator,
        remarks: remarks.trim(),
      }
      await updateLocalFlight(id, input, flight, localUser.name, 'Manual edit')
      notifySaved('Flight')
      await load()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save'
      setError(msg)
      notifyError('Flight', msg)
    } finally {
      setSaving(false)
    }
  }

  async function handleVoid() {
    if (!flight || !localUser || !voidReason.trim()) return
    setVoiding(true)
    try {
      await voidLocalFlight(id, localUser.name, voidReason.trim())
      toast({ title: 'Entry Voided', description: 'Flight entry voided and recorded in the audit log.' })
      router.replace('/desktop/logbook')
    } catch (err) {
      notifyError('Flight', err instanceof Error ? err.message : 'Failed to void flight')
    } finally {
      setVoiding(false)
      setShowVoidForm(false)
    }
  }

  const isVoided = flight?.voided ?? false
  const isReadOnly = isVoided

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error && !flight) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} type="button" className="rounded-md p-1.5 transition-colors hover:bg-muted">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Edit Flight</h1>
          <p className="text-xs text-muted-foreground">{flight?.date?.split('T')[0]} · {flight?.aircraft}</p>
        </div>
      </div>

      {/* Voided banner */}
      {isVoided && (
        <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">This entry has been voided</p>
            {flight?.voidReason && <p className="mt-0.5 text-xs opacity-80">Reason: {flight.voidReason}</p>}
            {flight?.voidedBy && <p className="text-xs opacity-80">By {flight.voidedBy}{flight.voidedAt ? ` on ${formatHistoryDate(flight.voidedAt)}` : ''}</p>}
          </div>
        </div>
      )}

      {error && flight && (
        <div className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</div>
      )}

      {/* Edit form */}
      <div className="space-y-4 rounded-lg border border-border bg-card p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Date">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={isReadOnly}
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="Aircraft">
            {aircraftList.length === 0 ? (
              <input
                type="text"
                value={aircraft}
                onChange={(e) => setAircraft(e.target.value.toUpperCase())}
                disabled={isReadOnly}
                placeholder="N-number"
                className={INPUT_CLASS}
              />
            ) : useManualAircraft ? (
              <div className="space-y-1">
                <input
                  type="text"
                  value={aircraft}
                  onChange={(e) => {
                    const value = e.target.value.toUpperCase()
                    setAircraft(value)
                    const match = aircraftList.find((a) => a.nNumber.toUpperCase() === value)
                    setAircraftId(match?.id || '')
                  }}
                  disabled={isReadOnly}
                  placeholder="N-number"
                  className={INPUT_CLASS}
                />
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={() => setUseManualAircraft(false)}
                    className="text-[11px] font-medium text-primary hover:underline"
                  >
                    Choose from saved aircraft
                  </button>
                )}
              </div>
            ) : (
              <select
                value={aircraftId}
                onChange={(e) => {
                  const id = e.target.value
                  if (id === '__manual__') {
                    setUseManualAircraft(true)
                    return
                  }
                  setAircraftId(id)
                  const match = aircraftList.find((a) => a.id === id)
                  if (match) setAircraft(match.nNumber)
                }}
                disabled={isReadOnly}
                className={INPUT_CLASS}
              >
                <option value="" disabled>Select aircraft…</option>
                {aircraftList.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nickname ? `${a.nickname} — ${a.nNumber}` : a.nNumber}
                  </option>
                ))}
                <option value="__manual__">Other / enter manually…</option>
              </select>
            )}
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="From">
            <input
              type="text"
              value={routeFrom}
              onChange={(e) => setRouteFrom(e.target.value.toUpperCase())}
              disabled={isReadOnly}
              placeholder="ICAO"
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="To">
            <input
              type="text"
              value={routeTo}
              onChange={(e) => setRouteTo(e.target.value.toUpperCase())}
              disabled={isReadOnly}
              placeholder="ICAO"
              className={INPUT_CLASS}
            />
          </Field>
        </div>

        <Field label="Total Time (hours)">
          <input
            type="number"
            step="0.1"
            min="0"
            value={totalTime}
            onChange={(e) => setTotalTime(e.target.value)}
            disabled={isReadOnly}
            placeholder="0.0"
            className={INPUT_CLASS}
          />
        </Field>

        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Time Breakdown (optional)</p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {FIELDS.map((f) => (
              <Field key={f.key} label={f.label}>
                <input
                  type="number"
                  step={f.step}
                  min="0"
                  value={times[f.key] || ''}
                  onChange={(e) => setField(f.key, e.target.value)}
                  disabled={isReadOnly}
                  placeholder="0.0"
                  className={INPUT_CLASS}
                />
              </Field>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Day Landings">
            <input type="number" min="0" step="1" value={dayLandings} onChange={(e) => setDayLandings(e.target.value)} disabled={isReadOnly} placeholder="0" className={INPUT_CLASS} />
          </Field>
          <Field label="Night Landings">
            <input type="number" min="0" step="1" value={nightLandings} onChange={(e) => setNightLandings(e.target.value)} disabled={isReadOnly} placeholder="0" className={INPUT_CLASS} />
          </Field>
        </div>

        <div className="flex items-center gap-2">
          <input type="checkbox" id="sim" checked={isSimulator} onChange={(e) => setIsSimulator(e.target.checked)} disabled={isReadOnly} className="h-4 w-4 rounded border-border" />
          <label htmlFor="sim" className="text-sm">Simulator / FTD</label>
        </div>

        <Field label="Remarks">
          <textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            disabled={isReadOnly}
            placeholder="Notes about this flight..."
            rows={3}
            className={`${INPUT_CLASS} resize-none`}
          />
        </Field>
      </div>

      {/* Action buttons */}
      {!isVoided && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-md border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Changes
          </button>
          <div className="ml-auto">
            <button
              type="button"
              onClick={() => setShowVoidForm((v) => !v)}
              className="inline-flex items-center gap-2 rounded-md border border-destructive/40 px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
            >
              <Ban className="h-4 w-4" />
              Void Entry
            </button>
          </div>
        </div>
      )}

      {/* Void form */}
      {showVoidForm && !isVoided && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
          <p className="text-sm font-medium text-destructive">Void this entry</p>
          <p className="text-xs text-muted-foreground">
            Voiding preserves the record for audit purposes but removes it from all totals and exports.
            This cannot be undone.
          </p>
          <textarea
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
            placeholder="Reason for voiding (required)..."
            rows={2}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-destructive resize-none"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setShowVoidForm(false); setVoidReason('') }}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleVoid}
              disabled={voiding || !voidReason.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
            >
              {voiding && <Loader2 className="h-3 w-3 animate-spin" />}
              Confirm Void
            </button>
          </div>
        </div>
      )}

      {/* Audit history */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <History className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Audit History</h2>
          <span className="ml-auto text-xs text-muted-foreground">{history.length} event{history.length !== 1 ? 's' : ''}</span>
        </div>

        {history.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">
            No changes recorded yet. Edits made from this page will appear here.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {history.map((h) => (
              <div key={h.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      h.action === 'VOIDED' ? 'bg-destructive/10 text-destructive' :
                      h.action === 'UPDATED' ? 'bg-primary/10 text-primary' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {h.action}
                    </span>
                    {h.fieldName && (
                      <span className="text-xs font-medium">{formatFieldName(h.fieldName)}</span>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">{formatHistoryDate(h.changedAt)}</span>
                </div>
                {h.fieldName && h.oldValue !== null && (
                  <div className="mt-1.5 flex items-center gap-2 text-xs">
                    <span className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-muted-foreground line-through">{h.oldValue || '—'}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-primary">{h.newValue || '—'}</span>
                  </div>
                )}
                <div className="mt-1 flex gap-3 text-[10px] text-muted-foreground">
                  <span>by {h.changedBy}</span>
                  {h.reason && <span>· {h.reason}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
