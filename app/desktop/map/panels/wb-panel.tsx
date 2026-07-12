'use client'

import { cn } from '@/lib/utils'

interface WbPanelProps {
  aircraftName: string
  setAircraftName: (v: string) => void
  wbFrontSeats: number
  setWbFrontSeats: (v: number) => void
  wbRearSeat1: number
  setWbRearSeat1: (v: number) => void
  wbRearSeat2: number
  setWbRearSeat2: (v: number) => void
  wbBaggage1: number
  setWbBaggage1: (v: number) => void
  wbBaggage2: number
  setWbBaggage2: (v: number) => void
  wbFuelGal: number
  setWbFuelGal: (v: number) => void
  wbEmptyWeight: number
  wbPayloadWeight: number
  wbFuelWeight: number
  wbTotalWeight: number
  wbCg: number
  wbForwardLimit: number
  wbAftLimit: number
  wbWithinLimits: boolean
  wbCgPercent: number
  selectedAircraftModel?: string | null
}

export function WbPanel(props: WbPanelProps) {
  const {
    aircraftName, setAircraftName,
    wbFrontSeats, setWbFrontSeats,
    wbRearSeat1, setWbRearSeat1,
    wbRearSeat2, setWbRearSeat2,
    wbBaggage1, setWbBaggage1,
    wbBaggage2, setWbBaggage2,
    wbFuelGal, setWbFuelGal,
    wbEmptyWeight, wbPayloadWeight, wbFuelWeight, wbTotalWeight,
    wbCg, wbForwardLimit, wbAftLimit, wbWithinLimits, wbCgPercent,
    selectedAircraftModel,
  } = props

  return (
    <div className="space-y-3">
      {selectedAircraftModel && (
        <div className="rounded-md border border-sky-500/30 bg-sky-500/10 px-2.5 py-1.5 text-[11px] text-sky-700 dark:text-sky-300">
          Using envelope data for <strong>{selectedAircraftModel}</strong>
        </div>
      )}

      {/* Weight inputs */}
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Front Seats (lbs)">
            <input type="number" value={wbFrontSeats} onChange={(e) => setWbFrontSeats(Number(e.target.value) || 0)} className="wb-input" />
          </Field>
          <Field label="Rear Seat 1 (lbs)">
            <input type="number" value={wbRearSeat1} onChange={(e) => setWbRearSeat1(Number(e.target.value) || 0)} className="wb-input" />
          </Field>
          <Field label="Rear Seat 2 (lbs)">
            <input type="number" value={wbRearSeat2} onChange={(e) => setWbRearSeat2(Number(e.target.value) || 0)} className="wb-input" />
          </Field>
          <Field label="Baggage 1 (lbs)">
            <input type="number" value={wbBaggage1} onChange={(e) => setWbBaggage1(Number(e.target.value) || 0)} className="wb-input" />
          </Field>
          <Field label="Baggage 2 (lbs)">
            <input type="number" value={wbBaggage2} onChange={(e) => setWbBaggage2(Number(e.target.value) || 0)} className="wb-input" />
          </Field>
          <Field label="Fuel (gal)">
            <input type="number" value={wbFuelGal} onChange={(e) => setWbFuelGal(Number(e.target.value) || 0)} className="wb-input" />
          </Field>
        </div>
      </div>

      {/* Weight summary */}
      <div className="grid grid-cols-3 gap-1.5">
        <Stat label="Empty" value={`${wbEmptyWeight} lbs`} />
        <Stat label="Payload" value={`${wbPayloadWeight} lbs`} />
        <Stat label="Fuel" value={`${wbFuelWeight} lbs`} />
        <Stat label="Total" value={`${wbTotalWeight} lbs`} />
        <Stat label="CG" value={`${wbCg.toFixed(1)}"`} />
        <Stat label="Limits" value={`${wbForwardLimit}" - ${wbAftLimit}"`} />
      </div>

      {/* CG visualization */}
      <div className="rounded-md border border-border bg-muted/30 p-2.5">
        <div className="mb-1.5 flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">Center of Gravity</span>
          <span className="font-medium">{wbCg.toFixed(1)}"</span>
        </div>
        <div className="relative h-3 rounded-full bg-muted">
          {/* Envelope range bar */}
          <div className="absolute inset-y-0 left-0 rounded-full bg-emerald-500/20" style={{ width: '100%' }} />
          {/* CG marker */}
          <div
            className={cn(
              'absolute top-0 h-full w-1 rounded',
              wbWithinLimits ? 'bg-emerald-500' : 'bg-destructive',
            )}
            style={{ left: `calc(${wbCgPercent}% - 2px)` }}
          />
        </div>
        <div className="mt-1 flex items-center justify-between text-[10px]">
          <span className="text-muted-foreground">{wbForwardLimit}"</span>
          <span className={cn('font-medium', wbWithinLimits ? 'text-emerald-600' : 'text-destructive')}>
            {wbWithinLimits ? '✓ Within Limits' : '⚠ Out of Limits'}
          </span>
          <span className="text-muted-foreground">{wbAftLimit}"</span>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground">
        Arms and limits based on POH data for the selected aircraft. Always verify against the official POH for your specific aircraft.
      </p>

      <style jsx>{`
        :global(.wb-input) {
          height: 1.75rem;
          width: 100%;
          border-radius: 0.375rem;
          border: 1px solid hsl(var(--border));
          background: hsl(var(--background));
          padding: 0 0.5rem;
          font-size: 0.75rem;
          outline: none;
        }
        :global(.wb-input:focus) {
          box-shadow: 0 0 0 2px hsl(var(--ring));
        }
      `}</style>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-card px-2 py-1">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-xs font-semibold">{value}</p>
    </div>
  )
}
