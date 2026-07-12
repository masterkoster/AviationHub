'use client'

import { useEffect, useState } from 'react'
import { X, Loader2, Wind, Eye, Thermometer, Gauge, Sunrise, CloudSun } from 'lucide-react'
import { fetchMetar, fetchTaf } from '@/desktop/lib/weather-fetch'
import type { MetarData, TafData, FlightCategory } from '@/desktop/lib/weather-types'
import type { MetarStation } from './metar-stations'

// ── Flight category display ──

const CAT_STYLE: Record<FlightCategory, { label: string; bg: string; text: string }> = {
  VFR: { label: 'VFR', bg: 'bg-green-500/20', text: 'text-green-300' },
  MVFR: { label: 'MVFR', bg: 'bg-blue-500/20', text: 'text-blue-300' },
  IFR: { label: 'IFR', bg: 'bg-red-500/20', text: 'text-red-300' },
  LIFR: { label: 'LIFR', bg: 'bg-purple-500/20', text: 'text-purple-300' },
}

// ── Props ──

interface WeatherPopupProps {
  station: MetarStation | null
  onClose: () => void
}

// ── Component ──

export default function WeatherPopup({ station, onClose }: WeatherPopupProps) {
  const [taf, setTaf] = useState<TafData | null>(null)
  const [tafLoading, setTafLoading] = useState(false)

  // Fetch TAF when station changes
  useEffect(() => {
    if (!station) return
    setTaf(null)
    setTafLoading(true)
    let cancelled = false

    fetchTaf(station.icao)
      .then((data) => {
        if (!cancelled) setTaf(data)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setTafLoading(false)
      })

    return () => { cancelled = true }
  }, [station?.icao])

  if (!station) return null

  const metar = station.metar
  const category = metar?.flightCategory
  const catStyle = category ? CAT_STYLE[category] : null

  return (
    <div className="pointer-events-auto rounded-2xl border border-slate-200/10 bg-slate-900/80 backdrop-blur-xl shadow-xl w-80">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-700/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <CloudSun className="h-4 w-4 text-slate-300" />
          <div>
            <span className="text-sm font-semibold text-white">{station.icao}</span>
            {station.iata && (
              <span className="ml-1.5 text-xs text-slate-400">({station.iata})</span>
            )}
            {catStyle && (
              <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold ${catStyle.bg} ${catStyle.text}`}>
                {catStyle.label}
              </span>
            )}
          </div>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Airport name */}
      <div className="px-4 pt-2">
        <p className="text-xs text-slate-400">{station.name}{station.city ? ` • ${station.city}` : ''}</p>
      </div>

      {/* METAR data */}
      {metar ? (
        <div className="px-4 py-2 space-y-1.5">
          {metar.observationTime && (
            <p className="text-[10px] text-slate-500">
              Obs: {new Date(metar.observationTime).toLocaleString()}
            </p>
          )}
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
            <WxItem icon={Wind} label="Wind" value={
              metar.windDirDeg !== undefined
                ? `${metar.windDirDeg}° @ ${metar.windSpeedKts ?? 0} kt${metar.windGustKts ? ` G${metar.windGustKts}` : ''}`
                : '—'
            } />
            <WxItem icon={Eye} label="Visibility" value={
              metar.visibilitySm !== undefined ? `${metar.visibilitySm.toFixed(1)} SM` : '—'
            } />
            <WxItem icon={Thermometer} label="Temp/Dew" value={
              metar.tempC !== undefined ? `${metar.tempC}° / ${metar.dewpointC ?? '—'}°C` : '—'
            } />
            <WxItem icon={Gauge} label="Altimeter" value={
              metar.altimeterHg !== undefined ? `${metar.altimeterHg.toFixed(2)}"Hg` : '—'
            } />
            <WxItem icon={Sunrise} label="Ceiling" value={
              metar.ceilingFt ? `${metar.ceilingFt.toLocaleString()} ft` : 'CLR'
            } />
          </div>

          {metar.rawText && (
            <details className="mt-1">
              <summary className="cursor-pointer text-[10px] text-slate-500 hover:text-slate-300">Raw METAR</summary>
              <p className="mt-1 font-mono text-[10px] leading-relaxed text-slate-400">{metar.rawText}</p>
            </details>
          )}
        </div>
      ) : (
        <div className="px-4 py-3 text-xs text-slate-400">No METAR data available</div>
      )}

      {/* TAF */}
      <div className="border-t border-slate-700/50 px-4 py-2">
        <div className="flex items-center gap-1.5 mb-1">
          <ClockIcon />
          <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">TAF Forecast</span>
        </div>
        {tafLoading ? (
          <div className="flex items-center gap-2 py-1">
            <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
            <span className="text-[10px] text-slate-400">Loading TAF...</span>
          </div>
        ) : taf?.rawText ? (
          <div>
            {taf.issueTime && (
              <p className="text-[9px] text-slate-500 mb-1">Issued: {new Date(taf.issueTime).toLocaleString()}</p>
            )}
            <p className="font-mono text-[10px] leading-relaxed text-slate-400 whitespace-pre-wrap">{taf.rawText}</p>
          </div>
        ) : (
          <p className="text-[10px] text-slate-500">No TAF available</p>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ──

function WxItem({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="h-3 w-3 shrink-0 text-slate-400" />
      <div>
        <span className="text-slate-400">{label}: </span>
        <span className="text-slate-200">{value}</span>
      </div>
    </div>
  )
}

function ClockIcon() {
  return (
    <svg className="h-3 w-3 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12,6 12,12 16,14" />
    </svg>
  )
}
