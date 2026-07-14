import type { StyleSpecification } from 'maplibre-gl'
import { AERO_TILE_URL_MAPLIBRE, AERO_MAX_ZOOM } from './aero-source'

export type MapBaseLayer = 'osm' | 'satellite' | 'terrain' | 'dark' | 'aero'

const TILE_URLS: Record<MapBaseLayer, string> = {
  osm: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  satellite:
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  terrain: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  aero: AERO_TILE_URL_MAPLIBRE,
}

function expandSubdomains(url: string): string[] {
  if (!url.includes('{s}')) return [url]
  return ['a', 'b', 'c'].map((s) => url.replace('{s}', s).replace('{r}', ''))
}

export function buildRasterStyle(baseLayer: MapBaseLayer): StyleSpecification {
  const isAero = baseLayer === 'aero'
  return {
    version: 8,
    sources: {
      basemap: {
        type: 'raster',
        tiles: expandSubdomains(TILE_URLS[baseLayer]),
        tileSize: 256,
        ...(isAero ? { maxzoom: AERO_MAX_ZOOM } : {}),
      },
    },
    layers: [
      {
        id: 'basemap-layer',
        type: 'raster',
        source: 'basemap',
      },
    ],
  }
}