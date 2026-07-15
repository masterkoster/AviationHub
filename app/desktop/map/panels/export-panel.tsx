'use client'

import { useState } from 'react'
import { Download, ExternalLink, FileText, FileDown, AlertCircle } from 'lucide-react'
import type { Waypoint, AirportWeather } from '../types'
import type { FlightPackData } from '../lib/map-pdf-export'

interface ExportPanelProps {
  waypoints: Waypoint[]
  routeName: string
  onExport: (format: 'gpx' | 'fpl' | 'json') => void
  onFileFlightPlan: () => void
  // PDF props
  weatherData: Record<string, AirportWeather | null>
  fuelGal: number
  burnGph: number
  cruiseKts: number
  estRangeNm: number
  callsign?: string
  pilotName?: string
  aircraftName?: string
  departureAt?: string
  cruiseAltFt?: number
}

export function ExportPanel(props: ExportPanelProps) {
  const {
    waypoints,
    routeName,
    onExport,
    onFileFlightPlan,
    weatherData,
    fuelGal,
    burnGph,
    cruiseKts,
    estRangeNm,
    callsign,
    pilotName,
    aircraftName,
    departureAt,
    cruiseAltFt,
  } = props

  const hasRoute = waypoints.length >= 2
  const [pdfDetailed, setPdfDetailed] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [pdfError, setPdfError] = useState('')
  const [pdfDone, setPdfDone] = useState(false)

  async function handlePdfExport() {
    if (!hasRoute) return
    setPdfBusy(true)
    setPdfError('')
    setPdfDone(false)
    try {
      const { generateFlightPackPdf } = await import('../lib/map-pdf-export')
      const data: FlightPackData = {
        routeName: routeName || `${waypoints[0].icao} → ${waypoints[waypoints.length - 1].icao}`,
        waypoints: waypoints.map((w) => ({
          icao: w.icao,
          name: w.name,
          latitude: w.latitude,
          longitude: w.longitude,
        })),
        weatherData,
        fuelGal,
        burnGph,
        cruiseKts,
        estRangeNm,
        callsign,
        pilotName,
        aircraftName,
        departureAt,
        cruiseAltFt,
      }
      await generateFlightPackPdf(data, pdfDetailed)
      setPdfDone(true)
      setTimeout(() => setPdfDone(false), 3000)
    } catch (err) {
      console.error('PDF export failed:', err)
      setPdfError(err instanceof Error ? err.message : 'PDF generation failed')
    } finally {
      setPdfBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {!hasRoute ? (
        <div className="rounded-md border border-dashed border-border bg-muted/20 p-6 text-center">
          <Download className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground">
            Add at least 2 waypoints to export your route.
          </p>
        </div>
      ) : (
        <>
          {/* Route summary */}
          <div className="rounded-md border border-border bg-muted/20 p-2.5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Route</p>
            <p className="mt-0.5 font-mono text-xs font-semibold">
              {waypoints.map((w) => w.icao).join(' → ')}
            </p>
            {routeName && (
              <p className="mt-0.5 text-[10px] text-muted-foreground">&quot;{routeName}&quot;</p>
            )}
          </div>

          {/* Export formats */}
          <div>
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Export Route
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {(['gpx', 'fpl', 'json'] as const).map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => onExport(fmt)}
                  className="flex flex-col items-center gap-1 rounded-md border border-border bg-card p-2.5 text-[10px] font-medium uppercase hover:bg-muted"
                >
                  <Download className="h-4 w-4 text-muted-foreground" />
                  {fmt}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              GPX works with Garmin and most GPS devices. FPL is for flight plan software. JSON is for backup/import.
            </p>
          </div>

          {/* Flight Pack PDF */}
          <div className="rounded-md border border-border bg-muted/20 p-2.5">
            <div className="flex items-start gap-2">
              <FileDown className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div className="flex-1">
                <p className="text-xs font-semibold">Flight Pack PDF</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  Generate a printable flight pack with weather, fuel, and route data.
                </p>

                {/* Basic / Detailed toggle */}
                <div className="mt-2 flex gap-1">
                  <button
                    onClick={() => setPdfDetailed(false)}
                    className={`rounded-l-md border px-2.5 py-1 text-[10px] font-medium transition-colors ${
                      !pdfDetailed
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    Basic
                  </button>
                  <button
                    onClick={() => setPdfDetailed(true)}
                    className={`rounded-r-md border border-l-0 px-2.5 py-1 text-[10px] font-medium transition-colors ${
                      pdfDetailed
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    Detailed
                  </button>
                </div>
                <p className="mt-1 text-[9px] text-muted-foreground">
                  {pdfDetailed
                    ? 'Multi-page: cover, nav log, weather, W&B, and legality.'
                    : 'Single-page summary with route, weather, and fuel.'}
                </p>

                {/* Export button */}
                <button
                  onClick={handlePdfExport}
                  disabled={pdfBusy}
                  className="mt-2 flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  <FileDown className="h-3 w-3" />
                  {pdfBusy ? 'Generating...' : 'Export PDF'}
                </button>

                {/* Status messages */}
                {pdfDone && (
                  <p className="mt-1.5 text-[10px] text-emerald-500">
                    PDF exported successfully!
                  </p>
                )}
                {pdfError && (
                  <div className="mt-1.5 flex items-start gap-1 text-[10px] text-destructive">
                    <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
                    <span>{pdfError}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Flight plan filing */}
          <div className="rounded-md border border-border bg-muted/20 p-2.5">
            <div className="flex items-start gap-2">
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <p className="text-xs font-semibold">File Flight Plan</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  Opens 1800wxbrief.com (free FAA service) with your route pre-filled in your default browser.
                </p>
                <button
                  onClick={onFileFlightPlan}
                  className="mt-2 flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <ExternalLink className="h-3 w-3" />
                  File on 1800wxbrief
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
