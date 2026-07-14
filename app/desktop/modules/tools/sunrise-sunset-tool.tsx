'use client'

/**
 * Sunrise / Sunset calculator — solar position, twilight, and night currency.
 *
 * Two-column layout: left = inputs + detail table, right = SVG sun-arc visualization.
 * Includes civil twilight, solar noon, live countdown, night-currency note,
 * and debounced history logging.
 */
import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { Sun, Moon, MapPin, Copy, Calendar, Play, Pause, RotateCcw, Search, Plane, Compass, Navigation, Shield, AlertTriangle, CheckCircle2, XCircle, ChevronDown, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { fetchMetar } from '@/desktop/lib/weather-fetch'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { ToolShell } from '@/components/ui/e6b'
import { logToolUse } from '@/desktop/lib/e6b-store'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'

// ── Common aviation timezones ──────────────────────────────────────────────────

const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Anchorage', 'Pacific/Honolulu', 'America/Phoenix', 'America/Detroit',
  'America/Indiana/Indianapolis', 'America/Boise', 'America/Dawson',
  'America/Vancouver', 'America/Toronto', 'America/Halifax', 'Europe/London',
  'Europe/Paris', 'Europe/Berlin', 'Asia/Tokyo', 'Asia/Shanghai', 'Australia/Sydney',
  'Pacific/Auckland',
]

/** Approximate UTC offset for a timezone (hours) */
function getUtcOffsetHours(tz: string): number {
  try {
    const now = new Date()
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' })
    const parts = fmt.formatToParts(now)
    const tzPart = parts.find((p) => p.type === 'timeZoneName')
    if (tzPart) {
      const m = tzPart.value.match(/GMT([+-]\d+)/)
      if (m) return Number(m[1])
    }
    // fallback: compare UTC to local
    const utcStr = now.toLocaleString('en-US', { timeZone: 'UTC' })
    const localStr = now.toLocaleString('en-US', { timeZone: tz })
    const diff = (new Date(localStr).getTime() - new Date(utcStr).getTime()) / 3_600_000
    return Math.round(diff)
  } catch {
    return 0
  }
}

function tzLabel(tz: string): string {
  const offset = getUtcOffsetHours(tz)
  const sign = offset >= 0 ? '+' : ''
  const city = tz.split('/').pop()?.replace(/_/g, ' ') ?? tz
  return `${city} (GMT${sign}${offset})`
}

// ── Solar position algorithm (USNO simplified) ────────────────────────────────

function calcSunAngle(
  date: Date,
  lat: number,
  lng: number,
  angle: number,
): { rise: Date | null; set: Date | null; noon: Date } {
  const rad = Math.PI / 180
  const JD = date.getTime() / 86400000 + 2440587.5
  const n = JD - 2451545.0 + 0.0008
  const Jstar = n - lng / 360
  const M = ((357.5291 + 0.98560028 * Jstar) % 360 + 360) % 360
  const Mrad = M * rad
  const C =
    1.9148 * Math.sin(Mrad) +
    0.02 * Math.sin(2 * Mrad) +
    0.0003 * Math.sin(3 * Mrad)
  const lambda = ((M + C + 180 + 102.9372) % 360 + 360) % 360
  const Jtransit =
    2451545.0 +
    Jstar +
    0.0053 * Math.sin(Mrad) -
    0.0069 * Math.sin(2 * lambda * rad)
  const sinDec = Math.sin(lambda * rad) * Math.sin(23.4397 * rad)
  const cosDec = Math.cos(Math.asin(sinDec))
  const noon = new Date((Jtransit - 2440587.5) * 86400000)
  const cosH =
    (Math.sin(angle * rad) - Math.sin(lat * rad) * sinDec) /
    (Math.cos(lat * rad) * cosDec)
  if (cosH < -1 || cosH > 1) return { rise: null, set: null, noon }
  const H = Math.acos(cosH) * (180 / Math.PI)
  const jdToDate = (jd: number) => new Date((jd - 2440587.5) * 86400000)
  return {
    rise: jdToDate(Jtransit - H / 360),
    set: jdToDate(Jtransit + H / 360),
    noon,
  }
}

/** Compute sun elevation (altitude) and azimuth at a specific moment. */
function calcSunPosition(
  date: Date,
  lat: number,
  lng: number,
): { elevation: number; azimuth: number } {
  const rad = Math.PI / 180
  const JD = date.getTime() / 86400000 + 2440587.5
  const n = JD - 2451545.0 + 0.0008
  const Jstar = n - lng / 360
  const M = ((357.5291 + 0.98560028 * Jstar) % 360 + 360) % 360
  const Mrad = M * rad
  const C = 1.9148 * Math.sin(Mrad) + 0.02 * Math.sin(2 * Mrad) + 0.0003 * Math.sin(3 * Mrad)
  const lambda = ((M + C + 180 + 102.9372) % 360 + 360) % 360
  const sinDec = Math.sin(lambda * rad) * Math.sin(23.4397 * rad)
  const cosDec = Math.cos(Math.asin(sinDec))
  // Hour angle
  const Jtransit = 2451545.0 + Jstar + 0.0053 * Math.sin(Mrad) - 0.0069 * Math.sin(2 * lambda * rad)
  const H = ((JD - Jtransit) * 360) // hours * 15 → degrees (approx)
  const Hrad = H * rad
  const sinAlt = Math.sin(lat * rad) * sinDec + Math.cos(lat * rad) * cosDec * Math.cos(Hrad)
  const elevation = Math.asin(Math.max(-1, Math.min(1, sinAlt))) / rad
  const cosAz = (sinDec - Math.sin(lat * rad) * sinAlt) / (Math.cos(lat * rad) * Math.cos(Math.asin(sinAlt)))
  const azRaw = Math.acos(Math.max(-1, Math.min(1, cosAz))) / rad
  const azimuth = H > 0 ? 360 - azRaw : azRaw
  return { elevation: +elevation.toFixed(1), azimuth: +azimuth.toFixed(1) }
}

function formatTime(date: Date | null, tz: string): string {
  if (!date) return '—'
  try {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: tz,
    })
  } catch {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  }
}

function formatTimeFull(date: Date | null, tz: string): string {
  if (!date) return '—'
  try {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: tz,
    })
  } catch {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- preserved from original
function timeDiffMinutes(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / 60000
}

// ── SVG label helper ──────────────────────────────────────────────────────────

function LabelBg({ x, y, text, anchor = 'middle', className = '' }: {
  x: number; y: number; text: string; anchor?: string; className?: string
}) {
  const estimatedWidth = text.length * 7 + 12
  const tx = anchor === 'end' ? x - estimatedWidth : anchor === 'start' ? x : x - estimatedWidth / 2
  return (
    <g>
      <rect x={tx} y={y - 13} width={estimatedWidth} height={18} rx={4}
            className="fill-background/90 stroke-border" strokeWidth={0.5} />
      <text x={x} y={y} textAnchor={anchor as 'start' | 'middle' | 'end'}
            className={`fill-foreground text-sm font-medium ${className}`}>
        {text}
      </text>
    </g>
  )
}

// ── Copy button ───────────────────────────────────────────────────────────────

function CopyBtn({ value }: { value: string }) {
  return (
    <button
      type="button"
      aria-label="Copy value"
      className="text-muted-foreground/40 hover:text-muted-foreground transition-colors p-0.5 shrink-0"
      onClick={() => {
        try {
          navigator.clipboard.writeText(value)
        } catch {
          /* clipboard unavailable */
        }
        toast.success(`${value} copied`)
      }}
    >
      <Copy className="w-3 h-3" />
    </button>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SunriseSunsetTool() {
  const auth = useDesktopAuth()
  const userId = auth.localUser?.id ?? auth.cloudUser?.id ?? null

  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [lat, setLat] = useState(39.86)
  const [lng, setLng] = useState(-104.67)
  const [locationName, setLocationName] = useState('Denver, CO')
  const [tz, setTz] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  )

  // ── Location search state ──────────────────────────────────────────────
  const [locQuery, setLocQuery] = useState('Denver, CO')
  const [locResults, setLocResults] = useState<Array<{ label: string; lat: number; lng: number; tz?: string; type: 'airport' | 'city' }>>([])
  const [locSearching, setLocSearching] = useState(false)
  const [showLocResults, setShowLocResults] = useState(false)
  const locRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (locRef.current && !locRef.current.contains(e.target as Node)) setShowLocResults(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const searchLocation = useCallback(async (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) { setLocResults([]); return }
    setLocSearching(true)
    try {
      const results: Array<{ label: string; lat: number; lng: number; tz?: string; type: 'airport' | 'city' }> = []

      // 1. Check if it's lat,lng format (e.g. "39.86, -104.67" or "39.86 -104.67")
      const llMatch = trimmed.match(/^(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)$/)
      if (llMatch) {
        const latVal = parseFloat(llMatch[1])
        const lngVal = parseFloat(llMatch[2])
        if (latVal >= -90 && latVal <= 90 && lngVal >= -180 && lngVal <= 180) {
          results.push({ label: `${latVal.toFixed(4)}, ${lngVal.toFixed(4)}`, lat: latVal, lng: lngVal, type: 'city' })
        }
      }

      // 2. Search airports via existing API
      if (results.length === 0) {
        try {
          const res = await fetch(`/api/airports?q=${encodeURIComponent(trimmed)}&limit=5&country=`)
          const data = await res.json()
          if (Array.isArray(data.airports)) {
            for (const a of data.airports.slice(0, 5)) {
              results.push({
                label: `${a.icao}${a.iata ? ` (${a.iata})` : ''} — ${a.name}`,
                lat: a.latitude,
                lng: a.longitude,
                type: 'airport',
              })
            }
          }
        } catch { /* airport API unavailable */ }
      }

      // 3. If no airport results, try city geocoding via Nominatim
      if (results.length === 0) {
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(trimmed)}&format=json&limit=5`, {
            headers: { 'User-Name': 'next-dashboard-aviation' },
          })
          const data = await res.json()
          if (Array.isArray(data)) {
            for (const place of data.slice(0, 5)) {
              results.push({
                label: place.display_name?.length > 60 ? place.display_name.slice(0, 60) + '…' : place.display_name,
                lat: parseFloat(place.lat),
                lng: parseFloat(place.lon),
                type: 'city',
              })
            }
          }
        } catch { /* geocoding unavailable */ }
      }

      setLocResults(results)
      setShowLocResults(results.length > 0)
    } finally {
      setLocSearching(false)
    }
  }, [])

  // Debounced search
  const locTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleLocInput = useCallback((val: string) => {
    setLocQuery(val)
    setShowLocResults(false)
    if (locTimerRef.current) clearTimeout(locTimerRef.current)
    locTimerRef.current = setTimeout(() => searchLocation(val), 350)
  }, [searchLocation])

  const pickLocation = useCallback((r: { label: string; lat: number; lng: number; type: 'airport' | 'city' }) => {
    setLat(r.lat)
    setLng(r.lng)
    setLocationName(r.label)
    setLocQuery(r.label)
    setShowLocResults(false)
  }, [])

  const handleLocKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && locResults.length > 0) {
      pickLocation(locResults[0])
    } else if (e.key === 'Escape') {
      setShowLocResults(false)
    }
  }, [locResults, pickLocation])

  const [result, setResult] = useState<{
    civilDawn: Date | null
    sunrise: Date | null
    solarNoon: Date
    sunset: Date | null
    civilDusk: Date | null
    dayLength: string
    dayLengthMin: number
  } | null>(null)

  // Live countdown state (refreshes every 60s)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  // ── SVG sun arc coordinates (viewBox 800×340) ──────────────────────────

  const sunriseX = 80
  const sunsetX = 720
  const centerX = (sunriseX + sunsetX) / 2
  const arcWidth = sunsetX - sunriseX
  const peakHeight = 200
  const horizonY = 250

  // ── Animation state ────────────────────────────────────────────────────
  const [isAnimating, setIsAnimating] = useState(false)
  const animTRef = useRef(0) // raw animation value (ref for smooth updates)
  const [animRender, setAnimRender] = useState(0) // React state at ~30fps for UI
  const [animSpeed, setAnimSpeed] = useState(8) // seconds for full cycle
  const animStartRef = useRef<number | null>(null)
  const animT0Ref = useRef(0) // starting t when play/pause pressed
  const rafRef = useRef<number>(0)
  const animLastRenderRef = useRef(0)
  const sunGroupRef = useRef<SVGGElement>(null)

  // Derive simulated time from animRender (updated at 30fps)
  const simulatedTime = useMemo(() => {
    if (!result?.sunrise || !result?.sunset) return null
    const sunriseMs = result.sunrise.getTime()
    const sunsetMs = result.sunset.getTime()
    const simMs = sunriseMs + animRender * (sunsetMs - sunriseMs)
    return new Date(simMs)
  }, [animRender, result])

  const tick = useCallback((ts: number) => {
    if (animStartRef.current === null) animStartRef.current = ts
    const elapsed = (ts - animStartRef.current) / 1000 // seconds
    const progress = animT0Ref.current + elapsed / animSpeed
    const clamped = Math.min(1, Math.max(0, progress))

    // Direct DOM update for smooth sun movement (every frame, no React re-render)
    animTRef.current = clamped
    if (sunGroupRef.current) {
      const x = sunriseX + clamped * arcWidth
      const y = horizonY - 4 * peakHeight * clamped * (1 - clamped)
      sunGroupRef.current.style.transform = `translate(${x}px, ${y}px)`
    }

    // React state update for UI elements (every ~33ms ≈ 30fps)
    if (ts - animLastRenderRef.current > 33) {
      animLastRenderRef.current = ts
      setAnimRender(clamped)
    }

    if (progress >= 1) {
      setAnimRender(1)
      animTRef.current = 1
      setIsAnimating(false)
      animStartRef.current = null
      if (sunGroupRef.current) {
        const x = sunriseX + arcWidth
        const y = horizonY
        sunGroupRef.current.style.transform = `translate(${x}px, ${y}px)`
      }
      return
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [animSpeed, sunriseX, arcWidth, horizonY, peakHeight])

  useEffect(() => {
    if (isAnimating) {
      animStartRef.current = null
      animLastRenderRef.current = 0
      rafRef.current = requestAnimationFrame(tick)
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [isAnimating, tick])

  const handlePlayPause = useCallback(() => {
    if (isAnimating) {
      // Pause: record current animT0
      animT0Ref.current = animTRef.current
      setIsAnimating(false)
    } else {
      // Play: start from current animT
      if (animTRef.current >= 1) {
        // If at end, restart from beginning
        animTRef.current = 0
        setAnimRender(0)
        animT0Ref.current = 0
      } else {
        animT0Ref.current = animTRef.current
      }
      setIsAnimating(true)
    }
  }, [isAnimating])

  const handleReset = useCallback(() => {
    setIsAnimating(false)
    animTRef.current = 0
    setAnimRender(0)
    animStartRef.current = null
    animT0Ref.current = 0
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (sunGroupRef.current) {
      sunGroupRef.current.style.transform = `translate(${sunriseX}px, ${horizonY}px)`
    }
  }, [sunriseX, horizonY])

  // ── Hourly solar + weather data ─────────────────────────────────────────
  interface HourlyRow {
    hour: number
    timeLabel: string
    elevation: number
    azimuth: number
    phase: string
    phaseBg: string
    phaseColor: string
    temp: string
    tempColor: string
    wind: string
    windIcon: string
    thermal: string
    thermalColor: string
    visibility: string
    visColor: string
    uvIndex: string
    uvColor: string
    conditions: string
    condColor: string
    bestFly: boolean
    goldenHour: boolean
  }

  const hourlyData = useMemo<HourlyRow[]>(() => {
    if (!result || !result.sunrise || !result.sunset) return []
    const d = new Date(date + 'T00:00:00Z')
    const tzOffset = getUtcOffsetHours(tz)
    const sunriseMs = result.sunrise.getTime()
    const sunsetMs = result.sunset.getTime()
    const civilDawnMs = result.civilDawn?.getTime() ?? sunriseMs
    const civilDuskMs = result.civilDusk?.getTime() ?? sunsetMs
    const dayLenHrs = (sunsetMs - sunriseMs) / 3_600_000

    // Rough temperature model: low at dawn, peaks ~2pm, drops after sunset
    // Base temps vary by latitude
    const baseTempC = Math.round(28 - Math.abs(lat) * 0.3) // equatorial ~28, 60° ~10
    const rows: HourlyRow[] = []
    for (let h = 0; h < 24; h++) {
      const utcHour = ((h - tzOffset) % 24 + 24) % 24
      const hourDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), utcHour, 0, 0))
      const pos = calcSunPosition(hourDate, lat, lng)
      const hourMs = hourDate.getTime()

      // Phase
      let phase: string, phaseBg: string, phaseColor: string
      const isNight = hourMs < civilDawnMs || hourMs > civilDuskMs
      const isTwilight = !isNight && (hourMs < sunriseMs || hourMs > sunsetMs)
      const isDay = !isNight && !isTwilight
      if (isNight) { phase = 'Night'; phaseBg = 'bg-slate-900/40'; phaseColor = 'text-slate-400' }
      else if (isTwilight) { phase = 'Twilight'; phaseBg = 'bg-purple-900/30'; phaseColor = 'text-purple-400' }
      else { phase = 'Day'; phaseBg = ''; phaseColor = 'text-amber-400' }

      // Golden hour (first/last hour of sunlight)
      const sunriseHour = new Date(sunriseMs).getUTCHours() + tzOffset
      const sunsetHour = new Date(sunsetMs).getUTCHours() + tzOffset
      const goldenHour = isDay && (h === Math.floor(sunriseHour) || h === Math.ceil(sunsetHour) - 1 ||
        h === Math.floor(((sunsetMs - civilDawnMs) / 3_600_000) + tzOffset) % 24)

      // Temperature estimate (°C): peaks ~2h after solar noon
      const solarNoonH = new Date(result.solarNoon.getTime()).getUTCHours() + tzOffset
      const tempPeakH = solarNoonH + 2
      const hoursFromPeak = Math.abs(h - tempPeakH)
      const tempDrop = hoursFromPeak * hoursFromPeak * 0.8 // parabolic cooling
      const nightDrop = isNight ? 6 : 0
      const tempC = Math.round(baseTempC + 12 - tempDrop - nightDrop)
      const tempColor = tempC > 30 ? 'text-red-400' : tempC > 20 ? 'text-amber-400' : tempC > 10 ? 'text-emerald-400' : 'text-blue-400'

      // Wind estimate: calm at dawn, builds with thermals midday, calm at dusk
      let wind: string, windIcon: string
      if (isNight || isTwilight) { wind = 'Calm'; windIcon = '🍃' }
      else if (pos.elevation < 15) { wind = '5-10 kt'; windIcon = '🌬' }
      else if (pos.elevation < 35) { wind = '8-15 kt'; windIcon = '💨' }
      else { wind = '10-18 kt'; windIcon = '💨' }

      // Thermal activity: builds after sunrise, peaks early afternoon, gone by sunset
      let thermal: string, thermalColor: string
      const hoursSinceSunrise = (hourMs - sunriseMs) / 3_600_000
      if (isNight || isTwilight) { thermal = 'None'; thermalColor = 'text-slate-500' }
      else if (hoursSinceSunrise < 1.5) { thermal = 'Developing'; thermalColor = 'text-yellow-300' }
      else if (hoursSinceSunrise < 3) { thermal = 'Active'; thermalColor = 'text-orange-400' }
      else if (hoursSinceSunrise < dayLenHrs - 2) { thermal = 'Strong'; thermalColor = 'text-red-400' }
      else if (hoursSinceSunrise < dayLenHrs - 0.5) { thermal = 'Weakening'; thermalColor = 'text-yellow-300' }
      else { thermal = 'Dissipating'; thermalColor = 'text-slate-400' }

      // Visibility
      let visibility: string, visColor: string
      if (isNight) { visibility = 'Good'; visColor = 'text-emerald-400' }
      else if (isTwilight) { visibility = 'Reduced'; visColor = 'text-amber-300' }
      else if (h >= 5 && h <= 7) { visibility = 'Fog risk'; visColor = 'text-red-400' }
      else if (pos.elevation > 20) { visibility = 'Good'; visColor = 'text-emerald-400' }
      else { visibility = 'Good'; visColor = 'text-emerald-400' }

      // UV index
      let uvIndex: string, uvColor: string
      if (pos.elevation <= 0) { uvIndex = '0'; uvColor = 'text-slate-500' }
      else {
        const uv = Math.round(Math.max(0, (pos.elevation / 60) * 11))
        uvIndex = `${uv}`
        uvColor = uv >= 8 ? 'text-red-400' : uv >= 5 ? 'text-amber-400' : uv >= 3 ? 'text-yellow-300' : 'text-emerald-400'
      }

      // Conditions summary
      let conditions: string, condColor: string
      if (isNight) { conditions = 'Clear night'; condColor = 'text-slate-400' }
      else if (isTwilight && hourMs < sunriseMs) { conditions = 'Pre-dawn calm'; condColor = 'text-purple-400' }
      else if (isTwilight) { conditions = 'Dusk settling'; condColor = 'text-purple-400' }
      else if (pos.elevation < 15) { conditions = 'Low sun angle'; condColor = 'text-amber-300' }
      else if (pos.elevation > 45) { conditions = 'High sun'; condColor = 'text-amber-400' }
      else { conditions = 'Good conditions'; condColor = 'text-emerald-400' }

      // Best flying: VFR day, moderate thermals, good visibility, not too early/late
      const bestFly = isDay && pos.elevation > 10 && pos.elevation < 50 &&
        hoursSinceSunrise > 2 && hoursSinceSunrise < dayLenHrs - 1.5

      const timeLabel = `${String(h).padStart(2, '0')}:00`
      rows.push({
        hour: h, timeLabel, elevation: pos.elevation, azimuth: pos.azimuth,
        phase, phaseBg, phaseColor,
        temp: `${tempC}°`, tempColor,
        wind, windIcon,
        thermal, thermalColor,
        visibility, visColor,
        uvIndex, uvColor,
        conditions, condColor,
        bestFly, goldenHour,
      })
    }
    return rows
  }, [result, date, lat, lng, tz])

  // ── Table weather filter ────────────────────────────────────────────────
  type WeatherFilter = 'all' | 'vfr' | 'marginal' | 'night' | 'best'
  const [weatherFilter, setWeatherFilter] = useState<WeatherFilter>('all')
  const [detailsOpen, setDetailsOpen] = useState(false)

  const filteredHourlyData = useMemo(() => {
    if (weatherFilter === 'all') return hourlyData
    return hourlyData.filter((row) => {
      switch (weatherFilter) {
        case 'vfr': return row.phase === 'Day' && row.elevation > 6
        case 'marginal': return row.phase === 'Twilight' || (row.phase === 'Day' && row.elevation <= 15 && row.elevation > 0)
        case 'night': return row.phase === 'Night'
        case 'best': return row.bestFly
        default: return true
      }
    })
  }, [hourlyData, weatherFilter])

  const geolocate = useCallback(() => {
    navigator.geolocation?.getCurrentPosition((pos) => {
      const newLat = +(pos.coords.latitude.toFixed(4))
      const newLng = +(pos.coords.longitude.toFixed(4))
      setLat(newLat)
      setLng(newLng)
      setLocationName(`GPS: ${newLat}, ${newLng}`)
      setLocQuery(`${newLat}, ${newLng}`)
      toast.success('Location updated')
    })
  }, [])

  const calculate = useCallback(() => {
    const d = new Date(date + 'T12:00:00Z')
    const sun = calcSunAngle(d, lat, lng, -0.8333)
    const twi = calcSunAngle(d, lat, lng, -6)
    let dayLength = '—'
    let dayLengthMin = 0
    if (sun.rise && sun.set) {
      const mins = Math.round((sun.set.getTime() - sun.rise.getTime()) / 60000)
      dayLengthMin = mins
      dayLength = `${Math.floor(mins / 60)}h ${mins % 60}m`
    }
    setResult({
      civilDawn: twi.rise,
      sunrise: sun.rise,
      solarNoon: sun.noon,
      sunset: sun.set,
      civilDusk: twi.set,
      dayLength,
      dayLengthMin,
    })
  }, [date, lat, lng])

  // Auto-calculate on mount and when inputs change
  useEffect(() => {
    calculate()
  }, [calculate])

  // History logging (debounced 1s)
  useEffect(() => {
    if (!result) return
    const t = setTimeout(() => {
      try {
        void logToolUse(
          userId ?? '',
          'sun',
          { date, lat, lng, tz },
          {
            sunrise: formatTime(result.sunrise, tz),
            sunset: formatTime(result.sunset, tz),
            dayLength: result.dayLength,
          },
        )
      } catch {
        /* silent */
      }
    }, 1000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result])

  // ── Derived solar data for SVG & countdown ──────────────────────────────

  const solar = useMemo(() => {
    if (!result) return null

    const sunrise = result.sunrise
    const sunset = result.sunset
    const civilDawn = result.civilDawn
    const civilDusk = result.civilDusk
    const solarNoon = result.solarNoon

    // Night currency boundaries
    let earliestNight = '—'
    let latestNight = '—'
    if (sunrise && sunset) {
      const earliestDate = new Date(sunrise.getTime() - 3600_000)
      const latestDate = new Date(sunset.getTime() + 3600_000)
      earliestNight = formatTime(earliestDate, tz)
      latestNight = formatTime(latestDate, tz)
    }

    // Current sun position parameter t ∈ [0, 1]
    let t = -1
    let isNight = false
    if (sunrise && sunset) {
      const sunriseMs = sunrise.getTime()
      const sunsetMs = sunset.getTime()
      const nowMs = now.getTime()
      if (nowMs < sunriseMs) {
        t = 0
        isNight = true
      } else if (nowMs > sunsetMs) {
        t = 1
        isNight = true
      } else {
        t = (nowMs - sunriseMs) / (sunsetMs - sunriseMs)
      }
    }

    // Live countdown
    let countdownText = ''
    const nowMs = now.getTime()
    if (sunrise && sunset) {
      const sunriseMs = sunrise.getTime()
      const sunsetMs = sunset.getTime()
      if (nowMs < sunriseMs) {
        const diffMin = Math.round((sunriseMs - nowMs) / 60_000)
        countdownText = `Sunrise in ${Math.floor(diffMin / 60)}h ${diffMin % 60}m`
      } else if (nowMs < sunsetMs) {
        const diffMin = Math.round((sunsetMs - nowMs) / 60_000)
        countdownText = `Sunset in ${Math.floor(diffMin / 60)}h ${diffMin % 60}m`
      } else {
        // After sunset — show countdown to next sunrise (approximate: same time tomorrow)
        const nextSunrise = new Date(sunriseMs + 86400_000)
        const diffMin = Math.round((nextSunrise.getTime() - nowMs) / 60_000)
        countdownText = `Sunrise in ${Math.floor(diffMin / 60)}h ${diffMin % 60}m`
      }
    }

    return {
      earliestNight,
      latestNight,
      t,
      isNight,
      countdownText,
      sunriseTime: formatTime(sunrise, tz),
      sunsetTime: formatTime(sunset, tz),
      civilDawnTime: formatTime(civilDawn, tz),
      civilDuskTime: formatTime(civilDusk, tz),
      solarNoonTime: formatTime(solarNoon, tz),
      sunriseDate: sunrise,
      sunsetDate: sunset,
      civilDawnDate: civilDawn,
      civilDuskDate: civilDusk,
    }
  }, [result, now, tz])

  // ── Route weather + legality planner ────────────────────────────────────
  type FlightModel = 'vfr-day' | 'vfr-night' | 'ifr' | 'ifr-night'
  const FLIGHT_MODELS: { id: FlightModel; label: string; desc: string }[] = [
    { id: 'vfr-day', label: 'VFR Day', desc: 'Daylight VFR — basic pilot certificate' },
    { id: 'vfr-night', label: 'VFR Night', desc: 'Night VFR — requires night endorsement + 3 full-stop landings' },
    { id: 'ifr', label: 'IFR', desc: 'Instrument Flight — requires instrument rating + current' },
    { id: 'ifr-night', label: 'IFR Night', desc: 'Night IFR — instrument rating + night + currency' },
  ]

  const [flightModel, setFlightModel] = useState<FlightModel>('vfr-day')
  const [routeHeading, setRouteHeading] = useState(0)
  const [routeDistance, setRouteDistance] = useState(100) // nm
  const [routeAircraft, setRouteAircraft] = useState('C172')
  const [routeResults, setRouteResults] = useState<{
    departure: string
    arrival: string
    metar: { icao: string; category?: string; wind?: string; vis?: string; ceiling?: string; rawText?: string } | null
    legal: boolean
    legalReasons: string[]
    advisory: string[]
    goNoGo: 'go' | 'caution' | 'no-go'
  } | null>(null)
  const [routeLoading, setRouteLoading] = useState(false)

  function calcDestination(lat: number, lng: number, headingDeg: number, distNm: number) {
    const R = 3440.065
    const brng = headingDeg * Math.PI / 180
    const lat1 = lat * Math.PI / 180
    const lng1 = lng * Math.PI / 180
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(distNm / R) + Math.cos(lat1) * Math.sin(distNm / R) * Math.cos(brng))
    const lng2 = lng1 + Math.atan2(Math.sin(brng) * Math.sin(distNm / R) * Math.cos(lat1), Math.cos(distNm / R) - Math.sin(lat1) * Math.sin(lat2))
    return { lat: lat2 * 180 / Math.PI, lng: lng2 * 180 / Math.PI }
  }

  const runRouteCheck = useCallback(async () => {
    setRouteLoading(true)
    try {
      const dest = calcDestination(lat, lng, routeHeading, routeDistance)
      let depIcao = '', arrIcao = ''
      try {
        const depRes = await fetch(`/api/airports?q=${lat.toFixed(1)},${lng.toFixed(1)}&limit=1&country=`)
        const depData = await depRes.json()
        depIcao = depData.airports?.[0]?.icao ?? ''
      } catch { /* */ }
      try {
        const arrRes = await fetch(`/api/airports?q=${dest.lat.toFixed(1)},${dest.lng.toFixed(1)}&limit=1&country=`)
        const arrData = await arrRes.json()
        arrIcao = arrData.airports?.[0]?.icao ?? ''
      } catch { /* */ }

      let metar: { icao: string; category?: string; wind?: string; vis?: string; ceiling?: string; rawText?: string } | null = null
      if (arrIcao) {
        try {
          const m = await fetchMetar(arrIcao)
          metar = {
            icao: m.icao,
            category: m.flightCategory,
            wind: m.windSpeedKts != null ? `${m.windDirDeg ?? 'V'}/${m.windSpeedKts}${m.windGustKts ? `G${m.windGustKts}` : ''}kt` : undefined,
            vis: m.visibilitySm != null ? `${m.visibilitySm}SM` : undefined,
            ceiling: m.ceilingFt != null ? `${m.ceilingFt}ft` : undefined,
            rawText: m.rawText,
          }
        } catch { /* */ }
      }

      const legalReasons: string[] = [], advisory: string[] = []
      const isNight = solar?.isNight ?? true
      const cat = metar?.category?.toUpperCase()

      if (flightModel === 'vfr-day') {
        if (isNight) legalReasons.push('VFR Day requires daylight')
        if (cat === 'IFR' || cat === 'LIFR') legalReasons.push(`${cat} — VFR not legal`)
        if (cat === 'MVFR') advisory.push('Marginal VFR')
      }
      if (flightModel === 'vfr-night') {
        if (!isNight) advisory.push('Currently daylight — plan may differ')
        if (cat === 'IFR' || cat === 'LIFR') legalReasons.push(`${cat} — VFR not legal`)
        advisory.push('Requires night endorsement (3 full-stop in 90 days)')
      }
      if (flightModel === 'ifr' || flightModel === 'ifr-night') {
        advisory.push('Requires: Instrument rating, IPC current, approach plates')
        if (flightModel === 'ifr-night') advisory.push('Ensure night currency + alternate minimums')
      }

      const windMatch = metar?.wind?.match(/(\d+)/)
      if (windMatch) {
        const ws = parseInt(windMatch[1])
        if (ws > 30) legalReasons.push(`Wind ${ws}kt exceeds safe limits for ${routeAircraft}`)
        else if (ws > 20) advisory.push(`Wind ${ws}kt — moderate turbulence`)
      }
      const visMatch = metar?.vis?.match(/([\d.]+)/)
      if (visMatch) {
        const v = parseFloat(visMatch[1])
        if (flightModel.startsWith('vfr') && v < 3) legalReasons.push(`Vis ${v}SM below VFR mins`)
        if (flightModel.startsWith('ifr') && v < 1) legalReasons.push(`Vis ${v}SM below IFR mins`)
      }
      const ceilMatch = metar?.ceiling?.match(/(\d+)/)
      if (ceilMatch) {
        const c = parseInt(ceilMatch[1])
        if (flightModel.startsWith('vfr') && c < 1000) legalReasons.push(`Ceiling ${c}ft below VFR mins`)
        if (flightModel.startsWith('ifr') && c < 500) advisory.push(`Ceiling ${c}ft — approach concerns`)
      }

      setRouteResults({
        departure: depIcao || `${lat.toFixed(2)}, ${lng.toFixed(2)}`,
        arrival: arrIcao || `${dest.lat.toFixed(2)}, ${dest.lng.toFixed(2)}`,
        metar, legal: legalReasons.length === 0,
        legalReasons, advisory,
        goNoGo: legalReasons.length > 0 ? 'no-go' : advisory.length > 1 ? 'caution' : 'go',
      })
    } finally { setRouteLoading(false) }
  }, [lat, lng, routeHeading, routeDistance, routeAircraft, flightModel, solar])

  // Path points for the arc
  const pathPoints: string[] = []
  for (let x = sunriseX; x <= sunsetX; x += 2) {
    const t = (x - sunriseX) / arcWidth
    const y = horizonY - 4 * peakHeight * t * (1 - t)
    pathPoints.push(`${x},${y}`)
  }

  // Effective t: use animRender when animating or paused mid-flight, else real-time
  const useAnimPosition = isAnimating || (animRender > 0 && animRender < 1)
  const effectiveT = useAnimPosition ? animRender : (solar?.t ?? -1)

  // Dynamic sky colors based on sun position
  const skyColors = useMemo(() => {
    const t = effectiveT
    if (t < 0 || t > 1) {
      // Night
      return { top: '#050a15', mid: '#0a1628', low: '#111d3a', horizon: '#1a2744' }
    }
    if (t < 0.06) {
      // Pre-dawn
      return { top: '#0a1628', mid: '#1e1b4b', low: '#4c1d95', horizon: '#6d28d9' }
    }
    if (t < 0.14) {
      // Dawn — warm oranges
      return { top: '#1e3a5f', mid: '#5b7fb5', low: '#d97706', horizon: '#f59e0b' }
    }
    if (t < 0.3) {
      // Morning — fresh blue
      return { top: '#0369a1', mid: '#0ea5e9', low: '#38bdf8', horizon: '#7dd3fc' }
    }
    if (t < 0.7) {
      // Midday — bright blue
      return { top: '#0c4a6e', mid: '#0284c7', low: '#38bdf8', horizon: '#7dd3fc' }
    }
    if (t < 0.86) {
      // Afternoon — warming
      return { top: '#0369a1', mid: '#0ea5e9', low: '#fbbf24', horizon: '#fde68a' }
    }
    if (t < 0.94) {
      // Dusk — orange/purple
      return { top: '#1e1b4b', mid: '#6d28d9', low: '#d97706', horizon: '#f59e0b' }
    }
    // Post-dusk
    return { top: '#0a1628', mid: '#1e1b4b', low: '#4c1d95', horizon: '#6d28d9' }
  }, [effectiveT])

  // Current sun position on the arc
  const sunPosX =
    effectiveT >= 0 && effectiveT <= 1
      ? sunriseX + effectiveT * arcWidth
      : centerX
  const sunPosY =
    effectiveT >= 0 && effectiveT <= 1
      ? horizonY - 4 * peakHeight * effectiveT * (1 - effectiveT)
      : horizonY

  // Civil twilight x positions (below horizon, offset from sunrise/sunset)
  const civilDawnX =
    solar?.civilDawnDate && result?.sunrise
      ? sunriseX -
        ((result.sunrise.getTime() - solar.civilDawnDate.getTime()) /
          (result.sunrise.getTime() -
            (result.civilDawn?.getTime() ?? result.sunrise.getTime()))) *
          40
      : sunriseX - 40
  const civilDuskX =
    solar?.civilDuskDate && result?.sunset
      ? sunsetX +
        ((solar.civilDuskDate.getTime() - result.sunset.getTime()) /
          ((result.civilDusk?.getTime() ?? result.sunset.getTime()) -
            result.sunset.getTime())) *
          40
      : sunsetX + 40

  // Clamp civil twilight positions
  const civilDawnXClamped = Math.max(20, Math.min(sunriseX - 5, civilDawnX))
  const civilDuskXClamped = Math.min(780, Math.max(sunsetX + 5, civilDuskX))

  // ── Scroll hint auto-hide ─────────────────────────────────────────────
  const [showScrollHint, setShowScrollHint] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setShowScrollHint(false), 4000)
    return () => clearTimeout(t)
  }, [])

  return (
    <ToolShell
      title="Sunrise / Sunset"
      description="Civil twilight, sunrise, solar noon, and sunset with live sun-arc visualization and hourly conditions."
      notesUserId={userId}
      notesTool="sun"
    >
      <div className="flex flex-col gap-4">

        {/* ── Top bar: compact inputs row ──────────────────────────────── */}
        <div className="flex items-end gap-3 flex-wrap">
          {/* Date */}
          <div className="w-36">
            <Label className="text-[10px] text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" />Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-0.5 h-8 text-xs" />
          </div>
          {/* Location search */}
          <div ref={locRef} className="relative flex-1 min-w-[200px] max-w-md">
            <Label className="text-[10px] text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" />Location</Label>
            <div className="relative mt-0.5">
              <Input value={locQuery} onChange={(e) => handleLocInput(e.target.value)} onFocus={() => { if (locResults.length > 0) setShowLocResults(true) }} onKeyDown={handleLocKeyDown} placeholder="City, airport, or lat,lng" className="h-8 text-xs pl-7" />
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              {locSearching && <div className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />}
            </div>
            {showLocResults && locResults.length > 0 && (
              <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-card shadow-lg max-h-48 overflow-y-auto">
                {locResults.map((r, i) => (
                  <button key={i} className="w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors flex items-center gap-2 first:rounded-t-lg last:rounded-b-lg" onMouseDown={() => pickLocation(r)}>
                    {r.type === 'airport' ? <Plane className="w-3 h-3 shrink-0 text-primary" /> : <MapPin className="w-3 h-3 shrink-0 text-muted-foreground" />}
                    <span className="truncate">{r.label}</span>
                  </button>
                ))}
              </div>
            )}
            <p className="text-[9px] text-muted-foreground/50 mt-0.5 font-mono">{lat.toFixed(4)}, {lng.toFixed(4)}</p>
          </div>
          {/* Timezone */}
          <div className="w-48">
            <Label className="text-[10px] text-muted-foreground">Timezone</Label>
            <select value={TIMEZONES.includes(tz) ? tz : ''} onChange={(e) => { if (e.target.value) setTz(e.target.value) }} className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs mt-0.5">
              {!TIMEZONES.includes(tz) && <option value="" disabled>{tz}</option>}
              {TIMEZONES.map((zone: string) => <option key={zone} value={zone}>{tzLabel(zone)}</option>)}
            </select>
          </div>
          {/* GPS */}
          <Button variant="outline" size="sm" onClick={geolocate} className="h-8 px-2.5 gap-1.5 text-xs shrink-0">
            <MapPin className="w-3 h-3" />GPS
          </Button>
        </div>

        {/* ── Sun arc (full width, tall) ──────────────────────────────── */}
        <div className="w-full h-[420px] rounded-xl bg-muted/30 p-3 relative overflow-hidden">
          {result && solar ? (
            <svg viewBox="0 0 800 340" className="w-full h-full" preserveAspectRatio="xMidYMid meet" aria-label="Sun arc">
              <defs>
                {/* Dynamic sky gradient */}
                <linearGradient id="ss-sky" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={skyColors.top} />
                  <stop offset="40%" stopColor={skyColors.mid} />
                  <stop offset="75%" stopColor={skyColors.low} />
                  <stop offset="100%" stopColor={skyColors.horizon} stopOpacity={0.7} />
                </linearGradient>
                <linearGradient id="ss-arcFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="ss-ground" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1a1a2e" stopOpacity={0.85} />
                  <stop offset="100%" stopColor="#0f0f1a" />
                </linearGradient>
                <radialGradient id="ss-sunGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.5} />
                  <stop offset="50%" stopColor="#fbbf24" stopOpacity={0.12} />
                  <stop offset="100%" stopColor="#fbbf24" stopOpacity={0} />
                </radialGradient>
                <radialGradient id="ss-moonGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#e2e8f0" stopOpacity={0.3} />
                  <stop offset="60%" stopColor="#e2e8f0" stopOpacity={0.08} />
                  <stop offset="100%" stopColor="#e2e8f0" stopOpacity={0} />
                </radialGradient>
                <linearGradient id="ss-twiDawn" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#7c3aed" stopOpacity={0} />
                  <stop offset="100%" stopColor="#7c3aed" stopOpacity={0.35} />
                </linearGradient>
                <linearGradient id="ss-twiDusk" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#7c3aed" stopOpacity={0} />
                </linearGradient>
              </defs>

              {/* Sky */}
              <rect x={0} y={0} width={800} height={horizonY} fill="url(#ss-sky)" />
              {/* Ground */}
              <rect x={0} y={horizonY} width={800} height={340 - horizonY} fill="url(#ss-ground)" />

              {/* ── Stars (visible when sky is dark) ──────────────────── */}
              {(effectiveT < 0.08 || effectiveT > 0.92 || effectiveT < 0 || effectiveT > 1) && (
                <g>
                  {[[90,30],[180,18],[280,42],[370,15],[480,38],[560,22],[650,45],[720,28],[130,55],[310,60],[450,48],[600,35],[240,50],[530,12],[700,55],[420,8],[160,38],[590,65],[350,28],[750,18]].map(([sx, sy], i) => (
                    <circle key={`star-${i}`} cx={sx} cy={sy} r={0.8 + (i % 3) * 0.4} fill="#e2e8f0" opacity={0.3 + (i % 4) * 0.12}>
                      <animate attributeName="opacity" values={`${0.2 + (i % 3) * 0.1};${0.5 + (i % 3) * 0.1};${0.2 + (i % 3) * 0.1}`} dur={`${2 + (i % 3)}s`} repeatCount="indefinite" />
                    </circle>
                  ))}
                </g>
              )}

              {/* ── Clouds (visible during daytime) ───────────────────── */}
              {effectiveT > 0.1 && effectiveT < 0.9 && (
                <g opacity={0.25 + Math.min(effectiveT, 1 - effectiveT) * 0.5}>
                  {/* Cloud 1 */}
                  <g transform="translate(160, 50)">
                    <ellipse cx={0} cy={0} rx={35} ry={10} fill="white" />
                    <ellipse cx={18} cy={-5} rx={25} ry={8} fill="white" />
                    <ellipse cx={-12} cy={-3} rx={20} ry={7} fill="white" />
                  </g>
                  {/* Cloud 2 */}
                  <g transform="translate(520, 35)">
                    <ellipse cx={0} cy={0} rx={28} ry={8} fill="white" />
                    <ellipse cx={15} cy={-4} rx={22} ry={7} fill="white" />
                    <ellipse cx={-10} cy={-2} rx={18} ry={6} fill="white" />
                  </g>
                  {/* Cloud 3 (small, high) */}
                  <g transform="translate(350, 22)" opacity={0.6}>
                    <ellipse cx={0} cy={0} rx={20} ry={6} fill="white" />
                    <ellipse cx={10} cy={-3} rx={15} ry={5} fill="white" />
                  </g>
                </g>
              )}

              {/* Twilight zones */}
              <rect x={civilDawnXClamped} y={horizonY} width={sunriseX - civilDawnXClamped} height={20} fill="url(#ss-twiDawn)" rx={2} />
              <rect x={sunsetX} y={horizonY} width={civilDuskXClamped - sunsetX} height={20} fill="url(#ss-twiDusk)" rx={2} />

              {/* Horizon line */}
              <line x1={20} y1={horizonY} x2={780} y2={horizonY} stroke="#fbbf24" strokeWidth={1} strokeOpacity={0.3} strokeDasharray="8 5" />
              <text x={28} y={horizonY - 8} className="fill-amber-400/40" fontSize={9} fontWeight={500}>HORIZON</text>

              {/* Compass directions */}
              <text x={sunriseX} y={horizonY + 55} textAnchor="middle" className="fill-amber-400/30" fontSize={10} fontWeight={700}>E</text>
              <text x={sunsetX} y={horizonY + 55} textAnchor="middle" className="fill-amber-400/30" fontSize={10} fontWeight={700}>W</text>
              <text x={centerX} y={12} textAnchor="middle" className="fill-amber-400/20" fontSize={9} fontWeight={600}>↑ S</text>

              {/* Arc path */}
              <polygon points={`${sunriseX},${horizonY} ${pathPoints.join(' ')} ${sunsetX},${horizonY}`} fill="url(#ss-arcFill)" />
              <polyline points={pathPoints.join(' ')} stroke="#fbbf24" strokeWidth={2} fill="none" strokeLinejoin="round" />

              {/* Solar noon marker */}
              <line x1={centerX} y1={horizonY - peakHeight - 10} x2={centerX} y2={horizonY} stroke="#fbbf24" strokeWidth={0.75} strokeOpacity={0.15} strokeDasharray="3 3" />
              <text x={centerX} y={horizonY - peakHeight - 16} textAnchor="middle" className="fill-amber-400/50" fontSize={9} fontWeight={600}>SOLAR NOON</text>
              <text x={centerX} y={horizonY - peakHeight - 4} textAnchor="middle" className="fill-amber-400" fontSize={11} fontWeight={700} style={{ fontVariantNumeric: 'tabular-nums' }}>{solar.solarNoonTime}</text>

              {/* ── Sunrise point ──────────────────────────────────────── */}
              <circle cx={sunriseX} cy={horizonY} r={6} fill="#fbbf24" fillOpacity={0.25} />
              <circle cx={sunriseX} cy={horizonY} r={3} fill="#fbbf24" />
              <text x={sunriseX} y={horizonY + 30} textAnchor="middle" className="fill-amber-300" fontSize={11} fontWeight={700} style={{ fontVariantNumeric: 'tabular-nums' }}>{solar.sunriseTime}</text>
              <text x={sunriseX} y={horizonY + 42} textAnchor="middle" className="fill-amber-400/50" fontSize={8} fontWeight={600}>SUNRISE</text>
              {/* Airport marker at sunrise */}
              <g transform={`translate(${sunriseX}, ${horizonY - 2})`} opacity={0.5}>
                <rect x={-1} y={-14} width={2} height={14} fill="#94a3b8" rx={0.5} />
                <polygon points="-5,-14 0,-19 5,-14" fill="#94a3b8" />
              </g>

              {/* ── Sunset point ───────────────────────────────────────── */}
              <circle cx={sunsetX} cy={horizonY} r={6} fill="#fbbf24" fillOpacity={0.25} />
              <circle cx={sunsetX} cy={horizonY} r={3} fill="#fbbf24" />
              <text x={sunsetX} y={horizonY + 30} textAnchor="middle" className="fill-amber-300" fontSize={11} fontWeight={700} style={{ fontVariantNumeric: 'tabular-nums' }}>{solar.sunsetTime}</text>
              <text x={sunsetX} y={horizonY + 42} textAnchor="middle" className="fill-amber-400/50" fontSize={8} fontWeight={600}>SUNSET</text>
              {/* Airport marker at sunset */}
              <g transform={`translate(${sunsetX}, ${horizonY - 2})`} opacity={0.5}>
                <rect x={-1} y={-14} width={2} height={14} fill="#94a3b8" rx={0.5} />
                <polygon points="-5,-14 0,-19 5,-14" fill="#94a3b8" />
              </g>

              {/* Civil twilight labels */}
              <text x={civilDawnXClamped + 8} y={horizonY + 14} className="fill-purple-400" fontSize={8} fontWeight={500}>Dawn</text>
              <text x={civilDuskXClamped - 8} y={horizonY + 14} textAnchor="end" className="fill-purple-400" fontSize={8} fontWeight={500}>Dusk</text>

              {/* ── Sun on arc (daytime) ──────────────────────────────── */}
              {effectiveT >= 0 && effectiveT <= 1 && !(useAnimPosition ? false : solar?.isNight) ? (
                <g ref={sunGroupRef} style={{ transform: `translate(${sunPosX}px, ${sunPosY}px)`, transition: isAnimating ? 'transform 30ms linear' : 'none' }}>
                  <circle cx={0} cy={0} r={32} fill="url(#ss-sunGlow)" />
                  {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
                    const rad = (angle * Math.PI) / 180
                    return <line key={angle} x1={16 * Math.cos(rad)} y1={16 * Math.sin(rad)} x2={26 * Math.cos(rad)} y2={26 * Math.sin(rad)} stroke="#fbbf24" strokeWidth={1.5} strokeLinecap="round" opacity={0.45} />
                  })}
                  <circle cx={0} cy={0} r={13} fill="#fbbf24" />
                  <circle cx={0} cy={0} r={13} fill="none" stroke="#fef3c7" strokeWidth={1} opacity={0.5} />
                  {(() => {
                    const isNearNoon = effectiveT >= 0.35 && effectiveT <= 0.65
                    const lblX = isNearNoon ? (effectiveT < 0.5 ? -70 : 70) : 0
                    const lblAnchor = isNearNoon ? (effectiveT < 0.5 ? 'end' as const : 'start' as const) : 'middle' as const
                    const displayTime = useAnimPosition && simulatedTime ? formatTimeFull(simulatedTime, tz) : formatTimeFull(now, tz)
                    return <g><rect x={lblAnchor === 'middle' ? lblX - 46 : lblX - 48} y={-42} width={92} height={22} rx={5} fill="#0f172a" fillOpacity={0.75} /><text x={lblX} y={-27} textAnchor={lblAnchor} className="fill-amber-300" fontSize={10} fontWeight={600} style={{ fontVariantNumeric: 'tabular-nums' }}>{displayTime}</text></g>
                  })()}
                </g>
              ) : solar?.isNight ? (
                /* ── Moon + stars (nighttime) ────────────────────────── */
                <g>
                  <circle cx={centerX} cy={70} r={28} fill="url(#ss-moonGlow)" />
                  <circle cx={centerX} cy={70} r={14} fill="#cbd5e1" />
                  <circle cx={centerX + 5} cy={67} r={12} fill="#0f172a" fillOpacity={0.85} />
                  <text x={centerX} y={100} textAnchor="middle" className="fill-slate-400" fontSize={10} fontWeight={600}>NIGHT</text>
                </g>
              ) : null}
            </svg>
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground text-xs">Enter a location to see the sun arc.</div>
          )}
          {/* Animation controls */}
          {result && solar && (
            <div className="absolute bottom-4 right-4 flex items-center gap-1.5">
              <Button variant={isAnimating ? 'default' : 'outline'} size="sm" className="h-7 px-2.5 gap-1 text-[10px]" onClick={handlePlayPause}>
                {isAnimating ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}{isAnimating ? 'Pause' : 'Play'}
              </Button>
              {(animRender > 0 || isAnimating) && (
                <Button variant="ghost" size="sm" className="h-7 px-1.5" onClick={handleReset}><RotateCcw className="w-3 h-3" /></Button>
              )}
              <select value={animSpeed} onChange={(e) => setAnimSpeed(Number(e.target.value))} className="h-7 rounded border border-input bg-background px-1.5 text-[10px]">
                <option value={4}>4s</option><option value={8}>8s</option><option value={16}>16s</option>
              </select>
            </div>
          )}
          {useAnimPosition && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-amber-400" style={{ width: `${animRender * 100}%` }} />
            </div>
          )}
        </div>

        {/* ── Badges + scroll hint ──────────────────────────────────────── */}
        {result && solar && (
          <div className="flex items-center gap-2 flex-wrap">
            {result.dayLength !== '—' && <Badge variant="default" className="text-xs font-mono font-bold">☀ {result.dayLength}</Badge>}
            {solar.countdownText && !useAnimPosition && (
              <Badge variant="outline" className="text-xs font-mono font-bold">
                {solar.isNight ? <Moon className="w-3 h-3 mr-1 inline" /> : <Sun className="w-3 h-3 mr-1 inline" />}{solar.countdownText}
              </Badge>
            )}
            {useAnimPosition && simulatedTime && (
              <Badge variant="outline" className="text-xs font-mono font-bold"><Sun className="w-3 h-3 mr-1 inline" />{formatTime(simulatedTime, tz)}</Badge>
            )}
            {showScrollHint && (
              <span className="ml-auto text-[10px] text-muted-foreground/60 animate-pulse flex items-center gap-1 transition-opacity duration-1000">
                scroll for details <ChevronDown className="w-3 h-3" />
              </span>
            )}
          </div>
        )}

        {/* ── Detail table (collapsible) ────────────────────────────────── */}
        {result && solar && (
          <div className="rounded-lg border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => setDetailsOpen(!detailsOpen)}
              className="w-full flex items-center justify-between px-4 py-2 hover:bg-muted/50 transition-colors text-left"
            >
              <span className="text-xs font-semibold text-muted-foreground">Sun Times Detail</span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-primary">{solar.sunriseTime} → {solar.sunsetTime}</span>
                <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${detailsOpen ? 'rotate-180' : ''}`} />
              </div>
            </button>
            {detailsOpen && (
              <div className="border-t border-border bg-muted divide-y divide-border">
                {[
                  { label: 'Civil Dawn', time: solar.civilDawnTime, dim: true },
                  { label: 'Sunrise', time: solar.sunriseTime, highlight: true },
                  { label: 'Solar Noon', time: solar.solarNoonTime },
                  { label: 'Sunset', time: solar.sunsetTime, highlight: true },
                  { label: 'Civil Dusk', time: solar.civilDuskTime, dim: true },
                  { label: 'Day Length', time: result.dayLength, bold: true },
                  { label: 'Night Window', time: `${solar.earliestNight} → ${solar.latestNight}`, dim: true },
                ].map((row) => (
                  <div key={row.label} className={`flex items-center justify-between px-4 py-2 ${row.highlight ? 'bg-background' : ''}`}>
                    <span className={`text-xs ${row.dim ? 'text-muted-foreground' : row.bold ? 'font-semibold' : 'font-medium'}`}>{row.label}</span>
                    <div className="flex items-center gap-1">
                      <span className={`font-mono text-xs font-semibold ${row.highlight ? 'text-primary' : row.dim ? 'text-muted-foreground' : ''}`}>{row.time}</span>
                      <CopyBtn value={row.time} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Hourly conditions table (full width) ──────────────────────── */}
        {hourlyData.length > 0 && (
          <div className="flex flex-col rounded-lg border border-border overflow-hidden">
            {/* Filter bar */}
            <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border bg-muted/50">
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground mr-1">Show:</span>
              {([['all', 'All'], ['vfr', 'VFR'], ['marginal', 'Marginal'], ['night', 'Night'], ['best', 'Best']] as const).map(([key, label]) => (
                <button key={key} onClick={() => setWeatherFilter(key)} className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${weatherFilter === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}>{label}</button>
              ))}
              <span className="ml-auto text-[10px] text-muted-foreground">{filteredHourlyData.length} rows</span>
            </div>
            {/* Table */}
            <div className="max-h-[420px] overflow-y-auto">
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur-sm">
                  <tr className="text-[9px] uppercase tracking-wider text-muted-foreground border-b border-border">
                    <th className="px-2 py-1.5 text-left font-semibold">Time</th>
                    <th className="px-1.5 py-1.5 text-center font-semibold">☀</th>
                    <th className="px-1.5 py-1.5 text-right font-semibold">Elev</th>
                    <th className="px-1.5 py-1.5 text-left font-semibold">Phase</th>
                    <th className="px-1.5 py-1.5 text-right font-semibold">Temp</th>
                    <th className="px-1.5 py-1.5 text-left font-semibold">Wind</th>
                    <th className="px-1.5 py-1.5 text-left font-semibold">Thermals</th>
                    <th className="px-1.5 py-1.5 text-left font-semibold">Vis</th>
                    <th className="px-1.5 py-1.5 text-center font-semibold">UV</th>
                    <th className="px-2 py-1.5 text-left font-semibold">Conditions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {filteredHourlyData.map((row) => {
                    const isCurrentHour = new Date().toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false }) === String(row.hour).padStart(2, '0')
                    return (
                      <tr key={row.hour} className={`${row.phaseBg} ${row.bestFly ? 'bg-emerald-900/20' : ''} ${isCurrentHour ? 'ring-1 ring-inset ring-primary/40' : ''} hover:bg-muted/30 transition-colors`}>
                        <td className={`px-2 py-1 font-mono tabular-nums whitespace-nowrap ${isCurrentHour ? 'font-bold text-primary' : row.bestFly ? 'font-semibold text-emerald-400' : 'text-foreground'}`}>{row.timeLabel}</td>
                        <td className="px-1.5 py-1 text-center">{row.goldenHour && <span title="Golden hour">✨</span>}{row.bestFly && !row.goldenHour && <span title="Best flying window">✈</span>}</td>
                        <td className="px-1.5 py-1 text-right font-mono tabular-nums">
                          <span className={row.elevation > 0 ? 'text-amber-400' : row.elevation > -6 ? 'text-purple-400' : 'text-slate-500'}>{row.elevation > 0 ? '+' : ''}{row.elevation}°</span>
                        </td>
                        <td className={`px-1.5 py-1 font-medium whitespace-nowrap ${row.phaseColor}`}>{row.phase}</td>
                        <td className={`px-1.5 py-1 text-right font-mono tabular-nums ${row.tempColor}`}>{row.temp}</td>
                        <td className="px-1.5 py-1 whitespace-nowrap">{row.windIcon} <span className="text-muted-foreground">{row.wind}</span></td>
                        <td className={`px-1.5 py-1 font-medium whitespace-nowrap ${row.thermalColor}`}>{row.thermal}</td>
                        <td className={`px-1.5 py-1 font-medium whitespace-nowrap ${row.visColor}`}>{row.visibility}</td>
                        <td className={`px-1.5 py-1 text-center font-mono ${row.uvColor}`}>{row.uvIndex}</td>
                        <td className={`px-2 py-1 font-medium whitespace-nowrap ${row.condColor}`}>{row.conditions}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Route Weather & Legality (own section) ─────────────────────── */}
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/50 border-b border-border">
            <Compass className="w-4 h-4 text-primary shrink-0" />
            <span className="text-sm font-semibold">Route Weather & Legality</span>
            {routeResults && (
              <span className={`ml-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                routeResults.goNoGo === 'go' ? 'bg-emerald-500/20 text-emerald-400' :
                routeResults.goNoGo === 'caution' ? 'bg-amber-500/20 text-amber-400' :
                'bg-red-500/20 text-red-400'
              }`}>
                {routeResults.goNoGo === 'go' ? 'GO' : routeResults.goNoGo === 'caution' ? 'CAUTION' : 'NO GO'}
              </span>
            )}
          </div>

          <div className="p-4 space-y-4">
            {/* Flight model selector */}
            <div>
              <Label className="text-[10px] text-muted-foreground mb-2 block flex items-center gap-1">
                <Shield className="w-3 h-3" />Flight Model
              </Label>
              <div className="flex gap-2 flex-wrap">
                {FLIGHT_MODELS.map((fm) => (
                  <button
                    key={fm.id}
                    type="button"
                    onClick={() => setFlightModel(fm.id)}
                    title={fm.desc}
                    className={`px-3 py-1.5 rounded-md text-[11px] font-medium border transition-colors ${
                      flightModel === fm.id
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  >
                    {fm.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Route inputs */}
            <div className="flex items-end gap-3 flex-wrap">
              <div className="w-32">
                <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Navigation className="w-3 h-3" />Heading (°)
                </Label>
                <Input
                  type="number"
                  min={0}
                  max={360}
                  value={routeHeading}
                  onChange={(e) => setRouteHeading(Math.max(0, Math.min(360, Number(e.target.value))))}
                  className="mt-0.5 h-9 text-xs font-mono"
                />
              </div>
              <div className="w-32">
                <Label className="text-[10px] text-muted-foreground">Distance (nm)</Label>
                <Input
                  type="number"
                  min={1}
                  max={5000}
                  value={routeDistance}
                  onChange={(e) => setRouteDistance(Math.max(1, Number(e.target.value)))}
                  className="mt-0.5 h-9 text-xs font-mono"
                />
              </div>
              <div className="w-32">
                <Label className="text-[10px] text-muted-foreground">Aircraft</Label>
                <Input
                  value={routeAircraft}
                  onChange={(e) => setRouteAircraft(e.target.value)}
                  placeholder="C172"
                  className="mt-0.5 h-9 text-xs"
                />
              </div>
              <Button
                variant="default"
                size="sm"
                className="h-9 px-5 gap-1.5 text-xs"
                onClick={runRouteCheck}
                disabled={routeLoading}
              >
                {routeLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Plane className="w-3 h-3" />
                )}
                {routeLoading ? 'Checking…' : 'Check Route'}
              </Button>
            </div>

            {/* Route results */}
            {routeResults && (
              <div className="space-y-3 rounded-lg bg-muted/30 p-4">
                {/* Header: go/no-go badge + airports */}
                <div className="flex items-center gap-3 flex-wrap">
                  <Badge
                    variant="outline"
                    className={`text-xs font-bold ${
                      routeResults.goNoGo === 'go' ? 'border-emerald-500 text-emerald-400' :
                      routeResults.goNoGo === 'caution' ? 'border-amber-500 text-amber-400' :
                      'border-red-500 text-red-400'
                    }`}
                  >
                    {routeResults.goNoGo === 'go' && <CheckCircle2 className="w-3.5 h-3.5 mr-1 inline" />}
                    {routeResults.goNoGo === 'caution' && <AlertTriangle className="w-3.5 h-3.5 mr-1 inline" />}
                    {routeResults.goNoGo === 'no-go' && <XCircle className="w-3.5 h-3.5 mr-1 inline" />}
                    {routeResults.goNoGo === 'go' ? 'GO' : routeResults.goNoGo === 'caution' ? 'CAUTION' : 'NO GO'}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {routeResults.departure}
                    <Plane className="w-3 h-3 mx-1.5 inline text-primary" />
                    {routeResults.arrival}
                  </span>
                </div>

                {/* METAR readout */}
                {routeResults.metar && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2.5 flex-wrap text-[11px]">
                      {routeResults.metar.category && (
                        <Badge variant="outline" className={`font-bold ${
                          routeResults.metar.category === 'VFR' ? 'border-emerald-500 text-emerald-400' :
                          routeResults.metar.category === 'MVFR' ? 'border-amber-500 text-amber-400' :
                          routeResults.metar.category === 'IFR' ? 'border-orange-500 text-orange-400' :
                          'border-red-500 text-red-400'
                        }`}>
                          {routeResults.metar.category}
                        </Badge>
                      )}
                      {routeResults.metar.wind && <span className="text-muted-foreground">Wind: <span className="text-foreground font-mono">{routeResults.metar.wind}</span></span>}
                      {routeResults.metar.vis && <span className="text-muted-foreground">Vis: <span className="text-foreground font-mono">{routeResults.metar.vis}</span></span>}
                      {routeResults.metar.ceiling && <span className="text-muted-foreground">Ceil: <span className="text-foreground font-mono">{routeResults.metar.ceiling}</span></span>}
                    </div>
                    {routeResults.metar.rawText && (
                      <p className="text-[10px] font-mono text-muted-foreground/70 leading-relaxed break-all">{routeResults.metar.rawText}</p>
                    )}
                  </div>
                )}

                {/* Legal reasons (red) */}
                {routeResults.legalReasons.length > 0 && (
                  <div className="space-y-1">
                    {routeResults.legalReasons.map((r, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-red-400">
                        <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{r}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Advisories (amber) */}
                {routeResults.advisory.length > 0 && (
                  <div className="space-y-1">
                    {routeResults.advisory.map((a, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-amber-400">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{a}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* No issues */}
                {routeResults.legalReasons.length === 0 && routeResults.advisory.length === 0 && (
                  <div className="flex items-center gap-2 text-xs text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>All conditions met for {FLIGHT_MODELS.find(f => f.id === flightModel)?.label ?? flightModel}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Night currency note ─────────────────────────────────────── */}
        <div className="px-1 pb-1">
          <p className="text-[10px] text-muted-foreground">
            Night landings count from 1 hr after sunset to 1 hr before sunrise (FAR 61.57).
          </p>
        </div>
      </div>
    </ToolShell>
  )
}
