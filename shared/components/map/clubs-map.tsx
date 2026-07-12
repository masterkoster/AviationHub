'use client'

import { useEffect, useMemo, useRef } from 'react'
import maplibregl, { type GeoJSONSource, type Map } from 'maplibre-gl'
import { buildRasterStyle } from '@/shared/components/map/maplibre-style'

export interface ClubMapPin {
  id: string
  name: string
  lat: number
  lon: number
}

interface ClubsMapProps {
  clubs: ClubMapPin[]
  selectedId: string | null
  onSelectClub: (id: string) => void
}

const CLUBS_SOURCE = 'clubs'
const CLUBS_LAYER = 'clubs-layer'
const CLUBS_LABELS = 'clubs-labels'

const DEFAULT_CENTER: [number, number] = [-98.5795, 39.8283] // [lon, lat]
const DEFAULT_ZOOM = 3.5

export default function ClubsMap({ clubs, selectedId, onSelectClub }: ClubsMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<Map | null>(null)
  const onSelectClubRef = useRef(onSelectClub)
  const hasFitBoundsRef = useRef(false)

  useEffect(() => {
    onSelectClubRef.current = onSelectClub
  }, [onSelectClub])

  const clubsGeoJSON = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: clubs.map((c) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [c.lon, c.lat] as [number, number] },
        properties: {
          id: c.id,
          name: c.name,
          selected: c.id === selectedId,
        },
      })),
    }),
    [clubs, selectedId]
  )

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildRasterStyle('osm'),
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: false,
    })

    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

    map.on('load', () => {
      map.addSource(CLUBS_SOURCE, { type: 'geojson', data: clubsGeoJSON })

      map.addLayer({
        id: CLUBS_LAYER,
        type: 'circle',
        source: CLUBS_SOURCE,
        paint: {
          'circle-color': ['case', ['get', 'selected'], '#f59e0b', '#3b82f6'],
          'circle-radius': ['case', ['get', 'selected'], 9, 6.5],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      })

      map.addLayer({
        id: CLUBS_LABELS,
        type: 'symbol',
        source: CLUBS_SOURCE,
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 11,
          'text-offset': [0, 1.4],
          'text-anchor': 'top',
          'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
          'text-allow-overlap': false,
          'text-optional': true,
        },
        paint: {
          'text-color': '#e5e7eb',
          'text-halo-color': '#111827',
          'text-halo-width': 1.4,
        },
      })

      map.on('mouseenter', CLUBS_LAYER, () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', CLUBS_LAYER, () => {
        map.getCanvas().style.cursor = ''
      })

      map.on('click', CLUBS_LAYER, (e) => {
        const feature = e.features?.[0]
        const id = feature?.properties?.id
        if (typeof id === 'string') onSelectClubRef.current(id)
      })
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep the source data in sync (also drives the selected marker highlight)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    const source = map.getSource(CLUBS_SOURCE) as GeoJSONSource | undefined
    if (source) source.setData(clubsGeoJSON)
  }, [clubsGeoJSON])

  // Fit the map to all club pins the first time they load
  useEffect(() => {
    const map = mapRef.current
    if (!map || hasFitBoundsRef.current || clubs.length === 0) return

    const doFit = () => {
      if (clubs.length === 1) {
        map.easeTo({ center: [clubs[0].lon, clubs[0].lat], zoom: 8, duration: 0 })
      } else {
        const bounds = clubs.reduce(
          (b, c) => b.extend([c.lon, c.lat]),
          new maplibregl.LngLatBounds([clubs[0].lon, clubs[0].lat], [clubs[0].lon, clubs[0].lat])
        )
        map.fitBounds(bounds, { padding: 60, duration: 0, maxZoom: 9 })
      }
      hasFitBoundsRef.current = true
    }

    if (map.isStyleLoaded()) doFit()
    else map.once('load', doFit)
  }, [clubs])

  // Pan to the selected club (e.g. selection made from the side list)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !selectedId) return
    const club = clubs.find((c) => c.id === selectedId)
    if (!club) return
    map.easeTo({ center: [club.lon, club.lat], zoom: Math.max(map.getZoom(), 7), duration: 400 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  return <div ref={containerRef} className="h-full w-full" />
}
