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
  baseLayer?: MapBaseLayer
  performanceMode?: boolean
  maxAirportsToRender?: number
  clusterAirports?: boolean
  weatherCategories?: Record<string, string>
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
    onAddToRoute: () => void
    onViewStateInfo?: (stateCode: string) => void
    onClose?: () => void
    onOpenExternal?: (url: string) => void
  }
): HTMLDivElement {
  const { loading, details, onAddToRoute, onViewStateInfo, onClose, onOpenExternal } = options
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
  baseLayer = 'osm',
  maxAirportsToRender = 2000,
  clusterAirports = true,
  weatherCategories = {},
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

  return <div ref={containerRef} className="h-full w-full" />
}
