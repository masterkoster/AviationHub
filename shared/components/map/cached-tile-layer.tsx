'use client'

import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { resolveTile, countCachedTiles, type TileProvider } from '@/desktop/lib/tile-cache'
import { buildAeroTileUrl, AERO_ATTRIBUTION } from './aero-source'

/** Tile URL builder per provider (matches LAYERS config in MapControls). */
function buildUrl(provider: TileProvider, z: number, x: number, y: number): string {
  switch (provider) {
    case 'satellite':
      return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`
    case 'terrain':
      return `https://a.tile.opentopomap.org/${z}/${x}/${y}.png`
    case 'dark':
      return `https://a.basemaps.cartocdn.com/dark_all/${z}/${x}/${y}.png`
    case 'aero':
      return buildAeroTileUrl(z, x, y)
    default:
      return `https://a.tile.openstreetmap.org/${z}/${x}/${y}.png`
  }
}

const ATTRIBUTIONS: Record<TileProvider, string> = {
  osm: '&copy; OpenStreetMap',
  satellite: '&copy; Esri',
  terrain: '&copy; OpenTopoMap',
  dark: '&copy; CartoDB',
  aero: AERO_ATTRIBUTION,
}

/**
 * CachedTileLayer — a Leaflet GridLayer that consults the local SQLite tile
 * cache before going to the network. Used by the desktop Fuel Saver map.
 *
 * Behavior:
 *  - On every tile request (z/x/y), check tile_cache SQLite table.
 *  - Hit → resolve as Blob URL (instant, fully offline).
 *  - Miss + online → fetch upstream, persist blob, then resolve.
 *  - Miss + offline → leaflet shows a blank grey tile (default error handling).
 *
 * Note: the Rust migrations create the tile_cache table on every launch via
 * tauri-plugin-sql. We never block the map on cache writes — they happen
 * asynchronously behind the visible tile.
 */
export function CachedTileLayer({
  provider,
  useCache = true,
}: {
  provider: TileProvider
  useCache?: boolean
}) {
  const map = useMap()
  const layerRef = useRef<L.GridLayer | null>(null)

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const LAny = L as any
    const CachedGridLayer = LAny.GridLayer.extend({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      createTile: (coords: any, done: (err?: Error, tile?: HTMLElement) => void) => {
        const tile = document.createElement('img') as HTMLImageElement
        tile.crossOrigin = 'anonymous'
        const { x, y, z } = coords
        const url = buildUrl(provider, z, x, y)

        resolveTile(provider, url, z, x, y)
          .then((blobUrl) => {
            if (blobUrl) {
              tile.src = blobUrl
              done(undefined, tile)
            } else {
              tile.src = TRANSPARENT_PIXEL
              done(new Error('no tile'), tile)
            }
          })
          .catch((err: Error) => done(err))

        return tile
      },
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const layer = new CachedGridLayer({
      minZoom: 0,
      maxZoom: 19,
      attribution: ATTRIBUTIONS[provider],
    })
    layer.addTo(map)
    layerRef.current = layer

    return () => {
      if (layerRef.current) {
        layerRef.current.remove()
        layerRef.current = null
      }
    }
  }, [map, provider, useCache])

  return null
}

// 1×1 transparent PNG (so Leaflet doesn't render a broken-image icon on miss)
const TRANSPARENT_PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='