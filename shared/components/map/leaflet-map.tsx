'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, Popup, Polyline, CircleMarker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// Lazy import the cached tile layer used in desktop mode (Tauri only).
// `import-type` indirection avoids loading the cache bundle on the web app;
// the chunk ships with the Tauri entry point because the desktop map page
// imports this file with useCachedTiles=true.
import { CachedTileLayer } from './cached-tile-layer';

// Fix Leaflet icon issue
if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window as any).L?.Icon?.Default?.prototype?._getIconUrl;
}

interface Airport {
  icao: string;
  iata?: string;
  name: string;
  city?: string;
  latitude: number;
  longitude: number;
  type?: string;
}

interface Waypoint {
  id: string;
  icao: string;
  name: string;
  latitude: number;
  longitude: number;
}

interface FuelPrice {
  icao: string;
  price100ll: number | null;
  priceJetA?: number | null;
  source?: string;
  sourceUrl?: string;
  lastReported?: string;
  attribution?: {
    name: string;
    url: string;
    airbossUrl: string;
  };
}

interface AirportDetails {
  icao: string;
  name: string;
  type?: string;
  elevation_ft?: number;
  city?: string;
  state?: string;
  runways?: { length_ft: number; surface: string; he_ident: string }[];
  frequencies?: { frequency_mhz: number; description: string; type: string }[];
  fuel?: { 
    price100ll: number; 
    priceJetA?: number;
    source: string;
    sourceUrl?: string;
    lastReported?: string;
    providerName?: string;
    providerPhone?: string;
    community100ll?: {
      price: number;
      fbo: string | null;
      date: string;
      reportedAt: string;
      daysAgo: number;
    } | null;
    communityJetA?: {
      price: number;
      fbo: string | null;
      date: string;
      reportedAt: string;
      daysAgo: number;
    } | null;
    priceDivergence?: {
      type: string;
      airnavPrice: number;
      communityPrice: number;
      difference: string;
    } | null;
  };
  landingFee?: { amount: number };
  hasTower?: boolean;
  attendance?: string;
  phone?: string;
  manager?: string;
}

interface LeafletMapProps {
  airports: Airport[];
  waypoints: Waypoint[];
  fuelPrices: Record<string, FuelPrice>;
  onBoundsChange: (bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number }) => void;
  onAirportClick: (airport: Airport) => void;
  mapCenter: [number, number];
  mapZoom: number;
  showTerrain?: boolean;
  showAirspaces?: boolean;
  showStateOverlay?: boolean;
  showNotams?: boolean;
  showTfrs?: boolean;
  showPireps?: boolean;
  onStateClick?: (stateInfo: any) => void;
  baseLayer?: 'osm' | 'satellite' | 'terrain' | 'dark';
  onViewStateInfo?: (stateCode: string) => void;
  performanceMode?: boolean;
  /** Desktop-only: route tile requests through the Tauri SQLite cache. */
  useCachedTiles?: boolean;
  maxAirportsToRender?: number;
}

// Component to handle map move events and get map reference
function MapEventHandler({ onBoundsChange, onMapReady }: { onBoundsChange: (bounds: any) => void; onMapReady?: (map: L.Map) => void }) {
  const emitBounds = useCallback((targetMap: L.Map) => {
    const b = targetMap.getBounds();
    onBoundsChange({
      minLat: b.getSouth(),
      maxLat: b.getNorth(),
      minLon: b.getWest(),
      maxLon: b.getEast(),
    });
  }, [onBoundsChange]);

  const map = useMapEvents({
    moveend: (e: any) => {
      emitBounds(e.target);
    },
    zoomend: (e: any) => {
      emitBounds(e.target);
    },
  });
  
  useEffect(() => {
    if (onMapReady) {
      onMapReady(map);
    }
    emitBounds(map);
  }, [map, onMapReady, emitBounds]);
  
  return null;
}

function getMarkerColor(type?: string) {
  switch (type) {
    case 'large_airport': return '#ef4444';
    case 'medium_airport': return '#f59e0b';
    case 'small_airport': return '#22c55e';
    default: return '#6b7280';
  }
}

// Simple state inference from coordinates
function inferStateFromCoords(lat: number, lon: number): string | null {
  if (lat >= 41.7 && lon >= -90.4 && lon <= -82.1) return 'MI';
  if (lat >= 40.5 && lon >= -79.8 && lon <= -71.8) return 'NY';
  if (lat >= 30.4 && lon >= -85.6 && lon <= -80.8) return 'GA';
  if (lat >= 35 && lon >= -90.3 && lon <= -81.6) return 'TN';
  if (lat >= 37 && lon >= -91.5 && lon <= -87) return 'IL';
  if (lat >= 38 && lon >= -88.1 && lon <= -84.8) return 'IN';
  if (lat >= 38.4 && lon >= -84.8 && lon <= -80.5) return 'OH';
  if (lat >= 29 && lon >= -95 && lon <= -81) return 'FL';
  if (lat >= 30 && lon >= -90 && lon <= -85) return 'MS';
  if (lat >= 29 && lon >= -94.1 && lon <= -88.8) return 'LA';
  if (lat >= 33 && lon >= -106.7 && lon <= -93.5) return 'TX';
  if (lat >= 31.3 && lon >= -114.7 && lon <= -109) return 'AZ';
  if (lat >= 32.5 && lon >= -124.4 && lon <= -114.6) return 'CA';
  if (lat >= 45.5 && lon >= -124.8 && lon <= -116.9) return 'WA';
  if (lat >= 42 && lon >= -124.6 && lon <= -116.5) return 'OR';
  if (lat >= 43 && lon >= -117 && lon <= -111) return 'ID';
  if (lat >= 37 && lon >= -109.1 && lon <= -102) return 'CO';
  if (lat >= 35 && lon >= -120 && lon <= -114) return 'NV';
  if (lat >= 37 && lon >= -114.1 && lon <= -109) return 'UT';
  if (lat >= 41 && lon >= -111.1 && lon <= -104.1) return 'WY';
  if (lat >= 44.4 && lon >= -116 && lon <= -104) return 'MT';
  if (lat >= 45.9 && lon >= -104.1 && lon <= -96.6) return 'ND';
  if (lat >= 42.5 && lon >= -104.1 && lon <= -96.4) return 'SD';
  if (lat >= 38 && lon >= -104.1 && lon <= -94.3) return 'NE';
  if (lat >= 37 && lon >= -102.1 && lon <= -94.6) return 'KS';
  if (lat >= 33.6 && lon >= -103 && lon <= -94.4) return 'OK';
  if (lat >= 33.8 && lon >= -84.3 && lon <= -75.4) return 'NC';
  if (lat >= 32 && lon >= -83.4 && lon <= -78.5) return 'SC';
  if (lat >= 36.5 && lon >= -83.7 && lon <= -75.2) return 'VA';
  if (lat >= 36.5 && lon >= -89.6 && lon <= -81.9) return 'KY';
  if (lat >= 37.2 && lon >= -82.6 && lon <= -77.7) return 'WV';
  if (lat >= 39.7 && lon >= -80.5 && lon <= -74.7) return 'PA';
  if (lat >= 41 && lon >= -73.7 && lon <= -71.8) return 'CT';
  if (lat >= 41.2 && lon >= -73.5 && lon <= -69.9) return 'MA';
  if (lat >= 42.7 && lon >= -72.6 && lon <= -70.7) return 'NH';
  if (lat >= 43.1 && lon >= -71.1 && lon <= -66.9) return 'ME';
  if (lat >= 42.7 && lon >= -73.5 && lon <= -71.5) return 'VT';
  if (lat >= 38.9 && lon >= -75.6 && lon <= -73.9) return 'NJ';
  if (lat >= 41.1 && lon >= -71.9 && lon <= -71.1) return 'RI';
  if (lat >= 38.5 && lon >= -75.8 && lon <= -75) return 'DE';
  if (lat >= 37.9 && lon >= -79.5 && lon <= -75) return 'MD';
  if (lat >= 38.79 && lon >= -77.119 && lon <= -76.909) return 'DC';
  if (lat >= 30.2 && lon >= -88.5 && lon <= -84.9) return 'AL';
  if (lat >= 33 && lon >= -94.6 && lon <= -89.6) return 'AR';
  if (lat >= 40.4 && lon >= -96.6 && lon <= -90.1) return 'IA';
  if (lat >= 36 && lon >= -95.8 && lon <= -89.1) return 'MO';
  if (lat >= 31.3 && lon >= -109.1 && lon <= -103) return 'NM';
  if (lat >= 42.5 && lon >= -92.9 && lon <= -86.8) return 'WI';
  if (lat >= 43.5 && lon >= -97.2 && lon <= -89.5) return 'MN';
  if (lat >= 51.8 && lon >= -180 && lon <= -130) return 'AK';
  if (lat >= 18.9 && lon >= -160.2 && lon <= -154.7) return 'HI';
  return null;
}

const AirportPopup = React.memo(function AirportPopup({ airport, onAddToRoute, onViewStateInfo }: { airport: Airport; onAddToRoute: () => void; onViewStateInfo?: (stateCode: string) => void }) {
  const [details, setDetails] = useState<AirportDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Expose refresh function globally
  useEffect(() => {
    (window as any).refreshAirportDetails = (icao: string) => {
      if (icao === airport.icao) {
        setRefreshKey(k => k + 1);
      }
    };
  }, [airport.icao]);

  useEffect(() => {
    async function fetchDetails() {
      try {
        const res = await fetch(`/api/airports/${airport.icao}`);
        if (res.ok) {
          const data = await res.json();
          setDetails(data);
        }
      } catch (e) {
        console.error('Error fetching airport details:', e);
      }
      setLoading(false);
    }
    fetchDetails();
  }, [airport.icao, refreshKey]);

  const handleViewStateInfo = () => {
    if (onViewStateInfo) {
      const stateCode = details?.state || inferStateFromCoords(airport.latitude, airport.longitude);
      if (stateCode) {
        onViewStateInfo(stateCode);
      }
    }
  };

  return (
    <div className="min-w-[150px] max-w-[180px] text-slate-900 relative">
      {/* Close button */}
      <button
        onClick={(e) => { e.stopPropagation(); }}
        className="absolute -top-1 -right-1 w-5 h-5 bg-slate-200 hover:bg-slate-300 rounded-full text-xs flex items-center justify-center"
        title="Close"
      >
        ×
      </button>
      <strong className="text-lg">{airport.icao}</strong>
      {airport.iata && <span className="ml-2 text-slate-500">({airport.iata})</span>}
      <div className="font-medium">{airport.name}</div>
      {details?.city && (
        <div className="text-sm text-slate-600">
          {details.city}{details.state && `, ${details.state}`}
        </div>
      )}
      
      {details && (
        <>
          {details.elevation_ft && (
            <div className="text-sm mt-2">
              <span className="font-medium">Elevation:</span> {details.elevation_ft} ft
            </div>
          )}
          
          {details.runways && details.runways.length > 0 && (
            <div className="text-sm mt-1">
              <span className="font-medium">Runways:</span>{' '}
              {details.runways.slice(0, 2).map((r, i) => (
                <span key={i} className="mr-2">
                  {r.he_ident} ({r.length_ft?.toLocaleString()}ft {r.surface})
                </span>
              ))}
            </div>
          )}
          
          {details.frequencies && details.frequencies.length > 0 && (
            <div className="text-sm mt-2">
              <span className="font-medium">Freqs:</span>
              <div className="max-h-20 overflow-y-auto mt-1">
                {details.frequencies.slice(0, 5).map((f, i) => (
                  <div key={i} className="text-xs">
                    {f.frequency_mhz.toFixed(3)} {f.type} - {f.description}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {details.fuel && (
            <div className="mt-2">
              <div className="text-emerald-600 font-medium">
                100LL: ${details.fuel.price100ll.toFixed(2)}/gal
                {details.fuel.priceJetA && (
                  <span className="ml-2">JetA: ${details.fuel.priceJetA.toFixed(2)}/gal</span>
                )}
              </div>
              
              {/* Community-reported price (shown alongside AirNav if available) */}
              {(details.fuel.community100ll || details.fuel.communityJetA) && (
                <div className="mt-1 space-y-1">
                  {details.fuel.community100ll && (
                    <div className={`text-sm ${details.fuel.community100ll.daysAgo <= 30 ? 'text-green-600 font-medium' : 'text-slate-500'}`}>
                      <span className="text-green-600">●</span> ${details.fuel.community100ll.price.toFixed(2)}/gal community
                      <span className="text-xs text-slate-400 ml-1">· {details.fuel.community100ll.daysAgo === 0 ? 'today' : `${details.fuel.community100ll.daysAgo}d ago`}</span>
                      {details.fuel.community100ll.fbo && (
                        <span className="text-xs text-slate-400"> @ {details.fuel.community100ll.fbo}</span>
                      )}
                    </div>
                  )}
                  {details.fuel.communityJetA && (
                    <div className={`text-sm ${details.fuel.communityJetA.daysAgo <= 30 ? 'text-green-600 font-medium' : 'text-slate-500'}`}>
                      <span className="text-green-600">●</span> ${details.fuel.communityJetA.price.toFixed(2)}/gal JetA community
                      <span className="text-xs text-slate-400 ml-1">· {details.fuel.communityJetA.daysAgo === 0 ? 'today' : `${details.fuel.communityJetA.daysAgo}d ago`}</span>
                    </div>
                  )}
                </div>
              )}
              
              {/* Price divergence warning */}
              {details.fuel.priceDivergence && (
                <div className="mt-1 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
                  ⚠️ Community price is {details.fuel.priceDivergence.difference}
                </div>
              )}
              
              {details.fuel.lastReported && (
                <div className="text-xs text-slate-400">
                  AirNav: {details.fuel.lastReported}
                </div>
              )}
              {/* AirNav Attribution */}
              {details.fuel.source === 'airnav' && (
                <a 
                  href={details.fuel.sourceUrl || 'https://www.airnav.com'} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-xs text-slate-500 hover:text-sky-500 block mt-1"
                >
                  Source: AirNav.com
                </a>
              )}
              {/* Tower & Landing Fee - Important Info */}
              {(details.hasTower !== undefined || details.landingFee) && (
                <div className="mt-2 flex gap-2 flex-wrap">
                  {details.hasTower !== undefined && (
                    <span className={`text-xs px-2 py-1 rounded ${details.hasTower ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                      {details.hasTower ? '✓ Tower' : '✗ No Tower'}
                    </span>
                  )}
                  {details.landingFee && (
                    <span className="text-xs px-2 py-1 rounded bg-amber-500/20 text-amber-400">
                      Landing: ${details.landingFee.amount}
                    </span>
                  )}
                </div>
              )}
              {/* More Details Dropdown */}
              <details className="mt-2">
                <summary className="text-xs text-slate-500 cursor-pointer hover:text-sky-400">
                  More details
                </summary>
                <div className="mt-2 space-y-1 text-xs bg-slate-100 p-2 rounded">
                  {details.manager && (
                    <div><span className="font-medium">Manager:</span> {details.manager}</div>
                  )}
                  {/* Manager/Airport Phone */}
                  {details.phone && (
                    <div>
                      <span className="font-medium">Airport Phone:</span>{' '}
                      <a href={`tel:${details.phone}`} className="text-sky-600 hover:underline">{details.phone}</a>
                    </div>
                  )}
                  {/* Fuel Provider Info */}
                  {details.fuel?.providerName && (
                    <div>
                      <span className="font-medium">Fuel Provider:</span> {details.fuel.providerName}
                      {details.fuel.providerPhone && (
                        <span className="ml-1">
                          (<a href={`tel:${details.fuel.providerPhone}`} className="text-sky-600 hover:underline">{details.fuel.providerPhone}</a>)
                        </span>
                      )}
                    </div>
                  )}
                  {details.attendance && (
                    <div><span className="font-medium">Attendance:</span> {details.attendance}</div>
                  )}
                  <a 
                    href={`https://www.airnav.com/airport/${airport.icao}`}
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sky-500 hover:underline block mt-2"
                  >
                    View full details on AirNav →
                  </a>
                </div>
              </details>
              {/* Submit price button */}
              <details className="mt-2">
                <summary className="text-xs text-sky-500 cursor-pointer hover:text-sky-400">
                  Paid a different price? Submit it
                </summary>
                <form 
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.target as HTMLFormElement;
                    const price = parseFloat((form.elements.namedItem('price') as HTMLInputElement).value);
                    const fuelType = (form.elements.namedItem('fuelType') as HTMLSelectElement).value;
                    const fbo = (form.elements.namedItem('fbo') as HTMLInputElement).value;
                    const purchaseDate = (form.elements.namedItem('purchaseDate') as HTMLInputElement).value;
                    
                    if (price > 0 && purchaseDate) {
                      try {
                        const res = await fetch('/api/fuel-prices/community', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            icao: details.icao,
                            price,
                            fuelType,
                            fbo: fbo || null,
                            purchaseDate
                          })
                        });
                        if (res.ok) {
                          alert('Thanks! Price submitted. Other pilots will see your community price.');
                          // Refresh the airport details
                          (window as any).refreshAirportDetails?.(details.icao);
                        } else {
                          const err = await res.json();
                          alert(err.error || 'Failed to submit price');
                        }
                      } catch (err) {
                        console.error('Error submitting price:', err);
                        alert('Failed to submit price. Please try again.');
                      }
                    }
                  }}
                  className="mt-2 p-2 bg-slate-700 rounded"
                >
                  <div className="text-xs mb-2 text-slate-300">Submit your actual price (per gallon)</div>
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <select 
                        name="fuelType" 
                        className="bg-slate-600 text-white text-xs px-2 py-1 rounded"
                      >
                        <option value="100LL">100LL</option>
                        <option value="JetA">Jet A</option>
                      </select>
                      <input 
                        type="number" 
                        name="price" 
                        step="0.01" 
                        min="0" 
                        max="20"
                        placeholder="$0.00"
                        className="bg-slate-600 text-white text-xs px-2 py-1 rounded w-20"
                        required
                      />
                    </div>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        name="fbo" 
                        placeholder="FBO name (optional)"
                        className="bg-slate-600 text-white text-xs px-2 py-1 rounded flex-1"
                      />
                      <input 
                        type="date" 
                        name="purchaseDate" 
                        max={new Date().toISOString().split('T')[0]}
                        className="bg-slate-600 text-white text-xs px-2 py-1 rounded w-28"
                        required
                      />
                    </div>
                    <button 
                      type="submit"
                      className="w-full bg-sky-500 hover:bg-sky-600 text-white text-xs px-2 py-2 rounded"
                    >
                      Submit Price
                    </button>
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    Help other pilots know real prices!
                  </div>
                </form>
              </details>
            </div>
          )}
          
          {details.landingFee && (
            <div className="text-sm text-amber-600">
              Landing: ${details.landingFee.amount.toFixed(2)}
            </div>
          )}
        </>
      )}
      
      {loading && <div className="text-sm text-slate-400 mt-2">Loading details...</div>}
      
      <button
        onClick={onAddToRoute}
        className="mt-3 w-full bg-sky-500 hover:bg-sky-600 text-white px-3 py-2 rounded text-sm font-medium"
      >
        Add to Route
      </button>
      
      {/* View State Info button - only show if handler provided */}
      {onViewStateInfo && (
        <button
          onClick={() => {
            // Use state from details or infer from coordinates
            let stateCode: string | undefined = details?.state;
            if (!stateCode) {
              stateCode = inferStateFromCoords(airport.latitude, airport.longitude) ?? undefined;
            }
            if (stateCode) {
              onViewStateInfo(stateCode);
            }
          }}
          className="mt-2 w-full bg-purple-500 hover:bg-purple-600 text-white px-3 py-2 rounded text-sm font-medium"
        >
          View State Info
        </button>
      )}
    </div>
  );
});

export default function LeafletMap({ 
  airports, 
  waypoints, 
  fuelPrices, 
  onBoundsChange, 
  onAirportClick, 
  mapCenter, 
  mapZoom,
  showTerrain = false,
  showAirspaces = false,
  showStateOverlay = false,
  showNotams = false,
  showTfrs = false,
  showPireps = false,
  onStateClick,
baseLayer = 'osm',
  onViewStateInfo,
  performanceMode = false,
  useCachedTiles = false,
  maxAirportsToRender = 2000,
}: LeafletMapProps) {
  const [terrainLayer, setTerrainLayer] = useState<L.TileLayer | null>(null);
  const [tfrs, setTfrs] = useState<any[]>([]);
  const [pireps, setPireps] = useState<any[]>([]);
  const [notams, setNotams] = useState<any[]>([]);
  const mapRef = useRef<L.Map | null>(null);
  const [currentZoom, setCurrentZoom] = useState(mapZoom);
  const boundsRef = useRef<{ minLat: number; maxLat: number; minLon: number; maxLon: number } | null>(null);
  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isFetchingRef = useRef(false);
  const lastFailedRef = useRef<{ tfrs?: number; pireps?: number }>({});
  
  // Base layer URLs
  const baseLayers = {
    osm: { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; OpenStreetMap' },
    satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: '&copy; Esri' },
    terrain: { url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', attribution: '&copy; OpenTopoMap' },
    dark: { url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attribution: '&copy; CartoDB' }
  };
  
  // Pre-compute stable pathOptions per airport type to avoid new objects on every render
  const markerPathOptions = useMemo(() => ({
    large_airport: { color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.7, weight: 1 },
    medium_airport: { color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.7, weight: 1 },
    small_airport: { color: '#22c55e', fillColor: '#22c55e', fillOpacity: 0.7, weight: 1 },
    default: { color: '#6b7280', fillColor: '#6b7280', fillOpacity: 0.7, weight: 1 },
  }), []);

  // Stable onMapReady callback
  const handleMapReady = useCallback((map: L.Map) => {
    mapRef.current = map;
  }, []);
  const filteredAirports = useMemo(() => {
    const filtered = airports.filter(a => a.type !== 'seaplane_base');
    return filtered.length > maxAirportsToRender ? filtered.slice(0, maxAirportsToRender) : filtered;
  }, [airports, maxAirportsToRender]);
  
  // Calculate marker size based on zoom - smaller airports stay small when zoomed out
  const getMarkerRadius = (type?: string) => {
    const zoomScale = Math.max(1, (currentZoom - 4) * 0.5);
    if (type === 'large_airport') {
      return 6 + zoomScale;
    } else if (type === 'medium_airport') {
      // Medium airports: smaller when zoomed out, larger when zoomed in
      return currentZoom < 7 ? 3 : 3 + (zoomScale * 0.7);
    } else {
      // Small airports: stay small when zoomed out, only grow when very zoomed in
      return currentZoom < 8 ? 1.5 : 1.5 + ((currentZoom - 7) * 0.8);
    }
  };
  
  // Update zoom level and respond to center/zoom changes from parent
  useEffect(() => {
    if (!mapRef.current) return;
    
    const handleZoom = () => setCurrentZoom(mapRef.current!.getZoom());
    mapRef.current.on('zoomend', handleZoom);
    
    // Watch for center/zoom prop changes and update map view
    const handleMoveEnd = () => {
      const map = mapRef.current;
      if (!map) return;
      const newCenter = map.getCenter();
      const newZoom = map.getZoom();
      // Only update if significantly different to avoid loops
      if (Math.abs(newCenter.lat - mapCenter[0]) > 0.001 || 
          Math.abs(newCenter.lng - mapCenter[1]) > 0.001 ||
          newZoom !== mapZoom) {
        map.setView(mapCenter as [number, number], mapZoom, { animate: true });
      }
    };
    
    // Apply the center/zoom from props
    mapRef.current.setView(mapCenter as [number, number], mapZoom, { animate: true });
    
    return () => {
      mapRef.current?.off('zoomend', handleZoom);
    };
  }, [mapCenter, mapZoom]);
  
  // Toggle terrain layer based on setting
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Import Leaflet dynamically
    import('leaflet').then((L) => {
      if (showTerrain && !terrainLayer) {
        // Add OpenTopoMap terrain layer
        const terrain = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
          attribution: 'Map data: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
          maxZoom: 17,
        });
        terrain.addTo(mapRef.current!);
        setTerrainLayer(terrain);
      } else if (!showTerrain && terrainLayer) {
        // Remove terrain layer
        terrainLayer.remove();
        setTerrainLayer(null);
      }
    });
  }, [showTerrain, terrainLayer]);
  
  // Track bounds changes and update ref
  const handleBoundsChange = useCallback((bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number }) => {
    boundsRef.current = bounds;
    onBoundsChange(bounds);
    
    // Debounce TFR/PIREP fetches - wait 500ms after map stops moving
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }
    
    fetchTimeoutRef.current = setTimeout(() => {
      // Don't fetch if already fetching or recently failed
      if (isFetchingRef.current) return;
      const now = Date.now();
      if (lastFailedRef.current.tfrs && now - lastFailedRef.current.tfrs < 30000) return;
      if (lastFailedRef.current.pireps && now - lastFailedRef.current.pireps < 30000) return;
      
      if (showTfrs && boundsRef.current && !lastFailedRef.current.tfrs) {
        isFetchingRef.current = true;
        const boundsParam = `${bounds.minLat},${bounds.maxLat},${bounds.minLon},${bounds.maxLon}`;
        fetch(`/api/tfrs?bounds=${boundsParam}`)
          .then(res => {
            if (!res.ok) throw new Error('API unavailable');
            return res.json();
          })
          .then(data => setTfrs(data.tfrs || []))
          .catch(() => { lastFailedRef.current.tfrs = Date.now(); })
          .finally(() => { isFetchingRef.current = false; });
      }
      if (showPireps && boundsRef.current && !lastFailedRef.current.pireps) {
        isFetchingRef.current = true;
        const boundsParam = `${bounds.minLat},${bounds.maxLat},${bounds.minLon},${bounds.maxLon}`;
        fetch(`/api/pireps?bounds=${boundsParam}`)
          .then(res => {
            if (!res.ok) throw new Error('API unavailable');
            return res.json();
          })
          .then(data => setPireps(data.pireps || []))
          .catch(() => { lastFailedRef.current.pireps = Date.now(); })
          .finally(() => { isFetchingRef.current = false; });
      }
    }, 500);
  }, [onBoundsChange, showTfrs, showPireps]);

  // Initial fetch when toggled ON
  useEffect(() => {
    if (!showTfrs) return;
    if (!boundsRef.current) return;
    
    const bounds = boundsRef.current;
    const boundsParam = `${bounds.minLat},${bounds.maxLat},${bounds.minLon},${bounds.maxLon}`;
    
    fetch(`/api/tfrs?bounds=${boundsParam}`)
      .then(res => res.json())
      .then(data => setTfrs(data.tfrs || []))
      .catch(console.error);
  }, [showTfrs]);

  // Initial fetch when toggled ON  
  useEffect(() => {
    if (!showPireps) return;
    if (!boundsRef.current) return;
    
    const bounds = boundsRef.current;
    const boundsParam = `${bounds.minLat},${bounds.maxLat},${bounds.minLon},${bounds.maxLon}`;
    
    fetch(`/api/pireps?bounds=${boundsParam}`)
      .then(res => res.json())
      .then(data => setPireps(data.pireps || []))
      .catch(console.error);
  }, [showPireps]);
 
  return (
    <MapContainer
      center={mapCenter}
      zoom={mapZoom}
      style={{ height: '100%', width: '100%', zIndex: 0 }}
    >
<TileLayer
        key={baseLayer}
        attribution={baseLayers[baseLayer].attribution}
        url={baseLayers[baseLayer].url}
      />
      
      <MapEventHandler onBoundsChange={handleBoundsChange} onMapReady={handleMapReady} />
      
      {/* Airport markers - filtered and zoom-based sizing */}
      {filteredAirports.map(airport => (
        <CircleMarker
          key={airport.icao}
          center={[airport.latitude, airport.longitude]}
          radius={getMarkerRadius(airport.type)}
          pathOptions={markerPathOptions[airport.type as keyof typeof markerPathOptions] || markerPathOptions.default}
          eventHandlers={{
            click: () => {
              if (mapRef.current) {
                mapRef.current.flyTo([airport.latitude, airport.longitude], Math.max(mapRef.current.getZoom(), 8), {
                  animate: true,
                })
              }
            },
          }}
        >
          <Popup>
            <AirportPopup airport={airport} onAddToRoute={() => onAirportClick(airport)} onViewStateInfo={onViewStateInfo} />
          </Popup>
        </CircleMarker>
      ))}
      
      {/* Route line */}
      {waypoints.length > 1 && (
        <Polyline
          positions={waypoints.map(w => [w.latitude, w.longitude])}
          pathOptions={{ color: '#38bdf8', weight: 3, dashArray: '10, 5' }}
        />
      )}
      
      {/* TFR markers */}
      {showTfrs && tfrs.map(tfr => (
        <CircleMarker
          key={tfr.id}
          center={[tfr.latitude, tfr.longitude]}
          radius={8}
          pathOptions={{
            color: '#ef4444',
            fillColor: '#ef4444',
            fillOpacity: 0.4,
            weight: 2,
            dashArray: '5, 5'
          }}
        >
          <Popup>
            <div className="text-slate-900 min-w-[150px]">
              <strong className="text-red-600">🔴 TFR</strong>
              <div className="font-medium">{tfr.title}</div>
              <div className="text-sm">{tfr.description}</div>
              <div className="text-xs text-slate-500 mt-1">
                {tfr.type} - {tfr.facility}
              </div>
              <div className="text-xs text-slate-500">
                Alt: {tfr.lowerAltitude} to {tfr.upperAltitude}
              </div>
              <div className="text-xs text-slate-500">
                Radius: {tfr.radius} NM
              </div>
            </div>
          </Popup>
        </CircleMarker>
      ))}
      
      {/* PIREP markers */}
      {showPireps && pireps.map(pirep => (
        <CircleMarker
          key={pirep.id}
          center={[pirep.latitude, pirep.longitude]}
          radius={6}
          pathOptions={{
            color: pirep.turbulence !== 'NIL' ? '#f59e0b' : pirep.icing !== 'NIL' ? '#8b5cf6' : '#22c55e',
            fillColor: pirep.turbulence !== 'NIL' ? '#f59e0b' : pirep.icing !== 'NIL' ? '#8b5cf6' : '#22c55e',
            fillOpacity: 0.7,
            weight: 2
          }}
        >
          <Popup>
            <div className="text-slate-900 min-w-[150px]">
              <strong className="text-purple-600">🛩️ PIREP</strong>
              <div className="text-sm font-medium">{pirep.aircraft} FL{pirep.flightLevel}</div>
              {pirep.turbulence !== 'NIL' && (
                <div className="text-amber-600">Turbulence: {pirep.turbulence}</div>
              )}
              {pirep.icing !== 'NIL' && (
                <div className="text-purple-600">Icing: {pirep.icing}</div>
              )}
              <div className="text-xs text-slate-500 mt-1">
                {pirep.windDirection}° @ {pirep.windSpeed} kts
              </div>
              <div className="text-xs text-slate-500">
                Temp: {pirep.temperature}°C
              </div>
            </div>
          </Popup>
        </CircleMarker>
      ))}
      
      {/* Waypoint markers */}
      {waypoints.map((wp, i) => (
        <CircleMarker
          key={wp.id}
          center={[wp.latitude, wp.longitude]}
          radius={8}
          pathOptions={{
            color: i === 0 ? '#22c55e' : i === waypoints.length - 1 ? '#ef4444' : '#f59e0b',
            fillColor: i === 0 ? '#22c55e' : i === waypoints.length - 1 ? '#ef4444' : '#f59e0b',
            fillOpacity: 1,
            weight: 2
          }}
        >
          <Popup>
            <div className="text-slate-900">
              <strong>{wp.icao}</strong>
              <br />
              {wp.name}
              <br />
              <span className="text-sm">Position: {i + 1} of {waypoints.length}</span>
              <br />
              {fuelPrices[wp.icao] && (
                <span className="text-emerald-600 font-medium">
                  ${fuelPrices[wp.icao].price100ll}/gal
                </span>
              )}
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
