/**
 * Aero base layer — Esri World Navigation Charts (ONC).
 *
 * Tile source: Esri ArcGIS Online, Specialty/World_Navigation_Charts/MapServer.
 * Operational Navigation Charts (ONC) at 1:1,000,000 scale, produced by the
 * US National Geospatial-Intelligence Agency. Covers the entire world.
 *
 * Tile scheme: XYZ (OSM convention) — y increases southward.
 *   - Leaflet: pass `tms: false` (default)
 *   - MapLibre: omit `scheme` (defaults to 'xyz')
 *
 * CORS: Access-Control-Allow-Origin: * (cross-origin embedding allowed).
 * Cache: max-age=86400 (24 h browser cache per Esri's CDN).
 * Esri tile URL convention uses {z}/{y}/{x} ordering in the path.
 */

const ESRI_BASE =
  'https://services.arcgisonline.com/ArcGIS/rest/services/Specialty/World_Navigation_Charts/MapServer/tile'

export const AERO_TILE_URL_LEAFLET = `${ESRI_BASE}/{z}/{y}/{x}`
export const AERO_TILE_URL_MAPLIBRE = `${ESRI_BASE}/{z}/{y}/{x}`

/** Build the Aero tile URL for a specific XYZ tile (used by the offline cache fetcher). */
export function buildAeroTileUrl(z: number, x: number, xyzY: number): string {
  // Esri uses {z}/{y}/{x} path order. Y is in standard XYZ convention (south-increasing).
  return `${ESRI_BASE}/${z}/${xyzY}/${x}`
}

export const AERO_ATTRIBUTION = '&copy; Esri — NGA World Navigation Charts'
export const AERO_MAX_ZOOM = 10
export const AERO_TMS = false