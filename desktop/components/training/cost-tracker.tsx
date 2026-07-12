'use client'

import { useState, useEffect } from 'react'
import { DollarSign, Plane, Clock, CalendarDays, TrendingUp, Save } from 'lucide-react'
import { type TrainingRates, DEFAULT_RATES, loadRates, saveRates } from '@/desktop/data/training-data'

interface Props {
  hoursRemaining: number
}

export default function CostTracker({ hoursRemaining }: Props) {
  const [rates, setRates] = useState<TrainingRates>(DEFAULT_RATES)
  const [loaded, setLoaded] = useState(false)

  // Load rates from localStorage on mount
  useEffect(() => {
    setRates(loadRates())
    setLoaded(true)
  }, [])

  // Persist rates on change
  useEffect(() => {
    if (loaded) saveRates(rates)
  }, [rates, loaded])

  const updateRate = <K extends keyof TrainingRates>(key: K, value: number) => {
    setRates(prev => ({ ...prev, [key]: Math.max(0, value) }))
  }

  // Computed values
  const hourlyCost = rates.aircraftRate + rates.instructorRate
  const trainingCost = hoursRemaining * hourlyCost
  const oneTimeCosts = rates.checkrideFee + rates.writtenExamFee + rates.medicalFee + rates.equipmentCost
  const totalProjection = trainingCost + oneTimeCosts
  const hoursPerMonth = rates.flightsPerMonth * rates.avgHoursPerFlight
  const monthlyCost = hoursPerMonth * hourlyCost
  const estimatedMonths = hoursPerMonth > 0 ? Math.ceil(hoursRemaining / hoursPerMonth) : 0

  return (
    <div className="rounded-xl border border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Cost Tracker</h3>
        </div>
        {loaded && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Save className="h-3 w-3" /> Auto-saved
          </span>
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* Rate inputs */}
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Rate Configuration</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <RateInput label="Aircraft Rate ($/hr)" value={rates.aircraftRate} onChange={v => updateRate('aircraftRate', v)} icon={Plane} />
            <RateInput label="Instructor Rate ($/hr)" value={rates.instructorRate} onChange={v => updateRate('instructorRate', v)} icon={Clock} />
            <RateInput label="Flights per Month" value={rates.flightsPerMonth} onChange={v => updateRate('flightsPerMonth', v)} icon={CalendarDays} />
            <RateInput label="Avg Hours per Flight" value={rates.avgHoursPerFlight} onChange={v => updateRate('avgHoursPerFlight', v)} icon={TrendingUp} step={0.1} />
          </div>
        </div>

        {/* One-time costs */}
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">One-Time Costs</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <OneTimeInput label="Checkride Fee" description="FAA practical test examiner fee" value={rates.checkrideFee} onChange={v => updateRate('checkrideFee', v)} />
            <OneTimeInput label="Written Exam" description="FAA knowledge test (PAR, IRA, CAX, FIA, etc.)" value={rates.writtenExamFee} onChange={v => updateRate('writtenExamFee', v)} />
            <OneTimeInput label="Medical" description="Aviation medical certificate (1st/2nd/3rd class)" value={rates.medicalFee} onChange={v => updateRate('medicalFee', v)} />
            <OneTimeInput label="Equipment" description="Headset, iPad, kneeboard, charts, supplies" value={rates.equipmentCost} onChange={v => updateRate('equipmentCost', v)} />
          </div>
        </div>

        {/* Projection summary */}
        <div className="rounded-lg border border-border bg-muted/20 p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Projection</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ProjectionCard label="Remaining Hours" value={hoursRemaining.toFixed(1)} unit="hrs" description="Flight hours still needed to meet all requirements for this certificate" />
            <ProjectionCard label="Hourly Cost" value={`$${hourlyCost.toFixed(0)}`} unit="acft + instr" description="Combined aircraft rental and instructor rate per hour" />
            <ProjectionCard label="Training Cost" value={`$${trainingCost.toLocaleString()}`} unit={`${hoursRemaining.toFixed(0)} hrs`} description="Estimated cost of remaining flight hours at current hourly rate" />
            <ProjectionCard label="One-Time Costs" value={`$${oneTimeCosts.toLocaleString()}`} unit="fees + equip" description="Checkride fee + written exam + medical + equipment (one-time expenses)" />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <ProjectionCard label="Total Projection" value={`$${totalProjection.toLocaleString()}`} unit="all costs" highlight description="Estimated total cost to complete this certificate (training + one-time fees)" />
            <ProjectionCard label="Monthly Cost" value={`$${monthlyCost.toLocaleString()}`} unit={`${rates.flightsPerMonth} flights/mo`} description={`Estimated monthly spend at ${rates.flightsPerMonth} flights of ${rates.avgHoursPerFlight}h each`} />
            <ProjectionCard label="Est. Timeline" value={estimatedMonths > 0 ? `${estimatedMonths} mo` : '\u2014'} unit={estimatedMonths > 0 ? `${(estimatedMonths / 12).toFixed(1)} years` : ''} description={`Approximate time to completion at current flying pace (${rates.flightsPerMonth} flights/mo, ${rates.avgHoursPerFlight}h avg)`} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ──

const RATE_TOOLTIPS: Record<string, string> = {
  'Aircraft Rate ($/hr)': 'Hourly rental or operating cost of the aircraft (dry or wet)',
  'Instructor Rate ($/hr)': 'Hourly fee charged by your flight instructor (CFI/CFII/MEI)',
  'Flights per Month': 'How many flights you plan to fly per month on average',
  'Avg Hours per Flight': 'Average duration of each flight in hours (incl. taxi, flight, etc.)',
}

function RateInput({ label, value, onChange, icon: Icon, step = 1 }: {
  label: string
  value: number
  onChange: (v: number) => void
  icon: React.ComponentType<{ className?: string }>
  step?: number
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2" title={RATE_TOOLTIPS[label] || label}>
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 text-xs text-muted-foreground">{label}</span>
      <input
        type="number"
        value={value}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        step={step}
        min={0}
        className="w-20 rounded border border-border bg-card px-2 py-1 text-xs tabular-nums text-right font-medium outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
      />
    </div>
  )
}

function OneTimeInput({ label, description, value, onChange }: {
  label: string
  description: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2" title={description}>
      <span className="min-w-0 flex-1 text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center">
        <span className="text-xs text-muted-foreground mr-1">$</span>
        <input
          type="number"
          value={value}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          min={0}
          className="w-16 rounded border border-border bg-card px-2 py-1 text-xs tabular-nums text-right font-medium outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
        />
      </div>
    </div>
  )
}

function ProjectionCard({ label, value, unit, highlight, description }: {
  label: string
  value: string
  unit: string
  highlight?: boolean
  description?: string
}) {
  return (
    <div className={cn(
      'rounded-lg border p-3',
      highlight ? 'bg-primary/5 border-primary/30' : 'border-border bg-card'
    )} title={description || `${label}: ${value}`}>
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={cn(
        'mt-1 text-lg font-bold tabular-nums',
        highlight ? 'text-primary' : 'text-foreground'
      )}>
        {value}
      </p>
      <p className="text-[10px] text-muted-foreground">{unit}</p>
    </div>
  )
}

function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ')
}
