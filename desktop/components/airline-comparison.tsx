'use client'

import { useState, useMemo } from 'react'
import {
  Plane, Briefcase, Building2, Globe, MapPin, DollarSign,
  ArrowRight, ChevronDown, ChevronUp, Award, ExternalLink,
  CheckCircle2, XCircle, MinusCircle, AlertTriangle,
} from 'lucide-react'
import {
  AIRLINE_CATEGORIES,
  ALL_AIRLINES,
  REQUIREMENT_KEYS,
  type Airline,
  type RequirementValue,
} from '@/desktop/data/airline-requirements'

// ── Types ────────────────────────────────────────────────────────

interface UserFlightData {
  totalTime: number
  picTime: number
  sicTime: number
  nightTime: number
  instrumentTime: number
  crossCountryTime: number
  multiEngineTime?: number
  turbineTime?: number
  turbinePIC?: number
  last12Total: number
  last12Pic: number
  last24Total: number
  last36Total: number
  flights: number
}

interface Props {
  userData: UserFlightData | null
  loading?: boolean
}

// ── Category icons ───────────────────────────────────────────────

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  majors: Briefcase,
  regionals: Building2,
  cargo: Plane,
  corporate: Award,
  lcc: ArrowRight,
  european: Globe,
}

// ── Helpers ──────────────────────────────────────────────────────

function fmtH(hours: number): string {
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function getCurrentValue(key: string, data: UserFlightData): number | undefined {
  const map: Record<string, number> = {
    totalTime: data.totalTime,
    pic: data.picTime,
    sic: data.sicTime,
    night: data.nightTime,
    instrument: data.instrumentTime,
    crossCountry: data.crossCountryTime,
    multiEngine: data.multiEngineTime ?? -1,
    turbineTime: data.turbineTime ?? -1,
    turbinePIC: data.turbinePIC ?? -1,
    recent12mo: data.last12Total,
    recent24mo: data.last24Total,
  }
  const val = map[key]
  return val !== undefined && val >= 0 ? val : undefined
}

function formatRegion(region: string): string {
  switch (region) {
    case 'US': return 'United States'
    case 'EU': return 'Europe (EASA)'
    case 'UK': return 'United Kingdom (UK CAA)'
    default: return region
  }
}

// ── Color classes for requirement bars ────────────────────────────

function getReqColors(current: number, required: number, isRequired: boolean) {
  if (!isRequired) {
    // Preferred — show blue styling
    const pct = Math.min((current / required) * 100, 100)
    if (current >= required) return { bar: 'bg-blue-500', text: 'text-blue-600', pct, met: true }
    return { bar: 'bg-blue-400/60', text: 'text-blue-600', pct, met: false }
  }
  const pct = Math.min((current / required) * 100, 100)
  if (current >= required) return { bar: 'bg-emerald-500', text: 'text-emerald-600', pct, met: true }
  if (pct >= 80) return { bar: 'bg-amber-500', text: 'text-amber-600', pct, met: false }
  return { bar: 'bg-red-500', text: 'text-red-600', pct, met: false }
}

// ── Component ────────────────────────────────────────────────────

export default function AirlineComparison({ userData, loading }: Props) {
  const [activeCategory, setActiveCategory] = useState('majors')
  const [expandedAirlines, setExpandedAirlines] = useState<Set<string>>(new Set())
  const [selectedAirlines, setSelectedAirlines] = useState<Set<string>>(new Set())

  const category = AIRLINE_CATEGORIES.find((c) => c.id === activeCategory)
  const airlines = category?.airlines || []

  const toggleExpand = (id: string) => {
    setExpandedAirlines((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelect = (id: string) => {
    setSelectedAirlines((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Compute overall readiness for each airline
  const airlineReadiness = useMemo(() => {
    if (!userData) return new Map<string, { pct: number; met: number; total: number }>()
    const map = new Map<string, { pct: number; met: number; total: number }>()
    for (const airline of ALL_AIRLINES) {
      const reqs = airline.flight
      const reqKeys = Object.keys(reqs) as (keyof typeof reqs)[]
      let met = 0
      let total = 0
      for (const key of reqKeys) {
        const req = reqs[key] as RequirementValue | undefined
        if (!req) continue
        const current = getCurrentValue(key as string, userData)
        if (current === undefined) continue
        total++
        if (current >= req.hours) met++
      }
      map.set(airline.id, { pct: total > 0 ? Math.round((met / total) * 100) : 0, met, total })
    }
    return map
  }, [userData])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="ml-2 text-sm text-muted-foreground">Loading comparison data...</span>
      </div>
    )
  }

  if (!userData) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
        <Plane className="mx-auto h-8 w-8 text-muted-foreground/50" />
        <p className="mt-2 text-sm text-muted-foreground">Add flight data to see airline requirement comparisons.</p>
      </div>
    )
  }

  return (
    <div>
      {/* ── Category Tabs ── */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {AIRLINE_CATEGORIES.map((cat) => {
          const Icon = CATEGORY_ICONS[cat.id] || Plane
          const isActive = activeCategory === cat.id
          return (
            <button key={cat.id} onClick={() => { setActiveCategory(cat.id); setExpandedAirlines(new Set()) }}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
              )}>
              <Icon className="h-3.5 w-3.5" />
              {cat.label}
              <span className="ml-0.5 rounded-full bg-background/20 px-1.5 text-[10px] tabular-nums">{cat.airlines.length}</span>
            </button>
          )
        })}
      </div>

      {/* ── Category Description ── */}
      {category && (
        <p className="mb-4 text-xs text-muted-foreground">{category.description}</p>
      )}

      {/* ── Selected Airlines Bar ── */}
      {selectedAirlines.size > 0 && (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-800 dark:bg-blue-950/30">
          <div className="flex items-center gap-2 text-xs font-medium text-blue-700 dark:text-blue-300">
            <Award className="h-3.5 w-3.5" />
            Comparing {selectedAirlines.size} airline{selectedAirlines.size > 1 ? 's' : ''}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {Array.from(selectedAirlines).map((id) => {
              const al = ALL_AIRLINES.find((a) => a.id === id)
              if (!al) return null
              const readiness = airlineReadiness.get(id)
              return (
                <span key={id} className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs font-medium shadow-sm dark:bg-blue-900/50">
                  <span className="text-muted-foreground">{al.code || al.name}</span>
                  {readiness && (
                    <span className={readiness.pct >= 80 ? 'text-emerald-600' : readiness.pct >= 50 ? 'text-amber-600' : 'text-red-600'}>
                      {readiness.pct}%
                    </span>
                  )}
                  <button onClick={() => toggleSelect(id)} className="ml-1 text-muted-foreground hover:text-foreground">&times;</button>
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Airline Cards ── */}
      <div className="space-y-2">
        {airlines.map((airline) => {
          const isExpanded = expandedAirlines.has(airline.id)
          const isSelected = selectedAirlines.has(airline.id)
          const readiness = airlineReadiness.get(airline.id)

          return (
            <div key={airline.id}
              className={cn(
                'rounded-lg border transition-all',
                isSelected ? 'border-primary/40 ring-1 ring-primary/20' : 'border-border',
                isExpanded ? 'bg-card' : 'bg-card hover:bg-muted/30'
              )}>
              {/* ── Card Header (always visible) ── */}
              <button onClick={() => toggleExpand(airline.id)}
                className="flex w-full items-center gap-3 p-3 text-left">
                {/* Airline icon area */}
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-bold text-muted-foreground">
                  {airline.code || airline.name.substring(0, 2)}
                </div>

                {/* Name & details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{airline.name}</span>
                    <span className={cn(
                      'rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase',
                      airline.category === 'major' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' :
                      airline.category === 'regional' ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300' :
                      airline.category === 'cargo' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' :
                      airline.category === 'corporate' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
                      airline.category === 'lcc' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' :
                      'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                    )}>
                      {airline.category === 'major' ? 'Major' :
                       airline.category === 'regional' ? 'Regional' :
                       airline.category === 'cargo' ? 'Cargo' :
                       airline.category === 'corporate' ? 'Corporate' :
                       airline.category === 'lcc' ? 'LCC' : 'European'}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                    {airline.code && <span>{airline.code}</span>}
                    {airline.region && <span>{formatRegion(airline.region)}</span>}
                    {airline.alliance && airline.alliance !== 'None' && airline.alliance !== 'Multiple' && <span>{airline.alliance}</span>}
                    {airline.flow && <span className="text-blue-500">Flow: {airline.flow}</span>}
                  </div>
                </div>

                {/* Readiness */}
                {readiness && (
                  <div className="hidden sm:flex items-center gap-2">
                    <div className="text-right">
                      <div className={cn(
                        'text-lg font-bold tabular-nums',
                        readiness.pct >= 80 ? 'text-emerald-500' :
                        readiness.pct >= 50 ? 'text-amber-500' : 'text-red-500'
                      )}>
                        {readiness.pct}%
                      </div>
                      <div className="text-[10px] text-muted-foreground">{readiness.met}/{readiness.total} met</div>
                    </div>
                    {/* Mini donut */}
                    <div className="relative h-8 w-8">
                      <svg className="h-8 w-8 -rotate-90" viewBox="0 0 32 32">
                        <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted/30" />
                        <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="3"
                          strokeDasharray={`${(readiness.pct / 100) * 87.96} 87.96`}
                          className={readiness.pct >= 80 ? 'text-emerald-500' : readiness.pct >= 50 ? 'text-amber-500' : 'text-red-500'} />
                      </svg>
                    </div>
                  </div>
                )}

                {/* Expand/collapse */}
                <div className="shrink-0 text-muted-foreground">
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </button>

              {/* ── Expanded Detail ── */}
              {isExpanded && (
                <div className="border-t border-border px-3 pb-4 pt-3">
                  {/* Quick info bar */}
                  <div className="mb-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                    {airline.bases && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {airline.bases}
                      </span>
                    )}
                    {airline.fleet && (
                      <span className="inline-flex items-center gap-1">
                        <Plane className="h-3 w-3" /> {airline.fleet}
                      </span>
                    )}
                    {airline.pay && (
                      <span className="inline-flex items-center gap-1">
                        <DollarSign className="h-3 w-3" /> {airline.pay}
                      </span>
                    )}
                    {airline.hiringStatus && (
                      <span className={cn(
                        'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                        airline.hiringStatus === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' :
                        airline.hiringStatus === 'limited' ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-700'
                      )}>
                        {airline.hiringStatus === 'active' ? 'Hiring' : airline.hiringStatus === 'limited' ? 'Limited' : 'Closed'}
                      </span>
                    )}
                  </div>

                  {/* Requirements table */}
                  <div className="mb-3">
                    <p className="mb-2 text-xs font-medium text-muted-foreground">Flight Requirements</p>
                    <div className="space-y-2.5">
                      {REQUIREMENT_KEYS.map((reqKey) => {
                        const req = airline.flight[reqKey.key as keyof typeof airline.flight] as RequirementValue | undefined
                        if (!req) return null
                        const current = getCurrentValue(reqKey.key, userData)
                        const hasData = current !== undefined
                        const colors = hasData ? getReqColors(current!, req.hours, req.required) : null
                        const remaining = hasData ? Math.max(req.hours - current!, 0) : req.hours

                        return (
                          <div key={reqKey.key}>
                            <div className="mb-0.5 flex items-center justify-between text-xs">
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-foreground">{reqKey.label}</span>
                                {!req.required && (
                                  <span className="rounded bg-blue-100 px-1 py-0.5 text-[9px] font-medium text-blue-600 dark:bg-blue-900/30 dark:text-blue-300">Preferred</span>
                                )}
                                {req.label && req.label !== reqKey.label && (
                                  <span className="text-muted-foreground" title={req.label}>{req.label.length > 20 ? req.label.substring(0, 20) + '...' : req.label}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 tabular-nums">
                                {hasData ? (
                                  <>
                                    <span className={colors?.text || 'text-foreground'}>{fmtH(current!)}</span>
                                    <span className="text-muted-foreground">/ {fmtH(req.hours)}</span>
                                    {current! >= req.hours ? (
                                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                    ) : (
                                      <XCircle className="h-3.5 w-3.5 text-red-400" />
                                    )}
                                  </>
                                ) : (
                                  <>
                                    <span className="text-muted-foreground italic">No data</span>
                                    <span className="text-muted-foreground">/ {fmtH(req.hours)}</span>
                                    <MinusCircle className="h-3.5 w-3.5 text-muted-foreground/50" />
                                  </>
                                )}
                              </div>
                            </div>
                            {hasData && colors && (
                              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                                <div className={`h-full rounded-full transition-all duration-500 ${colors.bar}`}
                                  style={{ width: `${colors.pct}%` }} />
                              </div>
                            )}
                            <div className="mt-0.5 text-[10px] text-muted-foreground tabular-nums">
                              {hasData
                                ? current! >= req.hours
                                  ? 'Requirement met ✓'
                                  : `${fmtH(remaining)} remaining`
                                : 'No logbook data for this category'}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Non-flight requirements */}
                  <div className="mb-3">
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">Other Requirements</p>
                    <div className="grid gap-1 text-xs sm:grid-cols-2">
                      {airline.nonFlight.certificate && (
                        <ReqItem label="Certificate" value={airline.nonFlight.certificate} />
                      )}
                      {airline.nonFlight.medical && (
                        <ReqItem label="Medical" value={airline.nonFlight.medical} />
                      )}
                      {airline.nonFlight.education && (
                        <ReqItem label="Education" value={airline.nonFlight.education} />
                      )}
                      {airline.nonFlight.age && (
                        <ReqItem label="Age" value={airline.nonFlight.age} />
                      )}
                      {airline.nonFlight.citizenship && (
                        <ReqItem label="Citizenship" value={airline.nonFlight.citizenship} />
                      )}
                      {airline.nonFlight.language && (
                        <ReqItem label="Language" value={airline.nonFlight.language} />
                      )}
                      {airline.nonFlight.atpNotes && (
                        <div className="sm:col-span-2 rounded-md bg-muted/30 p-2 text-[11px] text-muted-foreground">
                          <span className="font-medium">ATP Note:</span> {airline.nonFlight.atpNotes}
                        </div>
                      )}
                    </div>
                    {airline.nonFlight.additional && airline.nonFlight.additional.length > 0 && (
                      <div className="mt-2">
                        <p className="mb-1 text-[10px] font-medium text-muted-foreground">
                          Additional Requirements ({airline.nonFlight.additional.length})
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {airline.nonFlight.additional.map((item, i) => (
                            <span key={i} className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              {item}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Notes */}
                  {airline.notes && (
                    <div className="mb-3 rounded-md bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                      <span className="font-medium">Tips: </span>{airline.notes}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <button onClick={() => toggleSelect(airline.id)}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                        isSelected
                          ? 'bg-primary text-primary-foreground'
                          : 'border border-border hover:bg-muted'
                      )}>
                      {isSelected ? 'Remove from comparison' : 'Add to comparison'}
                    </button>
                    <span className="text-[10px] text-muted-foreground">
                      Selected: {selectedAirlines.size} airline{selectedAirlines.size !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {airlines.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No airlines in this category.
          </div>
        )}
      </div>

      {/* ── Quick comparison table (if 2+ selected) ── */}
      {selectedAirlines.size >= 2 && (
        <div className="mt-6 rounded-lg border border-border bg-card p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Award className="h-4 w-4 text-muted-foreground" />
            Side-by-Side Comparison
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="px-2 py-1.5 text-left font-medium">Requirement</th>
                  <th className="px-2 py-1.5 text-right font-medium">Your Hours</th>
                  {Array.from(selectedAirlines).map((id) => {
                    const al = ALL_AIRLINES.find((a) => a.id === id)
                    return <th key={id} className="px-2 py-1.5 text-right font-medium">{al?.code || al?.name || id}</th>
                  })}
                </tr>
              </thead>
              <tbody>
                {REQUIREMENT_KEYS.map((reqKey) => {
                  const current = getCurrentValue(reqKey.key, userData)
                  if (current === undefined) return null

                  return (
                    <tr key={reqKey.key} className="border-b border-border/50">
                      <td className="px-2 py-1.5 text-left font-medium">{reqKey.label}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{fmtH(current)}</td>
                      {Array.from(selectedAirlines).map((id) => {
                        const al = ALL_AIRLINES.find((a) => a.id === id)
                        const req = al?.flight[reqKey.key as keyof typeof al.flight] as RequirementValue | undefined
                        if (!req) {
                          return <td key={id} className="px-2 py-1.5 text-right text-muted-foreground/50">\u2014</td>
                        }
                        const met = current >= req.hours
                        return (
                          <td key={id} className={cn(
                            'px-2 py-1.5 text-right tabular-nums',
                            met ? 'text-emerald-500 font-semibold' : 'text-red-400 font-medium'
                          )}>
                            {fmtH(req.hours)}
                            {met ? ' ✓' : ` (${fmtH(Math.max(req.hours - current, 0))})`}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            Red values show the hours remaining to meet each requirement (in parentheses).
          </p>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────

function ReqItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/30 p-1.5">
      <span className="text-[10px] font-medium text-muted-foreground">{label}: </span>
      <span className="text-foreground">{value}</span>
    </div>
  )
}

function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ')
}
