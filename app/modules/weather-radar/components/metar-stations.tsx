'use client'

import { useEffect, useRef, useCallback } from 'react'
import L from 'leaflet'
import { fetchMetarBatch } from '@/desktop/lib/weather-fetch'
import type { MetarData, FlightCategory } from '@/desktop/lib/weather-types'

// ── Types ──

interface AirportBasic {
  icao: string
  iata: string | null
  name: string
  city: string | null
  latitude: number
  longitude: number
  type: string
}

export interface MetarStation extends AirportBasic {
  metar?: MetarData
}

// ── Flight category colors ──

const CAT_COLORS: Record<FlightCategory, string> = {
  VFR: '#22c55e',
  MVFR: '#3b82f6',
  IFR: '#ef4444',
  LIFR: '#a855f7',
}
const CAT_OPTS: Record<FlightCategory, { fill: string; radius: number }> = {
  VFR: { fill: '#22c55e', radius: 7 },
  MVFR: { fill: '#3b82f6', radius: 8 },
  IFR: { fill: '#ef4444', radius: 9 },
  LIFR: { fill: '#a855f7', radius: 10 },
}

// ── Component ──

interface MetarStationsProps {
  map: L.Map | null
  enabled: boolean
  onStationClick?: (station: MetarStation) => void
}

export default function MetarStations({ map, enabled, onStationClick }: MetarStationsProps) {
  const groupRef = useRef<L.LayerGroup | null>(null)
  const stationsRef = useRef<MetarStation[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fetchTokenRef = useRef(0)

  // Create LayerGroup when map is ready
  useEffect(() => {
    if (!map) return
    if (!groupRef.current) {
      groupRef.current = L.layerGroup().addTo(map)
    }
    return () => {
      if (groupRef.current) {
        groupRef.current.clearLayers()
        map.removeLayer(groupRef.current)
        groupRef.current = null
      }
    }
  }, [map])

  // Load stations within current bounds
  const loadBounds = useCallback(async () => {
    if (!map || !groupRef.current) return

    const bounds = map.getBounds()
    const minLat = bounds.getSouth()
    const maxLat = bounds.getNorth()
    const minLon = bounds.getWest()
    const maxLon = bounds.getEast()

    // Don't fetch if the map is zoomed too far out (continent view — too many airports)
    const zoom = map.getZoom()
    if (zoom < 4) return

    const token = ++fetchTokenRef.current

    try {
      const res = await fetch(
        `/api/airports/bounds?minLat=${minLat}&maxLat=${maxLat}&minLon=${minLon}&maxLon=${maxLon}&minSize=small&limit=300`
      )
      if (!res.ok || token !== fetchTokenRef.current) return
      const data = await res.json()
      const airports: AirportBasic[] = data.airports || []
      if (airports.length === 0) return

      // Extract ICAO codes (only those with valid 4-letter codes)
      const icaos = airports
        .map((a) => a.icao)
        .filter((i): i is string => !!i && i.length >= 3)

      if (icaos.length === 0 || token !== fetchTokenRef.current) return

      // Fetch METARs in batch
      const metarMap = await fetchMetarBatch(icaos)
      if (token !== fetchTokenRef.current) return

      // Build station list
      const stations: MetarStation[] = airports
        .filter((a) => a.icao && metarMap[a.icao]?.rawText)
        .map((a) => ({
          ...a,
          metar: metarMap[a.icao],
        }))

      stationsRef.current = stations
      renderStations(stations)
    } catch {
      // Silently fail — will retry on next move
    }
  }, [map])

  // Render stations as colored circle markers
  function renderStations(stations: MetarStation[]) {
    const group = groupRef.current
    if (!group) return

    group.clearLayers()

    for (const st of stations) {
      if (!st.metar?.flightCategory) continue

      const cat: FlightCategory = st.metar.flightCategory
      const opts = CAT_OPTS[cat]
      const color = CAT_COLORS[cat]

      const marker = L.circleMarker([st.latitude, st.longitude], {
        radius: opts.radius,
        fillColor: opts.fill,
        color: '#ffffff',
        weight: 1.5,
        opacity: 0.9,
        fillOpacity: 0.7,
      })

      // Tooltip on hover
      marker.bindTooltip(
        `<div class="text-xs">
          <strong>${st.icao}</strong> ${st.iata ? `(${st.iata})` : ''}<br/>
          <span style="color:${color}">●</span> ${cat}
          ${st.metar.windSpeedKts !== undefined ? `<br/>Wind: ${st.metar.windDirDeg ?? '?'}° @ ${st.metar.windSpeedKts}kt` : ''}
          ${st.metar.tempC !== undefined ? `<br/>Temp: ${st.metar.tempC}°C` : ''}
          ${st.metar.visibilitySm !== undefined ? `<br/>Vis: ${st.metar.visibilitySm.toFixed(1)} SM` : ''}
        </div>`,
        { direction: 'top', offset: L.point(0, -8), className: 'weather-tooltip' }
      )

      // Click → popup with full METAR
      marker.on('click', () => {
        onStationClick?.(st)
      })

      group.addLayer(marker)
    }
  }

  // Watch map moves with debounce
  useEffect(() => {
    if (!map || !enabled) return

    // Immediate first load
    loadBounds()

    const handleMoveEnd = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(loadBounds, 300)
    }

    map.on('moveend', handleMoveEnd)
    return () => {
      map.off('moveend', handleMoveEnd)
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [map, enabled, loadBounds])

  // Show/hide the layer group
  useEffect(() => {
    if (!groupRef.current) return
    if (enabled) {
      map?.addLayer(groupRef.current)
    } else {
      map?.removeLayer(groupRef.current)
    }
  }, [map, enabled])

  return null
}
