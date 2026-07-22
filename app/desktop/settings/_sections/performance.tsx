'use client'

import { useState, useEffect } from 'react'
import { Gauge, Globe, AlertTriangle } from 'lucide-react'
import { SettingsCard, SectionHeading } from '@/desktop/components/settings-ui'

const STORAGE_KEY = 'map_airport_limit'

function readAirportLimit(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored !== null) {
      const n = Number(stored)
      if (Number.isFinite(n) && n >= 50 && n <= 5000) return n
    }
  } catch { /* ignore */ }
  return 1000
}

function writeAirportLimit(value: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(value))
  } catch { /* ignore */ }
}

export function PerformanceSection() {
  const [airportLimit, setAirportLimit] = useState(1000)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setAirportLimit(readAirportLimit())
    setMounted(true)
  }, [])

  function handleChange(value: number) {
    setAirportLimit(value)
    writeAirportLimit(value)
  }

  const isHigh = airportLimit > 3000
  const isVeryHigh = airportLimit > 4000

  return (
    <SettingsCard>
      <SectionHeading
        icon={<Gauge className="h-4 w-4" />}
        title="Map Performance"
        description="Control how many airports are rendered on the map. Higher values show more airports but may impact performance on slower devices."
      />

      {/* Airport density slider */}
      <div className="rounded-md border border-border bg-muted/30 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs font-medium">Airport Density</p>
              <p className="text-[11px] text-muted-foreground">
                Maximum airports rendered on the map at once
              </p>
            </div>
          </div>
          <span className="text-sm font-bold tabular-nums text-primary">
            {mounted ? airportLimit.toLocaleString() : '—'}
          </span>
        </div>

        <input
          type="range"
          min={50}
          max={5000}
          step={50}
          value={airportLimit}
          onChange={(e) => handleChange(Number(e.target.value))}
          className="w-full accent-primary"
        />

        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>50</span>
          <span>1,000</span>
          <span>2,500</span>
          <span>5,000</span>
        </div>

        {/* Quick presets */}
        <div className="flex gap-2 pt-1">
          {[
            { label: 'Fast', value: 500, desc: 'Large airports only' },
            { label: 'Balanced', value: 1000, desc: 'Default' },
            { label: 'Dense', value: 2500, desc: 'Most airports' },
            { label: 'Max', value: 5000, desc: 'All airports' },
          ].map((preset) => (
            <button
              key={preset.label}
              onClick={() => handleChange(preset.value)}
              className={`flex-1 rounded-md border px-2 py-1.5 text-center transition-colors ${
                airportLimit === preset.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-card hover:bg-muted'
              }`}
            >
              <p className="text-[11px] font-semibold">{preset.label}</p>
              <p className="text-[9px] text-muted-foreground">{preset.desc}</p>
            </button>
          ))}
        </div>

        {/* Warning for high values */}
        {isHigh && (
          <div className={`flex items-start gap-2 rounded-md p-2.5 text-[11px] ${
            isVeryHigh
              ? 'bg-destructive/10 text-destructive'
              : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
          }`}>
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>
              {isVeryHigh
                ? 'Very high airport density may cause lag on slower devices. Reduce if the map feels sluggish.'
                : 'High airport density may slightly impact performance on older hardware.'}
            </span>
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        This setting is saved locally on this device and applies to the map view.
        The map will still fetch additional airports from the database as needed for search and routing.
      </p>
    </SettingsCard>
  )
}
