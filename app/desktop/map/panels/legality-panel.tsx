'use client'

import { useState, useCallback } from 'react'
import {
  ShieldCheck, Plane, Loader2, AlertTriangle,
  CheckCircle2, XCircle, Compass, Navigation,
  Heart, Award, Calendar,
} from 'lucide-react'
import type { Waypoint, AirportWeather } from '../types'
import type { PilotCertStatus, WeatherWarning } from '@/desktop/lib/weather-types'

type FlightModel = 'vfr-day' | 'vfr-night' | 'ifr' | 'ifr-night'

const FLIGHT_MODELS: { id: FlightModel; label: string }[] = [
  { id: 'vfr-day', label: 'VFR Day' },
  { id: 'vfr-night', label: 'VFR Night' },
  { id: 'ifr', label: 'IFR' },
  { id: 'ifr-night', label: 'IFR Night' },
]

interface LegalityResult {
  goNoGo: 'go' | 'caution' | 'no-go'
  legal: boolean
  reasons: string[]
  advisory: string[]
}

interface LegalityPanelProps {
  waypoints: Waypoint[]
  weatherData: Record<string, AirportWeather | null>
  pilotStatus?: PilotCertStatus | null
  weatherWarnings?: WeatherWarning[]
}

/**
 * Compact Route Weather & Legality panel for the map page.
 * Shows a flight model selector, checks METAR for each waypoint,
 * and displays go/no-go status with advisories.
 */
export function LegalityPanel({ waypoints, weatherData, pilotStatus, weatherWarnings = [] }: LegalityPanelProps) {
  const [flightModel, setFlightModel] = useState<FlightModel>('vfr-day')
  const [results, setResults] = useState<LegalityResult | null>(null)
  const [checking, setChecking] = useState(false)
  const nowMs = useState(() => Date.now())[0]

  const runCheck = useCallback(() => {
    if (waypoints.length === 0) return
    setChecking(true)

    // Run checks against available weather data
    setTimeout(() => {
      const reasons: string[] = []
      const advisory: string[] = []

      // Merge weather warnings from rules engine
      for (const w of weatherWarnings) {
        if (w.severity === 'warning') reasons.push(w.message)
        else advisory.push(w.message)
      }

      for (const wp of waypoints) {
        const wx = weatherData[wp.icao]
        if (!wx?.metar) {
          advisory.push(`${wp.icao}: No METAR available`)
          continue
        }
        const m = wx.metar
        const cat = m.flightCategory?.toUpperCase()
        const label = wp.icao

        // Flight category check
        if (flightModel.startsWith('vfr')) {
          if (cat === 'IFR' || cat === 'LIFR') reasons.push(`${label}: ${cat} — VFR not legal`)
          if (cat === 'MVFR') advisory.push(`${label}: Marginal VFR`)
        }
        if (flightModel.startsWith('ifr')) {
          if (!cat || cat === 'VFR') advisory.push(`${label}: ${cat ?? 'unknown'} — confirm IFR clearance`)
        }

        // Wind check
        if (m.windSpeedKts != null) {
          if (m.windSpeedKts > 30) reasons.push(`${label}: Wind ${m.windSpeedKts}kt exceeds limits`)
          else if (m.windSpeedKts > 20) advisory.push(`${label}: Wind ${m.windSpeedKts}kt — moderate turbulence`)
        }

        // Visibility check
        if (m.visibilitySm != null) {
          if (flightModel.startsWith('vfr') && m.visibilitySm < 3) reasons.push(`${label}: Vis ${m.visibilitySm}SM below VFR mins`)
          if (flightModel.startsWith('ifr') && m.visibilitySm < 1) reasons.push(`${label}: Vis ${m.visibilitySm}SM below IFR mins`)
        }

        // Ceiling check (estimated from flight category)
        if (cat) {
          const ceilingBelowVFR = cat === 'IFR' || cat === 'LIFR'
          const ceilingBelowIFR = cat === 'LIFR'
          if (flightModel.startsWith('vfr') && ceilingBelowVFR) reasons.push(`${label}: Ceiling likely below VFR mins (${cat})`)
          if (flightModel.startsWith('ifr') && ceilingBelowIFR) advisory.push(`${label}: Ceiling ${cat} — approach concerns`)
        }
      }

      setResults({
        goNoGo: reasons.length > 0 ? 'no-go' : advisory.length > 1 ? 'caution' : 'go',
        legal: reasons.length === 0,
        reasons,
        advisory,
      })
      setChecking(false)
    }, 300)
  }, [waypoints, weatherData, flightModel, weatherWarnings])

  return (
    <div className="space-y-3">
      {/* Flight model */}
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Flight Model</span>
        </div>
        <div className="grid grid-cols-2 gap-1">
          {FLIGHT_MODELS.map((fm) => (
            <button
              key={fm.id}
              onClick={() => setFlightModel(fm.id)}
              className={`rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors ${
                flightModel === fm.id
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {fm.label}
            </button>
          ))}
        </div>
      </div>

      {/* Check button */}
      <button
        onClick={runCheck}
        disabled={waypoints.length === 0 || checking}
        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plane className="h-3.5 w-3.5" />}
        {checking ? 'Checking…' : 'Check Legality'}
      </button>

      {waypoints.length === 0 && (
        <div className="rounded-md border border-dashed border-border bg-muted/20 p-6 text-center">
          <Compass className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground">Add waypoints to check route legality.</p>
        </div>
      )}

      {/* Pilot Currency Status */}
      {pilotStatus && (
        <div className="rounded-md border border-border bg-muted/20 p-2.5">
          <div className="flex items-center gap-1.5 mb-2">
            <Award className="h-3.5 w-3.5 text-primary" />
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Pilot Currency</span>
          </div>
          <div className="space-y-1.5">
            {/* Medical */}
            <div className="flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-1.5">
                <Heart className="h-3 w-3 text-muted-foreground" />
                <span>Medical{pilotStatus.medicalClass ? ` (Class ${pilotStatus.medicalClass})` : ''}</span>
              </div>
              <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${
                pilotStatus.medicalExpired ? 'bg-red-500/10 text-red-600' :
                pilotStatus.medicalExpiry && new Date(pilotStatus.medicalExpiry).getTime() - nowMs < 30 * 86400000 ? 'bg-amber-500/10 text-amber-600' :
                'bg-emerald-500/10 text-emerald-600'
              }`}>
                {pilotStatus.medicalExpired ? 'EXPIRED' :
                 pilotStatus.medicalExpiry ? `Exp ${new Date(pilotStatus.medicalExpiry).toLocaleDateString()}` :
                 'Unknown'}
              </span>
            </div>
            {/* BFR */}
            <div className="flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3 w-3 text-muted-foreground" />
                <span>Flight Review (BFR)</span>
              </div>
              <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${
                !pilotStatus.bfrCurrent ? 'bg-red-500/10 text-red-600' :
                pilotStatus.bfrExpiry && new Date(pilotStatus.bfrExpiry).getTime() - nowMs < 30 * 86400000 ? 'bg-amber-500/10 text-amber-600' :
                'bg-emerald-500/10 text-emerald-600'
              }`}>
                {!pilotStatus.bfrCurrent ? 'EXPIRED' :
                 pilotStatus.bfrExpiry ? `Exp ${new Date(pilotStatus.bfrExpiry).toLocaleDateString()}` :
                 'Current'}
              </span>
            </div>
            {/* Day Currency */}
            {pilotStatus.dayCurrency && (
              <div className="flex items-center justify-between text-[11px]">
                <span className="ml-4.5">Day Passenger</span>
                <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${
                  pilotStatus.dayCurrency.completed >= pilotStatus.dayCurrency.required ? 'bg-emerald-500/10 text-emerald-600' :
                  'bg-amber-500/10 text-amber-600'
                }`}>
                  {pilotStatus.dayCurrency.completed}/{pilotStatus.dayCurrency.required}
                </span>
              </div>
            )}
            {/* Night Currency */}
            {pilotStatus.nightCurrency && (
              <div className="flex items-center justify-between text-[11px]">
                <span className="ml-4.5">Night Passenger</span>
                <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${
                  pilotStatus.nightCurrency.completed >= pilotStatus.nightCurrency.required ? 'bg-emerald-500/10 text-emerald-600' :
                  'bg-amber-500/10 text-amber-600'
                }`}>
                  {pilotStatus.nightCurrency.completed}/{pilotStatus.nightCurrency.required}
                </span>
              </div>
            )}
            {/* IFR Currency */}
            {pilotStatus.ifrCurrency && (
              <div className="flex items-center justify-between text-[11px]">
                <span className="ml-4.5">IFR (IPC)</span>
                <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${
                  pilotStatus.ifrCurrency.completed >= pilotStatus.ifrCurrency.required ? 'bg-emerald-500/10 text-emerald-600' :
                  'bg-amber-500/10 text-amber-600'
                }`}>
                  {pilotStatus.ifrCurrency.completed}/{pilotStatus.ifrCurrency.required}
                </span>
              </div>
            )}
            {/* Instrument Rating */}
            <div className="flex items-center justify-between text-[11px]">
              <span className="ml-4.5">Instrument Rating</span>
              <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${
                pilotStatus.hasInstrumentRating ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'
              }`}>
                {pilotStatus.hasInstrumentRating ? 'Yes' : 'No'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="space-y-2">
          {/* Go/No-Go banner */}
          <div className={`rounded-md p-2.5 ${
            results.goNoGo === 'go' ? 'bg-emerald-500/10 border border-emerald-500/30' :
            results.goNoGo === 'caution' ? 'bg-amber-500/10 border border-amber-500/30' :
            'bg-red-500/10 border border-red-500/30'
          }`}>
            <div className="flex items-center gap-2">
              {results.goNoGo === 'go' && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
              {results.goNoGo === 'caution' && <AlertTriangle className="h-4 w-4 text-amber-500" />}
              {results.goNoGo === 'no-go' && <XCircle className="h-4 w-4 text-red-500" />}
              <span className={`text-xs font-semibold ${
                results.goNoGo === 'go' ? 'text-emerald-600' :
                results.goNoGo === 'caution' ? 'text-amber-600' :
                'text-red-600'
              }`}>
                {results.goNoGo === 'go' ? 'GO — All conditions met' :
                 results.goNoGo === 'caution' ? 'CAUTION — Review advisories' :
                 'NO GO — See issues below'}
              </span>
            </div>
          </div>

          {/* Route summary */}
          {waypoints.length > 1 && (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Navigation className="h-3 w-3" />
              {waypoints.map((w) => w.icao).join(' → ')}
            </div>
          )}

          {/* Legal reasons */}
          {results.reasons.length > 0 && (
            <div className="space-y-0.5">
              {results.reasons.map((r, i) => (
                <div key={i} className="flex items-start gap-1.5 text-[11px] text-red-500">
                  <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{r}</span>
                </div>
              ))}
            </div>
          )}

          {/* Advisories */}
          {results.advisory.length > 0 && (
            <div className="space-y-0.5">
              {results.advisory.map((a, i) => (
                <div key={i} className="flex items-start gap-1.5 text-[11px] text-amber-500">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{a}</span>
                </div>
              ))}
            </div>
          )}

          {/* Per-waypoint METAR summary */}
          {waypoints.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">METAR Summary</span>
              {waypoints.map((wp) => {
                const wx = weatherData[wp.icao]
                const cat = wx?.metar?.flightCategory
                return (
                  <div key={wp.icao} className="flex items-center justify-between rounded border border-border bg-muted/30 px-2 py-1">
                    <span className="font-mono text-[11px] font-medium">{wp.icao}</span>
                    <div className="flex items-center gap-2">
                      {wx?.metar?.windSpeedKts != null && (
                        <span className="text-[10px] text-muted-foreground">{wx.metar.windSpeedKts}kt</span>
                      )}
                      {cat && (
                        <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium uppercase ${
                          cat === 'VFR' ? 'bg-emerald-500/10 text-emerald-600' :
                          cat === 'MVFR' ? 'bg-blue-500/10 text-blue-600' :
                          cat === 'IFR' ? 'bg-amber-500/10 text-amber-600' :
                          'bg-red-500/10 text-red-600'
                        }`}>
                          {cat}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
