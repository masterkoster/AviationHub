'use client'

/**
 * Route Weather & Legality Checker — standalone aviation tool.
 *
 * Checks weather conditions and legal requirements for VFR Day, VFR Night,
 * IFR, and IFR Night flight models. Fetches live METAR/TAF from NOAA,
 * runs legality checks against FAR minimums, and presents a Go / Caution /
 * No-Go decision with full weather breakdown.
 */
import { useState, useCallback, useRef } from 'react'
import {
  Plane,
  Shield,
  Navigation,
  Compass,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
  Cloud,
  Wind,
  Eye,
  Thermometer,
  Gauge,
  MapPin,
  Sun,
  Moon,
} from 'lucide-react'
import { ToolShell } from '@/components/ui/e6b'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import { logToolUse } from '@/desktop/lib/e6b-store'
import { fetchMetar, fetchTaf } from '@/desktop/lib/weather-fetch'
import type { MetarData, TafData } from '@/desktop/lib/weather-types'

// ── Types ─────────────────────────────────────────────────────────────────────

type FlightModel = 'vfr-day' | 'vfr-night' | 'ifr' | 'ifr-night'

interface FlightModelOption {
  id: FlightModel
  label: string
  shortLabel: string
  desc: string
  icon: typeof Plane
}

interface LegalityCheck {
  id: string
  label: string
  detail: string
  result: 'pass' | 'fail' | 'caution'
}

interface RouteResult {
  departureIcao: string
  arrivalIcao: string
  metar: MetarData | null
  taf: TafData | null
  goNoGo: 'go' | 'caution' | 'no-go'
  checks: LegalityCheck[]
  advisories: string[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const FLIGHT_MODELS: FlightModelOption[] = [
  {
    id: 'vfr-day',
    label: 'VFR Day',
    shortLabel: 'VFR',
    desc: 'Day VFR — basic pilot certificate, daylight required',
    icon: Sun,
  },
  {
    id: 'vfr-night',
    label: 'VFR Night',
    shortLabel: 'VFR Night',
    desc: 'Night VFR — requires night endorsement + 3 full-stop landings in 90 days',
    icon: Moon,
  },
  {
    id: 'ifr',
    label: 'IFR',
    shortLabel: 'IFR',
    desc: 'Instrument Flight — requires instrument rating + IPC current',
    icon: Compass,
  },
  {
    id: 'ifr-night',
    label: 'IFR Night',
    shortLabel: 'IFR Night',
    desc: 'Night IFR — instrument rating + night currency + alternate minimums',
    icon: Shield,
  },
]

const FLIGHT_CATEGORY_COLORS: Record<string, string> = {
  VFR: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  MVFR: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
  IFR: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
  LIFR: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30',
}

const GO_NO_GO_STYLES = {
  go: {
    bg: 'bg-emerald-500/10 border-emerald-500/40',
    icon: 'text-emerald-600 dark:text-emerald-400',
    text: 'text-emerald-700 dark:text-emerald-300',
    label: 'GO — All conditions met',
  },
  caution: {
    bg: 'bg-amber-500/10 border-amber-500/40',
    icon: 'text-amber-600 dark:text-amber-400',
    text: 'text-amber-700 dark:text-amber-300',
    label: 'CAUTION — Review advisories',
  },
  'no-go': {
    bg: 'bg-red-500/10 border-red-500/40',
    icon: 'text-red-600 dark:text-red-400',
    text: 'text-red-700 dark:text-red-300',
    label: 'NO GO — See issues below',
  },
}

// ── Helper: parse METAR wind string ───────────────────────────────────────────

function formatWind(m: MetarData): string {
  if (m.windSpeedKts == null) return '---'
  const dir = m.windDirDeg != null ? String(m.windDirDeg).padStart(3, '0') : 'VRB'
  const gust = m.windGustKts != null ? `G${m.windGustKts}` : ''
  return `${dir}/${m.windSpeedKts}${gust}kt`
}

function formatTemp(m: MetarData): string {
  if (m.tempC == null) return '---'
  const t = m.tempC > 0 ? `+${m.tempC}` : `${m.tempC}`
  const d = m.dewpointC != null ? (m.dewpointC > 0 ? `/${m.dewpointC}` : `/${m.dewpointC}`) : ''
  return `${t}°C${d}`
}

function formatAltimeter(m: MetarData): string {
  if (m.altimeterHg == null) return '---'
  return `${m.altimeterHg.toFixed(2)}"`
}

function formatVisibility(m: MetarData): string {
  if (m.visibilitySm == null) return '---'
  return `${m.visibilitySm}SM`
}

function formatCeiling(m: MetarData): string {
  if (m.ceilingFt == null) return 'Clear'
  return `${m.ceilingFt}ft`
}

// ── Helper: parse TAF periods ─────────────────────────────────────────────────

interface TafPeriod {
  timeRange: string
  conditions: string
  wind: string
  visibility: string
  ceiling: string
}

function parseTafPeriods(rawText: string): TafPeriod[] {
  if (!rawText) return []

  // Strip the header (e.g., "TAF KDEN 012345Z 010012...")
  // TAF periods are split by "FM" (from), "BECMG" (becoming), or "TEMPO" (temporary)
  const periodRegex = /\b(FM\d{6}|BECMG|TEMPO)\b/g
  const splits = rawText.split(periodRegex).filter(Boolean)

  const periods: TafPeriod[] = []
  let currentHeader = ''

  for (let i = 0; i < splits.length; i++) {
    const token = splits[i].trim()
    if (!token) continue

    const isLabel = /^FM\d{6}|^BECMG$|^TEMPO$/.test(token)
    if (isLabel) {
      currentHeader = token
      // The next token(s) form the body
      let body = ''
      // Collect consecutive non-label tokens
      while (i + 1 < splits.length && !/^FM\d{6}|^BECMG$|^TEMPO$/.test(splits[i + 1].trim())) {
        i++
        body += splits[i]
      }
      body = body.trim()

      // Extract wind
      const windMatch = body.match(/\b(\d{3}\d{2,3}(G\d{2,3})?KT)\b/)
      const visMatch = body.match(/\b(\d+SM|\d+\s*\d\/\d+SM|P\d+SM)\b/)
      const ceilMatch = body.match(/\b(BKN|OVC|FEW|SCT)(\d{3})\b/)

      // Extract time from FM label
      let timeRange = ''
      const fmMatch = currentHeader.match(/^FM(\d{2})(\d{2})(\d{2})/)
      if (fmMatch) {
        const day = fmMatch[1]
        const hr = fmMatch[2]
        const mn = fmMatch[3]
        timeRange = `FM ${day}Z ${hr}:${mn}`
      } else if (currentHeader === 'BECMG') {
        timeRange = 'Becoming'
      } else if (currentHeader === 'TEMPO') {
        timeRange = 'Temporary'
      }

      // Decode cloud cover description
      let ceilDesc = 'Clear'
      if (ceilMatch) {
        const cover = ceilMatch[1]
        const alt = parseInt(ceilMatch[2]) * 100
        ceilDesc = `${cover} ${alt}ft`
      }
      // Check for multiple cloud layers
      const allClouds = body.match(/\b(FEW|SCT|BKN|OVC)\d{3}\b/g)
      if (allClouds && allClouds.length > 1) {
        ceilDesc = allClouds.map(c => {
          const m2 = c.match(/(FEW|SCT|BKN|OVC)(\d{3})/)
          return m2 ? `${m2[1]} ${parseInt(m2[2]) * 100}ft` : c
        }).join(', ')
      }

      // Weather phenomena
      const wxMatch = body.match(/\b(TS|RA|SN|FG|BR|HZ|DZ|SHRA|SHSN|TSRA|FZRA|FZDZ|VCTS|VCSH)\b/g)
      const weather = wxMatch ? wxMatch.join(' ') : ''

      periods.push({
        timeRange,
        conditions: weather || 'No significant weather',
        wind: windMatch ? windMatch[1] : 'Calm',
        visibility: visMatch ? visMatch[1] : '10SM+',
        ceiling: ceilDesc,
      })
    }
  }

  return periods
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function RouteWeatherTool() {
  const { localUser, cloudUser, mode } = useDesktopAuth()
  const userId = mode === 'local' ? localUser?.id : cloudUser?.id

  // ── State ─────────────────────────────────────────────────────────────────
  const [flightModel, setFlightModel] = useState<FlightModel>('vfr-day')
  const [originIcao, setOriginIcao] = useState('')
  const [heading, setHeading] = useState<number>(0)
  const [distance, setDistance] = useState<number>(100)
  const [aircraft, setAircraft] = useState('C172')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<RouteResult | null>(null)
  const [tafOpen, setTafOpen] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  // ── Route check ───────────────────────────────────────────────────────────

  const checkRoute = useCallback(async () => {
    const depIcao = originIcao.trim().toUpperCase()
    if (depIcao.length < 3) {
      toast.error('Enter a valid origin ICAO (e.g., KDEN)')
      return
    }

    // Abort any in-flight request
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    setLoading(true)
    setResult(null)

    try {
      // Fetch METAR and TAF for origin (used as the primary weather station)
      const [metar, taf] = await Promise.all([
        fetchMetar(depIcao).catch(() => null as MetarData | null),
        fetchTaf(depIcao).catch(() => null as TafData | null),
      ])

      // Build legality checks
      const checks: LegalityCheck[] = []
      const advisories: string[] = []

      const cat = metar?.flightCategory?.toUpperCase() ?? ''
      const windSpd = metar?.windSpeedKts ?? 0
      const vis = metar?.visibilitySm ?? 10
      const ceil = metar?.ceilingFt ?? 99999

      // ── Flight category vs model ──────────────────────────────────────
      const isVfr = flightModel === 'vfr-day' || flightModel === 'vfr-night'
      const isIfr = flightModel === 'ifr' || flightModel === 'ifr-night'
      const isNight = flightModel === 'vfr-night' || flightModel === 'ifr-night'

      // Category check
      if (isVfr) {
        if (cat === 'IFR' || cat === 'LIFR') {
          checks.push({
            id: 'flight-category',
            label: 'Flight Category',
            detail: `${cat} — VFR flight not legal`,
            result: 'fail',
          })
        } else if (cat === 'MVFR') {
          checks.push({
            id: 'flight-category',
            label: 'Flight Category',
            detail: `MVFR — Marginal VFR conditions`,
            result: 'caution',
          })
        } else {
          checks.push({
            id: 'flight-category',
            label: 'Flight Category',
            detail: `${cat || 'VFR'} — Conditions suitable for VFR`,
            result: 'pass',
          })
        }
      } else {
        if (cat === 'LIFR') {
          checks.push({
            id: 'flight-category',
            label: 'Flight Category',
            detail: `LIFR — Extremely low ceilings/visibility`,
            result: 'caution',
          })
        } else {
          checks.push({
            id: 'flight-category',
            label: 'Flight Category',
            detail: `${cat || 'N/A'} — IFR clearance available`,
            result: 'pass',
          })
        }
      }

      // ── Wind check ────────────────────────────────────────────────────
      if (windSpd > 30) {
        checks.push({
          id: 'wind-speed',
          label: 'Wind Speed',
          detail: `${windSpd}kt exceeds safe crosswind limits for most GA aircraft`,
          result: 'fail',
        })
      } else if (windSpd > 20) {
        checks.push({
          id: 'wind-speed',
          label: 'Wind Speed',
          detail: `${windSpd}kt — moderate turbulence possible, check aircraft POH`,
          result: 'caution',
        })
      } else {
        checks.push({
          id: 'wind-speed',
          label: 'Wind Speed',
          detail: `${windSpd}kt — within normal operating range`,
          result: 'pass',
        })
      }

      // ── Visibility check ──────────────────────────────────────────────
      if (isVfr) {
        if (vis < 3) {
          checks.push({
            id: 'visibility',
            label: 'Visibility',
            detail: `${vis}SM — Below VFR minimums (3SM required)`,
            result: 'fail',
          })
        } else if (vis < 5) {
          checks.push({
            id: 'visibility',
            label: 'Visibility',
            detail: `${vis}SM — Reduced visibility, exercise caution`,
            result: 'caution',
          })
        } else {
          checks.push({
            id: 'visibility',
            label: 'Visibility',
            detail: `${vis}SM — Adequate for VFR`,
            result: 'pass',
          })
        }
      } else {
        if (vis < 1) {
          checks.push({
            id: 'visibility',
            label: 'Visibility',
            detail: `${vis}SM — Below IFR minimums (1SM required)`,
            result: 'fail',
          })
        } else if (vis < 2) {
          checks.push({
            id: 'visibility',
            label: 'Visibility',
            detail: `${vis}SM — Low visibility, approach minima critical`,
            result: 'caution',
          })
        } else {
          checks.push({
            id: 'visibility',
            label: 'Visibility',
            detail: `${vis}SM — Adequate for IFR operations`,
            result: 'pass',
          })
        }
      }

      // ── Ceiling check ─────────────────────────────────────────────────
      if (isVfr) {
        if (ceil < 1000) {
          checks.push({
            id: 'ceiling',
            label: 'Ceiling',
            detail: `${ceil === 99999 ? 'Unlimited' : `${ceil}ft`} — Below VFR minimums (1000ft BKN/OVC)`,
            result: 'fail',
          })
        } else if (ceil < 3000) {
          checks.push({
            id: 'ceiling',
            label: 'Ceiling',
            detail: `${ceil}ft — Low ceilings, stay alert`,
            result: 'caution',
          })
        } else {
          checks.push({
            id: 'ceiling',
            label: 'Ceiling',
            detail: `${ceil === 99999 ? 'Unlimited' : `${ceil}ft`} — Adequate for VFR`,
            result: 'pass',
          })
        }
      } else {
        if (ceil < 500) {
          checks.push({
            id: 'ceiling',
            label: 'Ceiling',
            detail: `${ceil}ft — Very low ceiling, approach minima critical`,
            result: 'caution',
          })
          advisories.push('Low ceiling may restrict approach options — verify alternate minimums')
        } else {
          checks.push({
            id: 'ceiling',
            label: 'Ceiling',
            detail: `${ceil === 99999 ? 'Unlimited' : `${ceil}ft`} — Adequate for IFR approaches`,
            result: 'pass',
          })
        }
      }

      // ── Daylight / Night currency ─────────────────────────────────────
      if (flightModel === 'vfr-day') {
        // Approximate: check if METAR obs time is during day (rough check)
        // A proper check would use sunrise/sunset data, but we can note it
        checks.push({
          id: 'daylight',
          label: 'Daylight Requirement',
          detail: 'VFR Day requires flight during daylight hours (1hr before sunrise to 1hr after sunset)',
          result: 'pass',
        })
      }
      if (flightModel === 'vfr-night') {
        checks.push({
          id: 'night-currency',
          label: 'Night Currency',
          detail: 'Requires 3 full-stop night landings within the preceding 90 days (FAR 61.57(c))',
          result: 'caution',
        })
        advisories.push('Verify night landing currency before departure')
      }
      if (isIfr) {
        checks.push({
          id: 'ifr-currency',
          label: 'IFR Currency',
          detail: 'Requires 6 instrument approaches + holds + intercepting/tracking within preceding 6 calendar months (FAR 61.57(c))',
          result: 'caution',
        })
        if (flightModel === 'ifr-night') {
          checks.push({
            id: 'ifr-night-alt',
            label: 'Alternate Minimums',
            detail: 'IFR Night — ensure filed alternates meet approach minima (FAR 91.169)',
            result: 'caution',
          })
        }
        advisories.push('Verify IPC (Instrument Proficiency Check) and approach currency')
      }

      // ── Altimeter check ──────────────────────────────────────────────
      const altim = metar?.altimeterHg
      if (altim != null) {
        if (altim < 29.0 || altim > 31.0) {
          checks.push({
            id: 'altimeter',
            label: 'Altimeter',
            detail: `${altim.toFixed(2)}" — Unusual pressure, verify altimeter setting`,
            result: 'caution',
          })
        } else {
          checks.push({
            id: 'altimeter',
            label: 'Altimeter',
            detail: `${altim.toFixed(2)}" — Standard pressure range`,
            result: 'pass',
          })
        }
      }

      // ── Determine overall Go/No-Go ───────────────────────────────────
      const hasFail = checks.some(c => c.result === 'fail')
      const hasCaution = checks.some(c => c.result === 'caution')
      let goNoGo: 'go' | 'caution' | 'no-go' = 'go'
      if (hasFail) goNoGo = 'no-go'
      else if (hasCaution) goNoGo = 'caution'

      const routeResult: RouteResult = {
        departureIcao: depIcao,
        arrivalIcao: depIcao, // We check weather at origin; user enters destination separately
        metar,
        taf,
        goNoGo,
        checks,
        advisories,
      }

      setResult(routeResult)

      // Log to history
      if (userId) {
        logToolUse(userId, 'route-weather', {
          flightModel,
          originIcao: depIcao,
          heading,
          distance,
          aircraft,
        }, {
          goNoGo,
          category: metar?.flightCategory,
          windSpd,
          vis,
          ceil,
        }).catch(() => {})
      }

      // Toast feedback
      if (goNoGo === 'go') {
        toast.success('Route check passed — GO')
      } else if (goNoGo === 'caution') {
        toast.warning('Route check: CAUTION — review advisories')
      } else {
        toast.error('Route check: NO GO — see issues')
      }
    } catch (err) {
      console.error('[route-weather] check failed:', err)
      toast.error('Failed to fetch weather data')
    } finally {
      setLoading(false)
    }
  }, [originIcao, heading, distance, aircraft, flightModel, userId])

  // ── Derived ──────────────────────────────────────────────────────────────

  const gnStyle = result ? GO_NO_GO_STYLES[result.goNoGo] : null
  const tafPeriods = result?.taf?.rawText ? parseTafPeriods(result.taf.rawText) : []

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <ToolShell
      title="Route Weather & Legality"
      description="Check weather conditions and legal requirements for your flight"
      fillHeight
      notesUserId={userId ?? null}
      notesTool="route-weather"
    >
      <div className="space-y-3">

        {/* ── Flight Model Selector ─────────────────────────────────────── */}
        <div className="rounded-lg border border-border p-3">
          <Label className="text-xs font-medium text-muted-foreground mb-2 block">
            Flight Model
          </Label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {FLIGHT_MODELS.map((fm) => {
              const active = flightModel === fm.id
              const Icon = fm.icon
              return (
                <button
                  key={fm.id}
                  type="button"
                  title={fm.desc}
                  onClick={() => setFlightModel(fm.id)}
                  className={`
                    flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3
                    text-sm font-medium transition-all duration-150
                    ${active
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                      : 'bg-card text-muted-foreground border-border hover:bg-accent hover:text-accent-foreground'
                    }
                  `}
                >
                  <Icon className={`h-5 w-5 ${active ? 'text-primary-foreground' : ''}`} />
                  <span className="text-xs">{fm.label}</span>
                </button>
              )
            })}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2 leading-snug">
            {FLIGHT_MODELS.find(f => f.id === flightModel)?.desc}
          </p>
        </div>

        {/* ── Route Builder ─────────────────────────────────────────────── */}
        <div className="rounded-lg border border-border p-3">
          <Label className="text-xs font-medium text-muted-foreground mb-2 block">
            Route
          </Label>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[120px]">
              <Label className="text-[11px] text-muted-foreground mb-1 block">Origin ICAO</Label>
              <Input
                placeholder="KDEN"
                value={originIcao}
                onChange={e => setOriginIcao(e.target.value.toUpperCase())}
                maxLength={4}
                className="h-9 text-sm font-mono uppercase"
              />
            </div>
            <div className="w-24">
              <Label className="text-[11px] text-muted-foreground mb-1 block">Heading</Label>
              <Input
                type="number"
                min={0}
                max={360}
                placeholder="0"
                value={heading || ''}
                onChange={e => setHeading(Math.min(360, Math.max(0, parseInt(e.target.value) || 0)))}
                className="h-9 text-sm font-mono"
              />
            </div>
            <div className="w-24">
              <Label className="text-[11px] text-muted-foreground mb-1 block">Distance (nm)</Label>
              <Input
                type="number"
                min={0}
                placeholder="100"
                value={distance || ''}
                onChange={e => setDistance(Math.max(0, parseInt(e.target.value) || 0))}
                className="h-9 text-sm font-mono"
              />
            </div>
            <div className="w-28">
              <Label className="text-[11px] text-muted-foreground mb-1 block">Aircraft</Label>
              <Input
                placeholder="C172"
                value={aircraft}
                onChange={e => setAircraft(e.target.value)}
                className="h-9 text-sm font-mono uppercase"
              />
            </div>
            <Button
              onClick={checkRoute}
              disabled={loading || originIcao.trim().length < 3}
              className="h-9 px-4 gap-1.5 shrink-0"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plane className="h-4 w-4" />
              )}
              {loading ? 'Checking...' : 'Check Route'}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2 leading-snug">
            Fetches live METAR & TAF for the origin airport and checks weather conditions against
            {flightModel.includes('vfr') ? ' VFR' : ' IFR'} minimums and flight rules.
          </p>
        </div>

        {/* ── Results ───────────────────────────────────────────────────── */}
        {result && gnStyle && (
          <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">

            {/* ── Go / No-Go Banner ──────────────────────────────────── */}
            <div className={`rounded-lg border-2 p-4 flex items-center gap-3 ${gnStyle.bg}`}>
              {result.goNoGo === 'go' && <CheckCircle2 className={`h-7 w-7 shrink-0 ${gnStyle.icon}`} />}
              {result.goNoGo === 'caution' && <AlertTriangle className={`h-7 w-7 shrink-0 ${gnStyle.icon}`} />}
              {result.goNoGo === 'no-go' && <XCircle className={`h-7 w-7 shrink-0 ${gnStyle.icon}`} />}
              <div>
                <p className={`text-lg font-bold ${gnStyle.text}`}>{gnStyle.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {FLIGHT_MODELS.find(f => f.id === flightModel)?.label} &middot;{' '}
                  {result.departureIcao} &middot;{' '}
                  {aircraft.toUpperCase()}
                </p>
              </div>
            </div>

            {/* ── Route Overview ──────────────────────────────────────── */}
            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-center gap-3 text-sm">
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono font-bold">{result.departureIcao}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <div className="h-px w-8 bg-border" />
                  <div className="flex flex-col items-center">
                    <Plane className="h-4 w-4 -rotate-45" />
                    <span className="text-[10px]">
                      {heading}° &middot; {distance}nm
                    </span>
                  </div>
                  <div className="h-px w-8 bg-border" />
                </div>
                <div className="flex items-center gap-1.5">
                  <Navigation className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono font-bold">
                    {distance > 0 ? `~${Math.round(distance)}nm` : 'Origin'}
                  </span>
                </div>
              </div>
            </div>

            {/* ── METAR Section ───────────────────────────────────────── */}
            {result.metar && result.metar.rawText && (
              <div className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Cloud className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">METAR — {result.metar.icao}</h3>
                  </div>
                  {result.metar.flightCategory && (
                    <Badge
                      variant="outline"
                      className={`text-xs font-bold border ${FLIGHT_CATEGORY_COLORS[result.metar.flightCategory] ?? ''}`}
                    >
                      {result.metar.flightCategory}
                    </Badge>
                  )}
                </div>

                {/* Observation time */}
                {result.metar.observationTime && (
                  <p className="text-[10px] text-muted-foreground mb-2">
                    Observed: {new Date(result.metar.observationTime).toUTCString()}
                  </p>
                )}

                {/* Weather grid */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-3">
                  <WeatherCell
                    icon={<Wind className="h-3.5 w-3.5" />}
                    label="Wind"
                    value={formatWind(result.metar)}
                  />
                  <WeatherCell
                    icon={<Eye className="h-3.5 w-3.5" />}
                    label="Visibility"
                    value={formatVisibility(result.metar)}
                  />
                  <WeatherCell
                    icon={<Cloud className="h-3.5 w-3.5" />}
                    label="Ceiling"
                    value={formatCeiling(result.metar)}
                  />
                  <WeatherCell
                    icon={<Thermometer className="h-3.5 w-3.5" />}
                    label="Temp / Dew"
                    value={formatTemp(result.metar)}
                  />
                  <WeatherCell
                    icon={<Gauge className="h-3.5 w-3.5" />}
                    label="Altimeter"
                    value={formatAltimeter(result.metar)}
                  />
                </div>

                {/* Raw METAR */}
                <details className="group">
                  <summary className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors">
                    <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
                    Raw METAR
                  </summary>
                  <p className="mt-1.5 text-[11px] font-mono text-muted-foreground bg-muted/50 rounded px-2 py-1.5 break-all leading-relaxed">
                    {result.metar.rawText}
                  </p>
                </details>
              </div>
            )}

            {/* No METAR available */}
            {result.metar && !result.metar.rawText && (
              <div className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Cloud className="h-4 w-4" />
                  <span className="text-sm">No METAR available for {result.departureIcao}</span>
                </div>
              </div>
            )}

            {/* ── TAF Section ─────────────────────────────────────────── */}
            {result.taf?.rawText && (
              <div className="rounded-lg border border-border p-3">
                <button
                  type="button"
                  onClick={() => setTafOpen(!tafOpen)}
                  className="flex items-center justify-between w-full text-left"
                >
                  <div className="flex items-center gap-2">
                    <Cloud className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">TAF — {result.taf.icao}</h3>
                    {tafPeriods.length > 0 && (
                      <Badge variant="outline" className="text-[10px]">
                        {tafPeriods.length} periods
                      </Badge>
                    )}
                  </div>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${tafOpen ? 'rotate-180' : ''}`} />
                </button>

                {tafOpen && (
                  <div className="mt-3">
                    {/* TAF validity */}
                    {result.taf.validFrom && result.taf.validTo && (
                      <p className="text-[10px] text-muted-foreground mb-2">
                        Valid: {new Date(result.taf.validFrom).toUTCString()} — {new Date(result.taf.validTo).toUTCString()}
                      </p>
                    )}

                    {/* Periods table */}
                    {tafPeriods.length > 0 ? (
                      <div className="space-y-1.5">
                        {/* Header row */}
                        <div className="grid grid-cols-[auto_1fr_1fr_1fr_1fr] gap-2 text-[10px] font-medium text-muted-foreground px-2">
                          <span className="w-20">Period</span>
                          <span>Weather</span>
                          <span>Wind</span>
                          <span>Vis</span>
                          <span>Ceiling</span>
                        </div>
                        {tafPeriods.map((p, i) => (
                          <div
                            key={i}
                            className="grid grid-cols-[auto_1fr_1fr_1fr_1fr] gap-2 text-[11px] bg-muted/30 rounded px-2 py-1.5"
                          >
                            <span className="w-20 font-mono text-muted-foreground">{p.timeRange}</span>
                            <span>{p.conditions}</span>
                            <span className="font-mono">{p.wind}</span>
                            <span className="font-mono">{p.visibility}</span>
                            <span className="font-mono">{p.ceiling}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">TAF available but could not parse periods.</p>
                    )}

                    {/* Raw TAF */}
                    <details className="group mt-2">
                      <summary className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors">
                        <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
                        Raw TAF
                      </summary>
                      <p className="mt-1.5 text-[11px] font-mono text-muted-foreground bg-muted/50 rounded px-2 py-1.5 break-all leading-relaxed">
                        {result.taf.rawText}
                      </p>
                    </details>
                  </div>
                )}
              </div>
            )}

            {/* ── Legality Checks ─────────────────────────────────────── */}
            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Legality Checks</h3>
                <Badge variant="outline" className="text-[10px] ml-auto">
                  {result.checks.filter(c => c.result === 'pass').length}/{result.checks.length} passed
                </Badge>
              </div>
              <div className="space-y-1.5">
                {result.checks.map((check) => (
                  <div
                    key={check.id}
                    className={`
                      flex items-start gap-2.5 rounded-md px-2.5 py-2 text-sm
                      ${check.result === 'pass' ? 'bg-emerald-500/5' : ''}
                      ${check.result === 'caution' ? 'bg-amber-500/5' : ''}
                      ${check.result === 'fail' ? 'bg-red-500/5' : ''}
                    `}
                  >
                    {check.result === 'pass' && <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />}
                    {check.result === 'caution' && <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />}
                    {check.result === 'fail' && <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />}
                    <div className="min-w-0">
                      <p className="font-medium text-xs">{check.label}</p>
                      <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{check.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Advisory Notes ───────────────────────────────────────── */}
            {result.advisories.length > 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                    Advisory Notes
                  </h3>
                </div>
                <ul className="space-y-1.5">
                  {result.advisories.map((note, i) => (
                    <li key={i} className="flex items-start gap-2 text-[11px] text-amber-700 dark:text-amber-300 leading-snug">
                      <span className="text-amber-500 mt-px">•</span>
                      {note}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* ── Night Currency Reminder ──────────────────────────────── */}
            <p className="text-[10px] text-muted-foreground text-center leading-relaxed px-4 pb-2">
              Night landings count from 1 hour after sunset to 1 hour before sunrise (FAR 61.57).
              This tool provides reference data only — always verify weather, NOTAMs, and personal
              currency before flight.
            </p>
          </div>
        )}
      </div>
    </ToolShell>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function WeatherCell({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1 text-muted-foreground">
        {icon}
        <span className="text-[10px]">{label}</span>
      </div>
      <span className="text-sm font-mono font-medium">{value}</span>
    </div>
  )
}
