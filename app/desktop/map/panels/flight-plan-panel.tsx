'use client'

import { Loader2 } from 'lucide-react'

interface FlightPlanPanelProps {
  callsign: string
  setCallsign: (v: string) => void
  pilotName: string
  setPilotName: (v: string) => void
  aircraftName: string
  setAircraftName: (v: string) => void
  departureAt: string
  setDepartureAt: (v: string) => void
  cruiseAltFt: number
  setCruiseAltFt: (v: number) => void
  soulsOnBoard: number
  setSoulsOnBoard: (v: number) => void
  alternateIcao: string
  setAlternateIcao: (v: string) => void
  remarks: string
  setRemarks: (v: string) => void
  fuelPercent: number
  setFuelPercent: (v: number) => void
  fuelGal: number
  burnGph: number
  cruiseKts: number
  estRangeNm: number
  userAircraft: { id: string; nNumber: string; nickname?: string | null; model?: string | null }[]
  selectedAircraftId: string | null
  onSelectAircraft: (id: string) => void
  onSave: () => void
  saving?: boolean
}

export function FlightPlanPanel(props: FlightPlanPanelProps) {
  const {
    callsign, setCallsign,
    pilotName, setPilotName,
    aircraftName, setAircraftName,
    departureAt, setDepartureAt,
    cruiseAltFt, setCruiseAltFt,
    soulsOnBoard, setSoulsOnBoard,
    alternateIcao, setAlternateIcao,
    remarks, setRemarks,
    fuelPercent, setFuelPercent,
    fuelGal, burnGph, cruiseKts, estRangeNm,
    userAircraft, selectedAircraftId, onSelectAircraft,
    onSave, saving,
  } = props

  return (
    <div className="space-y-3">
      {/* Aircraft selector */}
      {userAircraft.length > 0 && (
        <div>
          <label className="mb-1 block text-[11px] text-muted-foreground">Select Aircraft</label>
          <select
            value={selectedAircraftId ?? ''}
            onChange={(e) => onSelectAircraft(e.target.value)}
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">— Manual entry —</option>
            {userAircraft.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nickname ? `${a.nNumber} — ${a.nickname}` : a.nNumber}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Flight plan fields */}
      <div className="space-y-2">
        <Field label="Callsign">
          <input value={callsign} onChange={(e) => setCallsign(e.target.value)} className="panel-input" />
        </Field>
        <Field label="Pilot">
          <input value={pilotName} onChange={(e) => setPilotName(e.target.value)} className="panel-input" />
        </Field>
        <Field label="Aircraft">
          <input value={aircraftName} onChange={(e) => setAircraftName(e.target.value)} className="panel-input" />
        </Field>
        <Field label="Departure">
          <input type="datetime-local" value={departureAt} onChange={(e) => setDepartureAt(e.target.value)} className="panel-input" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Altitude (ft)">
            <input type="number" value={cruiseAltFt} onChange={(e) => setCruiseAltFt(Number(e.target.value) || 0)} className="panel-input" />
          </Field>
          <Field label="Souls">
            <input type="number" value={soulsOnBoard} onChange={(e) => setSoulsOnBoard(Number(e.target.value) || 0)} className="panel-input" />
          </Field>
        </div>
        <Field label="Alternate ICAO">
          <input value={alternateIcao} onChange={(e) => setAlternateIcao(e.target.value.toUpperCase())} className="panel-input" />
        </Field>
        <Field label="Remarks">
          <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} className="panel-input min-h-[54px] resize-none" />
        </Field>
      </div>

      {/* Fuel slider */}
      <div className="rounded-md border border-border bg-muted/20 p-2">
        <div className="mb-1 flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">Fuel</span>
          <span className="font-medium">{fuelPercent}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={fuelPercent}
          onInput={(e) => setFuelPercent(Number((e.target as HTMLInputElement).value))}
          onPointerDown={(e) => e.stopPropagation()}
          className="w-full cursor-ew-resize accent-sky-500"
        />
        <div className="mt-1 grid grid-cols-4 gap-1 text-[10px]">
          <Stat label="Range" value={`${Math.round(estRangeNm)}nm`} />
          <Stat label="Gal" value={fuelGal.toFixed(1)} />
          <Stat label="Burn" value={`${burnGph}gph`} />
          <Stat label="Kts" value={`${cruiseKts}`} />
        </div>
      </div>

      {/* Save button */}
      <button
        onClick={onSave}
        disabled={saving}
        className="flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        Save Flight Plan
      </button>

      <style jsx>{`
        :global(.panel-input) {
          height: 1.75rem;
          width: 100%;
          border-radius: 0.375rem;
          border: 1px solid hsl(var(--border));
          background: hsl(var(--background));
          padding: 0 0.5rem;
          font-size: 0.75rem;
          outline: none;
        }
        :global(.panel-input:focus) {
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
    <div className="rounded border border-border bg-card px-1.5 py-1">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  )
}
