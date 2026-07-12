'use client'

import { useState } from 'react'

export default function FlightCalcPage() {
  // ── State: the 4 inputs. Always strings, always start empty ('') ──
  const [hobbsStart, setHobbsStart] = useState('')
  const [hobbsEnd, setHobbsEnd] = useState('')
  const [fuelBurn, setFuelBurn] = useState('')
  const [fuelPrice, setFuelPrice] = useState('')

  return (
    <div className="p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* ── Header ── */}
        <div className="rounded-lg border border-border bg-card shadow-sm">
          <div className="p-5">
            <h1 className="text-lg font-semibold">Flight Time &amp; Fuel Calculator</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Enter your Hobbs times, fuel burn, and price to estimate flight time and fuel cost.
            </p>
          </div>
        </div>

        {/* ── Inputs ── */}
        <div className="rounded-lg border border-border bg-card shadow-sm">
          <div className="space-y-4 p-5">
            <Field
              label="Hobbs start"
              placeholder="e.g. 1245.3"
              value={hobbsStart}
              onChange={setHobbsStart}
            />
            <Field
              label="Hobbs end"
              placeholder="e.g. 1246.8"
              value={hobbsEnd}
              onChange={setHobbsEnd}
            />
            <Field
              label="Fuel burn rate (gal/hr)"
              placeholder="e.g. 10"
              value={fuelBurn}
              onChange={setFuelBurn}
            />
            <Field
              label="Fuel price ($/gal)"
              placeholder="e.g. 7.50"
              value={fuelPrice}
              onChange={setFuelPrice}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── A small reusable input component ──
// Instead of copying the same <label>+<input> block 4 times, we make a
// reusable piece called Field. It takes "props" (inputs to the component):
//   - label:    the text above the box
//   - placeholder: the grey hint inside the box
//   - value:    the current value (from our state)
//   - onChange: the setter function to call when the user types
function Field({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string
  placeholder: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <input
        type="text"
        inputMode="decimal"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  )
}
