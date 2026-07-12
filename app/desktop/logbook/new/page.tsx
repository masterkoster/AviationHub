'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import { getCloudSession } from '@/apps/desktop/src/lib/cloud-session'
import { cloudApi } from '@/apps/desktop/src/lib/cloud-api'
import {
  createLocalFlight,
  listLocalAircraftOptions,
  resolveLocalLogbookUserId,
  markLocalFlightSynced,
  markLocalFlightSyncFailed,
} from '@/apps/desktop/src/lib/local-logbook'
import { getSavedFlightPlans, type StoredFlightPlan } from '@/apps/desktop/src/lib/flight-plan-storage'
import { notifyCreated } from '@/desktop/lib/toast-helpers'

type Aircraft = { id: string; nNumber: string; nickname?: string | null }
type Airport = { icao: string; name: string; city?: string; state?: string }

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
const INPUT_CLASS = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring'

export default function DesktopNewFlightPage() {
  const router = useRouter()
  const { mode, localUser, cloudUser } = useDesktopAuth()

  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [aircraft, setAircraft] = useState('')
  const [aircraftId, setAircraftId] = useState('')
  const [routeFrom, setRouteFrom] = useState('')
  const [routeTo, setRouteTo] = useState('')
  const [totalTime, setTotalTime] = useState('')
  const [dayLandings, setDayLandings] = useState('')
  const [nightLandings, setNightLandings] = useState('')
  const [isSimulator, setIsSimulator] = useState(false)
  const [remarks, setRemarks] = useState('')
  const [times, setTimes] = useState<Record<TimeKey, string>>({} as Record<TimeKey, string>)

  const [aircraftList, setAircraftList] = useState<Aircraft[]>([])
  const [fromResults, setFromResults] = useState<Airport[]>([])
  const [toResults, setToResults] = useState<Airport[]>([])
  const [showFromDrop, setShowFromDrop] = useState(false)
  const [showToDrop, setShowToDrop] = useState(false)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [savedPlans, setSavedPlans] = useState<StoredFlightPlan[]>([])
  const [selectedPlanId, setSelectedPlanId] = useState('')

  useEffect(() => {
    let cancelled = false
    async function loadAircraft() {
      const rows: Aircraft[] = []

      try {
        const localId = await resolveLocalLogbookUserId({
          mode,
          localUserId: localUser?.id,
          cloudUser,
        })
        const localAircraft = await listLocalAircraftOptions(localId)
        for (const a of localAircraft) {
          rows.push({ id: a.id, nNumber: a.nNumber, nickname: a.nickname })
        }
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

      const deduped = new Map<string, Aircraft>()
      for (const a of rows) {
        const key = a.nNumber.toUpperCase()
        if (!deduped.has(key)) deduped.set(key, a)
      }

      if (!cancelled) setAircraftList(Array.from(deduped.values()))
    }
    loadAircraft()
    return () => {
      cancelled = true
    }
  }, [mode, localUser?.id, cloudUser])

  useEffect(() => {
    getSavedFlightPlans().then(setSavedPlans).catch(() => setSavedPlans([]))
  }, [])

  const searchAirports = useCallback(async (q: string, setter: (a: Airport[]) => void) => {
    if (q.length < 2) {
      setter([])
      return
    }
    try {
      const session = await getCloudSession()
      if (!session.authenticated) {
        setter([])
        return
      }
      const airports = await cloudApi.searchAirports(q)
      setter(airports)
    } catch {
      setter([])
    }
  }, [])

  const setField = (key: TimeKey, val: string) => setTimes((prev) => ({ ...prev, [key]: val }))

  function applySavedPlan(plan: StoredFlightPlan) {
    setAircraft(plan.callsign || plan.aircraftName || '')
    setRemarks((prev) => [plan.name ? `Plan: ${plan.name}` : '', prev].filter(Boolean).join('\n'))
    if (plan.waypoints.length > 0) {
      setRouteFrom(plan.waypoints[0]?.icao || '')
      setRouteTo(plan.waypoints[plan.waypoints.length - 1]?.icao || '')
    }
  }

  function validate(): Record<string, string> {
    const errors: Record<string, string> = {}
    if (!aircraft.trim()) errors.aircraft = 'Aircraft is required'
    if (!totalTime || parseFloat(totalTime) <= 0) errors.totalTime = 'Total time must be greater than 0'
    return errors
  }

  async function handleSave() {
    const errors = validate()
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setSaving(true)
    setError('')

    try {
      const localUserId = await resolveLocalLogbookUserId({
        mode,
        localUserId: localUser?.id,
        cloudUser,
      })

      const localId = await createLocalFlight({
        userId: localUserId,
        date: new Date(`${date}T12:00:00Z`).toISOString(),
        aircraft: aircraft.trim(),
        aircraftId: aircraftId || undefined,
        routeFrom: routeFrom.toUpperCase() || '',
        routeTo: routeTo.toUpperCase() || '',
        totalTime: parseFloat(totalTime) || 0,
        picTime: parseFloat(times.picTime || '0') || 0,
        sicTime: parseFloat(times.sicTime || '0') || 0,
        soloTime: parseFloat(times.soloTime || '0') || 0,
        dualGiven: parseFloat(times.dualGiven || '0') || 0,
        dualReceived: parseFloat(times.dualReceived || '0') || 0,
        nightTime: parseFloat(times.nightTime || '0') || 0,
        instrumentTime: parseFloat(times.instrumentTime || '0') || 0,
        simulatedInstrumentTime: parseFloat(times.simulatedInstrumentTime || '0') || 0,
        crossCountryTime: parseFloat(times.crossCountryTime || '0') || 0,
        landingsDay: parseInt(dayLandings) || 0,
        landingsNight: parseInt(nightLandings) || 0,
        isSimulator,
        remarks: remarks || undefined,
      })

      const cloudSession = await getCloudSession()
      if (cloudSession.authenticated) {
        try {
          const payload: Record<string, unknown> = {
            date,
            aircraft: aircraft.trim(),
            aircraftId: aircraftId || undefined,
            routeFrom: routeFrom.toUpperCase() || '',
            routeTo: routeTo.toUpperCase() || '',
            totalTime: parseFloat(totalTime) || 0,
            dayLandings: parseInt(dayLandings) || 0,
            nightLandings: parseInt(nightLandings) || 0,
            isSimulator,
            remarks: remarks || undefined,
            picTime: parseFloat(times.picTime || '0') || 0,
            sicTime: parseFloat(times.sicTime || '0') || 0,
            nightTime: parseFloat(times.nightTime || '0') || 0,
            instrumentTime: parseFloat(times.instrumentTime || '0') || 0,
            crossCountryTime: parseFloat(times.crossCountryTime || '0') || 0,
            soloTime: parseFloat(times.soloTime || '0') || 0,
            dualReceived: parseFloat(times.dualReceived || '0') || 0,
            dualGiven: parseFloat(times.dualGiven || '0') || 0,
            simulatedInstrumentTime: parseFloat(times.simulatedInstrumentTime || '0') || 0,
          }
          const created = await cloudApi.createLogbookEntry(payload)
          await markLocalFlightSynced(localId, created?.id || null)
        } catch (syncErr) {
          await markLocalFlightSyncFailed(
            localId,
            syncErr instanceof Error ? syncErr.message : 'Cloud sync failed'
          )
        }
      }
      notifyCreated('Flight')
      router.replace('/desktop/logbook')
      router.refresh()
    } catch (saveErr) {
      setError(saveErr instanceof Error ? saveErr.message : 'Failed to save flight')
    } finally {
      setSaving(false)
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    handleSave()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault()
      handleSave()
    }
  }

  function clearFieldError(field: string) {
    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: '' }))
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} type="button" className="rounded-md p-1.5 transition-colors hover:bg-muted">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold">Log Flight</h1>
      </div>

      {error && <div className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</div>}

      <form onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
        <div className="space-y-4 rounded-lg border border-border bg-card p-4">
          {savedPlans.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-medium">Use Saved Flight Plan</label>
              <select
                value={selectedPlanId}
                onChange={(e) => {
                  const id = e.target.value
                  setSelectedPlanId(id)
                  const plan = savedPlans.find((p) => p.id === id)
                  if (plan) applySavedPlan(plan)
                }}
                className={INPUT_CLASS}
              >
                <option value="">Select plan...</option>
                {savedPlans.slice(0, 20).map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} • {plan.callsign || plan.aircraftName || 'No callsign'}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Date">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={INPUT_CLASS} />
            </Field>
            <Field label="Aircraft">
              <input
                type="text"
                value={aircraft}
                placeholder="N-number"
                onChange={(e) => {
                  setAircraft(e.target.value.toUpperCase())
                  const match = aircraftList.find((a) => a.nNumber.toUpperCase() === e.target.value.toUpperCase())
                  setAircraftId(match?.id || '')
                  clearFieldError('aircraft')
                }}
                list="aircraft-list"
                className={INPUT_CLASS}
              />
              <datalist id="aircraft-list">
                {aircraftList.map((a) => (
                  <option key={a.id} value={a.nNumber}>
                    {a.nickname ? `${a.nNumber} (${a.nickname})` : a.nNumber}
                  </option>
                ))}
              </datalist>
              {fieldErrors.aircraft && (
                <p className="mt-1 text-xs text-destructive">{fieldErrors.aircraft}</p>
              )}
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="From">
              <div className="relative">
                <input
                  type="text"
                  value={routeFrom}
                  placeholder="ICAO (e.g. KDTW)"
                  onChange={(e) => {
                    setRouteFrom(e.target.value.toUpperCase())
                    searchAirports(e.target.value, setFromResults)
                    setShowFromDrop(true)
                  }}
                  onBlur={() => setTimeout(() => setShowFromDrop(false), 200)}
                  className={INPUT_CLASS}
                />
                {showFromDrop && fromResults.length > 0 && (
                  <AirportDropdown
                    airports={fromResults}
                    onSelect={(a) => {
                      setRouteFrom(a.icao)
                      setShowFromDrop(false)
                    }}
                  />
                )}
              </div>
            </Field>
            <Field label="To">
              <div className="relative">
                <input
                  type="text"
                  value={routeTo}
                  placeholder="ICAO (e.g. KLAX)"
                  onChange={(e) => {
                    setRouteTo(e.target.value.toUpperCase())
                    searchAirports(e.target.value, setToResults)
                    setShowToDrop(true)
                  }}
                  onBlur={() => setTimeout(() => setShowToDrop(false), 200)}
                  className={INPUT_CLASS}
                />
                {showToDrop && toResults.length > 0 && (
                  <AirportDropdown
                    airports={toResults}
                    onSelect={(a) => {
                      setRouteTo(a.icao)
                      setShowToDrop(false)
                    }}
                  />
                )}
              </div>
            </Field>
          </div>

          <Field label="Total Time (hours)">
            <input
              type="number"
              step="0.1"
              min="0"
              value={totalTime}
              placeholder="0.0"
              onChange={(e) => {
                setTotalTime(e.target.value)
                clearFieldError('totalTime')
              }}
              className={INPUT_CLASS}
            />
            {fieldErrors.totalTime && (
              <p className="mt-1 text-xs text-destructive">{fieldErrors.totalTime}</p>
            )}
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
                    placeholder="0.0"
                    onChange={(e) => setField(f.key, e.target.value)}
                    className={INPUT_CLASS}
                  />
                </Field>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Day Landings">
              <input
                type="number"
                min="0"
                step="1"
                value={dayLandings}
                placeholder="0"
                onChange={(e) => setDayLandings(e.target.value)}
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="Night Landings">
              <input
                type="number"
                min="0"
                step="1"
                value={nightLandings}
                placeholder="0"
                onChange={(e) => setNightLandings(e.target.value)}
                className={INPUT_CLASS}
              />
            </Field>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="sim"
              checked={isSimulator}
              onChange={(e) => setIsSimulator(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            <label htmlFor="sim" className="text-sm">
              Simulator / FTD
            </label>
          </div>

          <Field label="Remarks">
            <textarea
              value={remarks}
              placeholder="Notes about this flight..."
              onChange={(e) => setRemarks(e.target.value)}
              rows={3}
              className={`${INPUT_CLASS} resize-none`}
            />
          </Field>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-md border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Flight
          </button>
        </div>
      </form>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}

function AirportDropdown({ airports, onSelect }: { airports: Airport[]; onSelect: (a: Airport) => void }) {
  return (
    <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-border bg-card shadow-lg">
      {airports.map((a) => (
        <button
          key={a.icao}
          onMouseDown={() => onSelect(a)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
        >
          <span className="font-mono font-medium">{a.icao}</span>
          <span className="truncate text-muted-foreground">{a.name}</span>
        </button>
      ))}
    </div>
  )
}
