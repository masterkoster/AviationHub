'use client'

import { useEffect, useMemo, useRef } from 'react'
import maplibregl, { type GeoJSONSource, type Map, type MapLayerMouseEvent } from 'maplibre-gl'
import { buildRasterStyle, type MapBaseLayer } from '@/shared/components/map/maplibre-style'

type Airport = {
  icao: string
  iata?: string
  name: string
  city?: string
  latitude: number
  longitude: number
  type?: string
}

type Waypoint = {
  id: string
  icao: string
  name: string
  latitude: number
  longitude: number
}

type Bounds = { minLat: number; maxLat: number; minLon: number; maxLon: number }

type AirportDetails = {
  icao: string
  iata?: string
  name: string
  city?: string
  state?: string
  elevation_ft?: number
  manager?: string | null
  phone?: string | null
  hasTower?: boolean | null
  attendance?: string | null
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
  runways?: Array<{ he_ident?: string; le_ident?: string; length_ft?: number; width_ft?: number; surface?: string }>
  frequencies?: Array<{ frequency_mhz?: number; type?: string; description?: string }>
}

interface MapLibreMapProps {
  airports: Airport[]
  waypoints: Waypoint[]
  onBoundsChange: (bounds: Bounds) => void
  onAirportClick: (airport: Airport) => void
  onAirportAddToRoute?: (airport: Airport) => void
  onViewStateInfo?: (stateCode: string) => void
  onAirportClose?: () => void
  onOpenExternal?: (url: string) => void
  mapCenter: [number, number]
  mapZoom: number
  showTerrain?: boolean
  showTfrs?: boolean
  showPireps?: boolean
  showMgrsGrid?: boolean
  showRuler?: boolean
  rulerPoints?: Array<{ lat: number; lng: number }>
  onRulerPointAdd?: (point: { lat: number; lng: number }) => void
  onRulerPointRemove?: (index: number) => void
  onRulerClear?: () => void
  showRangeRings?: boolean
  rangeRingCenter?: { lat: number; lng: number } | null
  rangeRingIntervals?: number[]
  baseLayer?: MapBaseLayer
  performanceMode?: boolean
  maxAirportsToRender?: number
  clusterAirports?: boolean
  weatherCategories?: Record<string, string>
  userId?: string | null
  onFlightHistory?: (icao: string) => Promise<Array<{ date: string; aircraft: string; routeFrom: string; routeTo: string; totalTime: number }>>
}

const AIRPORT_SOURCE = 'airports'
const AIRPORT_LARGE = 'airports-large'
const AIRPORT_MEDIUM = 'airports-medium'
const AIRPORT_SMALL = 'airports-small'
const AIRPORT_CLUSTER = 'airports-cluster'
const AIRPORT_CLUSTER_COUNT = 'airports-cluster-count'
const AIRPORT_LABELS = 'airports-labels'
const WAYPOINTS_SOURCE = 'waypoints'
const WAYPOINTS_LAYER = 'waypoints-layer'
const WAYPOINTS_LABELS = 'waypoints-labels'
const ROUTE_SOURCE = 'route-source'
const ROUTE_LAYER = 'route-layer'
const LEG_LABELS_SOURCE = 'leg-labels-source'
const LEG_LABELS_LAYER = 'leg-labels-layer'

// Overlay sources & layers
const TERRAIN_SOURCE = 'terrain-overlay'
const TERRAIN_LAYER = 'terrain-overlay-layer'
const TFR_SOURCE = 'tfrs-source'
const TFR_CIRCLE_LAYER = 'tfrs-circle'
const TFR_LABEL_LAYER = 'tfrs-labels'
const PIREP_SOURCE = 'pireps-source'
const PIREP_LAYER = 'pireps-layer'
const PIREP_LABELS_LAYER = 'pireps-labels'

// Military tools sources & layers
const MGRS_GRID_SOURCE = 'mgrs-grid-source'
const MGRS_GRID_LINES = 'mgrs-grid-lines'
const MGRS_GRID_LABELS = 'mgrs-grid-labels'
const RULER_SOURCE = 'ruler-source'
const RULER_LINE_LAYER = 'ruler-line'
const RULER_POINTS_LAYER = 'ruler-points'
const RULER_LABELS_LAYER = 'ruler-labels'

// Range ring sources & layers
const RANGE_RING_SOURCE = 'range-ring-source'
const RANGE_RING_CIRCLES = 'range-ring-circles'
const RANGE_RING_LABELS = 'range-ring-labels'

function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3440.065
  const φ1 = lat1 * Math.PI / 180
  const φ2 = lat2 * Math.PI / 180
  const Δφ = (lat2 - lat1) * Math.PI / 180
  const Δλ = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function trueHeading(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = (lon2 - lon1) * Math.PI / 180
  const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180)
  const x =
    Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
    Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

function formatMoney(v?: number): string {
  if (typeof v !== 'number' || Number.isNaN(v)) return '—'
  return `$${v.toFixed(2)}`
}

function normalizeStateCode(value?: string): string {
  if (!value) return ''
  const upper = value.toUpperCase()
  if (upper.startsWith('US-')) return upper.slice(3)
  return upper
}

function formatStateForDisplay(value?: string): string {
  if (!value) return ''
  return value.toUpperCase()
}

function buildAirportPopupContent(
  airport: Airport,
  options: {
    isDark: boolean
    loading?: boolean
    details?: AirportDetails | null
    flightHistory?: Array<{ date: string; aircraft: string; routeFrom: string; routeTo: string; totalTime: number }>
    flightHistoryLoading?: boolean
    onAddToRoute: () => void
    onViewStateInfo?: (stateCode: string) => void
    onClose?: () => void
    onOpenExternal?: (url: string) => void
  }
): HTMLDivElement {
  const { loading, details, flightHistory, flightHistoryLoading, onAddToRoute, onViewStateInfo, onClose, onOpenExternal } = options
  const wrap = document.createElement('div')
  wrap.className = 'min-w-[150px] max-w-[180px] text-slate-900 relative'

  const stateDisplay = formatStateForDisplay(details?.state)
  const iata = details?.iata || airport.iata
  const runwaysHtml = details?.runways?.slice(0, 2).map((r) => {
    const ident = r.he_ident || r.le_ident || 'RWY'
    const len = r.length_ft ? r.length_ft.toLocaleString() : '—'
    const surf = r.surface || ''
    return `<span class="mr-2">${ident} (${len}ft ${surf})</span>`
  }).join('') || ''
  const freqsHtml = details?.frequencies?.slice(0, 5).map((f) => `<div class="text-xs">${f.frequency_mhz || ''} ${f.type || ''}${f.description ? ` - ${f.description}` : ''}</div>`).join('') || ''

  wrap.innerHTML = `
    <button data-role="popup-close" class="absolute -top-1 -right-1 w-5 h-5 bg-slate-200 hover:bg-slate-300 rounded-full text-xs flex items-center justify-center" title="Close">×</button>
    <strong class="text-lg">${airport.icao}</strong>${iata ? `<span class="ml-2 text-slate-500">(${iata})</span>` : ''}
    <div class="font-medium">${airport.name}</div>
    <div class="text-sm text-slate-600">${airport.city || ''}${stateDisplay ? `${airport.city ? ', ' : ''}${stateDisplay}` : ''}</div>
    ${details?.elevation_ft ? `<div class="text-sm mt-2"><span class="font-medium">Elevation:</span> ${details.elevation_ft} ft</div>` : ''}
    ${runwaysHtml ? `<div class="text-sm mt-1"><span class="font-medium">Runways:</span> ${runwaysHtml}</div>` : ''}
    ${freqsHtml ? `<div class="text-sm mt-2"><span class="font-medium">Freqs:</span><div class="max-h-20 overflow-y-auto mt-1">${freqsHtml}</div></div>` : ''}
    ${loading ? `<div class="text-sm text-slate-400 mt-2">Loading details...</div>` : ''}
    ${details?.fuel || details?.landingFee ? `
      <div class="mt-2">
        ${details?.fuel?.price100ll ? `<div class="text-emerald-600 font-medium">100LL: ${formatMoney(details.fuel.price100ll)}/gal${details.fuel.priceJetA ? `<span class="ml-2">JetA: ${formatMoney(details.fuel.priceJetA)}/gal</span>` : ''}</div>` : ''}
        ${details?.fuel?.community100ll ? `<div class="text-sm ${details.fuel.community100ll.daysAgo <= 30 ? 'text-green-600 font-medium' : 'text-slate-500'}"><span class="text-green-600">●</span> ${formatMoney(details.fuel.community100ll.price)}/gal community <span class="text-xs text-slate-400 ml-1">· ${details.fuel.community100ll.daysAgo === 0 ? 'today' : `${details.fuel.community100ll.daysAgo}d ago`}</span>${details.fuel.community100ll.fbo ? `<span class="text-xs text-slate-400"> @ ${details.fuel.community100ll.fbo}</span>` : ''}</div>` : ''}
        ${details?.fuel?.communityJetA ? `<div class="text-sm ${details.fuel.communityJetA.daysAgo <= 30 ? 'text-green-600 font-medium' : 'text-slate-500'}"><span class="text-green-600">●</span> ${formatMoney(details.fuel.communityJetA.price)}/gal JetA community <span class="text-xs text-slate-400 ml-1">· ${details.fuel.communityJetA.daysAgo === 0 ? 'today' : `${details.fuel.communityJetA.daysAgo}d ago`}</span></div>` : ''}
        ${details?.fuel?.priceDivergence?.difference ? `<div class="mt-1 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">⚠️ Community price is ${details.fuel.priceDivergence.difference}</div>` : ''}
        ${details?.fuel?.lastReported ? `<div class="text-xs text-slate-400">AirNav: ${details.fuel.lastReported}</div>` : ''}
        ${details?.fuel?.source === 'airnav' ? `<a href="${details.fuel.sourceUrl || `https://www.airnav.com/airport/${airport.icao}`}" target="_blank" rel="noopener noreferrer" class="text-xs text-slate-500 hover:text-sky-500 block mt-1">Source: AirNav.com</a>` : ''}
        ${(details?.hasTower !== undefined || details?.landingFee) ? `<div class="mt-2 flex gap-2 flex-wrap">
          ${details?.hasTower !== undefined ? `<span class="text-xs px-2 py-1 rounded ${details.hasTower ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}">${details.hasTower ? '✓ Tower' : '✗ No Tower'}</span>` : ''}
          ${details?.landingFee?.amount ? `<span class="text-xs px-2 py-1 rounded bg-amber-500/20 text-amber-400">Landing: ${formatMoney(details.landingFee.amount)}</span>` : ''}
        </div>` : ''}
        <details class="mt-2">
          <summary class="text-xs text-slate-500 cursor-pointer hover:text-sky-400">More details</summary>
          <div class="mt-2 space-y-1 text-xs bg-slate-100 p-2 rounded">
            ${details?.manager ? `<div><span class="font-medium">Manager:</span> ${details.manager}</div>` : ''}
            ${details?.phone ? `<div><span class="font-medium">Airport Phone:</span> <a href="tel:${details.phone}" class="text-sky-600 hover:underline">${details.phone}</a></div>` : ''}
            ${details?.fuel?.providerName ? `<div><span class="font-medium">Fuel Provider:</span> ${details.fuel.providerName}${details.fuel.providerPhone ? ` (<a href="tel:${details.fuel.providerPhone}" class="text-sky-600 hover:underline">${details.fuel.providerPhone}</a>)` : ''}</div>` : ''}
            ${details?.attendance ? `<div><span class="font-medium">Attendance:</span> ${details.attendance}</div>` : ''}
            <a href="${details?.fuel?.sourceUrl || `https://www.airnav.com/airport/${airport.icao}`}" target="_blank" rel="noopener noreferrer" class="text-sky-500 hover:underline block mt-2">View full details on AirNav →</a>
          </div>
        </details>
        <details class="mt-2">
          <summary class="text-xs text-sky-500 cursor-pointer hover:text-sky-400">Paid a different price? Submit it</summary>
          <form class="mt-2 p-2 bg-slate-700 rounded">
            <div class="text-xs mb-2 text-slate-300">Submit your actual price (per gallon)</div>
            <div class="space-y-2">
              <div class="flex gap-2">
                <select name="fuelType" class="bg-slate-600 text-white text-xs px-2 py-1 rounded"><option value="100LL">100LL</option><option value="JetA">Jet A</option></select>
                <input type="number" name="price" step="0.01" min="0" max="20" placeholder="$0.00" class="bg-slate-600 text-white text-xs px-2 py-1 rounded w-20" required />
              </div>
              <div class="flex gap-2">
                <input type="text" name="fbo" placeholder="FBO name (optional)" class="bg-slate-600 text-white text-xs px-2 py-1 rounded flex-1" />
                <input type="date" name="purchaseDate" max="${new Date().toISOString().split('T')[0]}" class="bg-slate-600 text-white text-xs px-2 py-1 rounded w-28" required />
              </div>
              <button type="submit" class="w-full bg-sky-500 hover:bg-sky-600 text-white text-xs px-2 py-2 rounded">Submit Price</button>
            </div>
            <div class="text-xs text-slate-400 mt-1">Help other pilots know real prices!</div>
          </form>
        </details>
      </div>
    ` : ''}
    ${details?.landingFee?.amount ? `<div class="text-sm text-amber-600">Landing: ${formatMoney(details.landingFee.amount)}</div>` : ''}
    ${flightHistoryLoading ? `<div class="mt-2 text-xs text-slate-400">Loading flight history...</div>` : ''}
    ${flightHistory && flightHistory.length > 0 ? `
      <div class="mt-2">
        <div class="text-xs font-medium text-slate-500 mb-1">Your Flight History</div>
        <div class="max-h-24 overflow-y-auto space-y-1">
          ${flightHistory.slice(0, 8).map(f => {
            const isDep = f.routeFrom.toUpperCase() === airport.icao.toUpperCase()
            const dateStr = f.date ? new Date(f.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—'
            return `<div class="flex items-center justify-between text-[10px] bg-slate-100 rounded px-1.5 py-0.5">
              <span class="text-slate-500">${dateStr}</span>
              <span class="font-medium text-slate-700">${f.aircraft || '—'}</span>
              <span class="text-slate-500">${isDep ? 'Departed' : 'Arrived'}</span>
              <span class="font-mono text-slate-600">${isDep ? f.routeTo : f.routeFrom}</span>
              <span class="text-slate-400">${f.totalTime ? f.totalTime.toFixed(1) + 'h' : ''}</span>
            </div>`
          }).join('')}
        </div>
      </div>
    ` : ''}
    ${flightHistory && flightHistory.length === 0 && !flightHistoryLoading ? '' : ''}
    <button data-role="popup-add-route" class="mt-3 w-full bg-sky-500 hover:bg-sky-600 text-white px-3 py-2 rounded text-sm font-medium">Add to Route</button>
    <button data-role="popup-view-state" class="mt-2 w-full bg-purple-500 hover:bg-purple-600 text-white px-3 py-2 rounded text-sm font-medium">View State Info</button>
  `

  const closeBtn = wrap.querySelector('[data-role="popup-close"]') as HTMLButtonElement | null
  const addBtn = wrap.querySelector('[data-role="popup-add-route"]') as HTMLButtonElement | null
  const viewStateBtn = wrap.querySelector('[data-role="popup-view-state"]') as HTMLButtonElement | null
  if (closeBtn) closeBtn.onclick = () => onClose?.()
  if (addBtn) addBtn.onclick = onAddToRoute
  if (viewStateBtn) {
    viewStateBtn.onclick = () => {
      const state = normalizeStateCode(details?.state)
      if (state) onViewStateInfo?.(state)
    }
  }

  const form = wrap.querySelector('form') as HTMLFormElement | null
  if (form && details) {
    form.onsubmit = async (e) => {
      e.preventDefault()
      const formData = new FormData(form)
      const payload = {
        icao: details.icao,
        price: Number(formData.get('price') || 0),
        fuelType: String(formData.get('fuelType') || '100LL'),
        fbo: String(formData.get('fbo') || '') || null,
        purchaseDate: String(formData.get('purchaseDate') || ''),
      }
      try {
        const res = await fetch('/api/fuel-prices/community', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error('Submit failed')
      } catch {
        // no-op; keep parity behavior simple
      }
    }
  }

  const anchors = Array.from(wrap.querySelectorAll('a[href]')) as HTMLAnchorElement[]
  for (const a of anchors) {
    const href = a.href
    a.onclick = (e) => {
      e.preventDefault()
      onOpenExternal?.(href)
    }
  }

  return wrap
}

export default function MapLibreMap({
  airports,
  waypoints,
  onBoundsChange,
  onAirportClick,
  onAirportAddToRoute,
  onViewStateInfo,
  onAirportClose,
  onOpenExternal,
  mapCenter,
  mapZoom,
  showTerrain = false,
  showTfrs = false,
  showPireps = false,
  showMgrsGrid = false,
  showRuler = false,
  rulerPoints = [],
  onRulerPointAdd,
  onRulerClear,
  showRangeRings = false,
  rangeRingCenter = null,
  rangeRingIntervals = [25, 50, 100],
  baseLayer = 'osm',
  maxAirportsToRender = 2000,
  clusterAirports = true,
  weatherCategories = {},
  userId = null,
  onFlightHistory,
}: MapLibreMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<Map | null>(null)
  const popupRef = useRef<maplibregl.Popup | null>(null)
  const popupAirportRef = useRef<string | null>(null)
  const hoveredAirportIdRef = useRef<string | number | null>(null)
  const lastViewRef = useRef<{ center: [number, number]; zoom: number } | null>(null)
  const onBoundsChangeRef = useRef(onBoundsChange)
  const onAirportClickRef = useRef(onAirportClick)
  const onAirportAddToRouteRef = useRef(onAirportAddToRoute)
  const onViewStateInfoRef = useRef(onViewStateInfo)
  const onAirportCloseRef = useRef(onAirportClose)
  const onOpenExternalRef = useRef(onOpenExternal)
  const onRulerPointAddRef = useRef(onRulerPointAdd)
  const onRulerClearRef = useRef(onRulerClear)
  const onFlightHistoryRef = useRef(onFlightHistory)
  const showRangeRingsRef = useRef(showRangeRings)
  const rangeRingCenterRef = useRef(rangeRingCenter)
  const rangeRingIntervalsRef = useRef(rangeRingIntervals)

  useEffect(() => { showRangeRingsRef.current = showRangeRings }, [showRangeRings])
  useEffect(() => { rangeRingCenterRef.current = rangeRingCenter }, [rangeRingCenter])
  useEffect(() => { rangeRingIntervalsRef.current = rangeRingIntervals }, [rangeRingIntervals])

  useEffect(() => {
    onBoundsChangeRef.current = onBoundsChange
  }, [onBoundsChange])

  useEffect(() => {
    onAirportClickRef.current = onAirportClick
  }, [onAirportClick])

  useEffect(() => {
    onAirportAddToRouteRef.current = onAirportAddToRoute
  }, [onAirportAddToRoute])

  useEffect(() => {
    onViewStateInfoRef.current = onViewStateInfo
  }, [onViewStateInfo])

  useEffect(() => {
    onAirportCloseRef.current = onAirportClose
  }, [onAirportClose])

  useEffect(() => {
    onOpenExternalRef.current = onOpenExternal
  }, [onOpenExternal])

  useEffect(() => {
    onRulerPointAddRef.current = onRulerPointAdd
  }, [onRulerPointAdd])

  useEffect(() => {
    onRulerClearRef.current = onRulerClear
  }, [onRulerClear])

  useEffect(() => {
    onFlightHistoryRef.current = onFlightHistory
  }, [onFlightHistory])

  const boundedAirports = useMemo(() => airports.slice(0, maxAirportsToRender), [airports, maxAirportsToRender])

  const airportsGeoJSON = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: boundedAirports.map((a) => ({
        id: a.icao,
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [a.longitude, a.latitude] as [number, number],
        },
        properties: {
          icao: a.icao,
          iata: a.iata || '',
          name: a.name,
          city: a.city || '',
          type: a.type || '',
          flightCategory: weatherCategories[a.icao] || '',
        },
      })),
    }),
    [boundedAirports, weatherCategories]
  )

  const waypointsGeoJSON = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: waypoints.map((w, idx) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [w.longitude, w.latitude] as [number, number],
        },
        properties: {
          id: w.id,
          icao: w.icao,
          order: idx + 1,
        },
      })),
    }),
    [waypoints]
  )

  const routeGeoJSON = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features:
        waypoints.length >= 2
          ? [
              {
                type: 'Feature' as const,
                geometry: {
                  type: 'LineString' as const,
                  coordinates: waypoints.map((w) => [w.longitude, w.latitude] as [number, number]),
                },
                properties: {},
              },
            ]
          : [],
    }),
    [waypoints]
  )

  const legLabelsGeoJSON = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features:
        waypoints.length >= 2
          ? waypoints.slice(0, -1).map((w, i) => {
              const next = waypoints[i + 1]
              const nm = haversineNm(w.latitude, w.longitude, next.latitude, next.longitude)
              const hdg = trueHeading(w.latitude, w.longitude, next.latitude, next.longitude)
              return {
                type: 'Feature' as const,
                geometry: {
                  type: 'Point' as const,
                  coordinates: [
                    (w.longitude + next.longitude) / 2,
                    (w.latitude + next.latitude) / 2,
                  ] as [number, number],
                },
                properties: { label: `${Math.round(nm)} nm · ${Math.round(hdg)}°` },
              }
            })
          : [],
    }),
    [waypoints]
  )

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildRasterStyle(baseLayer),
      center: [mapCenter[1], mapCenter[0]],
      zoom: mapZoom,
      attributionControl: false,
    })

    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right')

    const emitBounds = () => {
      const b = map.getBounds()
      onBoundsChangeRef.current({
        minLat: b.getSouth(),
        maxLat: b.getNorth(),
        minLon: b.getWest(),
        maxLon: b.getEast(),
      })
    }

    map.on('load', () => {
      map.addSource(AIRPORT_SOURCE, {
        type: 'geojson',
        data: airportsGeoJSON,
        cluster: clusterAirports,
        clusterRadius: 52,
        clusterMaxZoom: 9,
      })

      if (clusterAirports) {
        map.addLayer({
          id: AIRPORT_CLUSTER,
          type: 'circle',
          source: AIRPORT_SOURCE,
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': '#1f2937',
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              3,
              ['step', ['get', 'point_count'], 12, 100, 15, 300, 18],
              8,
              ['step', ['get', 'point_count'], 16, 100, 20, 300, 24],
              11,
              ['step', ['get', 'point_count'], 20, 100, 24, 300, 28],
            ],
            'circle-opacity': 0.85,
          },
        })
        map.addLayer({
          id: AIRPORT_CLUSTER_COUNT,
          type: 'symbol',
          source: AIRPORT_SOURCE,
          filter: ['has', 'point_count'],
          layout: {
            'text-field': ['get', 'point_count_abbreviated'],
            'text-size': 11,
          },
          paint: {
            'text-color': '#ffffff',
          },
        })
      }

      map.addLayer({
        id: AIRPORT_LARGE,
        type: 'circle',
        source: AIRPORT_SOURCE,
        filter: clusterAirports
          ? ['all', ['!', ['has', 'point_count']], ['==', ['get', 'type'], 'large_airport']]
          : ['==', ['get', 'type'], 'large_airport'],
        paint: {
          'circle-color': [
            'match', ['get', 'flightCategory'],
            'VFR', '#22c55e',
            'MVFR', '#38bdf8',
            'IFR', '#ef4444',
            'LIFR', '#d946ef',
            '#ef4444',
          ],
          'circle-radius': 6,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#111827',
        },
      })

      map.addLayer({
        id: AIRPORT_MEDIUM,
        type: 'circle',
        source: AIRPORT_SOURCE,
        filter: clusterAirports
          ? ['all', ['!', ['has', 'point_count']], ['==', ['get', 'type'], 'medium_airport']]
          : ['==', ['get', 'type'], 'medium_airport'],
        paint: {
          'circle-color': [
            'match', ['get', 'flightCategory'],
            'VFR', '#22c55e',
            'MVFR', '#38bdf8',
            'IFR', '#ef4444',
            'LIFR', '#d946ef',
            '#f59e0b',
          ],
          'circle-radius': 4.5,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#111827',
        },
      })

      map.addLayer({
        id: AIRPORT_SMALL,
        type: 'circle',
        source: AIRPORT_SOURCE,
        filter: clusterAirports
          ? ['all', ['!', ['has', 'point_count']], ['==', ['get', 'type'], 'small_airport']]
          : ['==', ['get', 'type'], 'small_airport'],
        paint: {
          'circle-color': [
            'match', ['get', 'flightCategory'],
            'VFR', '#22c55e',
            'MVFR', '#38bdf8',
            'IFR', '#ef4444',
            'LIFR', '#d946ef',
            '#22c55e',
          ],
          'circle-radius': 3.2,
          'circle-stroke-width': 0.8,
          'circle-stroke-color': '#111827',
        },
      })

      map.addLayer({
        id: AIRPORT_LABELS,
        type: 'symbol',
        source: AIRPORT_SOURCE,
        filter: clusterAirports ? ['all', ['!', ['has', 'point_count']]] : ['all'],
        layout: {
          'text-field': ['get', 'icao'],
          'text-size': [
            'interpolate',
            ['linear'],
            ['zoom'],
            4,
            10,
            10,
            11,
            14,
            12,
          ],
          'text-offset': [0, -1.35],
          'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': '#e5e7eb',
          'text-halo-color': '#111827',
          'text-halo-width': 1.5,
          'text-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 1, 0],
        },
      })

      map.addSource(ROUTE_SOURCE, { type: 'geojson', data: routeGeoJSON })
      map.addLayer({
        id: ROUTE_LAYER,
        type: 'line',
        source: ROUTE_SOURCE,
        paint: {
          'line-color': '#3b82f6',
          'line-width': 2.5,
          'line-opacity': 0.95,
        },
      })

      map.addSource(WAYPOINTS_SOURCE, { type: 'geojson', data: waypointsGeoJSON })
      map.addLayer({
        id: WAYPOINTS_LAYER,
        type: 'circle',
        source: WAYPOINTS_SOURCE,
        paint: {
          'circle-color': '#3b82f6',
          'circle-radius': 8,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
        },
      })
      map.addLayer({
        id: WAYPOINTS_LABELS,
        type: 'symbol',
        source: WAYPOINTS_SOURCE,
        layout: {
          'text-field': ['to-string', ['get', 'order']],
          'text-size': 10,
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: {
          'text-color': '#ffffff',
        },
      })

      map.addSource(LEG_LABELS_SOURCE, { type: 'geojson', data: legLabelsGeoJSON })
      map.addLayer({
        id: LEG_LABELS_LAYER,
        type: 'symbol',
        source: LEG_LABELS_SOURCE,
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 11,
          'text-allow-overlap': false,
          'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
        },
        paint: {
          'text-color': '#93c5fd',
          'text-halo-color': '#0f172a',
          'text-halo-width': 1.5,
        },
      })

      if (clusterAirports) {
        map.on('click', AIRPORT_CLUSTER, (e) => {
          const feature = e.features?.[0]
          if (!feature) return
          const source = map.getSource(AIRPORT_SOURCE) as GeoJSONSource
          const clusterId = Number(feature.properties?.cluster_id)
          void source.getClusterExpansionZoom(clusterId).then((zoom) => {
            const c = (feature.geometry as GeoJSON.Point).coordinates
            const currentZoom = map.getZoom()
            const targetZoom = Math.min(zoom, currentZoom + 2)
            map.easeTo({ center: [c[0], c[1]], zoom: targetZoom, duration: 420 })
          })
        })
      }

      const setHover = (id: string | number | null) => {
        const prev = hoveredAirportIdRef.current
        if (prev !== null) {
          map.setFeatureState({ source: AIRPORT_SOURCE, id: prev }, { hover: false })
        }
        hoveredAirportIdRef.current = id
        if (id !== null) {
          map.setFeatureState({ source: AIRPORT_SOURCE, id }, { hover: true })
        }
      }

      const bindHover = (layerId: string) => {
        map.on('mousemove', layerId, (e: MapLayerMouseEvent) => {
          map.getCanvas().style.cursor = 'pointer'
          const feature = e.features?.[0]
          if (!feature) return
          const featureId = (feature.id as string | number | undefined) ?? null
          setHover(featureId)
        })
        map.on('mouseleave', layerId, () => {
          map.getCanvas().style.cursor = ''
          setHover(null)
        })
      }

      bindHover(AIRPORT_LARGE)
      bindHover(AIRPORT_MEDIUM)
      bindHover(AIRPORT_SMALL)
      if (clusterAirports) {
        map.on('mouseenter', AIRPORT_CLUSTER, () => {
          map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mouseleave', AIRPORT_CLUSTER, () => {
          map.getCanvas().style.cursor = ''
        })
      }

      const onClickAirportLayer = (layerId: string) => {
        map.on('click', layerId, (e) => {
          const feature = e.features?.[0]
          if (!feature) return
          const c = (feature.geometry as GeoJSON.Point).coordinates
          const airport: Airport = {
            icao: String(feature.properties?.icao || ''),
            iata: String(feature.properties?.iata || ''),
            name: String(feature.properties?.name || ''),
            city: String(feature.properties?.city || ''),
            latitude: c[1],
            longitude: c[0],
            type: String(feature.properties?.type || ''),
          }

          map.easeTo({ center: [c[0], c[1]], zoom: Math.max(map.getZoom(), 8), duration: 280 })
          onAirportClickRef.current(airport)

          const ensurePopupVisible = () => {
            if (!popupRef.current) return
            const popupEl = popupRef.current.getElement()
            if (!popupEl) return

            const mapSize = map.getContainer().getBoundingClientRect()
            const popupRect = popupEl.getBoundingClientRect()
            const point = map.project([c[0], c[1]])

            const margin = 16
            const popupHeight = Math.max(160, popupRect.height)
            const popupWidth = Math.max(180, popupRect.width)

            let dx = 0
            let dy = 0

            // Ensure marker + popup have room vertically (popup opens above marker)
            const requiredTop = popupHeight + margin
            if (point.y < requiredTop) {
              dy = point.y - requiredTop
            } else if (point.y > mapSize.height - margin) {
              dy = point.y - (mapSize.height - margin)
            }

            // Ensure popup is horizontally visible
            if (point.x < popupWidth / 2 + margin) {
              dx = point.x - (popupWidth / 2 + margin)
            } else if (point.x > mapSize.width - popupWidth / 2 - margin) {
              dx = point.x - (mapSize.width - popupWidth / 2 - margin)
            }

            if (dx !== 0 || dy !== 0) {
              map.panBy([dx, dy], { duration: 260 })
            }
          }

          if (popupRef.current) popupRef.current.remove()
          popupAirportRef.current = airport.icao
          const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')

          const loadingContent = buildAirportPopupContent(airport, {
            isDark,
            loading: true,
            flightHistoryLoading: !!onFlightHistoryRef.current,
            onAddToRoute: () => onAirportAddToRouteRef.current?.(airport),
            onViewStateInfo: (stateCode) => onViewStateInfoRef.current?.(stateCode),
            onOpenExternal: (url) => onOpenExternalRef.current?.(url),
            onClose: () => {
              popupRef.current?.remove()
              popupRef.current = null
              popupAirportRef.current = null
              onAirportCloseRef.current?.()
            },
          })

          popupRef.current = new maplibregl.Popup({ closeButton: true, closeOnMove: false })
            .setLngLat([c[0], c[1]])
            .setDOMContent(loadingContent)
            .addTo(map)

          requestAnimationFrame(ensurePopupVisible)

          fetch(`/api/airports/${airport.icao}`)
            .then(async (res) => {
              if (!res.ok) throw new Error('Failed to load airport details')
              return res.json() as Promise<AirportDetails>
            })
            .then((details) => {
              if (!popupRef.current) return
              if (popupAirportRef.current !== airport.icao) return
              const detailsContent = buildAirportPopupContent(airport, {
                isDark,
                details,
                onAddToRoute: () => onAirportAddToRouteRef.current?.(airport),
                onViewStateInfo: (stateCode) => onViewStateInfoRef.current?.(stateCode),
                onOpenExternal: (url) => onOpenExternalRef.current?.(url),
                onClose: () => {
                  popupRef.current?.remove()
                  popupRef.current = null
                  popupAirportRef.current = null
                  onAirportCloseRef.current?.()
                },
              })
              popupRef.current.setDOMContent(detailsContent)
              requestAnimationFrame(ensurePopupVisible)

              // Fetch flight history asynchronously — never blocks the popup
              if (onFlightHistoryRef.current) {
                onFlightHistoryRef.current(airport.icao)
                  .then((history) => {
                    if (!popupRef.current || popupAirportRef.current !== airport.icao) return
                    if (!history || history.length === 0) return
                    // Append flight history section to the existing popup
                    const popupEl = popupRef.current.getElement()
                    if (!popupEl) return
                    const addRouteBtn = popupEl.querySelector('[data-role="popup-add-route"]') as HTMLElement | null
                    if (!addRouteBtn) return
                    const histDiv = document.createElement('div')
                    histDiv.className = 'mt-2'
                    histDiv.innerHTML = `
                      <div class="text-xs font-medium" style="color:#64748b;margin-bottom:4px;">Your Flight History</div>
                      <div style="max-height:96px;overflow-y:auto;">
                        ${history.slice(0, 8).map(f => {
                          const isDep = f.routeFrom.toUpperCase() === airport.icao.toUpperCase()
                          const dateStr = f.date ? new Date(f.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—'
                          return `<div style="display:flex;align-items:center;justify-content:space-between;font-size:10px;background:#f1f5f9;border-radius:4px;padding:2px 6px;margin-bottom:2px;">
                            <span style="color:#64748b;">${dateStr}</span>
                            <span style="font-weight:500;color:#334155;">${f.aircraft || '—'}</span>
                            <span style="color:#64748b;">${isDep ? 'Dep' : 'Arr'}</span>
                            <span style="font-family:monospace;color:#475569;">${isDep ? f.routeTo : f.routeFrom}</span>
                            <span style="color:#94a3b8;">${f.totalTime ? f.totalTime.toFixed(1) + 'h' : ''}</span>
                          </div>`
                        }).join('')}
                      </div>
                    `
                    addRouteBtn.parentElement?.insertBefore(histDiv, addRouteBtn)
                  })
                  .catch(() => {}) // silently ignore flight history errors
              }
            })
            .catch(() => {
              if (!popupRef.current) return
              if (popupAirportRef.current !== airport.icao) return
              const fallbackContent = buildAirportPopupContent(airport, {
                isDark,
                onAddToRoute: () => onAirportAddToRouteRef.current?.(airport),
                onViewStateInfo: (stateCode) => onViewStateInfoRef.current?.(stateCode),
                onOpenExternal: (url) => onOpenExternalRef.current?.(url),
                onClose: () => {
                  popupRef.current?.remove()
                  popupRef.current = null
                  popupAirportRef.current = null
                  onAirportCloseRef.current?.()
                },
              })
              popupRef.current.setDOMContent(fallbackContent)
              requestAnimationFrame(ensurePopupVisible)
            })
        })
      }

      onClickAirportLayer(AIRPORT_LARGE)
      onClickAirportLayer(AIRPORT_MEDIUM)
      onClickAirportLayer(AIRPORT_SMALL)

      // ── Overlay sources & layers (initialized hidden, toggled by effects) ──
      map.addSource(TERRAIN_SOURCE, {
        type: 'raster',
        tiles: ['https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: 17,
      })
      map.addLayer({
        id: TERRAIN_LAYER,
        type: 'raster',
        source: TERRAIN_SOURCE,
        paint: { 'raster-opacity': 0.25 },
        layout: { visibility: 'none' },
      })

      map.addSource(TFR_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({
        id: TFR_CIRCLE_LAYER,
        type: 'circle',
        source: TFR_SOURCE,
        paint: {
          'circle-color': '#ef4444',
          'circle-radius': 8,
          'circle-opacity': 0.4,
          'circle-stroke-color': '#ef4444',
          'circle-stroke-width': 2,
        },
        layout: { visibility: 'none' },
      })
      map.addLayer({
        id: TFR_LABEL_LAYER,
        type: 'symbol',
        source: TFR_SOURCE,
        layout: {
          'text-field': ['get', 'title'],
          'text-size': 10,
          'text-offset': [0, 1.5],
          'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
          'visibility': 'none',
        },
        paint: {
          'text-color': '#ef4444',
          'text-halo-color': '#0f172a',
          'text-halo-width': 1,
        },
      })

      map.addSource(PIREP_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({
        id: PIREP_LAYER,
        type: 'circle',
        source: PIREP_SOURCE,
        paint: {
          'circle-color': [
            'match', ['get', 'turbulence'],
            'NIL', '#22c55e',
            'Light', '#f59e0b',
            'Moderate', '#f97316',
            'Severe', '#ef4444',
            '#a855f7',
          ],
          'circle-radius': 8,
          'circle-opacity': 0.85,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
        layout: { visibility: 'none' },
      })
      map.addLayer({
        id: PIREP_LABELS_LAYER,
        type: 'symbol',
        source: PIREP_SOURCE,
        layout: {
          'text-field': ['concat', ['get', 'turbulence'], ' ', ['get', 'icing']],
          'text-size': 9,
          'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
          'text-offset': [0, 1.5],
          'visibility': 'none',
        },
        paint: {
          'text-color': '#e2e8f0',
          'text-halo-color': '#0f172a',
          'text-halo-width': 1.5,
        },
      })

      // ── MGRS Grid overlay ──
      map.addSource(MGRS_GRID_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({
        id: MGRS_GRID_LINES,
        type: 'line',
        source: MGRS_GRID_SOURCE,
        filter: ['==', ['get', 'type'], 'grid'],
        paint: {
          'line-color': 'rgba(255,255,255,0.2)',
          'line-width': 0.8,
        },
        layout: { visibility: 'none' },
      })
      map.addLayer({
        id: MGRS_GRID_LABELS,
        type: 'symbol',
        source: MGRS_GRID_SOURCE,
        filter: ['==', ['get', 'type'], 'label'],
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 10,
          'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
          'symbol-placement': 'point',
          'visibility': 'none',
        },
        paint: {
          'text-color': 'rgba(255,255,255,0.6)',
          'text-halo-color': '#0f172a',
          'text-halo-width': 1,
        },
      })

      // ── Ruler overlay ──
      map.addSource(RULER_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({
        id: RULER_LINE_LAYER,
        type: 'line',
        source: RULER_SOURCE,
        filter: ['==', ['get', 'type'], 'line'],
        paint: {
          'line-color': '#facc15',
          'line-width': 2,
          'line-dasharray': [6, 3],
        },
        layout: { visibility: 'none' },
      })
      map.addLayer({
        id: RULER_POINTS_LAYER,
        type: 'circle',
        source: RULER_SOURCE,
        filter: ['==', ['get', 'type'], 'point'],
        paint: {
          'circle-color': '#facc15',
          'circle-radius': 5,
          'circle-stroke-color': '#0f172a',
          'circle-stroke-width': 1.5,
        },
        layout: { visibility: 'none' },
      })
      map.addLayer({
        id: RULER_LABELS_LAYER,
        type: 'symbol',
        source: RULER_SOURCE,
        filter: ['==', ['get', 'type'], 'label'],
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 11,
          'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
          'symbol-placement': 'point',
          'visibility': 'none',
        },
        paint: {
          'text-color': '#facc15',
          'text-halo-color': '#0f172a',
          'text-halo-width': 1.5,
        },
      })

      // ── Range Ring overlay ──
      map.addSource(RANGE_RING_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({
        id: RANGE_RING_CIRCLES,
        type: 'line',
        source: RANGE_RING_SOURCE,
        filter: ['==', ['get', 'type'], 'ring'],
        paint: {
          'line-color': '#f59e0b',
          'line-width': 2,
          'line-dasharray': [6, 3],
        },
        layout: { visibility: 'none' },
      })
      map.addLayer({
        id: RANGE_RING_LABELS,
        type: 'symbol',
        source: RANGE_RING_SOURCE,
        filter: ['==', ['get', 'type'], 'label'],
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 12,
          'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
          'symbol-placement': 'point',
          'visibility': 'none',
        },
        paint: {
          'text-color': '#f59e0b',
          'text-halo-color': '#0f172a',
          'text-halo-width': 2,
        },
      })

      // Trigger initial range ring update now that source exists
      {
        const rrVis = showRangeRingsRef.current ? 'visible' : 'none'
        try {
          map.setLayoutProperty(RANGE_RING_CIRCLES, 'visibility', rrVis)
          map.setLayoutProperty(RANGE_RING_LABELS, 'visibility', rrVis)
        } catch {}
        const rrCenter = rangeRingCenterRef.current
        if (showRangeRingsRef.current && rrCenter) {
          const features: GeoJSON.Feature[] = []
          const cosLat = Math.cos((rrCenter.lat * Math.PI) / 180) || 0.0001
          for (const interval of rangeRingIntervalsRef.current) {
            if (interval <= 0) continue
            const coords: [number, number][] = []
            for (let i = 0; i <= 64; i++) {
              const angle = (i * 2 * Math.PI) / 64
              coords.push([
                rrCenter.lng + (interval / (60 * cosLat)) * Math.sin(angle),
                rrCenter.lat + (interval / 60) * Math.cos(angle),
              ])
            }
            features.push({ type: 'Feature' as const, geometry: { type: 'LineString' as const, coordinates: coords }, properties: { type: 'ring', interval } })
            features.push({ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [rrCenter.lng, rrCenter.lat + (interval / 60)] }, properties: { type: 'label', label: `${interval} nm` } })
          }
          const src = map.getSource(RANGE_RING_SOURCE) as GeoJSONSource | undefined
          if (src) src.setData({ type: 'FeatureCollection', features })
        }
      }

      map.on('moveend', emitBounds)
      map.on('zoomend', emitBounds)
      emitBounds()
    })

    return () => {
      if (popupRef.current) {
        popupRef.current.remove()
        popupRef.current = null
      }
      popupAirportRef.current = null
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    const source = map.getSource(AIRPORT_SOURCE) as GeoJSONSource | undefined
    if (source) source.setData(airportsGeoJSON)
  }, [airportsGeoJSON])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    const source = map.getSource(WAYPOINTS_SOURCE) as GeoJSONSource | undefined
    if (source) source.setData(waypointsGeoJSON)
    const routeSource = map.getSource(ROUTE_SOURCE) as GeoJSONSource | undefined
    if (routeSource) routeSource.setData(routeGeoJSON)
    const legSource = map.getSource(LEG_LABELS_SOURCE) as GeoJSONSource | undefined
    if (legSource) legSource.setData(legLabelsGeoJSON)
  }, [waypointsGeoJSON, routeGeoJSON, legLabelsGeoJSON])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const prev = lastViewRef.current
    if (
      prev &&
      Math.abs(prev.center[0] - mapCenter[0]) < 0.0001 &&
      Math.abs(prev.center[1] - mapCenter[1]) < 0.0001 &&
      Math.abs(prev.zoom - mapZoom) < 0.0001
    ) {
      return
    }
    lastViewRef.current = { center: mapCenter, zoom: mapZoom }
    map.easeTo({ center: [mapCenter[1], mapCenter[0]], zoom: mapZoom, duration: 350 })
  }, [mapCenter, mapZoom])

  // ── Show/hide terrain overlay ──
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    try {
      map.setLayoutProperty(TERRAIN_LAYER, 'visibility', showTerrain ? 'visible' : 'none')
    } catch {}
  }, [showTerrain])

  // ── Show/hide TFR overlay ──
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    const vis = showTfrs ? 'visible' : 'none'
    try {
      map.setLayoutProperty(TFR_CIRCLE_LAYER, 'visibility', vis)
      map.setLayoutProperty(TFR_LABEL_LAYER, 'visibility', vis)
    } catch {}
    if (!showTfrs) {
      // Remove the DOM overlay when hidden
      const existing = map.getContainer().querySelector('.tfr-overlay') as HTMLDivElement | null
      if (existing) existing.remove()
      return
    }

    const controller = new AbortController()
    fetch('/api/tfrs', { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        const tfrs: Array<{ title: string; description: string; notamId: string }> = data.tfrs || []

        // Update container attributes for any external consumers
        const container = map.getContainer()
        container.setAttribute('data-tfr-count', String(tfrs.length))
        container.setAttribute('data-tfr-titles', tfrs.slice(0, 10).map(t => t.title).join('\n'))

        // Build/update a floating DOM overlay inside the map container
        let tfrDiv = container.querySelector('.tfr-overlay') as HTMLDivElement | null
        if (!tfrDiv) {
          tfrDiv = document.createElement('div')
          tfrDiv.className = 'tfr-overlay'
          tfrDiv.setAttribute('role', 'status')
          tfrDiv.setAttribute('aria-label', 'Active TFR information')
          tfrDiv.style.cssText = [
            'position:absolute',
            'bottom:40px',
            'left:8px',
            'z-index:999',
            'max-width:280px',
            'border-radius:6px',
            'font-family:system-ui,-apple-system,sans-serif',
            'pointer-events:auto',
            'box-shadow:0 2px 8px rgba(0,0,0,0.35)',
            'border:1px solid rgba(239,68,68,0.4)',
            'background:rgba(15,23,42,0.88)',
            'backdrop-filter:blur(6px)',
            'color:#e2e8f0',
            'overflow:hidden',
          ].join(';')
          container.appendChild(tfrDiv)
        }

        if (tfrs.length === 0) {
          tfrDiv.style.display = 'none'
          return
        }

        tfrDiv.style.display = 'block'
        const MAX_DISPLAY = 5
        const displayed = tfrs.slice(0, MAX_DISPLAY)
        const remaining = tfrs.length - MAX_DISPLAY

        const titlesHtml = displayed
          .map(t => {
            const escaped = t.title
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
            const truncated = escaped.length > 80 ? escaped.slice(0, 77) + '...' : escaped
            return `<li style="padding:2px 0;list-style:none;font-size:11px;line-height:1.35;border-bottom:1px solid rgba(255,255,255,0.06);color:#cbd5e1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escaped}"><span style="color:#ef4444;font-size:8px;margin-right:4px;">&#9679;</span>${truncated}</li>`
          })
          .join('')

        tfrDiv.innerHTML = `
          <div style="padding:8px 10px 6px;">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;">
              <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#ef4444;flex-shrink:0;box-shadow:0 0 4px #ef4444;"></span>
              <span style="font-size:11px;font-weight:600;color:#f87171;letter-spacing:0.02em;">${tfrs.length} Active TFR${tfrs.length !== 1 ? 's' : ''}</span>
            </div>
            <ul style="margin:0;padding:0;">
              ${titlesHtml}
            </ul>
            ${remaining > 0 ? `<div style="font-size:10px;color:#64748b;margin-top:4px;">+${remaining} more</div>` : ''}
            <a href="https://tfr.faa.gov" target="_blank" rel="noopener noreferrer"
               style="display:block;text-align:right;font-size:10px;color:#94a3b8;margin-top:4px;text-decoration:none;">
              View all on FAA &rarr;
            </a>
          </div>
        `
      })
      .catch(() => {})

    return () => {
      controller.abort()
      const existing = map.getContainer()?.querySelector('.tfr-overlay') as HTMLDivElement | null
      if (existing) existing.remove()
    }
  }, [showTfrs])

  // ── Show/hide PIREP overlay ──
  const pirepFetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    try {
      map.setLayoutProperty(PIREP_LAYER, 'visibility', showPireps ? 'visible' : 'none')
      map.setLayoutProperty(PIREP_LABELS_LAYER, 'visibility', showPireps ? 'visible' : 'none')
    } catch {}
    if (!showPireps) return
    // Fetch PIREP data for current bounds
    const fetchPireps = () => {
      const b = map.getBounds()
      const boundsParam = `${b.getSouth()},${b.getNorth()},${b.getWest()},${b.getEast()}`
      fetch(`/api/pireps?bounds=${boundsParam}`)
        .then((r) => r.json())
        .then((data) => {
          const pireps: Array<{ id: string; latitude: number; longitude: number; turbulence: string; icing: string; aircraft: string; flightLevel: number; windDirection: number; windSpeed: number }> = data.pireps || []
          const source = map.getSource(PIREP_SOURCE) as GeoJSONSource | undefined
          if (source) {
            source.setData({
              type: 'FeatureCollection',
              features: pireps.map((p) => ({
                type: 'Feature' as const,
                geometry: { type: 'Point' as const, coordinates: [p.longitude, p.latitude] },
                properties: {
                  id: p.id,
                  turbulence: p.turbulence || 'NIL',
                  icing: p.icing || 'NIL',
                  aircraft: p.aircraft || '',
                  flightLevel: p.flightLevel || 0,
                  windDirection: p.windDirection || 0,
                  windSpeed: p.windSpeed || 0,
                },
              })),
            })
          }
        })
        .catch(() => {})
    }
    fetchPireps()
    // Re-fetch on map movement (debounced)
    const onMoveEnd = () => {
      if (pirepFetchTimerRef.current) clearTimeout(pirepFetchTimerRef.current)
      pirepFetchTimerRef.current = setTimeout(fetchPireps, 600)
    }
    map.on('moveend', onMoveEnd)
    return () => {
      map.off('moveend', onMoveEnd)
      if (pirepFetchTimerRef.current) clearTimeout(pirepFetchTimerRef.current)
    }
  }, [showPireps])

  // ── Reference Grid overlay (distance-aware) ──
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    try {
      map.setLayoutProperty(MGRS_GRID_LINES, 'visibility', showMgrsGrid ? 'visible' : 'none')
      map.setLayoutProperty(MGRS_GRID_LABELS, 'visibility', showMgrsGrid ? 'visible' : 'none')
    } catch {}
    if (!showMgrsGrid) return

    const buildGrid = () => {
      const zoom = map.getZoom()
      const b = map.getBounds()
      const centerLat = (b.getNorth() + b.getSouth()) / 2

      // Pick target cell size in nm based on zoom
      let targetNm = 100
      if (zoom >= 4) targetNm = 50
      if (zoom >= 6) targetNm = 25
      if (zoom >= 8) targetNm = 10
      if (zoom >= 10) targetNm = 5
      if (zoom >= 12) targetNm = 2

      // Convert target nm → degree spacing
      // 1° lat ≈ 60 nm, 1° lon ≈ 60 × cos(lat) nm
      const latSpacing = targetNm / 60
      const cosLat = Math.cos((centerLat * Math.PI) / 180) || 0.0001
      const lonSpacing = targetNm / (60 * cosLat)

      // Snap to nice degree values
      function niceSpacing(raw: number): number {
        if (raw >= 10) return Math.round(raw / 10) * 10
        if (raw >= 5) return 5
        if (raw >= 2) return 2
        if (raw >= 1) return 1
        if (raw >= 0.5) return 0.5
        if (raw >= 0.25) return 0.25
        return 0.1
      }

      const latStep = niceSpacing(latSpacing)
      const lonStep = niceSpacing(lonSpacing)

      // Actual distances for the chosen spacing
      const actualNmLat = latStep * 60
      const actualNmLon = lonStep * 60 * cosLat
      const avgNm = (actualNmLat + actualNmLon) / 2
      const avgMi = avgNm * 1.15078
      const avgKm = avgNm * 1.852

      const west = Math.floor(b.getWest() / lonStep) * lonStep
      const east = Math.ceil(b.getEast() / lonStep) * lonStep
      const south = Math.floor(b.getSouth() / latStep) * latStep
      const north = Math.ceil(b.getNorth() / latStep) * latStep

      const features: GeoJSON.Feature[] = []

      // Vertical lines (longitude)
      for (let lon = west; lon <= east; lon += lonStep) {
        const rLon = Math.round(lon * 10000) / 10000
        features.push({
          type: 'Feature' as const,
          geometry: { type: 'LineString' as const, coordinates: [[rLon, south], [rLon, north]] },
          properties: { type: 'grid' },
        })
      }

      // Horizontal lines (latitude)
      for (let lat = south; lat <= north; lat += latStep) {
        const rLat = Math.round(lat * 10000) / 10000
        features.push({
          type: 'Feature' as const,
          geometry: { type: 'LineString' as const, coordinates: [[west, rLat], [east, rLat]] },
          properties: { type: 'grid' },
        })
      }

      // Reference badge at map center
      const badgeLon = (b.getWest() + b.getEast()) / 2
      const badgeLat = (b.getNorth() + b.getSouth()) / 2
      const nmStr = avgNm >= 1 ? Math.round(avgNm).toString() : avgNm.toFixed(1)
      const miStr = avgMi >= 1 ? avgMi.toFixed(1) : avgMi.toFixed(2)
      const kmStr = avgKm >= 1 ? avgKm.toFixed(1) : avgKm.toFixed(2)
      features.push({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [badgeLon, badgeLat] },
        properties: { type: 'label', label: `1 block ≈ ${nmStr} nm · ${miStr} mi · ${kmStr} km` },
      })

      const source = map.getSource(MGRS_GRID_SOURCE) as GeoJSONSource | undefined
      if (source) source.setData({ type: 'FeatureCollection', features })
    }

    buildGrid()
    map.on('moveend', buildGrid)
    map.on('zoomend', buildGrid)
    return () => {
      map.off('moveend', buildGrid)
      map.off('zoomend', buildGrid)
    }
  }, [showMgrsGrid])

  // ── Distance Ruler ──
  const rulerClickHandlerRef = useRef<((e: maplibregl.MapMouseEvent) => void) | null>(null)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    const vis = showRuler ? 'visible' : 'none'
    try {
      map.setLayoutProperty(RULER_LINE_LAYER, 'visibility', vis)
      map.setLayoutProperty(RULER_POINTS_LAYER, 'visibility', vis)
      map.setLayoutProperty(RULER_LABELS_LAYER, 'visibility', vis)
    } catch {}
    if (!showRuler) {
      // Remove click handler
      if (rulerClickHandlerRef.current) {
        map.off('click', rulerClickHandlerRef.current)
        rulerClickHandlerRef.current = null
      }
      return
    }
    // Add click handler
    const handler = (e: maplibregl.MapMouseEvent) => {
      onRulerPointAddRef.current?.({ lat: e.lngLat.lat, lng: e.lngLat.lng })
    }
    rulerClickHandlerRef.current = handler
    map.on('click', handler)
    return () => {
      if (rulerClickHandlerRef.current) {
        map.off('click', rulerClickHandlerRef.current)
        rulerClickHandlerRef.current = null
      }
    }
  }, [showRuler])

  // Update ruler data when points change
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    const source = map.getSource(RULER_SOURCE) as GeoJSONSource | undefined
    if (!source) return

    if (rulerPoints.length === 0) {
      source.setData({ type: 'FeatureCollection', features: [] })
      return
    }

    const features: GeoJSON.Feature[] = []
    let cumulativeNm = 0

    for (let i = 0; i < rulerPoints.length; i++) {
      const pt = rulerPoints[i]
      // Point marker
      features.push({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [pt.lng, pt.lat] },
        properties: { type: 'point' },
      })
      // Label: point number
      features.push({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [pt.lng, pt.lat] },
        properties: { type: 'label', label: `${i + 1}` },
      })

      if (i > 0) {
        const prev = rulerPoints[i - 1]
        const nm = haversineNm(prev.lat, prev.lng, pt.lat, pt.lng)
        const hdg = trueHeading(prev.lat, prev.lng, pt.lat, pt.lng)
        cumulativeNm += nm

        // Line segment
        features.push({
          type: 'Feature' as const,
          geometry: {
            type: 'LineString' as const,
            coordinates: [[prev.lng, prev.lat], [pt.lng, pt.lat]],
          },
          properties: { type: 'line' },
        })
        // Distance label at midpoint
        const midLng = (prev.lng + pt.lng) / 2
        const midLat = (prev.lat + pt.lat) / 2
        features.push({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [midLng, midLat] },
          properties: { type: 'label', label: `${Math.round(nm)} nm · ${Math.round(hdg)}°` },
        })
      }
    }

    // Total label at last point
    if (rulerPoints.length >= 2) {
      const last = rulerPoints[rulerPoints.length - 1]
      features.push({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [last.lng, last.lat] },
        properties: { type: 'label', label: `Total: ${Math.round(cumulativeNm)} nm` },
      })
    }

    source.setData({ type: 'FeatureCollection', features })
  }, [rulerPoints])

  // ── Range Rings ──
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const vis = showRangeRings ? 'visible' : 'none'
    try {
      map.setLayoutProperty(RANGE_RING_CIRCLES, 'visibility', vis)
      map.setLayoutProperty(RANGE_RING_LABELS, 'visibility', vis)
    } catch { return }
    if (!showRangeRings || !rangeRingCenter) {
      try {
        const source = map.getSource(RANGE_RING_SOURCE) as GeoJSONSource | undefined
        if (source) source.setData({ type: 'FeatureCollection', features: [] })
      } catch {}
      return
    }

    const features: GeoJSON.Feature[] = []
    const { lat, lng } = rangeRingCenter
    const cosLat = Math.cos((lat * Math.PI) / 180) || 0.0001
    const numPoints = 64

    for (const interval of rangeRingIntervals) {
      if (interval <= 0) continue
      const coords: [number, number][] = []
      for (let i = 0; i <= numPoints; i++) {
        const angle = (i * 2 * Math.PI) / numPoints
        const dLat = (interval / 60) * Math.cos(angle)
        const dLng = (interval / (60 * cosLat)) * Math.sin(angle)
        coords.push([lng + dLng, lat + dLat])
      }
      features.push({
        type: 'Feature' as const,
        geometry: { type: 'LineString' as const, coordinates: coords },
        properties: { type: 'ring', interval },
      })
      features.push({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [lng, lat + (interval / 60)] },
        properties: { type: 'label', label: `${interval} nm` },
      })
    }

    try {
      const source = map.getSource(RANGE_RING_SOURCE) as GeoJSONSource | undefined
      if (source) source.setData({ type: 'FeatureCollection', features })
    } catch {}
  }, [showRangeRings, rangeRingCenter, rangeRingIntervals])

  return <div ref={containerRef} className="h-full w-full" />
}
