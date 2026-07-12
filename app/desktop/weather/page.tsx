'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  CloudSun,
  Loader2,
  Search,
  Wind,
  Thermometer,
  Eye,
  Gauge,
  RefreshCw,
  AlertTriangle,
  Info,
  AlertCircle,
  Clock,
  MapPin,
  Radio,
  Plane,
  Sunrise,
  Sunset,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import {
  fetchMetar,
  fetchTaf,
  fetchWindsAloft,
  fetchRadarFrames,
  fetchHazards,
  getRadarTileUrl,
} from '@/desktop/lib/weather-fetch'
import { loadPilotCertStatus, evaluateWeatherRules } from '@/desktop/lib/weather-rules'
import { WeatherPilotStatus } from '@/desktop/components/weather-pilot-status'
import type {
  MetarData,
  TafData,
  WindsAloftPoint,
  HazardData,
  PilotCertStatus,
  WeatherWarning,
  FlightCategory,
} from '@/desktop/lib/weather-types'
import { flightCategoryColor, flightCategoryBg } from '@/desktop/lib/weather-types'
import { cn } from '@/lib/utils'

// ── Recent ICAO search history (session-local) ──
const RECENT_KEY = 'desktop.weather.recent'

function getRecentIcaos(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function addRecentIcao(icao: string) {
  try {
    const list = getRecentIcaos().filter((i) => i !== icao)
    list.unshift(icao)
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 10)))
  } catch {
    // ignore
  }
}

// ── Category badge ──
function CategoryBadge({ category }: { category?: FlightCategory | string }) {
  if (!category) return null
  const colorMap: Record<string, string> = {
    VFR: 'text-green-600 bg-green-500/10 border-green-500/30',
    MVFR: 'text-blue-600 bg-blue-500/10 border-blue-500/30',
    IFR: 'text-red-600 bg-red-500/10 border-red-500/30',
    LIFR: 'text-purple-600 bg-purple-500/10 border-purple-500/30',
  }
  const cls = colorMap[category] || 'text-muted-foreground bg-muted border-border'
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>
      {category}
    </span>
  )
}

// ── Severity icon ──
function SeverityIcon({ severity }: { severity: WeatherWarning['severity'] }) {
  switch (severity) {
    case 'warning':
      return <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
    case 'caution':
      return <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />
    case 'info':
      return <Info className="h-4 w-4 shrink-0 text-blue-500" />
  }
}

// ── Metar card ──
function MetarCard({ metar, label }: { metar?: MetarData | null; label: string }) {
  if (!metar) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">{label} — No data</p>
      </div>
    )
  }
  return (
    <div className={`rounded-lg border bg-card p-4 ${metar.flightCategory ? flightCategoryBg(metar.flightCategory) : 'border-border'}`}>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CloudSun className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
        </div>
        <CategoryBadge category={metar.flightCategory} />
      </div>
      {metar.observationTime && (
        <p className="mb-2 text-[10px] text-muted-foreground">
          Observed: {new Date(metar.observationTime).toLocaleString()}
        </p>
      )}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-5">
        <WeatherItem icon={Wind} label="Wind" value={metar.windDirDeg !== undefined ? `${metar.windDirDeg}° @ ${metar.windSpeedKts ?? 0} kt${metar.windGustKts ? ` G${metar.windGustKts}` : ''}` : '—'} />
        <WeatherItem icon={Eye} label="Vis" value={metar.visibilitySm !== undefined ? `${metar.visibilitySm.toFixed(1)} SM` : '—'} />
        <WeatherItem icon={Thermometer} label="Temp/Dew" value={metar.tempC !== undefined ? `${metar.tempC}° / ${metar.dewpointC ?? '—'}°C` : '—'} />
        <WeatherItem icon={Gauge} label="Altimeter" value={metar.altimeterHg !== undefined ? `${metar.altimeterHg.toFixed(2)}"Hg` : '—'} />
        <WeatherItem icon={Sunrise} label="Ceiling" value={metar.ceilingFt ? `${metar.ceilingFt.toLocaleString()} ft` : 'CLR'} />
      </div>
      {metar.rawText && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[10px] text-muted-foreground hover:text-foreground">Raw METAR</summary>
          <p className="mt-1 font-mono text-[10px] leading-relaxed text-muted-foreground/70">{metar.rawText}</p>
        </details>
      )}
    </div>
  )
}

// ── Taf card ──
function TafCard({ taf, label }: { taf?: TafData | null; label: string }) {
  if (!taf || !taf.rawText) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">{label} — No TAF available</p>
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-2 flex items-center gap-2">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      {taf.issueTime && (
        <p className="mb-1 text-[10px] text-muted-foreground">
          Issued: {new Date(taf.issueTime).toLocaleString()}
        </p>
      )}
      {taf.validFrom && taf.validTo && (
        <p className="mb-2 text-[10px] text-muted-foreground">
          Valid: {new Date(taf.validFrom).toLocaleString()} → {new Date(taf.validTo).toLocaleString()}
        </p>
      )}
      <p className="font-mono text-[11px] leading-relaxed text-foreground/80 whitespace-pre-wrap">{taf.rawText}</p>
    </div>
  )
}

// ── Winds aloft card ──
function WindsAloftCard({ levels, icao }: { levels: WindsAloftPoint[]; icao: string }) {
  if (levels.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">Winds Aloft — No data for {icao}</p>
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-2 flex items-center gap-2">
        <Wind className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">Winds Aloft — {icao}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="py-1 pr-3 text-left font-medium">Altitude</th>
              <th className="py-1 pr-3 text-left font-medium">Direction</th>
              <th className="py-1 pr-3 text-left font-medium">Speed</th>
              <th className="py-1 text-left font-medium">Temp</th>
            </tr>
          </thead>
          <tbody>
            {levels.map((lvl) => (
              <tr key={lvl.altitudeFt} className="border-b border-border/50 last:border-0">
                <td className="py-1 pr-3 font-mono tabular-nums">{lvl.altitudeFt.toLocaleString()} ft</td>
                <td className="py-1 pr-3 font-mono tabular-nums">{lvl.windDirDeg}°</td>
                <td className="py-1 pr-3 font-mono tabular-nums">{lvl.windSpeedKts} kt</td>
                <td className="py-1 font-mono tabular-nums">{lvl.tempC !== undefined ? `${lvl.tempC}°C` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Hazards list ──
function HazardsList({ hazards }: { hazards: HazardData[] }) {
  if (hazards.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">No active hazards in your area.</p>
      </div>
    )
  }
  const severityColor: Record<string, string> = {
    warning: 'border-red-500/30 bg-red-500/5',
    caution: 'border-amber-500/30 bg-amber-500/5',
    advisory: 'border-blue-500/30 bg-blue-500/5',
  }
  return (
    <div className="space-y-2">
      {hazards.map((h, i) => (
        <div key={i} className={`rounded-lg border p-3 ${severityColor[h.severity] || 'border-border bg-card'}`}>
          <div className="flex items-center gap-2">
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
              {h.type}
            </span>
            <span className="text-xs font-medium">{h.title}</span>
          </div>
          {h.description && (
            <p className="mt-1 text-[11px] text-muted-foreground">{h.description}</p>
          )}
          {h.validFrom && h.validTo && (
            <p className="mt-1 text-[10px] text-muted-foreground">
              {new Date(h.validFrom).toLocaleString()} → {new Date(h.validTo).toLocaleString()}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Warning cards ──
function WarningList({ warnings }: { warnings: WeatherWarning[] }) {
  if (warnings.length === 0) return null
  return (
    <div className="space-y-2">
      {warnings.map((w, i) => (
        <div
          key={i}
          className={cn(
            'rounded-lg border p-3',
            w.severity === 'warning' && 'border-red-500/30 bg-red-500/5',
            w.severity === 'caution' && 'border-amber-500/30 bg-amber-500/5',
            w.severity === 'info' && 'border-blue-500/30 bg-blue-500/5'
          )}
        >
          <div className="flex items-start gap-2">
            <SeverityIcon severity={w.severity} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium">{w.message}</p>
              {w.detail && (
                <p className="mt-0.5 text-[11px] text-muted-foreground">{w.detail}</p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── WeatherItem inline ──
function WeatherItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div>
        <span className="text-muted-foreground">{label}: </span>
        <span className="font-medium">{value}</span>
      </div>
    </div>
  )
}

// ── Loading skeleton ──
function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-32 animate-pulse rounded-lg border border-border bg-card" />
      ))}
    </div>
  )
}

// ── Radar Section ──
function RadarSection({ icao }: { icao: string }) {
  const [frames, setFrames] = useState<{ past: Array<{ time: number; path: string }> } | null>(null)
  const [loading, setLoading] = useState(true)
  const [frameIdx, setFrameIdx] = useState(0)
  const [showRadar, setShowRadar] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchRadarFrames()
      .then((data) => {
        if (!cancelled) {
          setFrames(data)
          setFrameIdx(data.past.length - 1)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [icao])

  if (loading) return null
  if (!frames || frames.past.length === 0) return null

  const frame = frames.past[frameIdx]
  if (!frame) return null

  // Show radar at a fixed tile center (CONUS overview)
  const tileUrl = getRadarTileUrl(frame.time, 4, 7, 6)

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <button
        onClick={() => setShowRadar((s) => !s)}
        className="mb-2 flex w-full items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Radar Imagery</span>
        </div>
        {showRadar ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </button>
      {showRadar && (
        <div className="space-y-2">
          <div className="relative aspect-video w-full overflow-hidden rounded-md bg-muted">
            {frame ? (
              <img
                src={`https://tilecache.rainviewer.com/v2/radar/${frame.time}/256/4/7/6/1_1.png`}
                alt="Radar overview"
                className="h-full w-full object-contain"
                style={{ imageRendering: 'pixelated' }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                Radar data unavailable
              </div>
            )}
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              {frames.past.map((f, i) => (
                <button
                  key={f.time}
                  onClick={() => setFrameIdx(i)}
                  className={`h-1.5 w-1.5 rounded-full transition-colors ${
                    i === frameIdx ? 'bg-primary' : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
                  }`}
                  title={new Date(f.time * 1000).toLocaleTimeString()}
                />
              ))}
            </div>
            <span className="text-[10px] text-muted-foreground">
              {frame && new Date(frame.time * 1000).toLocaleTimeString()}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Source: RainViewer. Imagery may not cover your exact area.
          </p>
        </div>
      )}
    </div>
  )
}

// ── Main Page ──

export default function DesktopWeatherPage() {
  const { mode, localUser } = useDesktopAuth()
  const [icao, setIcao] = useState('')
  const [pilotStatus, setPilotStatus] = useState<PilotCertStatus | null>(null)
  const [pilotStatusLoading, setPilotStatusLoading] = useState(true)

  // Weather data state
  const [metar, setMetar] = useState<MetarData | null>(null)
  const [taf, setTaf] = useState<TafData | null>(null)
  const [windsAloft, setWindsAloft] = useState<WindsAloftPoint[]>([])
  const [hazards, setHazards] = useState<HazardData[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Warnings
  const [warnings, setWarnings] = useState<WeatherWarning[]>([])
  const [briefingTime, setBriefingTime] = useState<string | null>(null)

  // Recent
  const [recentIcaos, setRecentIcaos] = useState<string[]>([])

  useEffect(() => {
    setRecentIcaos(getRecentIcaos())
  }, [])

  // Load pilot cert status on mount
  useEffect(() => {
    if (!localUser?.id) {
      setPilotStatusLoading(false)
      return
    }
    let cancelled = false
    loadPilotCertStatus(localUser.id)
      .then((status) => {
        if (!cancelled) setPilotStatus(status)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setPilotStatusLoading(false)
      })
    return () => { cancelled = true }
  }, [localUser?.id])

  const fetchWeather = useCallback(async (searchIcao: string) => {
    const key = searchIcao.toUpperCase().trim()
    if (key.length < 3 || key.length > 4) {
      setError('Enter a valid 3-4 character ICAO code (e.g., KLAX, KJFK)')
      return
    }

    setLoading(true)
    setError('')
    setMetar(null)
    setTaf(null)
    setWindsAloft([])
    setHazards([])
    setWarnings([])
    setBriefingTime(null)

    addRecentIcao(key)
    setRecentIcaos(getRecentIcaos())

    try {
      const [metarResult, tafResult, windsResult, hazardsResult] = await Promise.all([
        fetchMetar(key),
        fetchTaf(key),
        fetchWindsAloft(key),
        fetchHazards(),
      ])

      setMetar(metarResult)
      setTaf(tafResult)
      setWindsAloft(windsResult)
      setHazards(hazardsResult)
      setBriefingTime(new Date().toISOString())

      // Run rules engine
      if (metarResult && pilotStatus) {
        const rulesResult = evaluateWeatherRules({
          metar: metarResult,
          pilotStatus,
          departureIcao: key,
          departureTime: new Date(),
        })
        setWarnings(rulesResult.warnings)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Weather fetch failed')
    } finally {
      setLoading(false)
    }
  }, [pilotStatus])

  const filteredRecent = useMemo(() => {
    const q = icao.toUpperCase().trim()
    if (!q || q.length < 1) return recentIcaos
    return recentIcaos.filter((r) => r.startsWith(q))
  }, [icao, recentIcaos])

  return (
    <div className="mx-auto max-w-5xl p-6">
      {/* ── Header ── */}
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <CloudSun className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">Weather Briefing</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Aviation weather from NOAA/NWS. Enter an ICAO code to get started.
        </p>
      </div>

      {/* ── ICAO Search ── */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={icao}
            onChange={(e) => {
              setIcao(e.target.value.toUpperCase())
              setError('')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') fetchWeather(icao)
            }}
            placeholder="Enter ICAO code (e.g., KLAX, KJFK, EGLL)"
            className="w-full rounded-lg border border-input bg-background py-2.5 pl-10 pr-24 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={() => fetchWeather(icao)}
            disabled={loading}
            className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {loading ? 'Fetching...' : 'Get Briefing'}
          </button>
        </div>

        {/* Recent ICAOs */}
        {recentIcaos.length > 0 && !metar && !loading && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-medium text-muted-foreground">Recent:</span>
            {filteredRecent.map((r) => (
              <button
                key={r}
                onClick={() => {
                  setIcao(r)
                  fetchWeather(r)
                }}
                className="rounded border border-border bg-card px-2 py-0.5 font-mono text-[11px] hover:bg-muted"
              >
                {r}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
          <p className="text-xs text-red-600">{error}</p>
        </div>
      )}

      {/* ── Loading ── */}
      {loading && <LoadingSkeleton />}

      {/* ── Pilot Status ── */}
      {!pilotStatusLoading && pilotStatus && (
        <div className="mb-4">
          <WeatherPilotStatus status={pilotStatus} />
        </div>
      )}

      {/* ── Warnings ── */}
      {warnings.length > 0 && (
        <div className="mb-4">
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <span className="text-xs font-semibold text-muted-foreground">Weather + Currency Warnings</span>
          </div>
          <WarningList warnings={warnings} />
        </div>
      )}

      {/* ── METAR ── */}
      {metar && (
        <div className="mb-4">
          <MetarCard metar={metar} label={`METAR — ${metar.icao || icao}`} />
        </div>
      )}

      {/* ── Two-column: TAF + Winds ── */}
      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        {taf && <TafCard taf={taf} label={`TAF — ${taf.icao || icao}`} />}
        <WindsAloftCard levels={windsAloft} icao={icao} />
      </div>

      {/* ── Hazards + Radar ── */}
      <div className="mb-4 space-y-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground">Hazards (AIRMET/SIGMET/NOTAM)</span>
          </div>
          <HazardsList hazards={hazards} />
        </div>
        {metar && <RadarSection icao={metar.icao || icao} />}
      </div>

      {/* ── Briefing time ── */}
      {briefingTime && (
        <p className="text-[10px] text-muted-foreground">
          Briefing generated: {new Date(briefingTime).toLocaleString()}. Source: NOAA/NWS, RainViewer.
        </p>
      )}

      {/* ── Empty state ── */}
      {!metar && !loading && !error && (
        <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center">
          <CloudSun className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
          <h3 className="text-sm font-semibold text-muted-foreground">No Briefing Loaded</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Enter an ICAO code above and click Get Briefing to view current conditions, TAF, winds aloft, and hazards.
          </p>
        </div>
      )}
    </div>
  )
}
