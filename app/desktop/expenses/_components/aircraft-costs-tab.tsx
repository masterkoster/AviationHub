'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Loader2, Plane, PlusCircle, Calculator, Trash2, Gauge } from 'lucide-react'
import {
  cloudApi,
  type AircraftCostProfile,
  type AircraftCostSummary,
  type EngineReference,
  type FlightCostResponse,
} from '@/apps/desktop/src/lib/cloud-api'
import { ErrorCard } from '@/desktop/components/error-card'
import { toast } from '@/components/ui/use-toast'
import { notifyError, notifySaved, notifyCreated } from '@/desktop/lib/toast-helpers'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const DEFAULT_FUEL_PRICE = 6.25

// ── Formatting helpers ──────────────────────────────────────────

function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  return `$${n.toFixed(2)}`
}

function fmtPerHour(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  return `$${n.toFixed(2)}/hr`
}

function engineLabel(e: EngineReference): string {
  const name = [e.engineMfr, e.engineModel].filter(Boolean).join(' ') || e.engineModelKey
  const parts = [name]
  if (e.tboHours) parts.push(`TBO ${e.tboHours}h`)
  if (e.overhaulCost) parts.push(`~$${Math.round(e.overhaulCost).toLocaleString()} OH`)
  return parts.join(' · ')
}

// ── Editable numeric field config ────────────────────────────────

type NumEditKey =
  | 'fuelBurnGph'
  | 'oilReservePerHour'
  | 'maintReservePerHour'
  | 'insuranceAnnual'
  | 'hangarMonthly'
  | 'annualInspectionCost'
  | 'financingMonthly'
  | 'subscriptionsAnnual'
  | 'otherFixedAnnual'
  | 'expectedAnnualHours'
  | 'hourlyRateOverride'

function numToStr(n: number | null | undefined): string {
  return n === null || n === undefined ? '' : String(n)
}

function toEditStrings(p: AircraftCostProfile): Record<NumEditKey, string> {
  return {
    fuelBurnGph: numToStr(p.fuelBurnGph),
    oilReservePerHour: numToStr(p.oilReservePerHour),
    maintReservePerHour: numToStr(p.maintReservePerHour),
    insuranceAnnual: numToStr(p.insuranceAnnual),
    hangarMonthly: numToStr(p.hangarMonthly),
    annualInspectionCost: numToStr(p.annualInspectionCost),
    financingMonthly: numToStr(p.financingMonthly),
    subscriptionsAnnual: numToStr(p.subscriptionsAnnual),
    otherFixedAnnual: numToStr(p.otherFixedAnnual),
    expectedAnnualHours: numToStr(p.expectedAnnualHours),
    hourlyRateOverride: numToStr(p.hourlyRateOverride),
  }
}

// ── Main tab ──────────────────────────────────────────────────

export function AircraftCostsTab() {
  const [profiles, setProfiles] = useState<AircraftCostProfile[]>([])
  const [engines, setEngines] = useState<EngineReference[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [addNNumber, setAddNNumber] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [profilesRes, enginesRes] = await Promise.all([
        cloudApi.listAircraftCost(),
        cloudApi.listEngineReference(),
      ])
      setProfiles(Array.isArray(profilesRes?.profiles) ? profilesRes.profiles : [])
      setEngines(Array.isArray(enginesRes?.engines) ? enginesRes.engines : [])
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load aircraft cost profiles')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const nNumber = addNNumber.trim().toUpperCase()
    if (!/^[A-Z0-9]{2,10}$/.test(nNumber)) {
      setAddError('Tail number must be 2-10 letters/numbers (e.g. N12345).')
      return
    }
    setAddError(null)
    setAdding(true)
    try {
      const res = await cloudApi.createAircraftCost({ nNumber })
      notifyCreated(`Cost profile for ${nNumber}`)
      if (res.matchedBy === 'airframe') {
        toast({
          title: 'Engine guessed',
          description: 'Engine guessed from aircraft type — confirm below.',
        })
      }
      setAddNNumber('')
      await load()
    } catch (err) {
      notifyError('Add aircraft', err instanceof Error ? err.message : 'Failed to add aircraft')
    } finally {
      setAdding(false)
    }
  }

  function handleProfileUpdated(updated: AircraftCostProfile) {
    setProfiles((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
  }

  return (
    <div>
      {/* ── Add aircraft ── */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <PlusCircle className="h-4 w-4 text-muted-foreground" /> Add aircraft
          </CardTitle>
          <CardDescription>Set up a cost-of-ownership profile for one of your aircraft.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAdd} className="flex items-end gap-3">
            <div className="flex-1">
              <Label htmlFor="cost-nnumber" className="mb-1.5">Tail number</Label>
              <Input
                id="cost-nnumber"
                value={addNNumber}
                onChange={(e) => setAddNNumber(e.target.value.toUpperCase())}
                placeholder="N12345"
                maxLength={10}
                className="uppercase"
                autoComplete="off"
              />
            </div>
            <Button type="submit" disabled={adding}>
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
              {adding ? 'Adding…' : 'Add'}
            </Button>
          </form>
          {addError && <p className="mt-2 text-sm text-destructive">{addError}</p>}
        </CardContent>
      </Card>

      {/* ── Profile list ── */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : loadError ? (
        <ErrorCard message={loadError} onRetry={load} />
      ) : profiles.length === 0 ? (
        <div className="mb-6 rounded-lg border border-dashed border-border bg-card p-8 text-center">
          <Plane className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-2 text-sm text-muted-foreground">No aircraft cost profiles yet.</p>
        </div>
      ) : (
        <div className="mb-6 space-y-4">
          {profiles.map((p) => (
            <ProfileCard key={p.id} profile={p} engines={engines} onUpdated={handleProfileUpdated} />
          ))}
        </div>
      )}

      {/* ── Per-flight calculator ── */}
      {profiles.length > 0 && <FlightCostCalculator profiles={profiles} />}
    </div>
  )
}

// ── Profile card ──────────────────────────────────────────────

function ProfileCard({
  profile,
  engines,
  onUpdated,
}: {
  profile: AircraftCostProfile
  engines: EngineReference[]
  onUpdated: (p: AircraftCostProfile) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const [edits, setEdits] = useState<Record<NumEditKey, string>>(() => toEditStrings(profile))
  const [pickedEngineKey, setPickedEngineKey] = useState<string>(profile.engineModelKey ?? '')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [engineChanging, setEngineChanging] = useState(false)

  const [fuelPrice, setFuelPrice] = useState(String(DEFAULT_FUEL_PRICE))
  const [summary, setSummary] = useState<AircraftCostSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [summaryError, setSummaryError] = useState<string | null>(null)

  useEffect(() => {
    setEdits(toEditStrings(profile))
    setPickedEngineKey(profile.engineModelKey ?? '')
  }, [profile])

  const fetchSummary = useCallback(
    async (price: number) => {
      setSummaryLoading(true)
      setSummaryError(null)
      try {
        const res = await cloudApi.getAircraftCostSummary(profile.id, price)
        setSummary(res)
      } catch (err) {
        setSummaryError(err instanceof Error ? err.message : 'Failed to load cost summary')
      } finally {
        setSummaryLoading(false)
      }
    },
    [profile.id]
  )

  useEffect(() => {
    const price = Number(fuelPrice)
    const t = setTimeout(() => {
      fetchSummary(Number.isFinite(price) && price >= 0 ? price : DEFAULT_FUEL_PRICE)
    }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fuelPrice, fetchSummary])

  const engineName = useMemo(() => {
    const match = engines.find((e) => e.engineModelKey === (pickedEngineKey || profile.engineModelKey))
    if (match) return [match.engineMfr, match.engineModel].filter(Boolean).join(' ')
    return profile.engineModelKey || 'No engine set'
  }, [engines, pickedEngineKey, profile.engineModelKey])

  function setEdit(key: NumEditKey, value: string) {
    setEdits((prev) => ({ ...prev, [key]: value }))
  }

  async function handleEngineChange(key: string) {
    setPickedEngineKey(key)
    const ref = engines.find((e) => e.engineModelKey === key)
    if (!ref) return
    setEngineChanging(true)
    try {
      const res = await cloudApi.updateAircraftCost(profile.id, {
        tboHours: ref.tboHours,
        overhaulCost: ref.overhaulCost,
        propOverhaulHours: ref.propOverhaulHours,
        propOverhaulCost: ref.propOverhaulCost,
      })
      onUpdated(res.profile)
      notifySaved('Engine reserves')
      await fetchSummary(Number(fuelPrice) || DEFAULT_FUEL_PRICE)
    } catch (err) {
      notifyError('Engine change', err instanceof Error ? err.message : 'Failed to update engine')
    } finally {
      setEngineChanging(false)
    }
  }

  async function handleSave() {
    // Validate non-negative numbers client-side.
    const payload: Record<string, number | null> = {}
    for (const key of Object.keys(edits) as NumEditKey[]) {
      const raw = edits[key].trim()
      if (raw === '') {
        payload[key] = null
        continue
      }
      const n = Number(raw)
      if (!Number.isFinite(n) || n < 0) {
        setSaveError(`${key} must be a non-negative number.`)
        return
      }
      payload[key] = n
    }
    setSaveError(null)
    setSaving(true)
    try {
      const res = await cloudApi.updateAircraftCost(profile.id, payload)
      onUpdated(res.profile)
      notifySaved(`${profile.nNumber} cost profile`)
      await fetchSummary(Number(fuelPrice) || DEFAULT_FUEL_PRICE)
    } catch (err) {
      notifyError('Save cost profile', err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const expectedHours = profile.expectedAnnualHours ?? 0
  const projections = useMemo(() => {
    if (!summary) return null
    const price = Number(fuelPrice)
    const fuelPricePerGal = Number.isFinite(price) && price >= 0 ? price : DEFAULT_FUEL_PRICE
    const fuelBurnGph = profile.fuelBurnGph ?? 0
    const perHour = summary.allInPerHour
    if (!(expectedHours > 0)) return { perHour, perMonth: null, perYear: null }
    const perMonth =
      summary.fixedAnnual / 12 +
      summary.reservesPerHour.total * (expectedHours / 12) +
      fuelBurnGph * fuelPricePerGal * (expectedHours / 12)
    const perYear = summary.fixedAnnual + (summary.reservesPerHour.total + fuelBurnGph * fuelPricePerGal) * expectedHours
    return { perHour, perMonth, perYear }
  }, [summary, fuelPrice, profile.fuelBurnGph, expectedHours])

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge className="h-4 w-4 text-muted-foreground" />
              {profile.nNumber}
            </CardTitle>
            <CardDescription>{engineName}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {summary && (
              <span className="text-lg font-bold tabular-nums text-foreground">{fmtPerHour(summary.allInPerHour)}</span>
            )}
            <Button variant="ghost" size="sm" onClick={() => setExpanded((v) => !v)}>
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-5">
          {/* Engine picker */}
          <div>
            <Label className="mb-1.5">Engine</Label>
            <Select value={pickedEngineKey || undefined} onValueChange={handleEngineChange} disabled={engineChanging}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select an engine…" />
              </SelectTrigger>
              <SelectContent>
                {engines.map((e) => (
                  <SelectItem key={e.engineModelKey} value={e.engineModelKey}>
                    {engineLabel(e)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              Changing the engine updates the engine &amp; prop overhaul reserves below.
            </p>
          </div>

          <Separator />

          {/* Reserves per hour (manual) */}
          <div>
            <h3 className="mb-2 text-sm font-semibold">Reserves (per hour)</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <NumField id={`${profile.id}-maint`} label="Maintenance reserve" suffix="/hr" value={edits.maintReservePerHour} onChange={(v) => setEdit('maintReservePerHour', v)} />
              <NumField id={`${profile.id}-oil`} label="Oil reserve" suffix="/hr" value={edits.oilReservePerHour} onChange={(v) => setEdit('oilReservePerHour', v)} />
            </div>
          </div>

          <Separator />

          {/* Fixed costs */}
          <div>
            <h3 className="mb-2 text-sm font-semibold">Fixed costs</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <NumField id={`${profile.id}-insurance`} label="Insurance" suffix="/year" value={edits.insuranceAnnual} onChange={(v) => setEdit('insuranceAnnual', v)} />
              <NumField id={`${profile.id}-hangar`} label="Hangar" suffix="/month" value={edits.hangarMonthly} onChange={(v) => setEdit('hangarMonthly', v)} />
              <NumField id={`${profile.id}-annual-insp`} label="Annual inspection" value={edits.annualInspectionCost} onChange={(v) => setEdit('annualInspectionCost', v)} />
              <NumField id={`${profile.id}-financing`} label="Financing" suffix="/month" value={edits.financingMonthly} onChange={(v) => setEdit('financingMonthly', v)} />
              <NumField id={`${profile.id}-subs`} label="Subscriptions" suffix="/year" value={edits.subscriptionsAnnual} onChange={(v) => setEdit('subscriptionsAnnual', v)} />
              <NumField id={`${profile.id}-other`} label="Other fixed" suffix="/year" value={edits.otherFixedAnnual} onChange={(v) => setEdit('otherFixedAnnual', v)} />
            </div>
          </div>

          <Separator />

          {/* Usage & overrides */}
          <div>
            <h3 className="mb-2 text-sm font-semibold">Usage &amp; overrides</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <NumField id={`${profile.id}-hours`} label="Expected hours" suffix="/year" money={false} value={edits.expectedAnnualHours} onChange={(v) => setEdit('expectedAnnualHours', v)} />
              <NumField id={`${profile.id}-gph`} label="Fuel burn" suffix="gph" money={false} value={edits.fuelBurnGph} onChange={(v) => setEdit('fuelBurnGph', v)} />
              <NumField id={`${profile.id}-override`} label="Flat $/hr override" suffix="/hr" value={edits.hourlyRateOverride} onChange={(v) => setEdit('hourlyRateOverride', v)} hint="Optional — overrides the calculated all-in rate." />
            </div>
          </div>

          {saveError && <p className="text-sm text-destructive">{saveError}</p>}

          <div className="flex justify-end border-t border-border pt-4">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>

          <Separator />

          {/* Summary */}
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">Cost estimate</h3>
                <Badge variant="outline">Estimate</Badge>
              </div>
              <div className="flex items-center gap-1.5">
                <Label htmlFor={`${profile.id}-fuelprice`} className="text-xs text-muted-foreground whitespace-nowrap">
                  Assumed fuel $/gal
                </Label>
                <Input
                  id={`${profile.id}-fuelprice`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={fuelPrice}
                  onChange={(e) => setFuelPrice(e.target.value)}
                  className="h-8 w-20"
                />
              </div>
            </div>

            {summaryLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : summaryError ? (
              <ErrorCard message={summaryError} onRetry={() => fetchSummary(Number(fuelPrice) || DEFAULT_FUEL_PRICE)} />
            ) : summary ? (
              <>
                <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
                  <SummaryStat label="Engine" value={fmtPerHour(summary.reservesPerHour.engine)} />
                  <SummaryStat label="Prop" value={fmtPerHour(summary.reservesPerHour.prop)} />
                  <SummaryStat label="Maint" value={fmtPerHour(summary.reservesPerHour.maint)} />
                  <SummaryStat label="Oil" value={fmtPerHour(summary.reservesPerHour.oil)} />
                  <SummaryStat label="Reserves total" value={fmtPerHour(summary.reservesPerHour.total)} bold />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Fixed costs: {fmtMoney(summary.fixedAnnual)}/year
                  {summary.fixedPerHour !== null && ` (${fmtPerHour(summary.fixedPerHour)} at expected hours)`}
                </p>

                {/* Projection tiles */}
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <ProjectionTile label="Per hour (all-in)" value={fmtPerHour(projections?.perHour ?? summary.allInPerHour)} highlight />
                  {projections && projections.perMonth !== null ? (
                    <ProjectionTile label="Per month" value={fmtMoney(projections.perMonth)} />
                  ) : (
                    <HintTile />
                  )}
                  {projections && projections.perYear !== null ? (
                    <ProjectionTile label="Per year" value={fmtMoney(projections.perYear)} />
                  ) : (
                    <HintTile />
                  )}
                </div>
              </>
            ) : null}
          </div>
        </CardContent>
      )}
    </Card>
  )
}

function SummaryStat({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`tabular-nums ${bold ? 'font-semibold' : ''}`}>{value}</div>
    </div>
  )
}

function ProjectionTile({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-md border p-3 ${highlight ? 'border-primary/40 bg-primary/5' : 'border-border bg-card'}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
    </div>
  )
}

function HintTile() {
  return (
    <div className="flex items-center rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
      Set expected annual hours to see this projection.
    </div>
  )
}

function NumField({
  id,
  label,
  value,
  onChange,
  suffix,
  money = true,
  hint,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  suffix?: string
  money?: boolean
  hint?: string
}) {
  return (
    <div>
      <Label htmlFor={id} className="mb-1.5">
        {label} {suffix && <span className="font-normal text-muted-foreground">{suffix}</span>}
      </Label>
      <div className="relative">
        {money && (
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
        )}
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0.00"
          className={money ? 'pl-6' : ''}
        />
      </div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

// ── Per-flight calculator ────────────────────────────────────

interface CustomItem {
  label: string
  amount: string
}

function FlightCostCalculator({ profiles }: { profiles: AircraftCostProfile[] }) {
  const [selectedId, setSelectedId] = useState<string>(profiles[0]?.id ?? '')
  const [hours, setHours] = useState('1.0')
  const [actualFuelCost, setActualFuelCost] = useState('')
  const [fuelPricePerGal, setFuelPricePerGal] = useState(String(DEFAULT_FUEL_PRICE))
  const [customItems, setCustomItems] = useState<CustomItem[]>([])
  const [calculating, setCalculating] = useState(false)
  const [calcError, setCalcError] = useState<string | null>(null)
  const [result, setResult] = useState<FlightCostResponse | null>(null)

  useEffect(() => {
    if (!selectedId && profiles[0]) setSelectedId(profiles[0].id)
  }, [profiles, selectedId])

  function addCustomItem() {
    setCustomItems((prev) => [...prev, { label: '', amount: '' }])
  }

  function updateCustomItem(idx: number, field: 'label' | 'amount', value: string) {
    setCustomItems((prev) => prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)))
  }

  function removeCustomItem(idx: number) {
    setCustomItems((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleCalculate() {
    const h = Number(hours)
    if (!Number.isFinite(h) || h <= 0 || h > 24) {
      setCalcError('Hours must be a number between 0 and 24.')
      return
    }
    if (!selectedId) {
      setCalcError('Select an aircraft first.')
      return
    }
    const items: { label: string; amount: number }[] = []
    for (const item of customItems) {
      if (item.label.trim() === '' && item.amount.trim() === '') continue
      const amt = Number(item.amount)
      if (!Number.isFinite(amt)) {
        setCalcError(`Custom item "${item.label || '(unnamed)'}" needs a valid amount.`)
        return
      }
      items.push({ label: item.label.trim(), amount: amt })
    }
    setCalcError(null)
    setCalculating(true)
    try {
      const res = await cloudApi.calcFlightCost(selectedId, {
        hours: h,
        actualFuelCost: actualFuelCost.trim() ? Number(actualFuelCost) : undefined,
        fuelPricePerGal: fuelPricePerGal.trim() ? Number(fuelPricePerGal) : undefined,
        customItems: items.length > 0 ? items : undefined,
      })
      setResult(res)
    } catch (err) {
      notifyError('Flight cost', err instanceof Error ? err.message : 'Failed to calculate flight cost')
    } finally {
      setCalculating(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Calculator className="h-4 w-4 text-muted-foreground" /> Per-flight cost
        </CardTitle>
        <CardDescription>Estimate the cost of a single flight for one of your aircraft.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label className="mb-1.5">Aircraft</Label>
            <Select value={selectedId || undefined} onValueChange={setSelectedId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select aircraft…" />
              </SelectTrigger>
              <SelectContent>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.nNumber}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="flight-hours" className="mb-1.5">Hours</Label>
            <Input
              id="flight-hours"
              type="number"
              inputMode="decimal"
              min={0}
              max={24}
              step="0.1"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="flight-fuel-price" className="mb-1.5">
              Fuel $/gal <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="flight-fuel-price"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={fuelPricePerGal}
              onChange={(e) => setFuelPricePerGal(e.target.value)}
            />
          </div>
          <div className="sm:col-span-3">
            <Label htmlFor="flight-actual-fuel" className="mb-1.5">
              Actual fuel cost <span className="font-normal text-muted-foreground">(optional — overrides fuel $/gal estimate)</span>
            </Label>
            <Input
              id="flight-actual-fuel"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={actualFuelCost}
              onChange={(e) => setActualFuelCost(e.target.value)}
              placeholder="0.00"
              className="max-w-[160px]"
            />
          </div>
        </div>

        {/* Custom items */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <Label>Custom line items <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Button type="button" variant="outline" size="sm" onClick={addCustomItem}>
              <PlusCircle className="h-3.5 w-3.5" /> Add item
            </Button>
          </div>
          {customItems.length > 0 && (
            <div className="space-y-2">
              {customItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    value={item.label}
                    onChange={(e) => updateCustomItem(idx, 'label', e.target.value)}
                    placeholder="Landing fee"
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={item.amount}
                    onChange={(e) => updateCustomItem(idx, 'amount', e.target.value)}
                    placeholder="0.00"
                    className="w-28"
                  />
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeCustomItem(idx)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {calcError && <p className="text-sm text-destructive">{calcError}</p>}

        <div className="flex justify-end border-t border-border pt-4">
          <Button onClick={handleCalculate} disabled={calculating}>
            {calculating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
            {calculating ? 'Calculating…' : 'Calculate'}
          </Button>
        </div>

        {result && (
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <div className="mb-3 flex items-center gap-2">
              <h3 className="text-sm font-semibold">Estimated flight cost</h3>
              <Badge variant="outline">Estimate</Badge>
            </div>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Reserves</dt>
                <dd className="tabular-nums">{fmtMoney(result.reserves)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Fuel</dt>
                <dd className="tabular-nums">{fmtMoney(result.fuel)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Fixed</dt>
                <dd className="tabular-nums">{fmtMoney(result.fixed)}</dd>
              </div>
              {result.custom !== 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Custom items</dt>
                  <dd className="tabular-nums">{fmtMoney(result.custom)}</dd>
                </div>
              )}
              <Separator className="my-2" />
              <div className="flex justify-between text-base font-bold">
                <dt>Total</dt>
                <dd className="tabular-nums">{fmtMoney(result.total)}</dd>
              </div>
            </dl>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
