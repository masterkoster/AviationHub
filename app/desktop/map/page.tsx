'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import {
  Loader2,
  Globe,
  Search,
  Plus,
  X,
  Plane,
  Download,
  Upload,
  Save,
  FolderOpen,
  Copy,
  Trash2,
  Fuel,
  ExternalLink,
  XCircle,
  MapPin,
  Star,
  ClipboardList,
  Scale,
  Wind,
  Thermometer,
  Eye,
  Gauge,
  RefreshCw,
  Clock,
} from 'lucide-react'
import { MapControls, DEFAULT_MAP_OPTIONS, type MapLayerOptions } from '@/shared/components/map/map-controls'
import { TileCacheBanner } from '@/desktop/components/tile-cache-banner'
import { MapErrorBoundary } from '@/desktop/components/map-error-boundary'
import { downloadFPL, downloadGPX, downloadJSON } from '@/app/modules/fuel-saver/lib/exportUtils'
import {
  getSavedRoutes,
  saveRoute,
  deleteRoute,
  duplicateRoute,
  type StoredRoute,
} from '@/apps/desktop/src/lib/route-planner-storage'
import { saveFlightPlan } from '@/apps/desktop/src/lib/flight-plan-storage'
import { cloudApi } from '@/apps/desktop/src/lib/cloud-api'
import type { StateInfo } from '@/lib/stateData'

const DesktopMapRenderer = dynamic(() => import('@/shared/components/map/maplibre-map'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading map...
    </div>
  ),
})

interface Airport {
  icao: string
  iata?: string
  name: string
  city?: string
  latitude: number
  longitude: number
  type?: string
}

interface Waypoint {
  id: string
  icao: string
  name: string
  latitude: number
  longitude: number
}

interface AirportDetails {
  icao: string
  iata?: string
  name: string
  city?: string
  state?: string
  elevation_ft?: number
  runways?: Array<{ length_ft?: number; width_ft?: number; surface?: string }>
  frequencies?: Array<{ frequency_mhz?: number; type?: string }>
  hasTower?: boolean | null
  attendance?: string | null
  phone?: string | null
  manager?: string | null
  fuel?: {
    price100ll?: number
    priceJetA?: number
    source?: string
    sourceUrl?: string
    lastReported?: string
    providerName?: string | null
    providerPhone?: string | null
    community100ll?: { price: number; daysAgo: number; fbo?: string | null } | null
    communityJetA?: { price: number; daysAgo: number; fbo?: string | null } | null
    priceDivergence?: { difference?: string } | null
  } | null
  landingFee?: { amount?: number } | null
}

interface AirportWeather {
  icao: string
  metar?: {
    observationTime?: string
    rawText?: string
    tempC?: number
    dewpointC?: number
    windDirKts?: number
    windSpeedKts?: number
    windGustKts?: number
    visibilitySm?: number
    altHg?: number
    flightCategory?: string
  } | null
  taf?: {
    rawText?: string
  } | null
  fetchedAt?: string
  error?: string
}

interface RouteWeatherSummary {
  totalDistance?: number
  totalTimeStillAir?: number
  totalTimeWithWind?: number
  fuelImpact?: number
  fuelImpactPercent?: number
  significant?: boolean
  segments?: Array<{
    from: string
    to: string
    distance: number
    windSpeed: number
    windFrom: number
    groundSpeed: number
    timeStillAir: number
    timeWithWind: number
  }>
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
  const [airports, setAirports] = useState<Airport[]>([])
  const [waypoints, setWaypoints] = useState<Waypoint[]>([])
  const [selectedAirport, setSelectedAirport] = useState<Airport | null>(null)
  const [selectedAirportDetails, setSelectedAirportDetails] = useState<AirportDetails | null>(null)
  const [loadingAirportDetails, setLoadingAirportDetails] = useState(false)
  const [selectedStateInfo, setSelectedStateInfo] = useState<DesktopStateInfo | null>(null)
  const [stateCache, setStateCache] = useState<Record<string, DesktopStateInfo>>({})
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
  const [airportLimit, setAirportLimit] = useState(400)
  const [regionMode, setRegionMode] = useState<'map-view' | 'all-us' | 'east-coast' | 'west-coast'>('map-view')
  const [menuTab, setMenuTab] = useState<'route' | 'filters' | 'weather'>('route')
  const [routeName, setRouteName] = useState('')
  const [activeRouteId, setActiveRouteId] = useState<string | null>(null)
  const [savedRoutes, setSavedRoutes] = useState<StoredRoute[]>([])
  const [pendingImport, setPendingImport] = useState<Waypoint[] | null>(null)
  const [importError, setImportError] = useState('')

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

  // Weather state
  const [weatherData, setWeatherData] = useState<Record<string, AirportWeather | null>>({})
  const [weatherLoading, setWeatherLoading] = useState(false)
  const [routeWeather, setRouteWeather] = useState<RouteWeatherSummary | null>(null)
  const [weatherError, setWeatherError] = useState('')

  const fuelMaxGal = 56
  const burnGph = 9.9
  const cruiseKts = 122
  const fuelGal = (fuelMaxGal * fuelPercent) / 100
  const estRangeNm = (fuelGal / burnGph) * cruiseKts

  const wbEmptyWeight = 1689
  const wbEmptyCg = 39
  const wbFuelWeight = wbFuelGal * 6
  const wbPayloadWeight = wbFrontSeats + wbRearSeat1 + wbRearSeat2 + wbBaggage1 + wbBaggage2
  const wbTotalWeight = wbEmptyWeight + wbPayloadWeight + wbFuelWeight
  const wbMoment =
    wbEmptyWeight * wbEmptyCg +
    wbFrontSeats * 37 +
    (wbRearSeat1 + wbRearSeat2) * 73 +
    wbBaggage1 * 95 +
    wbBaggage2 * 123 +
    wbFuelWeight * 48
  const wbCg = wbTotalWeight > 0 ? wbMoment / wbTotalWeight : 0
  const wbForwardLimit = 35
  const wbAftLimit = 47.3
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

  async function loadSavedRoutes() {
    const routes = await getSavedRoutes()
    setSavedRoutes(routes)
  }

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
        const res = await fetch(`/api/airports?q=${encodeURIComponent(airportSearch)}&limit=8&country=US`)
        if (res.ok) {
          const data = await res.json()
          setAirportResults(data.airports || [])
          setHighlightIdx(-1)
        }
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
    fetch(`/api/airports/${airport.icao}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed')
        return res.json()
      })
      .then((data: AirportDetails) => {
        setSelectedAirportDetails(data)
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

    if (stateCache[normalized]) {
      setSelectedStateInfo(stateCache[normalized])
      return
    }

    import('@/lib/stateData')
      .then(async (mod) => {
        const info = mod.stateData[normalized]
        if (!info) return
        let media: DesktopStateInfo['media'] = []
        try {
          const res = await fetch(`/api/state-media/${normalized}`)
          if (res.ok) {
            const data = await res.json()
            media = Array.isArray(data?.images) ? data.images : []
          }
        } catch {
          media = []
        }
        const enriched: DesktopStateInfo = {
          ...info,
          media,
        }
        setStateCache((prev) => ({ ...prev, [normalized]: enriched }))
        setSelectedStateInfo(enriched)
      })
      .catch(() => {
        // ignore failures
      })
  }, [stateCache])

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
      // Fetch METAR/TAF for each waypoint via cloud API
      const results: Record<string, AirportWeather | null> = {}
      const icaoList = [...new Set(waypoints.map((w) => w.icao))].filter((icao) => icao.length >= 3 && icao.length <= 4)

      await Promise.all(
        icaoList.map(async (icao) => {
          try {
            const data = await cloudApi.getWeather(icao)
            const metarArr = Array.isArray(data?.data) ? data.data : null
            const tafArr = Array.isArray(data?.taf) ? data.taf : null
            results[icao] = {
              icao,
              metar: metarArr?.[0]
                ? {
                    observationTime: (metarArr[0].obsTime || metarArr[0].reportTime) as string | undefined,
                    rawText: (metarArr[0].rawOb || metarArr[0].raw_text) as string | undefined,
                    tempC: metarArr[0].temp as number | undefined,
                    dewpointC: metarArr[0].dewp as number | undefined,
                    windDirKts: metarArr[0].wdir as number | undefined,
                    windSpeedKts: metarArr[0].wspd as number | undefined,
                    windGustKts: metarArr[0].wgst as number | undefined,
                    visibilitySm: metarArr[0].vislt as number | undefined,
                    altHg: metarArr[0].altim as number | undefined,
                    flightCategory: (metarArr[0].fltCat || metarArr[0].flight_category) as string | undefined,
                  }
                : null,
              taf: tafArr?.[0] ? { rawText: (tafArr[0].rawTAF || tafArr[0].raw_text) as string | undefined } : null,
              fetchedAt: new Date().toISOString(),
            }
          } catch {
            results[icao] = { icao, metar: null, taf: null, error: 'Fetch failed' }
          }
        })
      )
      setWeatherData(results)

      // If 2+ waypoints, fetch route weather impact via cloud API
      if (waypoints.length >= 2) {
        try {
          const routeData = await cloudApi.getRouteWeather({
            waypoints: waypoints.map((w) => ({ icao: w.icao, lat: w.latitude, lon: w.longitude })),
            altitude: cruiseAltFt,
            aircraftTAS: cruiseKts,
          })
          setRouteWeather(routeData as RouteWeatherSummary)
        } catch {
          // non-fatal
        }
      }
    } catch (err) {
      setWeatherError(err instanceof Error ? err.message : 'Weather fetch failed')
    } finally {
      setWeatherLoading(false)
    }
  }, [waypoints, cruiseAltFt, cruiseKts])

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

  function exportRoute(kind: 'gpx' | 'fpl' | 'json') {
    if (waypoints.length < 2) return
    if (kind === 'gpx') {
      downloadGPX({ name: 'Desktop Route', waypoints })
      return
    }
    if (kind === 'fpl') {
      downloadFPL(waypoints)
      return
    }
    downloadJSON({ name: 'Desktop Route', waypoints })
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

  async function handleDeleteRoute(route: StoredRoute) {
    await deleteRoute(route.id)
    if (activeRouteId === route.id) {
      setActiveRouteId(null)
      setRouteName('')
    }
    await loadSavedRoutes()
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

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
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

      {/* Body */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-card xl:w-80">
          {/* Airport search */}
          <div className="border-b border-border p-2.5">
            <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">
              ADD WAYPOINT
            </label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <input
                ref={searchRef}
                type="text"
                value={airportSearch}
                onChange={(e) => setAirportSearch(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Type ICAO or name..."
                className="w-full rounded-md border border-input bg-background py-1.5 pl-8 pr-2 text-xs outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            {airportResults.length > 0 && (
              <ul className="mt-1 max-h-44 overflow-y-auto rounded-md border border-border bg-popover text-xs shadow-sm">
                {airportResults.map((a, i) => (
                  <li key={a.icao}>
                    <button
                      onClick={() => handleAddWaypoint(a)}
                      onMouseEnter={() => setHighlightIdx(i)}
                      className={`flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left ${
                        i === highlightIdx ? 'bg-primary/10 text-primary' : 'hover:bg-muted'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <Plus className="h-3 w-3 text-muted-foreground" />
                        <span className="font-mono font-medium">{a.icao}</span>
                      </span>
                      <span className="truncate text-muted-foreground">{a.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Waypoint list */}
          <div className="flex-1 overflow-y-auto p-2.5">
            <div className="mb-2 grid grid-cols-3 gap-1 rounded-md border border-border bg-muted/20 p-1">
              <button onClick={() => setMenuTab('route')} className={`rounded px-2 py-1 text-[11px] ${menuTab === 'route' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>Route</button>
              <button onClick={() => setMenuTab('filters')} className={`rounded px-2 py-1 text-[11px] ${menuTab === 'filters' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>Filters</button>
              <button onClick={() => setMenuTab('weather')} className={`rounded px-2 py-1 text-[11px] ${menuTab === 'weather' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>Weather</button>
            </div>

            {menuTab === 'filters' && (
              <>
                <div className="mb-2 rounded-md border border-border bg-muted/20 p-2">
                  <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Airport Size Filter</p>
                  <div className="grid grid-cols-2 gap-1">
                    <button onClick={() => applyAirportSizeMode('all')} className={`rounded px-2 py-1 text-[11px] ${airportSizeMode === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/70'}`}>All</button>
                    <button onClick={() => applyAirportSizeMode('only-large')} className={`rounded px-2 py-1 text-[11px] ${airportSizeMode === 'only-large' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/70'}`}>Only Large</button>
                    <button onClick={() => applyAirportSizeMode('only-medium')} className={`rounded px-2 py-1 text-[11px] ${airportSizeMode === 'only-medium' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/70'}`}>Only Medium</button>
                    <button onClick={() => applyAirportSizeMode('only-small')} className={`rounded px-2 py-1 text-[11px] ${airportSizeMode === 'only-small' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/70'}`}>Only Small</button>
                  </div>
                </div>

                <div className="mb-2 rounded-md border border-border bg-muted/20 p-2">
                  <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Region</p>
                  <div className="grid grid-cols-2 gap-1">
                    <button onClick={() => setRegionMode('map-view')} className={`rounded px-2 py-1 text-[11px] ${regionMode === 'map-view' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/70'}`}>Map View</button>
                    <button onClick={() => setRegionMode('all-us')} className={`rounded px-2 py-1 text-[11px] ${regionMode === 'all-us' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/70'}`}>All US</button>
                    <button onClick={() => setRegionMode('east-coast')} className={`rounded px-2 py-1 text-[11px] ${regionMode === 'east-coast' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/70'}`}>East Coast</button>
                    <button onClick={() => setRegionMode('west-coast')} className={`rounded px-2 py-1 text-[11px] ${regionMode === 'west-coast' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/70'}`}>West Coast</button>
                  </div>
                </div>

                <div className="mb-2 rounded-md border border-border bg-muted/20 p-2">
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Airport Count</p>
                    <span className="text-[11px] font-medium">{airportLimit}</span>
                  </div>
                  <input
                    type="range"
                    min={100}
                    max={2000}
                    step={50}
                    value={airportLimit}
                    onChange={(e) => setAirportLimit(Number(e.target.value))}
                    className="w-full"
                  />
                  <p className="mt-1 text-[10px] text-muted-foreground">Higher values show more airports but may reduce performance.</p>
                </div>
              </>
            )}

            {menuTab === 'weather' && (
              <div className="mb-2 rounded-md border border-border bg-muted/20 p-2">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Route Weather</p>
                  <button
                    onClick={() => fetchRouteWeather()}
                    disabled={weatherLoading || waypoints.length < 2}
                    className="flex items-center gap-1 rounded border border-border bg-card px-2 py-0.5 text-[10px] hover:bg-muted disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3 w-3 ${weatherLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </div>

                {waypoints.length < 2 ? (
                  <p className="text-[11px] text-muted-foreground">Add at least 2 waypoints to see route weather.</p>
                ) : weatherLoading ? (
                  <p className="text-[11px] text-muted-foreground">Loading weather data...</p>
                ) : (
                  <>
                    {routeWeather && (
                      <div className="mb-3 space-y-1.5 rounded border border-border bg-card p-2">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Impact Summary</p>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1 text-[11px]">
                            <Fuel className="h-3.5 w-3.5 text-amber-500" />
                            <span className={(routeWeather.fuelImpactPercent ?? 0) > 5 ? 'text-amber-600' : 'text-muted-foreground'}>
                              {(routeWeather.fuelImpactPercent ?? 0) > 0 ? '+' : ''}{(routeWeather.fuelImpactPercent ?? 0).toFixed(1)}% fuel
                            </span>
                          </div>
                          <div className="flex items-center gap-1 text-[11px]">
                            <Clock className="h-3.5 w-3.5 text-sky-500" />
                            {(() => {
                              const timeDiff = (routeWeather.totalTimeWithWind ?? 0) - (routeWeather.totalTimeStillAir ?? 0)
                              return (
                                <span className={Math.abs(timeDiff) > 10 ? 'text-sky-600' : 'text-muted-foreground'}>
                                  {timeDiff > 0 ? '+' : ''}{timeDiff.toFixed(0)} min
                                </span>
                              )
                            })()}
                          </div>
                        </div>
                        {routeWeather.segments && routeWeather.segments.length > 0 && (
                          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Wind className="h-3.5 w-3.5" />
                            {(() => {
                              const avgSpeed = routeWeather.segments.reduce((sum, s) => sum + s.windSpeed, 0) / routeWeather.segments.length
                              const avgDir = routeWeather.segments.reduce((sum, s) => sum + s.windFrom, 0) / routeWeather.segments.length
                              return `Avg wind: ${avgSpeed.toFixed(0)} kts @ ${avgDir.toFixed(0)}°`
                            })()}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="space-y-2">
                      {waypoints.map((wp) => {
                        const wx = weatherData[wp.icao]
                        if (!wx) return null
                        const category = wx.metar?.flightCategory || 'Unknown'
                        const categoryColors: Record<string, string> = {
                          VFR: 'text-emerald-600 bg-emerald-500/10',
                          MVFR: 'text-sky-600 bg-sky-500/10',
                          IFR: 'text-red-600 bg-red-500/10',
                          LIFR: 'text-fuchsia-600 bg-fuchsia-500/10',
                        }
                        const catClass = categoryColors[category] || 'text-muted-foreground bg-muted'
                        return (
                          <div key={wp.id} className="rounded border border-border bg-card p-2">
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-xs font-semibold">{wp.icao}</span>
                              <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${catClass}`}>
                                {category}
                              </span>
                            </div>
                            {wx.metar ? (
                              <div className="mt-1.5 space-y-1 text-[11px]">
                                <div className="flex items-center gap-1.5 text-muted-foreground">
                                  <Wind className="h-3 w-3" />
                                  {wx.metar.windDirKts ?? '---'}° @ {wx.metar.windSpeedKts ?? 0} kts {wx.metar.windGustKts ? `G${wx.metar.windGustKts}` : ''}
                                </div>
                                <div className="flex items-center gap-1.5 text-muted-foreground">
                                  <Eye className="h-3 w-3" />
                                  Vis: {wx.metar.visibilitySm ?? '---'} SM
                                </div>
                                <div className="flex items-center gap-1.5 text-muted-foreground">
                                  <Thermometer className="h-3 w-3" />
                                  {wx.metar.tempC ?? '--'}°C / {wx.metar.dewpointC ?? '--'}°C
                                </div>
                                <div className="flex items-center gap-1.5 text-muted-foreground">
                                  <Gauge className="h-3 w-3" />
                                  {wx.metar.altHg?.toFixed(2) ?? '---'} inHg
                                </div>
                                <p className="mt-1 font-mono text-[9px] leading-tight text-muted-foreground/70">{wx.metar.rawText}</p>
                              </div>
                            ) : (
                              <p className="mt-1 text-[11px] text-muted-foreground">No METAR available</p>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {Object.keys(weatherData).length === 0 && !weatherLoading && (
                      <p className="text-[11px] text-muted-foreground">Click Refresh to load weather for route airports.</p>
                    )}
                  </>
                )}
              </div>
            )}

            {menuTab === 'route' && (
              <>

            <div className="mb-2 rounded-md border border-border bg-muted/20 p-2">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Quick Actions</p>
                <div className="flex items-center gap-1 text-[10px]">
                  <button className="rounded border border-border bg-card px-2 py-0.5 hover:bg-muted">Add</button>
                  <button className="rounded border border-border bg-card px-2 py-0.5 hover:bg-muted">Plan</button>
                  <button
                    onClick={async () => {
                      await saveFlightPlan({
                        name: routeName || 'My Cross Country',
                        callsign,
                        pilotName,
                        aircraftName,
                        departureAt,
                        cruiseAltFt,
                        soulsOnBoard,
                        alternateIcao,
                        remarks,
                        fuelPercent,
                        waypoints: waypoints.map((w) => ({ icao: w.icao, name: w.name })),
                      })
                    }}
                    className="rounded border border-border bg-card px-2 py-0.5 hover:bg-muted"
                  >
                    Save Flight Plan
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1 text-[11px]">
                <div className="rounded border border-border bg-card px-2 py-1">
                  <p className="text-muted-foreground">Fuel</p>
                  <p className="font-semibold">{fuelPercent}%</p>
                </div>
                <div className="rounded border border-border bg-card px-2 py-1">
                  <p className="text-muted-foreground">W&amp;B</p>
                  <p className={`font-semibold ${wbWithinLimits ? 'text-emerald-600' : 'text-destructive'}`}>{wbWithinLimits ? 'Within limits' : 'Out of limits'}</p>
                </div>
                <div className="rounded border border-border bg-card px-2 py-1">
                  <p className="text-muted-foreground">CG</p>
                  <p className="font-semibold">{wbCg.toFixed(1)}&quot;</p>
                </div>
                <div className="rounded border border-border bg-card px-2 py-1">
                  <p className="text-muted-foreground">Range</p>
                  <p className="font-semibold">{Math.round(estRangeNm)} nm</p>
                </div>
              </div>
            </div>

            <div className="mb-2 rounded-md border border-border bg-muted/20 p-2">
              <p className="mb-1 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"><ClipboardList className="h-3.5 w-3.5" /> Flight Plan</p>
              <div className="space-y-2 text-xs">
                <FieldRow label="Callsign"><input value={callsign} onChange={(e) => setCallsign(e.target.value)} className="planner-input" /></FieldRow>
                <FieldRow label="Pilot"><input value={pilotName} onChange={(e) => setPilotName(e.target.value)} className="planner-input" /></FieldRow>
                <FieldRow label="Aircraft"><input value={aircraftName} onChange={(e) => setAircraftName(e.target.value)} className="planner-input" /></FieldRow>
                <FieldRow label="Departure"><input type="datetime-local" value={departureAt} onChange={(e) => setDepartureAt(e.target.value)} className="planner-input" /></FieldRow>
                <div className="grid grid-cols-2 gap-2">
                  <FieldRow label="Alt (ft)"><input type="number" value={cruiseAltFt} onChange={(e) => setCruiseAltFt(Number(e.target.value) || 0)} className="planner-input" /></FieldRow>
                  <FieldRow label="Souls"><input type="number" value={soulsOnBoard} onChange={(e) => setSoulsOnBoard(Number(e.target.value) || 0)} className="planner-input" /></FieldRow>
                </div>
                <FieldRow label="Alternate"><input value={alternateIcao} onChange={(e) => setAlternateIcao(e.target.value.toUpperCase())} className="planner-input" /></FieldRow>
                <FieldRow label="Remarks"><textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} className="planner-input min-h-[54px] resize-none" /></FieldRow>
                <div>
                  <div className="mb-1 flex items-center justify-between text-[11px]"><span className="text-muted-foreground">Fuel</span><span>{fuelPercent}%</span></div>
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
                    <div className="rounded border border-border bg-card px-1.5 py-1"><p className="text-muted-foreground">Range</p><p className="font-semibold">{Math.round(estRangeNm)}</p></div>
                    <div className="rounded border border-border bg-card px-1.5 py-1"><p className="text-muted-foreground">Gal</p><p className="font-semibold">{fuelGal.toFixed(1)}</p></div>
                    <div className="rounded border border-border bg-card px-1.5 py-1"><p className="text-muted-foreground">Burn</p><p className="font-semibold">{burnGph}</p></div>
                    <div className="rounded border border-border bg-card px-1.5 py-1"><p className="text-muted-foreground">Kts</p><p className="font-semibold">{cruiseKts}</p></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mb-2 rounded-md border border-border bg-muted/20 p-2">
              <button onClick={() => setWbOpen((v) => !v)} className="flex w-full items-center justify-between text-left">
                <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"><Scale className="h-3.5 w-3.5" /> Weight &amp; Balance</p>
                <span className="text-[11px] text-muted-foreground">{wbOpen ? 'Hide' : 'Show'}</span>
              </button>
              {wbOpen && (
                <div className="mt-2 space-y-2 text-xs">
                  <FieldRow label="Aircraft"><input value={aircraftName} onChange={(e) => setAircraftName(e.target.value)} className="planner-input" /></FieldRow>
                  <div className="grid grid-cols-2 gap-2">
                    <FieldRow label="Front Seats (lbs)"><input type="number" value={wbFrontSeats} onChange={(e) => setWbFrontSeats(Number(e.target.value) || 0)} className="planner-input" /></FieldRow>
                    <FieldRow label="Rear Seat 1 (lbs)"><input type="number" value={wbRearSeat1} onChange={(e) => setWbRearSeat1(Number(e.target.value) || 0)} className="planner-input" /></FieldRow>
                    <FieldRow label="Rear Seat 2 (lbs)"><input type="number" value={wbRearSeat2} onChange={(e) => setWbRearSeat2(Number(e.target.value) || 0)} className="planner-input" /></FieldRow>
                    <FieldRow label="Baggage 1 (lbs)"><input type="number" value={wbBaggage1} onChange={(e) => setWbBaggage1(Number(e.target.value) || 0)} className="planner-input" /></FieldRow>
                    <FieldRow label="Baggage 2 (lbs)"><input type="number" value={wbBaggage2} onChange={(e) => setWbBaggage2(Number(e.target.value) || 0)} className="planner-input" /></FieldRow>
                    <FieldRow label="Fuel (gal)"><input type="number" value={wbFuelGal} onChange={(e) => setWbFuelGal(Number(e.target.value) || 0)} className="planner-input" /></FieldRow>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[11px]">
                    <Stat text="Empty" value={`${wbEmptyWeight} lbs`} />
                    <Stat text="Payload" value={`${wbPayloadWeight} lbs`} />
                    <Stat text="Fuel" value={`${wbFuelWeight} lbs`} />
                    <Stat text="Total" value={`${wbTotalWeight} lbs`} />
                    <Stat text="CG" value={`${wbCg.toFixed(1)}\"`} />
                    <Stat text="Limits" value={`${wbForwardLimit}\" - ${wbAftLimit}\"`} />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground">CG:</span>
                      <span className="font-medium">{wbCg.toFixed(1)}&quot;</span>
                    </div>
                    <div className="relative h-2.5 rounded-full bg-muted">
                      <div
                        className={`absolute top-0 h-full w-1 rounded ${wbWithinLimits ? 'bg-emerald-500' : 'bg-destructive'}`}
                        style={{ left: `calc(${wbCgPercent}% - 2px)` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px]">
                      <span>{wbForwardLimit}&quot;</span>
                      <span className={`font-medium ${wbWithinLimits ? 'text-emerald-600' : 'text-destructive'}`}>
                        {wbWithinLimits ? '✓ Within Limits' : '⚠️ Out of Limits'}
                      </span>
                      <span>{wbAftLimit}&quot;</span>
                    </div>
                  </div>
                  <p className={`text-xs font-medium ${wbWithinLimits ? 'text-emerald-600' : 'text-destructive'}`}>
                    {wbWithinLimits ? '✓ Within Limits' : '✗ Out of Limits'}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Arms and limits based on POH data for selected aircraft.</p>
                </div>
              )}
            </div>

            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-medium text-muted-foreground">
                ROUTE ({waypoints.length})
              </span>
              <div className="flex items-center gap-2">
                {waypoints.length > 1 && (
                  <>
                    <button onClick={() => exportRoute('gpx')} className="text-[11px] text-muted-foreground hover:text-foreground" title="Export GPX"><Download className="h-3.5 w-3.5" /></button>
                    <button onClick={() => importInputRef.current?.click()} className="text-[11px] text-muted-foreground hover:text-foreground" title="Import Route"><Upload className="h-3.5 w-3.5" /></button>
                  </>
                )}
                {waypoints.length > 0 && (
                  <button
                    onClick={() => setWaypoints([])}
                    className="text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            <div className="mb-2 rounded-md border border-border bg-muted/20 p-2">
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Route File</p>
              <div className="flex items-center gap-1.5">
                <input
                  value={routeName}
                  onChange={(e) => setRouteName(e.target.value)}
                  placeholder="Route name"
                  className="h-7 flex-1 rounded border border-input bg-background px-2 text-[11px] outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  onClick={handleSaveCurrentRoute}
                  disabled={waypoints.length < 2}
                  className="inline-flex h-7 items-center gap-1 rounded border border-border bg-card px-2 text-[11px] hover:bg-muted disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" /> Save
                </button>
              </div>
              {importError && <p className="mt-1 text-[11px] text-destructive">{importError}</p>}
            </div>

            {pendingImport && (
              <div className="mb-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2">
                <p className="text-[11px] font-medium text-amber-700 dark:text-amber-300">Import conflict: keep current route or replace?</p>
                <div className="mt-1 flex gap-1">
                  <button onClick={() => applyImportedRoute(pendingImport, 'merge')} className="rounded border border-border bg-card px-2 py-1 text-[11px] hover:bg-muted">Merge</button>
                  <button onClick={() => applyImportedRoute(pendingImport, 'replace')} className="rounded border border-border bg-card px-2 py-1 text-[11px] hover:bg-muted">Replace</button>
                  <button onClick={() => setPendingImport(null)} className="rounded border border-border bg-card px-2 py-1 text-[11px] hover:bg-muted">Cancel</button>
                </div>
              </div>
            )}

            <input
              ref={importInputRef}
              type="file"
              accept=".gpx,.fpl,.json,.txt"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) importRouteFile(file)
                e.currentTarget.value = ''
              }}
            />
            {waypoints.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No waypoints. Search above to build a route.
              </p>
            ) : (
              <ol className="space-y-1">
                {waypoints.slice(0, 5).map((w, i) => (
                  <li key={w.id} className="group flex items-center gap-2 rounded-md bg-muted/40 px-2 py-1.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                      {i + 1}
                    </span>
                    <span className="flex-1 truncate">
                      <span className="block font-mono text-xs font-medium">{w.icao}</span>
                      <span className="block truncate text-[10px] text-muted-foreground">{w.name}</span>
                    </span>
                    <button
                      onClick={() => handleRemoveWaypoint(w.icao)}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
                {waypoints.length > 5 && (
                  <li className="text-[11px] text-muted-foreground">+{waypoints.length - 5} more waypoints</li>
                )}
              </ol>
            )}
            {waypoints.length > 1 && (
              <div className="mt-3 space-y-2 rounded-md border border-border bg-muted/30 px-2.5 py-2 text-xs">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Plane className="h-3 w-3" />
                  Route: {waypoints.map((w) => w.icao).join(' → ')}
                </div>
                <div className="flex flex-wrap gap-1">
                  <button onClick={() => exportRoute('gpx')} className="rounded border border-border bg-card px-2 py-1 text-[11px] hover:bg-muted">Export GPX</button>
                  <button onClick={() => exportRoute('fpl')} className="rounded border border-border bg-card px-2 py-1 text-[11px] hover:bg-muted">Export FPL</button>
                  <button onClick={() => exportRoute('json')} className="rounded border border-border bg-card px-2 py-1 text-[11px] hover:bg-muted">Export JSON</button>
                </div>
              </div>
            )}

            <div className="mt-3 rounded-md border border-border bg-muted/20 p-2">
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Saved Routes</p>
              {savedRoutes.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">No saved routes yet.</p>
              ) : (
                <ul className="space-y-1">
                  {savedRoutes.slice(0, 5).map((route) => (
                    <li key={route.id} className={`rounded border px-2 py-1 ${activeRouteId === route.id ? 'border-primary/50 bg-primary/5' : 'border-border bg-card'}`}>
                      <div className="flex items-center justify-between gap-1">
                        <button onClick={() => openSavedRoute(route)} className="min-w-0 flex-1 text-left">
                          <span className="block truncate text-[11px] font-medium">{route.name}</span>
                          <span className="text-[10px] text-muted-foreground">{route.waypoints.length} wp • {new Date(route.updatedAt).toLocaleDateString()}</span>
                        </button>
                        <div className="flex items-center gap-0.5">
                          <button onClick={() => openSavedRoute(route)} title="Open" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><FolderOpen className="h-3.5 w-3.5" /></button>
                          <button onClick={() => handleDuplicateRoute(route)} title="Duplicate" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Copy className="h-3.5 w-3.5" /></button>
                          <button onClick={() => handleDeleteRoute(route)} title="Delete" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </div>
                    </li>
                  ))}
                  {savedRoutes.length > 5 && (
                    <li className="text-[11px] text-muted-foreground">+{savedRoutes.length - 5} more saved routes</li>
                  )}
                </ul>
              )}
            </div>
            </>
            )}
          </div>

          <div className="border-t border-border p-2.5">
            <p className="text-[10px] text-muted-foreground">
              Tiles cache automatically. Use the Update button on the map to refresh.
            </p>
          </div>
        </aside>

        {/* Map */}
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
              showTerrain={mapOptions.showTerrain}
              showTfrs={mapOptions.showTfrs}
              showPireps={mapOptions.showPireps}
              baseLayer={mapOptions.baseLayer}
              performanceMode={mapOptions.performanceMode}
              maxAirportsToRender={airportLimit}
              clusterAirports={false}
            />
          </MapErrorBoundary>
          <div className="absolute bottom-4 right-4 z-[1000]">
            <MapControls options={mapOptions} onOptionsChange={setMapOptions} />
          </div>
          <div className="absolute left-2 top-2 z-[1000]">
            <TileCacheBanner
              provider={mapOptions.baseLayer}
              onRefresh={() => setCacheVersion((v) => v + 1)}
            />
          </div>

          {selectedStateInfo && (
            <DesktopStateInfoPanel
              key={selectedStateInfo.state}
              stateInfo={selectedStateInfo}
              onClose={() => setSelectedStateInfo(null)}
            />
          )}
        </div>
      </div>
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
