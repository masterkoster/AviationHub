'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import {
  Loader2,
  Globe,
  Search,
  Plane,
  Download,
  XCircle,
  ExternalLink,
  MapPin,
  Star,
} from 'lucide-react'
import { DEFAULT_MAP_OPTIONS, type MapLayerOptions } from '@/shared/components/map/map-controls'
import { TileCacheBanner } from '@/desktop/components/tile-cache-banner'
import { MapErrorBoundary } from '@/desktop/components/map-error-boundary'
import { MapAttribution } from './components/map-attribution'
import { CompassRose } from './components/compass-rose'
import {
  downloadFPL, downloadGPX, downloadJSON,
  type WbExportData,
} from '@/app/modules/fuel-saver/lib/exportUtils'
import {
  getSavedRoutes,
  saveRoute,
  deleteRoute,
  duplicateRoute,
} from '@/apps/desktop/src/lib/route-planner-storage'
import { saveFlightPlan } from '@/apps/desktop/src/lib/flight-plan-storage'
import { cloudApi } from '@/apps/desktop/src/lib/cloud-api'
import { fetchMetarBatch, fetchTafBatch } from '@/desktop/lib/weather-fetch'
import { loadPilotCertStatus, evaluateWeatherRules } from '@/desktop/lib/weather-rules'
import type { MetarData, PilotCertStatus, WeatherWarning } from '@/desktop/lib/weather-types'
import { ConfirmDialog } from '@/desktop/components/confirm-dialog'
import { useDesktopAuth } from '@/desktop/hooks/use-desktop-auth'
import { getLocalAircraft, getFlightsByAirport, type LocalAircraft } from '@/apps/desktop/src/lib/local-logbook'
import type { StateInfo } from '@/lib/stateData'
import type { Airport, Waypoint, StoredRoute, AirportDetails, AirportWeather, RouteWeatherSummary } from './types'
import { MapToolbar, type PanelId } from './components/map-toolbar'
import { MapStatusBar } from './components/map-status-bar'
import { MapPanelContainer } from './components/map-panel-container'
import { RoutePanel } from './panels/route-panel'
import { FlightPlanPanel } from './panels/flight-plan-panel'
import { WbPanel } from './panels/wb-panel'
import { WeatherPanel } from './panels/weather-panel'
import { FiltersPanel } from './panels/filters-panel'
import { SavedPanel } from './panels/saved-panel'
import { ExportPanel } from './panels/export-panel'
import { LegalityPanel } from './panels/legality-panel'
import { FuelPanel } from './panels/fuel-panel'

const DesktopMapRenderer = dynamic(() => import('@/shared/components/map/maplibre-map'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading map...
    </div>
  ),
})

/** Haversine distance between two lat/lon points in nautical miles */
function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3440.065 // Earth radius in NM
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** True heading from point A to B in degrees */
function trueHeading(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = (lon2 - lon1) * Math.PI / 180
  const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180)
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) - Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

interface DesktopStateInfo extends StateInfo {
  media?: Array<{
    title: string
    imageUrl: string
    sourceUrl: string
    author: string
    license: string
    licenseUrl: string
  }>
}

function getStateFallbackImage(stateName: string): string {
  return `https://placehold.co/1200x700/0f172a/e2e8f0?text=${encodeURIComponent(stateName)}`
}

function getMustSeeLink(attraction: string, stateName: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`${attraction} ${stateName} official site`)}`
}

async function openExternalUrl(url: string) {
  try {
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl(url)
    return
  } catch {
    // fallback for web/dev contexts
  }
  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

function buildAirportSet(
  items: Airport[],
  sizeMode: 'all' | 'only-large' | 'only-medium' | 'only-small',
  limit: number,
  bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number }
): Airport[] {
  const filtered = items.filter((a) => {
    if (sizeMode === 'only-large') return a.type === 'large_airport'
    if (sizeMode === 'only-medium') return a.type === 'medium_airport'
    if (sizeMode === 'only-small') return a.type === 'small_airport'
    return true
  })

  if (filtered.length <= limit) return filtered

  const cols = 12
  const rows = 8
  const latSpan = Math.max(0.0001, bounds.maxLat - bounds.minLat)
  const lonSpan = Math.max(0.0001, bounds.maxLon - bounds.minLon)

  const cells = new Map<string, Airport[]>()
  for (const a of filtered) {
    const cx = Math.max(0, Math.min(cols - 1, Math.floor(((a.longitude - bounds.minLon) / lonSpan) * cols)))
    const cy = Math.max(0, Math.min(rows - 1, Math.floor(((a.latitude - bounds.minLat) / latSpan) * rows)))
    const key = `${cx}:${cy}`
    const bucket = cells.get(key)
    if (bucket) bucket.push(a)
    else cells.set(key, [a])
  }

  const buckets = Array.from(cells.values())
  const picked: Airport[] = []
  let progressed = true
  while (picked.length < limit && progressed) {
    progressed = false
    for (const bucket of buckets) {
      if (bucket.length === 0) continue
      picked.push(bucket.shift() as Airport)
      progressed = true
      if (picked.length >= limit) break
    }
  }

  return picked
}

const DEFAULT_CENTER: [number, number] = [39.8283, -98.5795]
const DEFAULT_ZOOM = 5

const REGION_BOUNDS = {
  'all-us': { minLat: 24, maxLat: 50, minLon: -125, maxLon: -66 },
  'east-coast': { minLat: 24, maxLat: 47, minLon: -90, maxLon: -66 },
  'west-coast': { minLat: 30, maxLat: 49, minLon: -125, maxLon: -102 },
} as const

export default function DesktopMapPage() {
  const { mode, localUser } = useDesktopAuth()
  const [userAircraft, setUserAircraft] = useState<LocalAircraft[]>([])
  const [selectedAircraftId, setSelectedAircraftId] = useState<string | null>(null)

  const [airports, setAirports] = useState<Airport[]>([])
  const [waypoints, setWaypoints] = useState<Waypoint[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const raw = localStorage.getItem('map_draft_waypoints')
      return raw ? (JSON.parse(raw) as Waypoint[]) : []
    } catch { return [] }
  })
  const [selectedAirport, setSelectedAirport] = useState<Airport | null>(null)
  const [selectedAirportDetails, setSelectedAirportDetails] = useState<AirportDetails | null>(null)
  const [loadingAirportDetails, setLoadingAirportDetails] = useState(false)
  const [selectedStateInfo, setSelectedStateInfo] = useState<DesktopStateInfo | null>(null)
  const stateCacheRef = useRef<Record<string, DesktopStateInfo>>({})
  const [mapCenter, setMapCenter] = useState<[number, number]>(DEFAULT_CENTER)
  const [mapZoom, setMapZoom] = useState(DEFAULT_ZOOM)
  const [mapOptions, setMapOptions] = useState<MapLayerOptions>(DEFAULT_MAP_OPTIONS)
  const [cacheVersion, setCacheVersion] = useState(0)
  const [bounds, setBounds] = useState({ minLat: 25, maxLat: 50, minLon: -125, maxLon: -65 })
  const [loadingAirports, setLoadingAirports] = useState(true)
  const [airportSearch, setAirportSearch] = useState('')
  const [airportResults, setAirportResults] = useState<Airport[]>([])
  const [highlightIdx, setHighlightIdx] = useState(-1)
  const [airportSizeMode, setAirportSizeMode] = useState<'all' | 'only-large' | 'only-medium' | 'only-small'>('all')
  const [airportLimit, setAirportLimit] = useState(() => {
    try {
      const stored = localStorage.getItem('map_airport_limit')
      if (stored !== null) {
        const n = Number(stored)
        if (Number.isFinite(n) && n >= 50 && n <= 5000) return n
      }
    } catch { /* ignore */ }
    return 1000
  })
  const [regionMode, setRegionMode] = useState<'map-view' | 'all-us' | 'east-coast' | 'west-coast'>('map-view')
  const [activePanel, setActivePanel] = useState<PanelId | null>(null)
  const [showAttribution, setShowAttribution] = useState(() => {
    try { return localStorage.getItem('map_attribution_visible') !== 'false' } catch { return true }
  })
  const [attributionDetail, setAttributionDetail] = useState<'minimal' | 'standard' | 'full'>(() => {
    try {
      const v = localStorage.getItem('map_attribution_detail')
      if (v === 'minimal' || v === 'standard' || v === 'full') return v
    } catch {}
    return 'standard'
  })
  const [showMgrsGrid, setShowMgrsGrid] = useState(false)
  const [showRuler, setShowRuler] = useState(false)
  const [showCompass, setShowCompass] = useState(false)
  const [rulerPoints, setRulerPoints] = useState<Array<{ lat: number; lng: number }>>([])
  const [showRangeRings, setShowRangeRings] = useState(false)
  const [rangeRingIntervals, setRangeRingIntervals] = useState<number[]>([25, 50, 100])

  const handleRulerPointRemove = useCallback((index: number) => {
    setRulerPoints((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const handleRulerPointReorder = useCallback((from: number, to: number) => {
    setRulerPoints((prev) => {
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }, [])
  const [routeName, setRouteName] = useState(() => {
    if (typeof window === 'undefined') return ''
    return localStorage.getItem('map_draft_route_name') ?? ''
  })
  const [activeRouteId, setActiveRouteId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return localStorage.getItem('map_draft_route_id') ?? null
  })
  const [savedRoutes, setSavedRoutes] = useState<StoredRoute[]>([])
  const [pendingImport, setPendingImport] = useState<Waypoint[] | null>(null)
  const [importError, setImportError] = useState('')
  const [showAllWaypoints, setShowAllWaypoints] = useState(false)

  // Confirm dialog state
  const [clearWaypointsOpen, setClearWaypointsOpen] = useState(false)
  const [deleteRouteOpen, setDeleteRouteOpen] = useState(false)
  const [routeToDelete, setRouteToDelete] = useState<StoredRoute | null>(null)

  // Flight plan details (desktop planner panel)
  const [callsign, setCallsign] = useState('N12345')
  const [pilotName, setPilotName] = useState('John Doe')
  const [aircraftName, setAircraftName] = useState('Cessna 172S (2022)')
  const [departureAt, setDepartureAt] = useState('')
  const [cruiseAltFt, setCruiseAltFt] = useState(5500)
  const [soulsOnBoard, setSoulsOnBoard] = useState(1)
  const [alternateIcao, setAlternateIcao] = useState('KABC')
  const [remarks, setRemarks] = useState('')
  const [fuelPercent, setFuelPercent] = useState(100)

  // Weight & Balance (C172S baseline)
  const [wbFrontSeats, setWbFrontSeats] = useState(170)
  const [wbRearSeat1, setWbRearSeat1] = useState(170)
  const [wbRearSeat2, setWbRearSeat2] = useState(0)
  const [wbBaggage1, setWbBaggage1] = useState(0)
  const [wbBaggage2, setWbBaggage2] = useState(0)
  const [wbFuelGal, setWbFuelGal] = useState(40)
  const [wbOpen, setWbOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

  // Load user aircraft
  useEffect(() => {
    if (mode !== 'local' || !localUser) return
    let cancelled = false
    async function load() {
      const list = await getLocalAircraft(localUser!.id)
      if (!cancelled) setUserAircraft(list)
    }
    load()
    return () => { cancelled = true }
  }, [mode, localUser])

  useEffect(() => {
    if (localUser?.name) {
      setPilotName(localUser.name)
    }
  }, [localUser])

  function handleSelectAircraftForPlan(aircraftId: string) {
    const ac = userAircraft.find(a => a.id === aircraftId)
    if (!ac) return
    setSelectedAircraftId(aircraftId)

    setCallsign(ac.nNumber)
    const name = ac.nickname ? `${ac.nickname} (${ac.model || ac.nNumber})` : (ac.model || ac.nNumber)
    setAircraftName(name)

    if (ac.fuelCapacity != null) setWbFuelGal(ac.fuelCapacity)

    setFuelPercent(100)
  }

  // Weather state
  const [weatherData, setWeatherData] = useState<Record<string, AirportWeather | null>>({})
  const [weatherLoading, setWeatherLoading] = useState(false)
  const [routeWeather, setRouteWeather] = useState<RouteWeatherSummary | null>(null)
  const [weatherError, setWeatherError] = useState('')
  const [pilotStatus, setPilotStatus] = useState<PilotCertStatus | null>(null)
  const [weatherWarnings, setWeatherWarnings] = useState<WeatherWarning[]>([])

  const weatherCategories = useMemo(() => {
    const cats: Record<string, string> = {}
    for (const [icao, wx] of Object.entries(weatherData)) {
      if (wx?.metar?.flightCategory) cats[icao] = wx.metar.flightCategory
    }
    return cats
  }, [weatherData])

  /** Bearing from second-to-last waypoint to last waypoint */
  const routeBearing = useMemo(() => {
    if (waypoints.length < 2) return null
    const a = waypoints[waypoints.length - 2]
    const b = waypoints[waypoints.length - 1]
    return trueHeading(a.latitude, a.longitude, b.latitude, b.longitude)
  }, [waypoints])

  /** Center point for range rings — last waypoint */
  const rangeRingCenter = useMemo(() => {
    if (waypoints.length === 0) return null
    const last = waypoints[waypoints.length - 1]
    return { lat: last.latitude, lng: last.longitude }
  }, [waypoints])

  const selectedAc = userAircraft.find(a => a.id === selectedAircraftId)
  const fuelMaxGal = selectedAc?.fuelCapacity ?? 56
  const burnGph = selectedAc?.fuelBurn ?? 9.9
  const cruiseKts = selectedAc?.cruiseSpeed ?? 122
  const fuelGal = (fuelMaxGal * fuelPercent) / 100
  const estRangeNm = (fuelGal / burnGph) * cruiseKts

  const wbEmptyWeight = selectedAc?.emptyWeight ?? 1689
  const wbEmptyCg = selectedAc?.emptyCg ?? 39
  const armPilotStation = selectedAc?.armPilot ?? 37
  const armPassengerStation = selectedAc?.armPassenger ?? 73
  const armBaggageStation = selectedAc?.armBaggage ?? 95
  const armBaggage2Station = 123
  const armFuelStation = selectedAc?.armFuel ?? 48
  const wbForwardLimit = selectedAc?.cgMin ?? 35
  const wbAftLimit = selectedAc?.cgMax ?? 47.3

  const wbFuelWeight = wbFuelGal * 6
  const wbPayloadWeight = wbFrontSeats + wbRearSeat1 + wbRearSeat2 + wbBaggage1 + wbBaggage2
  const wbTotalWeight = wbEmptyWeight + wbPayloadWeight + wbFuelWeight
  const wbMoment =
    wbEmptyWeight * wbEmptyCg +
    wbFrontSeats * armPilotStation +
    (wbRearSeat1 + wbRearSeat2) * armPassengerStation +
    wbBaggage1 * armBaggageStation +
    wbBaggage2 * armBaggage2Station +
    wbFuelWeight * armFuelStation
  const wbCg = wbTotalWeight > 0 ? wbMoment / wbTotalWeight : 0
  const wbWithinLimits = wbCg >= wbForwardLimit && wbCg <= wbAftLimit
  const wbCgPercent = Math.min(
    100,
    Math.max(0, ((wbCg - wbForwardLimit) / (wbAftLimit - wbForwardLimit)) * 100)
  )

  useEffect(() => {
    fetchAirportsInBounds()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    loadSavedRoutes()
  }, [])

  // Load pilot cert status for weather warnings
  useEffect(() => {
    if (mode !== 'local' || !localUser?.id) return
    let cancelled = false
    loadPilotCertStatus(localUser.id)
      .then((status) => {
        if (!cancelled) setPilotStatus(status)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [mode, localUser?.id])

  async function loadSavedRoutes() {
    const routes = await getSavedRoutes()
    setSavedRoutes(routes)
  }

  useEffect(() => {
    try { localStorage.setItem('map_draft_waypoints', JSON.stringify(waypoints)) } catch {}
  }, [waypoints])

  // Auto-fetch weather when waypoints change (debounced 600ms)
  useEffect(() => {
    if (waypoints.length === 0) {
      setWeatherData({})
      setRouteWeather(null)
      setWeatherWarnings([])
      return
    }
    if (weatherTimerRef.current) clearTimeout(weatherTimerRef.current)
    weatherTimerRef.current = setTimeout(() => {
      fetchRouteWeather()
    }, 600)
    return () => {
      if (weatherTimerRef.current) clearTimeout(weatherTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waypoints])

  useEffect(() => {
    try { localStorage.setItem('map_draft_route_name', routeName) } catch {}
  }, [routeName])

  useEffect(() => {
    try { localStorage.setItem('map_attribution_visible', String(showAttribution)) } catch {}
  }, [showAttribution])

  useEffect(() => {
    try { localStorage.setItem('map_attribution_detail', attributionDetail) } catch {}
  }, [attributionDetail])

  useEffect(() => {
    try { localStorage.setItem('map_airport_limit', String(airportLimit)) } catch {}
  }, [airportLimit])

  useEffect(() => {
    try {
      if (activeRouteId) localStorage.setItem('map_draft_route_id', activeRouteId)
      else localStorage.removeItem('map_draft_route_id')
    } catch {}
  }, [activeRouteId])

  const fetchAirportsInBounds = useCallback(async () => {
    setLoadingAirports(true)
    try {
      const activeBounds =
        regionMode === 'map-view' ? bounds : REGION_BOUNDS[regionMode]
      const minSize = airportSizeMode === 'only-large' ? 'large' : airportSizeMode === 'only-medium' ? 'medium' : 'small'
      const queryLimit =
        airportSizeMode === 'only-large'
          ? airportLimit
          : airportSizeMode === 'only-medium'
            ? Math.min(7000, Math.max(1500, airportLimit * 4))
            : Math.min(10000, Math.max(3000, airportLimit * 8))
      const url = `/api/airports/bounds?minLat=${activeBounds.minLat}&maxLat=${activeBounds.maxLat}&minLon=${activeBounds.minLon}&maxLon=${activeBounds.maxLon}&minSize=${minSize}&limit=${queryLimit}&country=US`
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        const incoming = Array.isArray(data.airports) ? data.airports : []
        setAirports(buildAirportSet(incoming, airportSizeMode, airportLimit, activeBounds))
      }
    } catch (e) {
      console.error('Airport fetch failed:', e)
    } finally {
      setLoadingAirports(false)
    }
  }, [bounds, airportSizeMode, airportLimit, regionMode])

  useEffect(() => {
    fetchAirportsInBounds()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [airportSizeMode, airportLimit, regionMode])

  useEffect(() => {
    if (regionMode === 'east-coast') {
      setMapCenter([37.5, -78.5])
      setMapZoom(6)
    } else if (regionMode === 'west-coast') {
      setMapCenter([38.8, -118.5])
      setMapZoom(6)
    } else if (regionMode === 'all-us') {
      setMapCenter(DEFAULT_CENTER)
      setMapZoom(DEFAULT_ZOOM)
    }
  }, [regionMode])

  const boundsTimerRef = useRef<NodeJS.Timeout | null>(null)
  const weatherTimerRef = useRef<NodeJS.Timeout | null>(null)
  const handleBoundsChange = useCallback(
    (newBounds: typeof bounds) => {
      setBounds(newBounds)
      if (regionMode !== 'map-view') return
      if (boundsTimerRef.current) clearTimeout(boundsTimerRef.current)
      boundsTimerRef.current = setTimeout(() => fetchAirportsInBounds(), 220)
    },
    [fetchAirportsInBounds, regionMode]
  )

  // ---- Airport search — auto-searches as you type ----
  useEffect(() => {
    if (airportSearch.trim().length < 1) {
      setAirportResults([])
      setHighlightIdx(-1)
      return
    }
    const t = setTimeout(async () => {
      try {
        const data = await cloudApi.getAirports({ q: airportSearch, limit: 8, country: 'US' })
        setAirportResults(
          (data.airports || []).map((a): Airport => ({
            icao: a.icao,
            iata: a.iata ?? undefined,
            name: a.name,
            city: a.city ?? undefined,
            latitude: a.latitude,
            longitude: a.longitude,
            type: a.type ?? undefined,
          }))
        )
        setHighlightIdx(-1)
      } catch {
        setAirportResults([])
      }
    }, 150)
    return () => clearTimeout(t)
  }, [airportSearch])

  const handleAddWaypoint = useCallback((airport: Airport) => {
    setWaypoints((prev) => {
      if (prev.some((w) => w.icao === airport.icao)) return prev
      return [
        ...prev,
        {
          id: airport.icao,
          icao: airport.icao,
          name: airport.name,
          latitude: airport.latitude,
          longitude: airport.longitude,
        },
      ]
    })
    setAirportSearch('')
    setAirportResults([])
    setHighlightIdx(-1)
    setMapCenter([airport.latitude, airport.longitude])
    setMapZoom((z) => Math.max(z, 8))
    searchRef.current?.focus()
  }, [])

  const handleSelectAirport = useCallback((airport: Airport) => {
    setSelectedAirport(airport)
    setLoadingAirportDetails(true)
    setSelectedAirportDetails(null)
    cloudApi.getAirport(airport.icao)
      .then((data) => {
        setSelectedAirportDetails(data as unknown as AirportDetails)
      })
      .catch(() => {
        setSelectedAirportDetails(null)
      })
      .finally(() => setLoadingAirportDetails(false))
    setMapCenter([airport.latitude, airport.longitude])
    setMapZoom((z) => Math.max(z, 8))
  }, [])

  const handleViewStateInfo = useCallback((stateCode: string) => {
    const normalized = stateCode.toUpperCase().replace(/^US-/, '')
    if (!normalized) return

    if (stateCacheRef.current[normalized]) {
      setSelectedStateInfo(stateCacheRef.current[normalized])
      return
    }

    import('@/lib/stateData')
      .then(async (mod) => {
        const info = mod.stateData[normalized]
        if (!info) return
        let media: DesktopStateInfo['media'] = []
        try {
          const data = await cloudApi.getStateMedia(normalized)
          media = Array.isArray(data?.images) ? data.images : []
        } catch {
          media = []
        }
        const enriched: DesktopStateInfo = {
          ...info,
          media,
        }
        stateCacheRef.current = { ...stateCacheRef.current, [normalized]: enriched }
        setSelectedStateInfo(enriched)
      })
      .catch(() => {
        // ignore failures
      })
  }, [])

  const handleRemoveWaypoint = (icao: string) => {
    setWaypoints((prev) => prev.filter((w) => w.icao !== icao))
  }

  const handleCloseAirportContext = useCallback(() => {
    setSelectedAirport(null)
    setSelectedAirportDetails(null)
    setSelectedStateInfo(null)
  }, [])

  const fetchRouteWeather = useCallback(async () => {
    if (waypoints.length === 0) return
    setWeatherLoading(true)
    setWeatherError('')

    try {
      // Fetch METAR/TAF for each waypoint from NOAA directly
      const results: Record<string, AirportWeather | null> = {}
      const icaoList = [...new Set(waypoints.map((w) => w.icao))].filter((icao) => icao.length >= 3 && icao.length <= 4)

      // Batch-fetch METARs and TAFs from NOAA (parallel for speed)
      const [metarMap, tafMap] = await Promise.all([
        fetchMetarBatch(icaoList),
        fetchTafBatch(icaoList),
      ])

      for (const icao of icaoList) {
        const metar = metarMap[icao]
        const taf = tafMap[icao]
        results[icao] = {
          icao,
          metar: metar && metar.rawText
            ? {
                observationTime: metar.observationTime,
                rawText: metar.rawText,
                tempC: metar.tempC,
                dewpointC: metar.dewpointC,
                windDirKts: metar.windDirDeg,
                windSpeedKts: metar.windSpeedKts,
                windGustKts: metar.windGustKts,
                visibilitySm: metar.visibilitySm,
                altHg: metar.altimeterHg,
                flightCategory: metar.flightCategory,
              }
            : null,
          taf: taf && taf.rawText ? { rawText: taf.rawText } : null,
          fetchedAt: new Date().toISOString(),
        }
      }
      setWeatherData(results)

      // Run rules engine for departure airport warnings
      if (pilotStatus && waypoints.length > 0) {
        const depIcao = waypoints[0].icao
        const depMetar = metarMap[depIcao]
        if (depMetar) {
          const rulesResult = evaluateWeatherRules({
            metar: depMetar,
            pilotStatus,
            departureIcao: depIcao,
            departureTime: new Date(),
          })
          setWeatherWarnings(rulesResult.warnings)
        }
      }

      // If 2+ waypoints, fetch route weather impact via local API
      if (waypoints.length >= 2) {
        try {
          const data = await cloudApi.getRouteWeather({
            waypoints: waypoints.map((w) => ({ icao: w.icao, lat: w.latitude, lon: w.longitude })),
            altitude: cruiseAltFt,
            aircraftTAS: cruiseKts,
            fuelBurnGph: burnGph,
          }) as {
            summary?: {
              totalDistance?: number
              totalTimeStillAir?: number
              totalTimeWithWind?: number
              fuelImpact?: number
              fuelImpactPercent?: number
              significant?: boolean
            }
            segments?: RouteWeatherSummary['segments']
          }
          setRouteWeather({
            totalDistance: data.summary?.totalDistance,
            totalTimeStillAir: data.summary?.totalTimeStillAir,
            totalTimeWithWind: data.summary?.totalTimeWithWind,
            fuelImpact: data.summary?.fuelImpact,
            fuelImpactPercent: data.summary?.fuelImpactPercent,
            significant: data.summary?.significant,
            segments: data.segments,
          })
        } catch {
          // non-fatal
        }
      }
    } catch (err) {
      setWeatherError(err instanceof Error ? err.message : 'Weather fetch failed')
    } finally {
      setWeatherLoading(false)
    }
  }, [waypoints, cruiseAltFt, cruiseKts, burnGph, pilotStatus])

  const filteredAirports = useMemo(() => {
    return airports.filter((a) => {
      if (airportSizeMode === 'only-large' && a.type !== 'large_airport') return false
      if (airportSizeMode === 'only-medium' && a.type !== 'medium_airport') return false
      if (airportSizeMode === 'only-small' && a.type !== 'small_airport') return false
      if (!a.type) return true
      try {
        if (a.type === 'large_airport' && !mapOptions.showLarge) return false
        if (a.type === 'medium_airport' && !mapOptions.showMedium) return false
        if (a.type === 'small_airport' && !mapOptions.showSmall) return false
        if (a.type === 'seaplane_base' && !mapOptions.showSeaplane) return false
        if (a.type === 'heliport') return false
        return true
      } catch {
        return true
      }
    })
  }, [airports, mapOptions, airportSizeMode])

  function applyAirportSizeMode(mode: 'all' | 'only-large' | 'only-medium' | 'only-small') {
    setAirportSizeMode(mode)
    setMapOptions((prev) => {
      if (mode === 'all') {
        return { ...prev, showLarge: true, showMedium: true, showSmall: true }
      }
      if (mode === 'only-large') {
        return { ...prev, showLarge: true, showMedium: false, showSmall: false }
      }
      if (mode === 'only-medium') {
        return { ...prev, showLarge: false, showMedium: true, showSmall: false }
      }
      return { ...prev, showLarge: false, showMedium: false, showSmall: true }
    })
  }

  async function exportRoute(kind: 'gpx' | 'fpl' | 'json') {
    if (waypoints.length < 2) return
    if (kind === 'gpx') {
      await downloadGPX({ name: 'Desktop Route', waypoints })
      return
    }
    if (kind === 'fpl') {
      const wbData: WbExportData = {
        emptyWeight: wbEmptyWeight,
        emptyCg: wbEmptyCg,
        frontSeats: wbFrontSeats,
        rearSeats: wbRearSeat1 + wbRearSeat2,
        baggage: wbBaggage1 + wbBaggage2,
        fuelGal: wbFuelGal,
        fuelWeight: wbFuelWeight,
        totalWeight: wbTotalWeight,
        cg: wbCg,
        cgMin: wbForwardLimit,
        cgMax: wbAftLimit,
        withinLimits: wbWithinLimits,
        armPilot: armPilotStation,
        armPassenger: armPassengerStation,
        armBaggage: armBaggageStation,
        armFuel: armFuelStation,
      }
      await downloadFPL(waypoints, wbData)
      return
    }
    await downloadJSON({ name: 'Desktop Route', waypoints })
  }

  function applyImportedRoute(imported: Waypoint[], mode: 'replace' | 'merge') {
    if (mode === 'replace') {
      setWaypoints(imported)
    } else {
      setWaypoints((prev) => {
        const map = new Map<string, Waypoint>()
        for (const w of prev) map.set(w.icao, w)
        for (const w of imported) {
          if (!map.has(w.icao)) map.set(w.icao, w)
        }
        return Array.from(map.values())
      })
    }
    setMapCenter([imported[0].latitude, imported[0].longitude])
    setMapZoom(8)
    setPendingImport(null)
    setImportError('')
    setActiveRouteId(null)
  }

  function parseFpl(content: string): Waypoint[] {
    const tokens = content
      .split(/[^A-Z0-9]+/g)
      .map((t) => t.trim().toUpperCase())
      .filter((t) => t.length >= 3 && t.length <= 5)

    const result: Waypoint[] = []
    for (const tok of tokens) {
      const airport = airports.find((a) => a.icao.toUpperCase() === tok || a.iata?.toUpperCase() === tok)
      if (!airport) continue
      if (result.some((w) => w.icao === airport.icao)) continue
      result.push({
        id: airport.icao,
        icao: airport.icao,
        name: airport.name,
        latitude: airport.latitude,
        longitude: airport.longitude,
      })
    }
    return result
  }

  function parseGpx(content: string): Waypoint[] {
    const parser = new DOMParser()
    const doc = parser.parseFromString(content, 'text/xml')
    const pts = Array.from(doc.querySelectorAll('wpt, rtept'))
    const result: Waypoint[] = []
    for (const pt of pts) {
      const lat = Number(pt.getAttribute('lat') || '0')
      const lon = Number(pt.getAttribute('lon') || '0')
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
      const name = pt.querySelector('name')?.textContent?.trim() || `WPT${result.length + 1}`
      const airport = airports.find((a) => a.icao.toUpperCase() === name.toUpperCase())
      result.push({
        id: `${name}-${result.length}`,
        icao: airport?.icao || name.slice(0, 5).toUpperCase(),
        name: airport?.name || name,
        latitude: airport?.latitude ?? lat,
        longitude: airport?.longitude ?? lon,
      })
    }
    return result
  }

  function parseJson(content: string): Waypoint[] {
    const parsed = JSON.parse(content) as { waypoints?: Array<Partial<Waypoint>> }
    const result: Waypoint[] = []
    for (const wp of parsed.waypoints || []) {
      if (!wp.icao || typeof wp.latitude !== 'number' || typeof wp.longitude !== 'number') continue
      result.push({
        id: String(wp.id || wp.icao),
        icao: String(wp.icao).toUpperCase(),
        name: String(wp.name || wp.icao),
        latitude: wp.latitude,
        longitude: wp.longitude,
      })
    }
    return result
  }

  async function importRouteFile(file: File) {
    const content = await file.text()
    let imported: Waypoint[] = []
    const lower = file.name.toLowerCase()
    try {
      if (lower.endsWith('.gpx')) imported = parseGpx(content)
      else if (lower.endsWith('.fpl') || lower.endsWith('.txt')) imported = parseFpl(content)
      else if (lower.endsWith('.json')) imported = parseJson(content)
    } catch {
      imported = []
    }

    if (imported.length > 0) {
      if (waypoints.length > 0) {
        setPendingImport(imported)
      } else {
        applyImportedRoute(imported, 'replace')
      }
    } else {
      setImportError('Could not parse route file. Supported: GPX, FPL, JSON.')
    }
  }

  async function handleSaveCurrentRoute() {
    if (waypoints.length < 2) return
    const saved = await saveRoute(routeName || 'Untitled Route', waypoints, activeRouteId || undefined)
    setActiveRouteId(saved.id)
    setRouteName(saved.name)
    await loadSavedRoutes()
  }

  async function handleSaveAsRoute() {
    if (waypoints.length < 2) return
    // Save as new route (no routeId = creates new)
    const saved = await saveRoute(routeName || 'Untitled Route', waypoints)
    setActiveRouteId(saved.id)
    setRouteName(saved.name)
    await loadSavedRoutes()
  }

  function openSavedRoute(route: StoredRoute) {
    const waypointsFromRoute = route.waypoints.map((w) => ({ ...w }))
    setWaypoints(waypointsFromRoute)
    setRouteName(route.name)
    setActiveRouteId(route.id)
    if (waypointsFromRoute.length > 0) {
      setMapCenter([waypointsFromRoute[0].latitude, waypointsFromRoute[0].longitude])
      setMapZoom(8)
    }
  }

  function handleDeleteRoute(route: StoredRoute) {
    setRouteToDelete(route)
    setDeleteRouteOpen(true)
  }

  async function confirmDeleteRoute() {
    if (!routeToDelete) return
    await deleteRoute(routeToDelete.id)
    if (activeRouteId === routeToDelete.id) {
      setActiveRouteId(null)
      setRouteName('')
    }
    await loadSavedRoutes()
    setDeleteRouteOpen(false)
    setRouteToDelete(null)
  }

  function handleClearWaypoints() {
    setClearWaypointsOpen(true)
  }

  function confirmClearWaypoints() {
    setWaypoints([])
    setClearWaypointsOpen(false)
  }

  async function handleDuplicateRoute(route: StoredRoute) {
    await duplicateRoute(route.id)
    await loadSavedRoutes()
  }

  // Keyboard navigation for search dropdown
  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (airportResults.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIdx((i) => Math.min(i + 1, airportResults.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (highlightIdx >= 0 && highlightIdx < airportResults.length) {
        handleAddWaypoint(airportResults[highlightIdx])
      } else if (airportResults.length > 0) {
        handleAddWaypoint(airportResults[0])
      }
    } else if (e.key === 'Escape') {
      setAirportResults([])
      setHighlightIdx(-1)
    }
  }


  // ── Log Flight: navigate to logbook with route pre-filled ──
  function handleLogFlightFromWaypoints(routeWaypoints: Waypoint[]) {
    if (routeWaypoints.length < 2) return
    const first = routeWaypoints[0]
    const last = routeWaypoints[routeWaypoints.length - 1]
    const today = new Date().toISOString().slice(0, 10)
    const remarks = routeWaypoints.map((w) => w.icao).join('→')
    window.location.href = `/desktop/logbook/new?routeFrom=${encodeURIComponent(first.icao)}&routeTo=${encodeURIComponent(last.icao)}&date=${today}&remarks=${encodeURIComponent(remarks)}`
  }

  function handleLogFlightSaved(route: StoredRoute) {
    if (route.waypoints.length < 2) return
    handleLogFlightFromWaypoints(route.waypoints)
  }

  function handleLogFlightActive() {
    handleLogFlightFromWaypoints(waypoints)
  }

  // ── Reorder waypoints (for RoutePanel drag-reorder) ──
  const handleReorder = useCallback((from: number, to: number) => {
    setWaypoints((prev) => {
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }, [])

  // ── Optimize waypoints (nearest neighbor shortest path) ──
  const handleOptimize = useCallback(() => {
    setWaypoints((prev) => {
      if (prev.length < 3) return prev
      const sorted = [...prev]
      const start = sorted[0]
      const result: Waypoint[] = [start]
      const remaining = sorted.slice(1)

      while (remaining.length > 0) {
        const last = result[result.length - 1]
        let nearestIdx = 0
        let nearestDist = haversineNm(last.latitude, last.longitude, remaining[0].latitude, remaining[0].longitude)
        for (let i = 1; i < remaining.length; i++) {
          const d = haversineNm(last.latitude, last.longitude, remaining[i].latitude, remaining[i].longitude)
          if (d < nearestDist) { nearestDist = d; nearestIdx = i }
        }
        result.push(remaining[nearestIdx])
        remaining.splice(nearestIdx, 1)
      }
      return result
    })
  }, [])

  // ── Round trip: append first waypoint to end ──
  const handleRoundTrip = useCallback(() => {
    setWaypoints((prev) => {
      if (prev.length < 2) return prev
      const first = prev[0]
      const last = prev[prev.length - 1]
      // If first and last are already the same, remove the duplicate
      if (first.icao === last.icao) {
        return prev.slice(0, -1)
      }
      return [...prev, { ...first, id: `${first.id}-rtn` }]
    })
  }, [])

  // ── File flight plan on 1800wxbrief (deep-link) ──
  function handleFileFlightPlan() {
    const route = waypoints.map((w) => w.icao).join(' ')
    const url = `https://www.1800wxbrief.com/Website?geocode=icao&route=${encodeURIComponent(route)}`
    openExternalUrl(url)
  }

  const panelTitles: Record<PanelId, string> = {
    route: 'Route',
    plan: 'Flight Plan',
    wb: 'Weight and Balance',
    weather: 'Weather',
    legality: 'Legality Check',
    fuel: 'Fuel',
    layers: 'Layers and Filters',
    saved: 'Saved Routes',
    export: 'Export and File',
  }

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border bg-card px-4">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-primary" />
          <h1 className="text-sm font-semibold">Airport Map</h1>
          {loadingAirports ? (
            <span className="text-xs text-muted-foreground">
              <Loader2 className="inline mr-1 h-3 w-3 animate-spin" />
              Loading...
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              {filteredAirports.length} airports in view
            </span>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground">
          <kbd className="rounded border border-border bg-muted px-1 font-mono">Ctrl 7</kbd>
        </div>
      </div>

      {/* Body: full-screen map + toolbar + slide-out panel */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* Full-screen map */}
        <div className="relative flex-1">
          <MapErrorBoundary
            resetKey={cacheVersion}
            fallback={
              <div className="flex h-full items-center justify-center bg-muted/30">
                <button
                  onClick={() => setCacheVersion((v) => v + 1)}
                  className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
                >
                  Reload map
                </button>
              </div>
            }
          >
            <DesktopMapRenderer
              key={`${cacheVersion}-${mapOptions.baseLayer}`}
              airports={filteredAirports}
              waypoints={waypoints}
              onBoundsChange={handleBoundsChange}
              onAirportClick={handleSelectAirport}
              onAirportAddToRoute={handleAddWaypoint}
              onViewStateInfo={handleViewStateInfo}
              onAirportClose={handleCloseAirportContext}
              onOpenExternal={openExternalUrl}
              mapCenter={mapCenter}
              mapZoom={mapZoom}
              showTfrs={mapOptions.showTfrs}
              showPireps={mapOptions.showPireps}
              showMgrsGrid={showMgrsGrid}
              showRuler={showRuler}
              rulerPoints={rulerPoints}
              onRulerPointAdd={(pt) => setRulerPoints((prev) => [...prev, pt])}
              onRulerClear={() => setRulerPoints([])}
              showRangeRings={showRangeRings}
              rangeRingCenter={rangeRingCenter}
              rangeRingIntervals={rangeRingIntervals}
              baseLayer={mapOptions.baseLayer}
              performanceMode={mapOptions.performanceMode}
              maxAirportsToRender={airportLimit}
              clusterAirports={false}
              weatherCategories={weatherCategories}
              userId={localUser?.id ?? null}
              onFlightHistory={localUser?.id ? async (icao) => {
                const flights = await getFlightsByAirport(localUser!.id, icao, 10)
                return flights.map(f => ({
                  date: f.date,
                  aircraft: f.aircraft,
                  routeFrom: f.routeFrom || '',
                  routeTo: f.routeTo || '',
                  totalTime: f.totalTime,
                }))
              } : undefined}
            />
          </MapErrorBoundary>
          <div className="absolute left-2 top-2 z-[1000]">
            <TileCacheBanner
              provider={mapOptions.baseLayer}
              onRefresh={() => setCacheVersion((v) => v + 1)}
            />
          </div>
          {showAttribution && (
            <MapAttribution baseLayer={mapOptions.baseLayer} detail={attributionDetail} />
          )}
          {showCompass && <CompassRose bearing={routeBearing} />}
          {selectedStateInfo && (
            <DesktopStateInfoPanel
              key={selectedStateInfo.state}
              stateInfo={selectedStateInfo}
              onClose={() => setSelectedStateInfo(null)}
            />
          )}
        </div>

        {/* Vertical toolbar */}
        <MapToolbar
          activePanel={activePanel}
          onTogglePanel={(p) => setActivePanel((prev) => (prev === p ? null : p))}
          hasWaypoints={waypoints.length > 0}
          hasRoute={waypoints.length >= 2}
        />

        {/* Slide-out panel */}
        {activePanel && (
          <MapPanelContainer
            open={!!activePanel}
            onClose={() => setActivePanel(null)}
            title={panelTitles[activePanel]}
          >
            {activePanel === 'route' && (
              <RoutePanel
                waypoints={waypoints}
                airportSearch={airportSearch}
                setAirportSearch={setAirportSearch}
                airportResults={airportResults}
                onAddWaypoint={handleAddWaypoint}
                onRemoveWaypoint={handleRemoveWaypoint}
                onClearWaypoints={handleClearWaypoints}
                onReorder={handleReorder}
                onOptimize={handleOptimize}
                onRoundTrip={handleRoundTrip}
                onExport={exportRoute}
                onImportFile={importRouteFile}
                routeName={routeName}
                setRouteName={setRouteName}
                onSaveRoute={handleSaveCurrentRoute}
                onSaveAs={activeRouteId ? handleSaveAsRoute : undefined}
                isExistingRoute={!!activeRouteId}
                onSaveFlightPlan={() => saveFlightPlan({ name: routeName || 'My Cross Country', callsign, pilotName, aircraftName, departureAt, cruiseAltFt, soulsOnBoard, alternateIcao, remarks, fuelPercent, waypoints: waypoints.map((w) => ({ icao: w.icao, name: w.name })) })}
                onLogFlight={handleLogFlightActive}
              />
            )}
            {activePanel === 'plan' && (
              <FlightPlanPanel
                callsign={callsign} setCallsign={setCallsign}
                pilotName={pilotName} setPilotName={setPilotName}
                aircraftName={aircraftName} setAircraftName={setAircraftName}
                departureAt={departureAt} setDepartureAt={setDepartureAt}
                cruiseAltFt={cruiseAltFt} setCruiseAltFt={setCruiseAltFt}
                soulsOnBoard={soulsOnBoard} setSoulsOnBoard={setSoulsOnBoard}
                alternateIcao={alternateIcao} setAlternateIcao={setAlternateIcao}
                remarks={remarks} setRemarks={setRemarks}
                fuelPercent={fuelPercent} setFuelPercent={setFuelPercent}
                fuelGal={fuelGal} burnGph={burnGph} cruiseKts={cruiseKts} estRangeNm={estRangeNm}
                userAircraft={userAircraft} selectedAircraftId={selectedAircraftId}
                onSelectAircraft={handleSelectAircraftForPlan}
                onSave={() => saveFlightPlan({ name: routeName || 'My Cross Country', callsign, pilotName, aircraftName, departureAt, cruiseAltFt, soulsOnBoard, alternateIcao, remarks, fuelPercent, waypoints: waypoints.map((w) => ({ icao: w.icao, name: w.name })) })}
              />
            )}
            {activePanel === 'wb' && (
              <WbPanel
                aircraftName={aircraftName} setAircraftName={setAircraftName}
                wbFrontSeats={wbFrontSeats} setWbFrontSeats={setWbFrontSeats}
                wbRearSeat1={wbRearSeat1} setWbRearSeat1={setWbRearSeat1}
                wbRearSeat2={wbRearSeat2} setWbRearSeat2={setWbRearSeat2}
                wbBaggage1={wbBaggage1} setWbBaggage1={setWbBaggage1}
                wbBaggage2={wbBaggage2} setWbBaggage2={setWbBaggage2}
                wbFuelGal={wbFuelGal} setWbFuelGal={setWbFuelGal}
                wbEmptyWeight={wbEmptyWeight} wbPayloadWeight={wbPayloadWeight}
                wbFuelWeight={wbFuelWeight} wbTotalWeight={wbTotalWeight}
                wbCg={wbCg} wbForwardLimit={wbForwardLimit} wbAftLimit={wbAftLimit}
                wbWithinLimits={wbWithinLimits} wbCgPercent={wbCgPercent}
                selectedAircraftModel={selectedAc?.model ?? null}
              />
            )}
            {activePanel === 'weather' && (
              <WeatherPanel
                waypoints={waypoints}
                weatherData={weatherData}
                routeWeather={routeWeather}
                weatherLoading={weatherLoading}
                weatherError={weatherError}
                onRefresh={fetchRouteWeather}
              />
            )}
            {activePanel === 'fuel' && (
              <FuelPanel
                fuelGal={fuelGal}
                fuelMaxGal={fuelMaxGal}
                fuelPercent={fuelPercent}
                setFuelPercent={setFuelPercent}
                burnGph={burnGph}
                cruiseKts={cruiseKts}
                estRangeNm={estRangeNm}
                waypoints={waypoints}
                aircraftName={aircraftName}
              />
            )}
            {activePanel === 'layers' && (
              <FiltersPanel
                airportSizeMode={airportSizeMode} setAirportSizeMode={setAirportSizeMode}
                airportLimit={airportLimit} setAirportLimit={setAirportLimit}
                regionMode={regionMode} setRegionMode={setRegionMode}
                airportCount={filteredAirports.length}
                mapOptions={mapOptions} onMapOptionsChange={setMapOptions}
                showAttribution={showAttribution} onShowAttributionChange={setShowAttribution}
                attributionDetail={attributionDetail} onAttributionDetailChange={setAttributionDetail}
                showMgrsGrid={showMgrsGrid} onShowMgrsGridChange={setShowMgrsGrid}
                showRuler={showRuler} onShowRulerChange={setShowRuler}
                showCompass={showCompass} onShowCompassChange={setShowCompass}
                rulerPointCount={rulerPoints.length} rulerPoints={rulerPoints}
                onRulerPointRemove={handleRulerPointRemove} onRulerPointReorder={handleRulerPointReorder}
                onRulerClear={() => setRulerPoints([])}
                showRangeRings={showRangeRings} onShowRangeRingsChange={setShowRangeRings}
                rangeRingIntervals={rangeRingIntervals} onRangeRingIntervalsChange={setRangeRingIntervals}
              />
            )}
            {activePanel === 'saved' && (
              <SavedPanel
                savedRoutes={savedRoutes} activeRouteId={activeRouteId}
                onOpenRoute={openSavedRoute} onDuplicateRoute={handleDuplicateRoute}
                onDeleteRoute={handleDeleteRoute}
                onLogFlight={handleLogFlightSaved}
              />
            )}
            {activePanel === 'export' && (
              <ExportPanel
                waypoints={waypoints} routeName={routeName}
                onExport={exportRoute} onFileFlightPlan={handleFileFlightPlan}
                weatherData={weatherData}
                fuelGal={fuelGal} burnGph={burnGph} cruiseKts={cruiseKts} estRangeNm={estRangeNm}
                callsign={callsign} pilotName={pilotName} aircraftName={aircraftName}
                departureAt={departureAt} cruiseAltFt={cruiseAltFt}
              />
            )}
            {activePanel === 'legality' && (
              <LegalityPanel
                waypoints={waypoints}
                weatherData={weatherData}
                pilotStatus={pilotStatus}
                weatherWarnings={weatherWarnings}
              />
            )}
          </MapPanelContainer>
        )}
      </div>

      {/* Bottom status bar */}
      <MapStatusBar
        waypoints={waypoints}
        fuelPercent={fuelPercent}
        wbWithinLimits={wbWithinLimits}
        wbCg={wbCg}
        estRangeNm={estRangeNm}
      />
      {/* Confirm dialogs */}
      <ConfirmDialog
        open={clearWaypointsOpen}
        onOpenChange={setClearWaypointsOpen}
        onConfirm={confirmClearWaypoints}
        title="Clear all waypoints?"
        description="This will remove all waypoints from the current route. This action cannot be undone."
        confirmLabel="Clear"
        destructive={false}
      />
      <ConfirmDialog
        open={deleteRouteOpen}
        onOpenChange={setDeleteRouteOpen}
        onConfirm={confirmDeleteRoute}
        title="Delete saved route?"
        description="This will permanently delete this saved route. This action cannot be undone."
        confirmLabel="Delete"
        destructive
      />
    </div>
  )
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}

function Stat({ text, value }: { text: string; value: string }) {
  return (
    <div className="rounded border border-border bg-card px-2 py-1">
      <p className="text-[10px] text-muted-foreground">{text}</p>
      <p className="font-semibold">{value}</p>
    </div>
  )
}

function DesktopStateInfoPanel({
  stateInfo,
  onClose,
}: {
  stateInfo: DesktopStateInfo
  onClose: () => void
}) {
  const media = stateInfo.media && stateInfo.media.length > 0
    ? stateInfo.media.slice(0, 5)
    : [
        {
          title: `${stateInfo.stateName} landscape`,
          imageUrl: getStateFallbackImage(stateInfo.stateName),
          sourceUrl: `https://www.airnav.com/state/${stateInfo.state}`,
          author: 'Fallback image',
          license: 'N/A',
          licenseUrl: '',
        },
      ]
  const [slideIndex, setSlideIndex] = useState(0)

  useEffect(() => {
    if (media.length <= 1) return
    const id = window.setInterval(() => {
      setSlideIndex((i) => (i + 1) % media.length)
    }, 5000)
    return () => window.clearInterval(id)
  }, [media.length])

  const active = media[slideIndex]

  return (
    <div className="absolute right-4 top-4 z-[1100] w-[420px] overflow-hidden rounded-xl border border-border bg-card/95 shadow-2xl backdrop-blur">
      <div className="relative h-48 w-full overflow-hidden">
        <button onClick={() => openExternalUrl(active.sourceUrl)} className="block h-full w-full">
          <img
            src={active.imageUrl}
            alt={active.title}
            className="h-full w-full object-cover"
            onError={(e) => {
              const next = getStateFallbackImage(stateInfo.stateName)
              const img = e.currentTarget as HTMLImageElement
              if (img.src !== next) {
                img.src = next
              }
            }}
          />
        </button>
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <button
          onClick={onClose}
          className="absolute right-2 top-2 rounded-full bg-black/50 p-1 text-white hover:bg-black/70"
          title="Close"
        >
          <XCircle className="h-4 w-4" />
        </button>
        <div className="absolute bottom-2 left-3 text-white">
          <p className="text-xs font-semibold tracking-wide">{stateInfo.state}</p>
          <h3 className="text-lg font-bold leading-tight">{stateInfo.stateName}</h3>
        </div>
        {media.length > 1 && (
          <div className="absolute bottom-2 right-2 flex items-center gap-1">
            {media.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setSlideIndex(idx)}
                className={`h-1.5 w-1.5 rounded-full ${idx === slideIndex ? 'bg-white' : 'bg-white/45 hover:bg-white/70'}`}
                aria-label={`View slide ${idx + 1}`}
              />
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3 p-3">
        <div className="rounded-md border border-border bg-muted/20 p-2 text-xs">
          <p className="truncate font-medium">{active.title}</p>
          <p className="mt-1 truncate text-muted-foreground">
            Photo by {active.author} • {active.license}
          </p>
          <button onClick={() => openExternalUrl(active.sourceUrl)} className="mt-1 inline-flex items-center gap-1 text-primary hover:underline">
            <ExternalLink className="h-3 w-3" /> Open source
          </button>
        </div>

        <p className="text-sm text-muted-foreground">{stateInfo.bio}</p>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md border border-border bg-muted/30 p-2">
            <p className="text-muted-foreground">Capital</p>
            <p className="font-semibold">{stateInfo.capital}</p>
          </div>
          <div className="rounded-md border border-border bg-muted/30 p-2">
            <p className="text-muted-foreground">Climate</p>
            <p className="font-semibold">{stateInfo.climate}</p>
          </div>
        </div>

        <div>
          <p className="mb-1 flex items-center gap-1 text-xs font-semibold text-muted-foreground">
            <Star className="h-3.5 w-3.5" /> Must Sees
          </p>
          <ul className="space-y-1 text-sm">
            {stateInfo.attractions.slice(0, 4).map((item, idx) => (
              <li key={idx} className="rounded-md border border-border bg-muted/20 px-2 py-1">
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    void openExternalUrl(getMustSeeLink(item, stateInfo.stateName))
                  }}
                  className="hover:underline"
                >
                  {item}
                </a>
              </li>
            ))}
          </ul>
        </div>

        {stateInfo.majorAirports.length > 0 && (
          <div>
            <p className="mb-1 flex items-center gap-1 text-xs font-semibold text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" /> Major Airports
            </p>
            <div className="flex flex-wrap gap-1.5">
              {stateInfo.majorAirports.map((icao) => (
                <a
                  key={icao}
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    void openExternalUrl(`https://www.airnav.com/airport/${icao}`)
                  }}
                  className="rounded border border-border bg-card px-2 py-1 text-xs hover:bg-muted"
                >
                  {icao}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
