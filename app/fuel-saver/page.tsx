'use client';

import { useState, useMemo, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';

// Dynamic imports for Leaflet components (no SSR)
const LeafletMap = dynamic(() => import('./LeafletMap'), { ssr: false });
const StateInfoPanel = dynamic(() => import('./StateInfoPanel'), { ssr: false });
const NotamsPanel = dynamic(() => import('./components/NOTAMsPanel'), { ssr: false });
const ExportDropdown = dynamic(() => import('./components/ExportDropdown'), { ssr: false });
const TripFinder = dynamic(() => import('./components/TripFinder'), { ssr: false });
import { DEFAULT_MAP_OPTIONS, type MapLayerOptions } from './map-options';
const MapControls = dynamic(() => import('./MapControls').then((m) => m.MapControls), { ssr: false });
import FlightPlayback from './FlightPlayback';
import PostFlightReview from './PostFlightReview';
import RangeRingCalculator from './RangeRing';
import PerformanceSettingsPanel, { PerformanceSettings, DEFAULT_SETTINGS } from './PerformanceSettings';
import AuthModal from './AuthModal';
import UpgradeModal from './UpgradeModal';
import TierExplainerModal from './TierExplainerModal';
import VerificationBanner from '../components/VerificationBanner';

// Types
export interface Airport {
  icao: string;
  iata?: string;
  name: string;
  city?: string;
  country?: string;
  latitude: number;
  longitude: number;
  type?: string;
  elevation_ft?: number;
}

interface Waypoint {
  id: string;
  icao: string;
  name: string;
  city?: string;
  state?: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  sequence: number;
  type?: string;
}

interface FuelPrice {
  icao: string;
  price100ll: number | null;
  priceJetA: number | null;
  lastUpdated: string;
  source?: string;
  sourceUrl?: string;
  lastReported?: string;
}

// Inner component that uses useSearchParams
// function FuelSaverContent() {
// 
// Demo airports (fallback)
const DEMO_AIRPORTS: Airport[] = [
  { icao: 'KORD', iata: 'ORD', name: "Chicago O'Hare International", city: 'Chicago', latitude: 41.9742, longitude: -87.9073, type: 'large_airport' },
  { icao: 'KLAX', iata: 'LAX', name: 'Los Angeles International', city: 'Los Angeles', latitude: 33.9425, longitude: -118.4081, type: 'large_airport' },
  { icao: 'KJFK', iata: 'JFK', name: 'John F. Kennedy International', city: 'New York', latitude: 40.6413, longitude: -73.7781, type: 'large_airport' },
  { icao: 'KATL', iata: 'ATL', name: 'Hartsfield-Jackson Atlanta', city: 'Atlanta', latitude: 33.6407, longitude: -84.4277, type: 'large_airport' },
  { icao: 'KDEN', iata: 'DEN', name: 'Denver International', city: 'Denver', latitude: 39.8561, longitude: -104.6737, type: 'large_airport' },
  { icao: 'KSFO', iata: 'SFO', name: 'San Francisco International', city: 'San Francisco', latitude: 37.6213, longitude: -122.379, type: 'large_airport' },
  { icao: 'KLAS', iata: 'LAS', name: 'Harry Reid International', city: 'Las Vegas', latitude: 36.084, longitude: -115.1537, type: 'large_airport' },
  { icao: 'KSEA', iata: 'SEA', name: 'Seattle-Tacoma International', city: 'Seattle', latitude: 47.4502, longitude: -122.3088, type: 'large_airport' },
  { icao: 'KMIA', iata: 'MIA', name: 'Miami International', city: 'Miami', latitude: 25.7959, longitude: -80.287, type: 'large_airport' },
  { icao: 'KDFW', iata: 'DFW', name: 'Dallas/Fort Worth International', city: 'Dallas', latitude: 32.8998, longitude: -97.0403, type: 'large_airport' },
  { icao: 'KPHX', iata: 'PHX', name: 'Phoenix Sky Harbor', city: 'Phoenix', latitude: 33.4352, longitude: -112.0101, type: 'large_airport' },
  { icao: 'KIAH', iata: 'IAH', name: 'George Bush Intercontinental', city: 'Houston', latitude: 29.9902, longitude: -95.3368, type: 'large_airport' },
  { icao: 'KBOS', iata: 'BOS', name: 'Boston Logan International', city: 'Boston', latitude: 42.3656, longitude: -71.0096, type: 'large_airport' },
  { icao: 'KMSP', iata: 'MSP', name: 'Minneapolis-St Paul International', city: 'Minneapolis', latitude: 44.882, longitude: -93.2218, type: 'large_airport' },
  { icao: 'KCLT', iata: 'CLT', name: 'Charlotte Douglas International', city: 'Charlotte', latitude: 35.2144, longitude: -80.9473, type: 'large_airport' },
  { icao: 'KSTL', iata: 'STL', name: 'St. Louis Lambert International', city: 'St. Louis', latitude: 38.7499, longitude: -90.3742, type: 'large_airport' },
  { icao: 'KPDX', iata: 'PDX', name: 'Portland International', city: 'Portland', latitude: 45.5898, longitude: -122.5951, type: 'large_airport' },
  { icao: 'KRDU', iata: 'RDU', name: 'Raleigh-Durham International', city: 'Raleigh', latitude: 35.8801, longitude: -78.788, type: 'large_airport' },
  { icao: 'KSMF', iata: 'SMF', name: 'Sacramento International', city: 'Sacramento', latitude: 38.6954, longitude: -121.5908, type: 'medium_airport' },
  { icao: 'KVNY', iata: 'VNY', name: 'Van Nuys Airport', city: 'Van Nuys', latitude: 34.2098, longitude: -118.4895, type: 'medium_airport' },
];

// Demo fuel prices
const DEMO_FUEL_PRICES: FuelPrice[] = [
  { icao: 'KORD', price100ll: 9.58, priceJetA: 9.58, lastUpdated: '2026-02-15' },
  { icao: 'KLAX', price100ll: 10.65, priceJetA: 10.65, lastUpdated: '2026-02-15' },
  { icao: 'KVNY', price100ll: 8.32, priceJetA: 8.32, lastUpdated: '2026-02-15' },
  { icao: 'KPDK', price100ll: 8.67, priceJetA: 8.67, lastUpdated: '2026-02-15' },
];

// Calculate distance (NM)
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3440.065;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Persistent cache with localStorage
const CACHE_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days

function getCachedData<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const cached = localStorage.getItem(key);
    if (!cached) return null;
    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp > CACHE_EXPIRY) {
      localStorage.removeItem(key);
      return null;
    }
    return data as T;
  } catch { return null; }
}

function setCachedData<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
  } catch { /* ignore */ }
}

// Fuel price cache (in-memory + localStorage)
const fuelPriceCache: Record<string, FuelPrice> = {};

async function getFuelPrice(icao: string): Promise<FuelPrice | undefined> {
  if (fuelPriceCache[icao]) return fuelPriceCache[icao];
  
  // Check localStorage cache first
  const cachedPrices = getCachedData<Record<string, FuelPrice>>('fuelPricesCache');
  if (cachedPrices?.[icao]) {
    fuelPriceCache[icao] = cachedPrices[icao];
    return cachedPrices[icao];
  }
  
  // Check demo prices
  const demo = DEMO_FUEL_PRICES.find(f => f.icao === icao);
  if (demo) {
    fuelPriceCache[icao] = demo;
    return demo;
  }
  
  // Try API
  try {
    const res = await fetch(`/api/fuel-price?icao=${icao.toUpperCase()}`);
    if (res.ok) {
      const data = await res.json();
      // Fallback to old format
      if (typeof data?.price100ll === 'number' || typeof data?.priceJetA === 'number') {
        const fp: FuelPrice = {
          icao: data.icao,
          price100ll: data.price100ll ?? null,
          priceJetA: data.priceJetA ?? null,
          lastUpdated: data.updatedAt || data.lastReported || '',
          source: data.source,
          sourceUrl: data.sourceUrl,
          lastReported: data.lastReported
        };
        fuelPriceCache[icao] = fp;
        return fp;
      }
    }
  } catch (e) { console.error('Error fetching fuel:', e); }
  
  return undefined;
}

// Aircraft profiles with W&B data (arms in inches, weights in lbs)
const AIRCRAFT_PROFILES = [
  // Cessna
  { 
    name: 'Cessna 172S (2022)', manufacturer: 'Cessna', year: 2022, 
    fuelCapacity: 56, burnRate: 9.9, speed: 122, type: '100LL',
    emptyWeight: 1689, emptyCG: 39.1, maxWeight: 2550,
    arms: { frontSeats: 37.0, rearSeats: 73.0, baggage1: 95.0, baggage2: 123.0, fuel: 48.0 },
    cgLimits: { forward: 35.0, aft: 47.3 }
  },
  { 
    name: 'Cessna 182T (2020)', manufacturer: 'Cessna', year: 2020, 
    fuelCapacity: 92, burnRate: 12.5, speed: 140, type: '100LL',
    emptyWeight: 1710, emptyCG: 39.0, maxWeight: 3100,
    arms: { frontSeats: 37.0, rearSeats: 73.0, baggage1: 95.0, baggage2: 123.0, fuel: 48.0 },
    cgLimits: { forward: 35.0, aft: 47.3 }
  },
  { 
    name: 'Cessna 208 Caravan (2020)', manufacturer: 'Cessna', year: 2020, 
    fuelCapacity: 335, burnRate: 55, speed: 180, type: 'JET-A',
    emptyWeight: 4520, emptyCG: 90.0, maxWeight: 8800,
    arms: { frontSeats: 82.0, rearSeats: 118.0, baggage1: 150.0, fuel: 95.0 },
    cgLimits: { forward: 75.0, aft: 120.0 }
  },
  // Piper
  { 
    name: 'Piper Cherokee Six (2015)', manufacturer: 'Piper', year: 2015, 
    fuelCapacity: 84, burnRate: 11, speed: 130, type: '100LL',
    emptyWeight: 1520, emptyCG: 35.5, maxWeight: 2800,
    arms: { frontSeats: 32.5, rearSeats: 75.0, baggage1: 95.0, baggage2: 123.0, fuel: 47.0 },
    cgLimits: { forward: 31.0, aft: 47.3 }
  },
  { 
    name: 'Piper Cherokee Six (2020)', manufacturer: 'Piper', year: 2020, 
    fuelCapacity: 84, burnRate: 10.5, speed: 132, type: '100LL',
    emptyWeight: 1530, emptyCG: 35.5, maxWeight: 2800,
    arms: { frontSeats: 32.5, rearSeats: 75.0, baggage1: 95.0, baggage2: 123.0, fuel: 47.0 },
    cgLimits: { forward: 31.0, aft: 47.3 }
  },
  { 
    name: 'Piper Meridian (2021)', manufacturer: 'Piper', year: 2021, 
    fuelCapacity: 242, burnRate: 40, speed: 240, type: 'JET-A',
    emptyWeight: 3200, emptyCG: 85.0, maxWeight: 5200,
    arms: { frontSeats: 80.5, rearSeats: 118.0, baggage1: 150.0, fuel: 95.0 },
    cgLimits: { forward: 75.0, aft: 93.0 }
  },
  // Beechcraft
  { 
    name: 'Beechcraft Bonanza A36 (2018)', manufacturer: 'Beechcraft', year: 2018, 
    fuelCapacity: 102, burnRate: 14, speed: 155, type: '100LL',
    emptyWeight: 2550, emptyCG: 82.0, maxWeight: 3600,
    arms: { frontSeats: 82.5, rearSeats: 95.0, baggage1: 122.0, fuel: 95.0 },
    cgLimits: { forward: 77.0, aft: 93.0 }
  },
  { 
    name: 'Beechcraft Bonanza A36 (2024)', manufacturer: 'Beechcraft', year: 2024, 
    fuelCapacity: 102, burnRate: 13.5, speed: 158, type: '100LL',
    emptyWeight: 2560, emptyCG: 82.0, maxWeight: 3600,
    arms: { frontSeats: 82.5, rearSeats: 95.0, baggage1: 122.0, fuel: 95.0 },
    cgLimits: { forward: 77.0, aft: 93.0 }
  },
  // Diamond
  { 
    name: 'Diamond DA40 (2020)', manufacturer: 'Diamond', year: 2020, 
    fuelCapacity: 58, burnRate: 9, speed: 140, type: '100LL',
    emptyWeight: 1650, emptyCG: 93.0, maxWeight: 2700,
    arms: { frontSeats: 85.0, rearSeats: 85.0, baggage1: 90.0, fuel: 90.0 },
    cgLimits: { forward: 82.0, aft: 96.0 }
  },
  { 
    name: 'Diamond DA40 (2024)', manufacturer: 'Diamond', year: 2024, 
    fuelCapacity: 58, burnRate: 8.8, speed: 142, type: '100LL',
    emptyWeight: 1660, emptyCG: 93.0, maxWeight: 2700,
    arms: { frontSeats: 85.0, rearSeats: 85.0, baggage1: 90.0, fuel: 90.0 },
    cgLimits: { forward: 82.0, aft: 96.0 }
  },
  // Cirrus
  { 
    name: 'Cirrus SR22 (2019)', manufacturer: 'Cirrus', year: 2019, 
    fuelCapacity: 92, burnRate: 13, speed: 155, type: '100LL',
    emptyWeight: 3400, emptyCG: 35.0, maxWeight: 3600,
    arms: { frontSeats: 35.0, rearSeats: 66.0, baggage1: 86.0, baggage2: 86.0, fuel: 48.0 },
    cgLimits: { forward: 33.0, aft: 47.3 }
  },
  { 
    name: 'Cirrus SR22 (2024)', manufacturer: 'Cirrus', year: 2024, 
    fuelCapacity: 92, burnRate: 12.5, speed: 158, type: '100LL',
    emptyWeight: 3410, emptyCG: 35.0, maxWeight: 3600,
    arms: { frontSeats: 35.0, rearSeats: 66.0, baggage1: 86.0, baggage2: 86.0, fuel: 48.0 },
    cgLimits: { forward: 33.0, aft: 47.3 }
  },
];

function FuelSaverContent() {
  // Core state
  const [mapLoaded, setMapLoaded] = useState(true);
  const [airports, setAirports] = useState<Airport[]>([]);
  const [loadingAirports, setLoadingAirports] = useState(false);
  const [mapBounds, setMapBounds] = useState({ minLat: 25, maxLat: 50, minLon: -130, maxLon: -65 });
  const [showAllAirports, setShowAllAirports] = useState(false);
  const [showInternational, setShowInternational] = useState(false); // Show Canada/Mexico airports
  const [mapCenter, setMapCenter] = useState<[number, number]>([39.8283, -98.5795]);
  const [mapZoom, setMapZoom] = useState(5);
  
  // Geographic bounds for USA/Canada/Mexico (default restricted area)
  const NORTH_AMERICA_BOUNDS = {
    minLat: 15, maxLat: 72,  // Mexico to northern Canada
    minLon: -180, maxLon: -50 // Include Alaska
  };
  
  // Check if airport is in North America (USA, Canada, Mexico)
  const isNorthAmerica = (airport: Airport) => {
    const { latitude, longitude } = airport;
    return (
      latitude >= NORTH_AMERICA_BOUNDS.minLat &&
      latitude <= NORTH_AMERICA_BOUNDS.maxLat &&
      longitude >= NORTH_AMERICA_BOUNDS.minLon &&
      longitude <= NORTH_AMERICA_BOUNDS.maxLon
    );
  };
  
  // Map layer options
  const [mapOptions, setMapOptions] = useState<MapLayerOptions>(DEFAULT_MAP_OPTIONS);
  
  // State info panel
  const [selectedStateInfo, setSelectedStateInfo] = useState<any>(null);
  
  // LRU cache for state info (last 4 clicked)
  const [stateCache, setStateCache] = useState<Record<string, any>>({});
  const [stateCacheOrder, setStateCacheOrder] = useState<string[]>([]);
  
  // Handle view state info - lazy loads and caches
  const handleViewStateInfo = useCallback(async (stateCode: string) => {
    if (!stateCode) return;
    
    // Only accept valid US state codes (2-letter abbreviations)
    if (stateCode.length !== 2 || !/^[A-Z]{2}$/.test(stateCode)) {
      console.log('Skipping non-US state:', stateCode);
      return;
    }
    
    console.log('handleViewStateInfo called with:', stateCode);
    
    // Check cache first
    if (stateCache[stateCode]) {
      console.log('Using cached state info for:', stateCode);
      setSelectedStateInfo(stateCache[stateCode]);
      return;
    }
    
    // Lazy load state data
    const mod = await import('@/lib/stateData');
    const info = mod.stateData[stateCode];
    
    console.log('Loaded state info:', stateCode, info ? 'found' : 'not found');
    
    if (info) {
      // Manage cache: remove oldest if we have 4
      let newOrder = [...stateCacheOrder];
      let newCache = { ...stateCache };
      
      if (newOrder.length >= 4) {
        const oldest = newOrder.shift();
        if (oldest) delete newCache[oldest];
      }
      
      newOrder.push(stateCode);
      newCache[stateCode] = info;
      
      setStateCacheOrder(newOrder);
      setStateCache(newCache);
      setSelectedStateInfo(info);
    }
  }, [stateCache, stateCacheOrder]);
  
  // Performance settings
  const [performanceSettings, setPerformanceSettings] = useState<PerformanceSettings>(DEFAULT_SETTINGS);
  
  // Map height control (percentage)
  const [mapHeightPercent, setMapHeightPercent] = useState(60);
   
  // Flight plan state
  const [flightPlanName, setFlightPlanName] = useState('');
  const [callsign, setCallsign] = useState('');
  const [aircraftType, setAircraftType] = useState('');
  const [pilotName, setPilotName] = useState('');
  const [departureTime, setDepartureTime] = useState('');
  const [cruisingAlt, setCruisingAlt] = useState(5500);
  const [alternateIcao, setAlternateIcao] = useState('');
  const [remarks, setRemarks] = useState('');
  const [soulsOnBoard, setSoulsOnBoard] = useState(1);
  
  // Route waypoints
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [departureFuel, setDepartureFuel] = useState(100);
  const [selectedAircraft, setSelectedAircraft] = useState(AIRCRAFT_PROFILES[0]);
  
  // Drag and drop for leg reordering
  const [draggedLegIndex, setDraggedLegIndex] = useState<number | null>(null);
  
  // Fuel data
  const [fuelPrices, setFuelPrices] = useState<Record<string, FuelPrice>>({});
  const [fboFeesData, setFboFeesData] = useState<Record<string, { fee25?: number; fee100?: number; landingFee?: number }>>({});
  
  // State prices will be calculated in LeafletMap component
  
  // Saved flight plans
  const [savedPlans, setSavedPlans] = useState<any[]>([]);
  const [showPlanList, setShowPlanList] = useState(false);
  
  // Auth Modal
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalAction, setAuthModalAction] = useState<'save' | 'load' | 'export'>('save');
    
  // Upgrade Modal
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [upgradeFeature, setUpgradeFeature] = useState<string>('');
    
  // Tier Explainer Modal (shown on first visit for free users)
  const [showTierExplainer, setShowTierExplainer] = useState(false);

  // Weather for waypoints
  const [showWeather, setShowWeather] = useState(false);
  const [showWeatherMap, setShowWeatherMap] = useState(false);
  const [segmentWeather, setSegmentWeather] = useState<Record<number, { windSpeed: number; windDir: number; temp: number; impact: number }>>({});
  const [routeWeather, setRouteWeather] = useState<any>(null);
  const [loadingRouteWeather, setLoadingRouteWeather] = useState(false);
  const [waypointWeather, setWaypointWeather] = useState<Record<string, any>>({});
  const [weatherLoading, setWeatherLoading] = useState(false);

  // Auth
  const { data: session, status } = useSession();
  const [syncOffered, setSyncOffered] = useState(false);
  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null);
  
  // User tier and role - check session for pro/owner, default to free for guests
  const userRole = (session?.user as any)?.role;
  const userTier = (session?.user as any)?.tier || 'free';

  // Free tier limits
  const FREE_TIER_LIMITS = {
    maxWaypoints: 6,
    maxSavedPlans: 5,
    maxClubs: 1,
    maxAircraft: 3,
  };

  // Owner or Pro users don't see ads
  const isOwner = userRole === 'owner';
  const isPro = userTier === 'pro' || isOwner;
  const isGuest = status === 'unauthenticated';

  // Validation for save button
  const canSave = waypoints.length >= 2 && 
    (flightPlanName.trim() || 
     callsign.trim() || 
     pilotName.trim() || 
     waypoints[0]?.icao);

  // Check if we should show the tier explainer on mount
  // Only show for guests (not logged in), not for free/pro/owner users
  useEffect(() => {
    if (typeof window !== 'undefined' && isGuest && !isPro) {
      const seen = localStorage.getItem('hasSeenTierExplainer');
      if (!seen) {
        // Show after a short delay to let the page load
        setTimeout(() => setShowTierExplainer(true), 1500);
      }
    }
  }, [isGuest, isPro]);
  
  // Demo plans flag
  const [demoPlansLoaded, setDemoPlansLoaded] = useState(false);

  const CURRENT_PLAN_STORAGE_KEY = 'fuelSaverCurrentPlan';
  
  // Get URL params for loading a plan
  const searchParams = useSearchParams();
  
  // Load plan from URL param (shared link)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const urlParams = new URLSearchParams(window.location.search);
    const planParam = urlParams.get('plan');
    
    if (planParam) {
      try {
        const decoded = decodeURIComponent(atob(planParam));
        const planData = JSON.parse(decoded);
        
        if (planData.waypoints && Array.isArray(planData.waypoints)) {
          const loadedWaypoints = planData.waypoints.map((w: any, i: number) => ({
            ...w,
            id: `shared-${i}`,
            sequence: i
          }));
          setWaypoints(loadedWaypoints);
          
          if (loadedWaypoints.length > 0) {
            setMapCenter([loadedWaypoints[0].latitude, loadedWaypoints[0].longitude]);
          }
          
          if (planData.name) {
            setFlightPlanName(planData.name);
          }
        }
      } catch (e) {
        console.error('Error loading shared plan:', e);
      }
    }
  }, []);
   
  // Load plan from URL param when plans are loaded (for database plans)
  useEffect(() => {
    const loadId = searchParams?.get('load');
    if (loadId && savedPlans.length > 0) {
      const planToLoad = savedPlans.find((p: any) => p.id === loadId);
      if (planToLoad) {
        setCurrentPlanId(loadId);
        loadFlightPlan(planToLoad);
      }
    }
  }, [searchParams, savedPlans]);
  
  // Load saved flight plans - localStorage first, then database
  useEffect(() => {
    // Always load from localStorage first (works offline)
    if (typeof window !== 'undefined') {
      const localPlans = localStorage.getItem('savedFlightPlans');
      if (localPlans) {
        try {
          const parsed = JSON.parse(localPlans);
          // Mark local plans with a flag
          const localOnlyPlans = parsed.map((p: any) => ({ ...p, fromLocal: true }));
          setSavedPlans(localOnlyPlans);
        } catch (e) { 
          console.error('Error loading local plans:', e); 
        }
      }
    }
    
    // If authenticated, load from database and offer to sync
    if (status === 'authenticated' && session?.user?.id) {
      fetch('/api/flight-plans')
        .then(res => res.json())
        .then(data => {
          if (data.flightPlans && data.flightPlans.length > 0) {
            // Merge with local plans (database takes precedence for same plans)
            setSavedPlans(prev => {
              const dbPlans = data.flightPlans.map((p: any) => ({ ...p, fromLocal: false }));
              // Keep any local-only plans
              const localOnly = prev.filter((p: any) => p.fromLocal === true);
              return [...localOnly, ...dbPlans];
            });
            
            // Offer to import local plans if there are any
            const localPlans = typeof window !== 'undefined' ? localStorage.getItem('savedFlightPlans') : null;
            if (localPlans && !syncOffered) {
              const parsed = JSON.parse(localPlans);
              if (parsed.length > 0) {
                // Ask user if they want to import
                const importConfirm = confirm(`You have ${parsed.length} flight plan(s) saved locally. Import them to your account?`);
                if (importConfirm) {
                  // Import each local plan to database
                  parsed.forEach(async (plan: any) => {
                    await fetch('/api/flight-plans', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(plan)
                    });
                  });
                  // Clear local storage after import
                  localStorage.removeItem('savedFlightPlans');
                  setSyncOffered(true);
                  // Reload from database
                  window.location.reload();
                }
              }
              setSyncOffered(true);
            }
          }
        })
        .catch(err => console.error('Error loading plans:', err));
    }
  }, [status, session, syncOffered]);
  
  // Load fuel prices from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('fuelPrices');
      if (saved) {
        try {
          setFuelPrices(JSON.parse(saved));
        } catch (e) { console.error('Error loading fuel prices:', e); }
      }
      
      // Load FBO fees from localStorage
      const savedFbo = localStorage.getItem('fboFees');
      if (savedFbo) {
        try {
          setFboFeesData(JSON.parse(savedFbo));
        } catch (e) { console.error('Error loading FBO fees:', e); }
      }
    }
  }, []);
  
  // Save fuel prices to localStorage when they change
  useEffect(() => {
    if (typeof window !== 'undefined' && Object.keys(fuelPrices).length > 0) {
      localStorage.setItem('fuelPrices', JSON.stringify(fuelPrices));
    }
  }, [fuelPrices]);
  
  // Save FBO fees to localStorage when they change
  useEffect(() => {
    if (typeof window !== 'undefined' && Object.keys(fboFeesData).length > 0) {
      localStorage.setItem('fboFees', JSON.stringify(fboFeesData));
    }
  }, [fboFeesData]);
  
  // Load saved flight plans from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('savedFlightPlans');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          // Add demo plans if no saved plans exist
          if (parsed.length === 0 && !demoPlansLoaded) {
            setSavedPlans(DEMO_FLIGHT_PLANS);
            setDemoPlansLoaded(true);
          } else {
            setSavedPlans(parsed);
          }
        } catch (e) { 
          console.error('Error loading flight plans:', e); 
          // Show demo plans on error
          if (!demoPlansLoaded) {
            setSavedPlans(DEMO_FLIGHT_PLANS);
            setDemoPlansLoaded(true);
          }
        }
      } else {
        // No saved plans - show demo plans
        if (!demoPlansLoaded) {
          setSavedPlans(DEMO_FLIGHT_PLANS);
          setDemoPlansLoaded(true);
        }
      }
    }
  }, [demoPlansLoaded]);
  
  // Save flight plans to localStorage
  const saveToLocalStorage = (plans: any[]) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('savedFlightPlans', JSON.stringify(plans));
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (waypoints.length < 2) {
      localStorage.removeItem(CURRENT_PLAN_STORAGE_KEY);
      window.dispatchEvent(new CustomEvent('fuel-saver-plan-updated'));
      return;
    }

    const relevantFuelPrices: Record<string, FuelPrice> = {};
    waypoints.forEach((wp) => {
      if (wp?.icao && fuelPrices[wp.icao]) {
        relevantFuelPrices[wp.icao] = fuelPrices[wp.icao];
      }
    });

    const currentPlan = {
      name: flightPlanName?.trim() || undefined,
      waypoints: waypoints.map((wp) => ({
        icao: wp.icao,
        name: wp.name,
        latitude: wp.latitude,
        longitude: wp.longitude,
      })),
      aircraft: {
        name: selectedAircraft.name,
        speed: selectedAircraft.speed,
        burnRate: selectedAircraft.burnRate,
        fuelCapacity: selectedAircraft.fuelCapacity,
      },
      cruisingAltitude: cruisingAlt,
      fuelPrices: relevantFuelPrices,
      updatedAt: new Date().toISOString(),
    };

    localStorage.setItem(CURRENT_PLAN_STORAGE_KEY, JSON.stringify(currentPlan));
    window.dispatchEvent(new CustomEvent('fuel-saver-plan-updated'));
  }, [waypoints, selectedAircraft, cruisingAlt, fuelPrices, flightPlanName]);

  // Demo flight plans for users who want to try it out
  const DEMO_FLIGHT_PLANS = [
    {
      id: 'demo-1',
      name: 'California Coast Hop',
      callsign: 'N12345',
      aircraftType: 'Cessna 172S (2022)',
      pilotName: 'Demo Pilot',
      departureTime: '2026-02-20T08:00',
      cruisingAlt: 5500,
      alternateIcao: 'KSMO',
      remarks: 'Scenic coastal flight',
      soulsOnBoard: 2,
      departureFuel: 100,
      departureIcao: 'KVNY',
      arrivalIcao: 'KSFO',
      waypoints: [
        { icao: 'KVNY', name: 'Van Nuys Airport', city: 'Van Nuys', latitude: 34.2098, longitude: -118.4895, sequence: 0 },
        { icao: 'KLAX', name: 'Los Angeles International', city: 'Los Angeles', latitude: 33.9425, longitude: -118.4081, sequence: 1 },
        { icao: 'KSMF', name: 'Sacramento International', city: 'Sacramento', latitude: 38.6954, longitude: -121.5908, sequence: 2 },
        { icao: 'KSFO', name: 'San Francisco International', city: 'San Francisco', latitude: 37.6213, longitude: -122.379, sequence: 3 },
      ],
      isDemo: true,
      createdAt: '2026-01-15T10:00:00Z'
    },
    {
      id: 'demo-2',
      name: 'Texas Cross Country',
      callsign: 'N98765',
      aircraftType: 'Cessna 182T (2020)',
      pilotName: 'Demo Pilot',
      departureTime: '2026-02-21T09:00',
      cruisingAlt: 6500,
      alternateIcao: 'KDTO',
      remarks: 'Austin to Dallas',
      soulsOnBoard: 3,
      departureFuel: 100,
      departureIcao: 'KAUS',
      arrivalIcao: 'KDFW',
      waypoints: [
        { icao: 'KAUS', name: 'Austin-Bergstrom International', city: 'Austin', latitude: 30.1945, longitude: -97.6699, sequence: 0 },
        { icao: 'KTIW', name: 'Tulip Field', city: 'Cameron', latitude: 30.8791, longitude: -96.9769, sequence: 1 },
        { icao: 'KCFD', name: 'Caddo Mills Municipal', city: 'Caddo Mills', latitude: 33.0362, longitude: -96.2414, sequence: 2 },
        { icao: 'KDFW', name: 'Dallas/Fort Worth International', city: 'Dallas', latitude: 32.8998, longitude: -97.0403, sequence: 3 },
      ],
      isDemo: true,
      createdAt: '2026-01-20T14:30:00Z'
    },
    {
      id: 'demo-3',
      name: 'Florida Fun',
      callsign: 'N11111',
      aircraftType: 'Piper Cherokee Six (2020)',
      pilotName: 'Demo Pilot',
      departureTime: '2026-02-22T07:30',
      cruisingAlt: 4500,
      alternateIcao: 'KMIA',
      remarks: 'Tampa to Miami scenic',
      soulsOnBoard: 4,
      departureFuel: 100,
      departureIcao: 'KTPA',
      arrivalIcao: 'KMIA',
      waypoints: [
        { icao: 'KTPA', name: 'Tampa International', city: 'Tampa', latitude: 27.9755, longitude: -82.5332, sequence: 0 },
        { icao: 'KOPF', name: 'Opa Locka Executive', city: 'Miami', latitude: 25.907, longitude: -80.2586, sequence: 1 },
        { icao: 'KMIA', name: 'Miami International', city: 'Miami', latitude: 25.7959, longitude: -80.287, sequence: 2 },
      ],
      isDemo: true,
      createdAt: '2026-01-25T09:15:00Z'
    }
  ];

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Airport[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  
  // Panel visibility
  const [showPanel, setShowPanel] = useState(true);
  const [showOrientationWarning, setShowOrientationWarning] = useState(false);
  const [orientationDismissed, setOrientationDismissed] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'waypoints' | 'wb' | 'info' | 'e6b'>('details');
  const [tabIndex, setTabIndex] = useState(0);
  
  // E6B Calculator state
  const [e6bHeading, setE6bHeading] = useState(360);
  const [e6bWindspeed, setE6bWindspeed] = useState(15);
  const [e6bWindDir, setE6bWindDir] = useState(270);
  const [e6bTAS, setE6bTAS] = useState(120);
  const [e6bResult, setE6bResult] = useState<{ groundSpeed: number; windCorrection: number; track: number } | null>(null);
  
  // Weight & Balance state
  const [wbFrontPax, setWbFrontPax] = useState(170);
  const [wbRearPax1, setWbRearPax1] = useState(170);
  const [wbRearPax2, setWbRearPax2] = useState(0);
  const [wbBaggage1, setWbBaggage1] = useState(0);
  const [wbBaggage2, setWbBaggage2] = useState(0);
  const [wbFuel, setWbFuel] = useState(40);
  
  // Total trip cost settings
  const [includeLandingFees, setIncludeLandingFees] = useState(true);
  const [includeFboFees, setIncludeFboFees] = useState(true);
  
  const tabs = [
    { id: 'details', label: '📋 Details' },
    { id: 'waypoints', label: '📍 Route' },
    { id: 'wb', label: '⚖️ W&B' },
    { id: 'e6b', label: '🔧 Tools' },
    { id: 'info', label: '🌤 Weather' }
  ];
  
  // E6B Wind Correction calculation
  const calculateE6B = () => {
    const headingRad = (e6bHeading * Math.PI) / 180;
    const windRad = (e6bWindDir * Math.PI) / 180;
    const ws = e6bWindspeed;
    const tas = e6bTAS;
    
    // Wind components
    const windFrom = (windRad + Math.PI); // wind FROM direction
    const wx = ws * Math.cos(windFrom);
    const wy = ws * Math.sin(windFrom);
    
    // Ground speed vector
    const gsx = tas * Math.cos(headingRad) - wx;
    const gsy = tas * Math.sin(headingRad) - wy;
    
    const groundSpeed = Math.sqrt(gsx * gsx + gsy * gsy);
    const track = ((Math.atan2(gsy, gsx) * 180) / Math.PI + 360) % 360;
    const windCorrection = track - e6bHeading;
    
    setE6bResult({
      groundSpeed: Math.round(groundSpeed),
      windCorrection: Math.round(windCorrection),
      track: Math.round(track)
    });
  };
  
  // Cached airports - accumulates as user pans around
  const [cachedAirports, setCachedAirports] = useState<Airport[]>([]);
  const [allUSAirportsLoaded, setAllUSAirportsLoaded] = useState(false);
  
  // Pre-load all US airports on first load
  useEffect(() => {
    if (allUSAirportsLoaded) return;
    
    const cached = getCachedData<Airport[]>('allUSAirports');
    if (cached && cached.length > 0) {
      setCachedAirports(cached);
      // Load more airports initially so they're visible
      setAirports(cached.slice(0, 300));
      setAllUSAirportsLoaded(true);
      // Fit to show all airports
      if (cached.length > 0) {
        const lats = cached.slice(0, 300).map(a => a.latitude).filter(Boolean);
        const lons = cached.slice(0, 300).map(a => a.longitude).filter(Boolean);
        if (lats.length > 0) {
          const minLat = Math.min(...lats);
          const maxLat = Math.max(...lats);
          const minLon = Math.min(...lons);
          const maxLon = Math.max(...lons);
          setMapCenter([(minLat + maxLat) / 2, (minLon + maxLon) / 2]);
          setMapZoom(5);
        }
      }
      return;
    }
    
    // Fetch all US airports (large + medium)
    fetch('/api/airports?country=US&limit=10000')
      .then(r => r.json())
      .then(data => {
        if (data.airports) {
          const all = data.airports as Airport[];
          setCachedAirports(all);
          setAirports(all.slice(0, 300));
          setCachedData('allUSAirports', all);
          setAllUSAirportsLoaded(true);
          // Fit to show airports
          const lats = all.slice(0, 300).map(a => a.latitude).filter(Boolean);
          const lons = all.slice(0, 300).map(a => a.longitude).filter(Boolean);
          if (lats.length > 0) {
            const minLat = Math.min(...lats);
            const maxLat = Math.max(...lats);
            const minLon = Math.min(...lons);
            const maxLon = Math.max(...lons);
            setMapCenter([(minLat + maxLat) / 2, (minLon + maxLon) / 2]);
            setMapZoom(5);
          }
        }
      })
      .catch(console.error);
  }, [allUSAirportsLoaded]);
  
  // Fetch airports when map bounds change - with caching (capped at 5000)
  useEffect(() => {
    if (!mapLoaded) return;
    
    const fetchAirports = async () => {
      setLoadingAirports(true);
      try {
        const sizeParam = showAllAirports ? 'seaplane' : 'medium';
        const res = await fetch(
          `/api/airports/bounds?minLat=${mapBounds.minLat}&maxLat=${mapBounds.maxLat}&minLon=${mapBounds.minLon}&maxLon=${mapBounds.maxLon}&minSize=${sizeParam}&limit=100&country=US`
        );
        const data = await res.json();
        if (data.airports && data.airports.length > 0) {
          // Merge with cached airports (avoid duplicates), cap at 5000
          setCachedAirports(prev => {
            const existing = new Set(prev.map(a => a.icao));
            const newOnes = data.airports.filter((a: Airport) => !existing.has(a.icao));
            let allAirports = [...prev, ...newOnes];
            // Cap at 5000 - trim oldest if exceeded
            if (allAirports.length > 5000) {
              allAirports = allAirports.slice(allAirports.length - 5000);
            }
            // Show airports in current view
            const inView = allAirports.filter(a => 
              a.latitude >= mapBounds.minLat - 2 && 
              a.latitude <= mapBounds.maxLat + 2 &&
              a.longitude >= mapBounds.minLon - 2 && 
              a.longitude <= mapBounds.maxLon + 2
            );
            setAirports(inView);
            return allAirports;
          });
        }
      } catch (e) {
        console.error('Error fetching airports:', e);
        // Fallback to demo airports
        setAirports(DEMO_AIRPORTS.slice(0, 20));
      }
      setLoadingAirports(false);
    };
    
    fetchAirports();
  }, [mapBounds, showAllAirports, mapLoaded]);

  // Fetch fuel prices for waypoints (parallel)
  useEffect(() => {
    const fetchPrices = async () => {
      const uncached = waypoints.filter(wp => !fuelPrices[wp.icao]);
      if (uncached.length === 0) return;
      
      const results = await Promise.allSettled(
        uncached.map(wp => getFuelPrice(wp.icao))
      );
      
      const newPrices: Record<string, FuelPrice> = {};
      results.forEach((result, i) => {
        if (result.status === 'fulfilled' && result.value) {
          newPrices[uncached[i].icao] = result.value;
        }
      });
      
      if (Object.keys(newPrices).length > 0) {
        setFuelPrices(prev => ({ ...prev, ...newPrices }));
      }
    };
    if (waypoints.length > 0) {
      fetchPrices();
    }
  }, [waypoints]);

  // Handle user fuel price submissions
  useEffect(() => {
    const handleSubmitFuelPrice = async (event: Event) => {
      const customEvent = event as CustomEvent;
      const { icao, price, fuelType } = customEvent.detail;
      
      try {
        const res = await fetch('/api/fuel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            icao,
            fuelType,
            price,
            source: 'user'
          })
        });
        
        if (res.ok) {
          // Update local state
          setFuelPrices(prev => ({
            ...prev,
            [icao]: {
              ...prev[icao],
              icao,
              price100ll: fuelType === '100LL' ? price : (prev[icao]?.price100ll || null),
              priceJetA: fuelType === 'JetA' ? price : (prev[icao]?.priceJetA || null),
              lastUpdated: new Date().toISOString(),
              source: 'user'
            }
          }));
        }
      } catch (e) {
        console.error('Error submitting fuel price:', e);
      }
    };
    
    window.addEventListener('submitFuelPrice', handleSubmitFuelPrice);
    return () => window.removeEventListener('submitFuelPrice', handleSubmitFuelPrice);
  }, []);

  // Debounced search ref
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Search airports - searches demo + loaded + cached airports
  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    
    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    if (query.length >= 2) {
      // Debounce search by 150ms
      searchTimeoutRef.current = setTimeout(() => {
        const q = query.toUpperCase();
        // Search demo airports
        const demoResults = DEMO_AIRPORTS.filter(a =>
          a.icao.includes(q) || a.iata?.includes(q) || 
          a.name.toUpperCase().includes(q) || a.city?.toUpperCase().includes(q)
        );
        // Search current airports from map
        const mapResults = airports.filter(a =>
          a.icao.toUpperCase().includes(q) || a.iata?.toUpperCase().includes(q) || 
          a.name.toUpperCase().includes(q) || a.city?.toUpperCase().includes(q)
        );
        // Search cached airports (accumulated from panning)
        const cachedResults = cachedAirports.filter(a =>
          a.icao.toUpperCase().includes(q) || a.iata?.toUpperCase().includes(q) || 
          a.name.toUpperCase().includes(q) || a.city?.toUpperCase().includes(q)
        );
        // Combine and dedupe, then filter by region if international is disabled
        const combined = [...demoResults];
        const seen = new Set(combined.map(a => a.icao));
        for (const a of [...mapResults, ...cachedResults]) {
          if (!seen.has(a.icao)) {
            // Only include if in North America or international is enabled
            if (showInternational || isNorthAmerica(a)) {
              seen.add(a.icao);
              combined.push(a);
            }
          }
        }
        setSearchResults(combined.slice(0, 10));
        setShowSearchResults(true);
      }, 150);
    } else {
      setSearchResults([]);
      setShowSearchResults(false);
    }
  }, [airports, cachedAirports, showInternational]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  // Check for mobile and orientation
  useEffect(() => {
    const checkOrientation = () => {
      const isMobile = window.innerWidth < 768;
      const isPortrait = window.innerHeight > window.innerWidth;
      
      if (isMobile && isPortrait && !orientationDismissed) {
        setShowOrientationWarning(true);
      } else {
        setShowOrientationWarning(false);
      }
    };

    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    
    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, [orientationDismissed]);

  // Add waypoint
  const addWaypoint = (airport: Airport, index?: number) => {
    // Check if already in route
    if (waypoints.find(w => w.icao === airport.icao)) {
      alert('Airport already in route');
      return;
    }

    // Check free tier limit for waypoints
    if (!isPro && waypoints.length >= FREE_TIER_LIMITS.maxWaypoints) {
      setUpgradeFeature('More than 6 waypoints');
      setUpgradeModalOpen(true);
      return;
    }

    const wp: Waypoint = {
      id: crypto.randomUUID(),
      icao: airport.icao,
      name: airport.name,
      city: airport.city,
      state: (airport as any).state,
      latitude: airport.latitude,
      longitude: airport.longitude,
      sequence: index ?? waypoints.length,
      type: airport.type
    };
    
    if (index !== undefined) {
      const newWaypoints = [...waypoints];
      newWaypoints.splice(index, 0, wp);
      setWaypoints(newWaypoints.map((w, i) => ({ ...w, sequence: i })));
    } else {
      setWaypoints([...waypoints, wp]);
    }
    
    // Center map on new waypoint
    setMapCenter([airport.latitude, airport.longitude]);
    setMapZoom(8);
    setSearchQuery('');
    setShowSearchResults(false);
  };

  // Remove waypoint
  const removeWaypoint = (id: string) => {
    setWaypoints(waypoints.filter(w => w.id !== id).map((w, i) => ({ ...w, sequence: i })));
  };

  // Optimize route for shortest total distance (simple nearest neighbor)
  const optimizeRoute = () => {
    if (waypoints.length <= 2) return;
    
    const unvisited = waypoints.slice(1, waypoints.length - 1); // Keep first and last
    const optimized: Waypoint[] = [waypoints[0]];
    
    let current = waypoints[0];
    while (unvisited.length > 0) {
      let nearestIdx = 0;
      let nearestDist = Infinity;
      
      unvisited.forEach((wp, idx) => {
        const dist = calculateDistance(current.latitude, current.longitude, wp.latitude, wp.longitude);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestIdx = idx;
        }
      });
      
      const nearest = unvisited.splice(nearestIdx, 1)[0];
      optimized.push(nearest);
      current = nearest;
    }
    
    optimized.push(waypoints[waypoints.length - 1]); // Add last
    
    setWaypoints(optimized.map((w, i) => ({ ...w, sequence: i })));
  };

  // Toggle round trip (add first airport to end, or remove if already there)
  const toggleRoundTrip = () => {
    const first = waypoints[0];
    const last = waypoints[waypoints.length - 1];
    
    if (first.icao === last.icao) {
      // Already round trip - remove duplicate
      setWaypoints(waypoints.slice(0, -1).map((w, i) => ({ ...w, sequence: i })));
    } else {
      // Add first airport to end
      const returnWp: Waypoint = {
        ...first,
        id: crypto.randomUUID(),
        sequence: waypoints.length
      };
      setWaypoints([...waypoints, returnWp]);
    }
  };

  // Fit map to show all waypoints
  const fitMapToWaypoints = () => {
    if (waypoints.length === 0) return;
    if (waypoints.length === 1) {
      setMapCenter([waypoints[0].latitude, waypoints[0].longitude]);
      setMapZoom(10);
      return;
    }
    
    let minLat = Infinity, maxLat = -Infinity;
    let minLon = Infinity, maxLon = -Infinity;
    
    waypoints.forEach(wp => {
      minLat = Math.min(minLat, wp.latitude);
      maxLat = Math.max(maxLat, wp.latitude);
      minLon = Math.min(minLon, wp.longitude);
      maxLon = Math.max(maxLon, wp.longitude);
    });
    
    const centerLat = (minLat + maxLat) / 2;
    const centerLon = (minLon + maxLon) / 2;
    
    setMapCenter([centerLat, centerLon]);
    
    // Calculate zoom to fit
    const latDiff = maxLat - minLat;
    const lonDiff = maxLon - minLon;
    const maxDiff = Math.max(latDiff, lonDiff);
    
    let zoom = 8;
    if (maxDiff < 0.5) zoom = 12;
    else if (maxDiff < 1) zoom = 10;
    else if (maxDiff < 2) zoom = 9;
    else if (maxDiff < 5) zoom = 7;
    else if (maxDiff < 10) zoom = 6;
    else zoom = 5;
    
    setMapZoom(zoom);
  };

  // Move waypoint
  const moveWaypoint = (id: string, direction: 'up' | 'down') => {
    const index = waypoints.findIndex(w => w.id === id);
    if (index < 0) return;
    
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= waypoints.length) return;
    
    const newWaypoints = [...waypoints];
    [newWaypoints[index], newWaypoints[newIndex]] = [newWaypoints[newIndex], newWaypoints[index]];
    setWaypoints(newWaypoints.map((w, i) => ({ ...w, sequence: i })));
  };

  // Parse GPX file
  const parseGPX = (content: string) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/xml');
    const wpts = doc.querySelectorAll('wpt');
    
    const newWaypoints: Waypoint[] = [];
    wpts.forEach((wpt, i) => {
      const lat = parseFloat(wpt.getAttribute('lat') || '0');
      const lon = parseFloat(wpt.getAttribute('lon') || '0');
      const name = wpt.querySelector('name')?.textContent || `WPT${i + 1}`;
      const ele = wpt.querySelector('ele')?.textContent;
      
      // Try to find matching airport in our DB
      const matchingAirport = DEMO_AIRPORTS.find(a => 
        a.icao.toUpperCase() === name.toUpperCase().substring(0, 4)
      );
      
      newWaypoints.push({
        id: crypto.randomUUID(),
        icao: matchingAirport?.icao || name.substring(0, 4),
        name: matchingAirport?.name || name,
        latitude: matchingAirport?.latitude || lat,
        longitude: matchingAirport?.longitude || lon,
        altitude: ele ? parseInt(ele) : undefined,
        sequence: i
      });
    });
    
    if (newWaypoints.length > 0) {
      setWaypoints(newWaypoints);
      // Center on first waypoint
      setMapCenter([newWaypoints[0].latitude, newWaypoints[0].longitude]);
      setMapZoom(8);
    }
  };

  // Parse FPL file (simple parsing)
  const parseFPL = (content: string) => {
    const lines = content.split('\n');
    const newWaypoints: Waypoint[] = [];
    let seq = 0;
    
    for (const line of lines) {
      // Look for waypoint patterns (5-letter names or airport codes)
      const match = line.match(/([A-Z]{4,5})/g);
      if (match) {
        for (const wpId of match) {
          const airport = DEMO_AIRPORTS.find(a => 
            a.icao === wpId || a.iata === wpId
          );
          if (airport) {
            newWaypoints.push({
              id: crypto.randomUUID(),
              icao: airport.icao,
              name: airport.name,
              city: airport.city,
              latitude: airport.latitude,
              longitude: airport.longitude,
              sequence: seq++
            });
          }
        }
      }
    }
    
    if (newWaypoints.length > 0) {
      setWaypoints(newWaypoints);
      setMapCenter([newWaypoints[0].latitude, newWaypoints[0].longitude]);
      setMapZoom(8);
    }
  };

  // Parse flightplandatabase.com JSON format
  const parseFPDBJson = async (content: string) => {
    try {
      const data = JSON.parse(content);
      const newWaypoints: Waypoint[] = [];
      
      // Handle flightplandatabase.com JSON format
      // The route is in data.route as array of waypoints
      const route = data.route || data.plan?.route || [];
      
      for (const wp of route) {
        // Each waypoint can have: id, name, type, lat, lon, airway
        const lat = wp.lat || wp.latitude;
        const lon = wp.lon || wp.longitude;
        const icao = wp.id || wp.icao || wp.name;
        
        // Try to find airport in our database
        let airport = DEMO_AIRPORTS.find(a => a.icao === icao?.substring(0, 4));
        
        if (airport || (lat && lon)) {
          newWaypoints.push({
            id: crypto.randomUUID(),
            icao: airport?.icao || icao?.substring(0, 4) || 'WAYPT',
            name: airport?.name || icao || 'Waypoint',
            city: airport?.city,
            latitude: airport?.latitude || lat,
            longitude: airport?.longitude || lon,
            sequence: newWaypoints.length
          });
        }
      }
      
      if (newWaypoints.length > 0) {
        setWaypoints(newWaypoints);
        setMapCenter([newWaypoints[0].latitude, newWaypoints[0].longitude]);
        setMapZoom(6);
        return true;
      }
    } catch (e) {
      console.error('Error parsing FPDB JSON:', e);
    }
    return false;
  };

  // Parse flightplandatabase.com CSV format
  const parseFPDBCSV = (content: string) => {
    try {
      const lines = content.split('\n');
      const newWaypoints: Waypoint[] = [];
      
      // Skip header if present, find waypoint data
      for (const line of lines) {
        const parts = line.split(',').map(p => p.trim().replace(/"/g, ''));
        if (parts.length < 3) continue;
        
        // Try to extract waypoint info - format varies
        // Could be: id,type,lat,lon,airway or waypoint,lat,lon,alt,etc.
        let lat: number | undefined, lon: number | undefined, icao: string | undefined;
        
        // Try to find lat/lon in the line
        for (let i = 0; i < parts.length; i++) {
          const val = parseFloat(parts[i]);
          if (!isNaN(val)) {
            if (val >= -90 && val <= 90 && !lat) lat = val;
            else if (val >= -180 && val <= 180 && !lon) lon = val;
          }
          // Look for 4-letter ICAO codes
          if (parts[i].match(/^[A-Z]{4}$/)) {
            icao = parts[i];
          }
        }
        
        if (lat && lon) {
          const airport = DEMO_AIRPORTS.find(a => a.icao === icao);
          newWaypoints.push({
            id: crypto.randomUUID(),
            icao: airport?.icao || icao || `WPT${newWaypoints.length}`,
            name: airport?.name || icao || 'Waypoint',
            city: airport?.city,
            latitude: airport?.latitude || lat,
            longitude: airport?.longitude || lon,
            sequence: newWaypoints.length
          });
        }
      }
      
      if (newWaypoints.length > 0) {
        setWaypoints(newWaypoints);
        setMapCenter([newWaypoints[0].latitude, newWaypoints[0].longitude]);
        setMapZoom(6);
        return true;
      }
    } catch (e) {
      console.error('Error parsing FPDB CSV:', e);
    }
    return false;
  };

  // Import from flightplandatabase.com by plan ID
  const importFromFPDB = async (planId: string) => {
    try {
      // Fetch from flightplandatabase.com API (public endpoint)
      const res = await fetch(`https://flightplandatabase.com/api/plan/${planId}?format=json`);
      if (!res.ok) {
        alert('Plan not found. Check the plan ID.');
        return;
      }
      const data = await res.json();
      
      // Parse the route from FPDB format
      const newWaypoints: Waypoint[] = [];
      const route = data.route || [];
      
      for (const wp of route) {
        const lat = wp.lat;
        const lon = wp.lon;
        const waypointId = wp.id;
        
        // Try to find airport in our database
        const airport = DEMO_AIRPORTS.find(a => a.icao === waypointId?.substring(0, 4));
        
        if (airport || (lat && lon)) {
          newWaypoints.push({
            id: crypto.randomUUID(),
            icao: airport?.icao || waypointId?.substring(0, 4) || 'WAYPT',
            name: airport?.name || waypointId || 'Waypoint',
            city: airport?.city,
            latitude: airport?.latitude || lat,
            longitude: airport?.longitude || lon,
            sequence: newWaypoints.length
          });
        }
      }
      
      if (newWaypoints.length > 0) {
        setWaypoints(newWaypoints);
        setMapCenter([newWaypoints[0].latitude, newWaypoints[0].longitude]);
        setMapZoom(6);
        
        // Also fill in flight plan details if available
        if (data.origin) {
          setDepartureTime(data.departureTime || '');
        }
        if (data.altitude) {
          setCruisingAlt(data.altitude);
        }
        
        alert(`Imported ${newWaypoints.length} waypoints from flightplandatabase.com!`);
      } else {
        alert('No waypoints found in this plan.');
      }
    } catch (e) {
      console.error('Error importing from FPDB:', e);
      alert('Failed to import plan. Make sure the plan ID is correct.');
    }
  };

  // Parse simple route string (comma or space separated ICAOs)
  const parseRouteString = (content: string) => {
    const newWaypoints: Waypoint[] = [];
    
    // Split by comma, space, or newline
    const tokens = content.split(/[,\s\n]+/).filter(t => t.length >= 3 && t.length <= 5);
    
    for (const token of tokens) {
      const icao = token.toUpperCase().replace(/[^A-Z]/g, '').substring(0, 4);
      if (icao.length < 3) continue;
      
      const airport = DEMO_AIRPORTS.find(a => a.icao === icao || a.iata === icao);
      if (airport) {
        newWaypoints.push({
          id: crypto.randomUUID(),
          icao: airport.icao,
          name: airport.name,
          city: airport.city,
          latitude: airport.latitude,
          longitude: airport.longitude,
          sequence: newWaypoints.length
        });
      }
    }
    
    if (newWaypoints.length > 0) {
      setWaypoints(newWaypoints);
      setMapCenter([newWaypoints[0].latitude, newWaypoints[0].longitude]);
      setMapZoom(6);
      return true;
    }
    return false;
  };

  // Parse X-Plane FMS format
  const parseFMS = (content: string) => {
    const lines = content.split('\n');
    const newWaypoints: Waypoint[] = [];
    
    for (const line of lines) {
      // FMS format: 5 WAYPOINT_NAME lat lon alt (approximate)
      // Or: I waypoint lat lon altitude airWay
      const parts = line.trim().split(/[\s,]+/);
      if (parts.length < 4) continue;
      
      // Check if it's a valid line (starts with number or I)
      if (!parts[0].match(/^[0-9I]/)) continue;
      
      const waypointName = parts[1] || parts[0];
      const lat = parseFloat(parts[parts.length - 3]);
      const lon = parseFloat(parts[parts.length - 2]);
      
      if (!isNaN(lat) && !isNaN(lon)) {
        const airport = DEMO_AIRPORTS.find(a => a.icao === waypointName.substring(0, 4));
        newWaypoints.push({
          id: crypto.randomUUID(),
          icao: airport?.icao || waypointName.substring(0, 4),
          name: airport?.name || waypointName,
          city: airport?.city,
          latitude: airport?.latitude || lat,
          longitude: airport?.longitude || lon,
          sequence: newWaypoints.length
        });
      }
    }
    
    if (newWaypoints.length > 0) {
      setWaypoints(newWaypoints);
      setMapCenter([newWaypoints[0].latitude, newWaypoints[0].longitude]);
      setMapZoom(6);
      return true;
    }
    return false;
  };

  // Parse VATSIM/IVAO flight plan (plain text)
  const parseVATSIM = (content: string) => {
    const lines = content.split('\n');
    const newWaypoints: Waypoint[] = [];
    let foundRoute = false;
    
    for (const line of lines) {
      const upperLine = line.toUpperCase();
      
      // Look for ROUTE: or similar markers
      if (upperLine.includes('ROUTE:') || upperLine.includes('SID') || upperLine.includes('STAR')) {
        foundRoute = true;
      }
      
      if (foundRoute) {
        // Extract ICAO codes (4 letters)
        const matches = line.match(/[A-Z]{4}/g);
        if (matches) {
          for (const icao of matches) {
            const airport = DEMO_AIRPORTS.find(a => a.icao === icao);
            if (airport && !newWaypoints.find(w => w.icao === icao)) {
              newWaypoints.push({
                id: crypto.randomUUID(),
                icao: airport.icao,
                name: airport.name,
                city: airport.city,
                latitude: airport.latitude,
                longitude: airport.longitude,
                sequence: newWaypoints.length
              });
            }
          }
        }
        
        // Stop at next section
        if (upperLine.includes('REMARKS:') || upperLine.includes('NOTES:')) {
          break;
        }
      }
    }
    
    if (newWaypoints.length > 0) {
      setWaypoints(newWaypoints);
      setMapCenter([newWaypoints[0].latitude, newWaypoints[0].longitude]);
      setMapZoom(6);
      return true;
    }
    return false;
  };

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      const ext = file.name.toLowerCase();
      
      if (ext.endsWith('.gpx')) {
        parseGPX(content);
      } else if (ext.endsWith('.fpl')) {
        parseFPL(content);
      } else if (ext.endsWith('.json')) {
        const success = await parseFPDBJson(content);
        if (!success) alert('Could not parse JSON file. Make sure it\'s from flightplandatabase.com');
      } else if (ext.endsWith('.csv')) {
        const success = parseFPDBCSV(content);
        if (!success) alert('Could not parse CSV file. Make sure it\'s from flightplandatabase.com');
      } else {
        alert('Please upload a .gpx, .fpl, .json, or .csv file');
      }
    };
    reader.readAsText(file);
  };

  // Fetch weather for all waypoints
  const fetchWaypointWeather = async () => {
    if (waypoints.length === 0) return;
    setWeatherLoading(true);
    const weatherData: Record<string, any> = {};
    
    // Determine if we should get forecast (TAF) or current (METAR)
    const isForecast = departureTime && new Date(departureTime) > new Date();
    const forecastDate = departureTime ? new Date(departureTime).toISOString().split('T')[0] : null;
    
    for (const wp of waypoints) {
      try {
        // If departure time is in the future, get TAF forecast
        let url = `/api/weather?icao=${wp.icao}`;
        if (isForecast && forecastDate) {
          url += `&forecast=${forecastDate}`;
        }
        
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          // Get TAF forecast if available, otherwise METAR
          const tafData = data.taf?.[0];
          const metarData = data.data?.[0];
          
          // Use forecast if departure is in future, otherwise current
          weatherData[wp.icao] = isForecast && tafData ? {
            ...tafData,
            isForecast: true,
            forecastFor: forecastDate
          } : (metarData || null);
        }
      } catch (e) {
        weatherData[wp.icao] = null;
      }
    }
    
    setWaypointWeather(weatherData);
    setWeatherLoading(false);
  };

  // Fetch route weather with segment calculations
  const fetchRouteWeather = async () => {
    if (waypoints.length < 2) return;
    setLoadingRouteWeather(true);
    
    try {
      const routePoints = waypoints.map(wp => ({
        icao: wp.icao,
        lat: wp.latitude,
        lon: wp.longitude
      }));
      
      const res = await fetch('/api/route-weather', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          waypoints: routePoints,
          altitude: cruisingAlt,
          aircraftTAS: selectedAircraft.speed
        })
      });
      
      if (res.ok) {
        const data = await res.json();
        setRouteWeather(data);
      }
    } catch (e) {
      console.error('Route weather error:', e);
    }
    
    setLoadingRouteWeather(false);
  };

  // Calculate route statistics
  const routeStats = useMemo(() => {
    if (waypoints.length < 2) return null;
    
    let totalDist = 0;
    const segments: number[] = [];
    const legs: { from: Waypoint; to: Waypoint; distance: number; fuelNeeded: number; cost: number }[] = [];
    
    for (let i = 1; i < waypoints.length; i++) {
      const dist = calculateDistance(
        waypoints[i - 1].latitude, waypoints[i - 1].longitude,
        waypoints[i].latitude, waypoints[i].longitude
      );
      totalDist += dist;
      segments.push(dist);
      
      // Calculate fuel and cost for this leg
      const legFuel = (dist / selectedAircraft.speed) * selectedAircraft.burnRate * 1.25; // with reserves
      const fuelPrice = fuelPrices[waypoints[i].icao]?.price100ll || 6.50;
      const legCost = legFuel * fuelPrice;
      
      legs.push({
        from: waypoints[i - 1],
        to: waypoints[i],
        distance: dist,
        fuelNeeded: legFuel,
        cost: legCost
      });
    }
    
    // Estimate total fuel needed with reserves
    const flightHours = totalDist / selectedAircraft.speed;
    const fuelNeeded = flightHours * selectedAircraft.burnRate;
    const fuelWithReserves = fuelNeeded * 1.25; // 25% reserves
    
    // Calculate estimated cost - fuel only
    let fuelCost = 0;
    for (const wp of waypoints) {
      const price = fuelPrices[wp.icao]?.price100ll || 6.50;
      fuelCost += price * (fuelWithReserves / waypoints.length);
    }
    
    // Calculate landing fees (based on airport size)
    let landingFees = 0;
    if (includeLandingFees) {
      for (let i = 1; i < waypoints.length; i++) {
        const wp = waypoints[i];
        // Large airports: $50, Medium: $30, Small: $15
        if (wp.type === 'large_airport') landingFees += 50;
        else if (wp.type === 'medium_airport') landingFees += 30;
        else landingFees += 15;
      }
    }
    
    // Calculate FBO fees (if enabled and available)
    let fboFees = 0;
    if (includeFboFees) {
      for (let i = 1; i < waypoints.length; i++) {
        const wp = waypoints[i];
        if (fboFeesData[wp.icao]) {
          fboFees += fboFeesData[wp.icao].fee25 || 0; // Use typical fee
        }
      }
    }
    
    const totalCost = fuelCost + landingFees + fboFees;
    const costPerPerson = soulsOnBoard > 1 ? totalCost / soulsOnBoard : totalCost;
    
    // Determine if fuel stops needed
    const fuelStops: Waypoint[] = [];
    const fuelCapacity = selectedAircraft.fuelCapacity * (departureFuel / 100);
    let accumulatedDist = 0;
    
    for (let i = 1; i < waypoints.length; i++) {
      accumulatedDist += segments[i - 1];
      if (accumulatedDist > fuelCapacity * 0.6) { // Refuel at 60% capacity
        fuelStops.push(waypoints[i]);
        accumulatedDist = 0;
      }
    }
    
    return {
      totalDistance: totalDist,
      flightHours: flightHours.toFixed(1),
      fuelNeeded: fuelWithReserves.toFixed(1),
      estimatedCost: totalCost.toFixed(0),
      fuelCost: fuelCost.toFixed(0),
      landingFees: landingFees,
      fboFees: fboFees.toFixed(0),
      costPerPerson: costPerPerson.toFixed(0),
      fuelStops,
      segments,
      legs
    };
  }, [waypoints, selectedAircraft, departureFuel, fuelPrices, includeLandingFees, includeFboFees, soulsOnBoard]);

  // Save flight plan
  const saveFlightPlan = async () => {
    if (waypoints.length < 2) {
      alert('Please add at least departure and destination');
      return;
    }

    // Check free tier limit for saved plans
    if (!isPro && savedPlans.filter(p => !p.isDemo).length >= FREE_TIER_LIMITS.maxSavedPlans) {
      setUpgradeFeature('More than 5 saved flight plans');
      setUpgradeModalOpen(true);
      return;
    }
    
    const planName = flightPlanName || `Flight Plan ${new Date().toLocaleDateString()}`;
    
    const plan = {
      name: planName,
      callsign,
      aircraftType: aircraftType || selectedAircraft.name,
      aircraftSpeed: selectedAircraft.speed,
      aircraftBurnRate: selectedAircraft.burnRate,
      aircraftFuelCapacity: selectedAircraft.fuelCapacity,
      pilotName,
      departureTime,
      cruisingAlt,
      alternateIcao,
      remarks,
      soulsOnBoard,
      departureFuel,
      departureIcao: waypoints[0]?.icao,
      arrivalIcao: waypoints[waypoints.length - 1]?.icao,
      waypoints: waypoints.map(w => ({
        icao: w.icao,
        name: w.name,
        city: w.city,
        latitude: w.latitude,
        longitude: w.longitude,
        altitude: w.altitude,
        sequence: w.sequence
      })),
      createdAt: new Date().toISOString()
    };
    
    // If logged in, save to database
    if (status === 'authenticated') {
      try {
        // If we have a current plan loaded, update it
        // Only create new if name changed OR no current plan
        if (currentPlanId) {
          // Check if name changed - if so, create new plan instead
          const currentPlan = savedPlans.find((p: any) => p.id === currentPlanId);
          if (currentPlan && currentPlan.name !== planName) {
            // Name changed - create new plan
            console.log('Name changed, creating new plan');
          } else {
            // Same name or no current plan found - update existing
            console.log('Updating existing plan:', currentPlanId);
            const res = await fetch(`/api/flight-plans?id=${currentPlanId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(plan)
            });
            
            if (res.ok) {
              const data = await res.json();
              setSavedPlans(prev => prev.map(p => p.id === currentPlanId ? data.flightPlan : p));
              alert('Flight plan updated!');
              return;
            } else {
              const errData = await res.json();
              console.error('Update failed:', errData);
              alert('Failed to update flight plan: ' + (errData.error || 'Unknown error'));
              return;
            }
          }
        }
        
        // Either no current plan or name changed - create new
        console.log('Creating new plan');
        const res = await fetch('/api/flight-plans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(plan)
        });
        
        if (res.ok) {
          const data = await res.json();
          setSavedPlans(prev => [data.flightPlan, ...prev]);
          setCurrentPlanId(data.flightPlan.id);
          alert('Flight plan saved!');
        } else {
          const errData = await res.json();
          console.error('Save failed:', errData);
          alert('Failed to save flight plan: ' + (errData.error || 'Unknown error'));
        }
      } catch (e) {
        console.error('Error saving:', e);
        alert('Error saving flight plan');
      }
    } else {
      // Save to localStorage only (when not logged in)
      // If we have a current local plan with same name, update it
      const currentLocalPlan = savedPlans.find((p: any) => p.fromLocal && p.id === currentPlanId);
      if (currentLocalPlan && currentLocalPlan.name === planName) {
        const newPlans = savedPlans.map((p: any) => 
          (p.fromLocal && p.id === currentPlanId) ? { ...plan, id: currentPlanId, fromLocal: true } : p
        );
        setSavedPlans(newPlans);
        saveToLocalStorage(newPlans);
        alert('Flight plan updated!');
        return;
      }
      
      // Name changed or new - create new
      const newPlans = [...savedPlans.filter(p => !p.id || !p.fromLocal), { ...plan, id: Date.now(), fromLocal: true }];
      setSavedPlans(newPlans);
      saveToLocalStorage(newPlans);
      alert('Flight plan saved locally (log in to save to your account)');
    }
  };
  
  // Delete flight plan
  const deleteFlightPlan = async (planId: string | number) => {
    const plan = savedPlans.find((p, i) => (p.id || i) === planId);
    
    if (plan?.id) {
      // Database plan - delete from API
      try {
        await fetch(`/api/flight-plans?id=${plan.id}`, { method: 'DELETE' });
      } catch (e) {
        console.error('Error deleting:', e);
      }
    }
    
    // Remove from local state
    const newPlans = savedPlans.filter((p, i) => (p.id || i) !== planId);
    setSavedPlans(newPlans);
    
    // If it was a local-only plan, update localStorage
    if (!plan?.id && typeof planId === 'number') {
      saveToLocalStorage(newPlans.filter(p => !p.id));
    }
  };
  
  // Load a flight plan
  const loadFlightPlan = (plan: any) => {
    setFlightPlanName(plan.name || '');
    setCallsign(plan.callsign || '');
    setAircraftType(plan.aircraftType || '');
    setPilotName(plan.pilotName || '');
    setDepartureTime(plan.departureTime || '');
    setCruisingAlt(plan.cruisingAlt || 5500);
    setAlternateIcao(plan.alternateIcao || '');
    setRemarks(plan.remarks || '');
    setSoulsOnBoard(plan.soulsOnBoard || 1);
    setDepartureFuel(plan.departureFuel || 100);
    
    // Mark this plan as loaded so future saves update it
    if (plan.id) {
      setCurrentPlanId(plan.id);
    }
    
    // Set aircraft if it matches one of our profiles
    if (plan.aircraftType) {
      const ac = AIRCRAFT_PROFILES.find(p => p.name === plan.aircraftType);
      if (ac) setSelectedAircraft(ac);
    }
    
    // Handle both array waypoints and relation waypoints
    const waypointsData = plan.waypoints || (plan.waypoints === undefined ? [] : []);
    
    if (waypointsData.length > 0) {
      const loadedWaypoints = waypointsData.map((w: any, i: number) => ({
        id: crypto.randomUUID(),
        icao: w.icao,
        name: w.name || w.icao,
        city: w.city,
        latitude: w.latitude,
        longitude: w.longitude,
        altitude: w.altitude,
        sequence: i
      }));
      setWaypoints(loadedWaypoints);
      
      // Center map on first waypoint
      if (loadedWaypoints.length > 0) {
        setMapCenter([loadedWaypoints[0].latitude, loadedWaypoints[0].longitude]);
        setMapZoom(8);
      }
    }
    
    setShowPlanList(false);
  };
  
  // Marker click handler - for popup Add to Route button
  const handleAirportAdd = (airport: Airport) => {
    addWaypoint(airport);
    // Center map on airport and zoom out to see area (not filling screen)
    setMapCenter([airport.latitude, airport.longitude]);
    setMapZoom(6); // Zoom out more so airport doesn't fill screen
  };

  // Find nearest cheap fuel
  const findNearestFuel = async () => {
    // Use first waypoint as center, or ask user
    const centerIcao = waypoints[0]?.icao || 'KORD'; // Default to ORD
    const radius = 50; // nautical miles
    
    try {
      const res = await fetch(`/api/fuel/nearest?icao=${centerIcao}&radius=${radius}`);
      const data = await res.json();
      
      if (data.results && data.results.length > 0) {
        const resultsText = data.results.slice(0, 5).map((r: any) => 
          `${r.icao} - $${r.price100ll}/gal (${r.distanceNm}nm ${r.direction})`
        ).join('\n');
        alert(`Nearest Cheap Fuel within ${radius}nm of ${centerIcao}:\n\n${resultsText}`);
        
        // Add cheapest to route
        if (confirm('Add cheapest to route?')) {
          const cheapest = data.results[0];
          const airport = airports.find(a => a.icao === cheapest.icao);
          if (airport) {
            addWaypoint(airport);
          }
        }
      } else {
        alert(`No fuel prices found within ${radius}nm of ${centerIcao}`);
      }
    } catch (e) {
      console.error('Error finding fuel:', e);
      alert('Error finding fuel prices. Make sure you have an airport in your route.');
    }
  };

  // Get marker color based on airport type
  const getMarkerColor = (type?: string) => {
    switch (type) {
      case 'large_airport': return '#ef4444'; // red
      case 'medium_airport': return '#f59e0b'; // amber
      case 'small_airport': return '#22c55e'; // green
      default: return '#6b7280'; // gray
    }
  };

  return (
    <div className="h-[100vh] bg-background text-foreground flex flex-col overflow-hidden">
      {/* Top Bar */}
      <div className="w-full px-2 py-1.5 bg-card border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between h-8">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-bold">Flight Planner</h1>
            <div className="flex items-center gap-1 text-sm mb-2">
              <a href="/modules/fuel-saver" className="px-2 py-0.5 rounded bg-primary/10 text-primary font-medium text-xs">Fuel Map</a>
              <a href="/modules/fuel-saver/airport-lookup" className="px-2 py-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground text-xs">Airport Lookup</a>
              <a href="/modules/fuel-saver/favorites" className="px-2 py-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground text-xs">Favorites</a>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {status === 'authenticated' ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-emerald-600">{session?.user?.email}</span>
                <button 
                  onClick={() => signOut()}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <button
                onClick={() => signIn()}
                className="bg-secondary hover:bg-secondary/80 text-foreground px-3 py-1.5 rounded text-xs"
              >
                Sign In
              </button>
            )}
            <button
              onClick={() => findNearestFuel()}
              className="bg-primary hover:bg-primary/90 text-primary-foreground px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1"
            >
              <span>⛽</span> Find Cheap Fuel
            </button>
            <ExportDropdown 
              waypoints={waypoints}
              flightPlanName={flightPlanName}
              aircraftType={selectedAircraft.name}
              cruisingAltitude={cruisingAlt}
              isPro={isPro}
              aircraft={selectedAircraft}
              fuelPrices={fuelPrices}
            />
          </div>
        </div>
      </div>

      {/* Main Content: Sidebar left, Map right */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Toggle Arrow Button - floats over the map */}
        <button
          onClick={() => setShowPanel(!showPanel)}
          className="absolute top-1/2 -translate-y-1/2 z-30 bg-card hover:bg-secondary border text-foreground px-2 py-4 rounded-r-lg text-sm transition-all lg:block hidden shadow-md"
          style={{ left: showPanel ? '308px' : '0px' }}
        >
          {showPanel ? '◀' : '▶'}
        </button>

        {/* Mobile Toggle Button - always visible on small screens */}
        <button
          onClick={() => setShowPanel(!showPanel)}
          className="lg:hidden fixed bottom-4 left-4 z-30 bg-primary hover:bg-primary/90 text-primary-foreground p-4 rounded-full shadow-lg"
        >
          {showPanel ? '✕' : '☰'}
        </button>

        {/* Left Sidebar - Panel */}
        <div 
          className={`bg-card border-r border-border flex flex-col overflow-hidden transition-all duration-300 fixed lg:relative z-20 h-full ${
            showPanel ? 'w-full sm:w-[308px]' : 'w-0 lg:w-0'
          }`}
        >
          {showPanel && (
            <div className="w-full sm:w-[308px] flex flex-col h-full pt-5">
              {/* Mobile Close Button */}
              <div className="lg:hidden flex justify-end p-2 border-b border-border">
                <button
                  onClick={() => setShowPanel(false)}
                  className="bg-secondary hover:bg-secondary/80 text-foreground p-2 rounded-lg"
                >
                  ✕ Close
                </button>
              </div>

              {/* Tabs */}
              <div className="flex items-center text-xs border-b border-border px-1">
                <button
                  onClick={() => setTabIndex(Math.max(0, tabIndex - 1))}
                  disabled={tabIndex === 0}
                  className="p-1.5 text-muted-foreground disabled:opacity-30 hover:text-foreground"
                >
                  ‹
                </button>
                <div className="flex-1 flex overflow-hidden">
                  {tabs.slice(tabIndex, tabIndex + 5).map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as 'details' | 'waypoints' | 'info' | 'e6b')}
                      className={`flex-1 py-1.5 font-medium border-b-2 ${
                        activeTab === tab.id 
                          ? 'text-foreground border-primary bg-primary/5' 
                          : 'text-muted-foreground border-transparent hover:text-foreground'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setTabIndex(Math.min(tabs.length - 3, tabIndex + 1))}
                  disabled={tabIndex >= tabs.length - 3}
                  className="p-1.5 text-muted-foreground disabled:opacity-30 hover:text-foreground"
                >
                  ›
                </button>
              </div>

              {/* Content - scrollable */}
              <div className="flex-1 overflow-y-auto">
                {activeTab === 'details' ? (
                /* Flight Plan Details Tab */
                <div className="p-2 space-y-2">
                  {/* Search */}

                  {/* Search */}
                  <div>
                    <div className="flex gap-1">
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => handleSearch(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && searchResults[0] && addWaypoint(searchResults[0])}
                        placeholder="Search airport..."
                        className="flex-1 bg-background border border-border rounded px-2 py-1.5 text-foreground uppercase text-xs"
                      />
                      <button 
                        onClick={() => searchQuery.length >= 2 && searchResults[0] && addWaypoint(searchResults[0])}
                        className="bg-sky-600 hover:bg-sky-500 px-3 rounded text-foreground text-xs"
                      >
                        Add
                      </button>
                    </div>
                    {showSearchResults && searchResults.length > 0 && (
                      <div className="mt-2 bg-background rounded max-h-40 overflow-y-auto">
                        {searchResults.map((airport) => (
                          <button
                            key={airport.icao}
                            onClick={() => addWaypoint(airport)}
                            className="w-full text-left px-3 py-2 hover:bg-secondary text-sm border-b border-border last:border-0"
                          >
                            <div className="font-medium">{airport.icao}</div>
                            <div className="text-xs text-muted-foreground">{airport.name}</div>
                          </button>
                        ))}
                      </div>
                    )}
                    {showSearchResults && searchResults.length === 0 && searchQuery.length >= 2 && (
                      <div className="mt-2 text-xs text-muted-foreground text-center py-2">No airports found</div>
                    )}
                  </div>

                  {/* Plan Name */}
                  <div>
                    <label className="block text-xs text-muted-foreground mb-0.5">Plan</label>
                    <input
                      type="text"
                      value={flightPlanName}
                      onChange={(e) => setFlightPlanName(e.target.value)}
                      placeholder="My Cross Country"
                      className="w-full bg-background border border-border rounded px-2 py-1 text-foreground text-xs"
                    />
                  </div>

                  {/* Callsign & Pilot */}
                  <div className="grid grid-cols-2 gap-1">
                    <div>
                      <label className="block text-xs text-muted-foreground mb-0.5">Callsign</label>
                      <input
                        type="text"
                        value={callsign}
                        onChange={(e) => setCallsign(e.target.value)}
                        placeholder="N12345"
                        className="w-full bg-background border border-border rounded px-2 py-1 text-foreground text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-0.5">Pilot</label>
                      <input
                        type="text"
                        value={pilotName}
                        onChange={(e) => setPilotName(e.target.value)}
                        placeholder="John Doe"
                        className="w-full bg-background border border-border rounded px-2 py-1 text-foreground text-xs"
                      />
                    </div>
                  </div>

                  {/* Aircraft & Departure Time */}
                  <div className="grid grid-cols-2 gap-1">
                    <div>
                      <label className="block text-xs text-muted-foreground mb-0.5">Aircraft</label>
                      <select
                        value={selectedAircraft.name}
                        onChange={(e) => {
                        const ac = AIRCRAFT_PROFILES.find(p => p.name === e.target.value);
                          if (ac) setSelectedAircraft(ac);
                        }}
                        className="w-full bg-background border border-border rounded px-2 py-1 text-foreground text-xs"
                      >
                        {[...new Set(AIRCRAFT_PROFILES.map(p => p.manufacturer))].map(mfr => (
                          <optgroup key={mfr} label={mfr}>
                            {AIRCRAFT_PROFILES.filter(p => p.manufacturer === mfr).map(p => (
                              <option key={p.name} value={p.name}>{p.name}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-0.5">Departure</label>
                      <input
                        type="datetime-local"
                        value={departureTime}
                        onChange={(e) => setDepartureTime(e.target.value)}
                        className="w-full bg-background border border-border rounded px-2 py-1 text-foreground text-xs"
                      />
                    </div>
                  </div>

                  {/* Cruising Alt & Souls */}
                  <div className="grid grid-cols-2 gap-1">
                    <div>
                      <label className="block text-xs text-muted-foreground mb-0.5">Alt (ft)</label>
                      <input
                        type="number"
                        value={cruisingAlt}
                        onChange={(e) => setCruisingAlt(parseInt(e.target.value))}
                        className="w-full bg-background border border-border rounded px-2 py-1 text-foreground text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-0.5">Souls</label>
                      <input
                        type="number"
                        min="1"
                        value={soulsOnBoard}
                        onChange={(e) => setSoulsOnBoard(parseInt(e.target.value))}
                        className="w-full bg-background border border-border rounded px-2 py-1 text-foreground text-xs"
                      />
                    </div>
                  </div>

                  {/* Alternate Airport */}
                  <div>
                    <label className="block text-xs text-muted-foreground mb-0.5">Alternate</label>
                    <input
                      type="text"
                      value={alternateIcao}
                      onChange={(e) => setAlternateIcao(e.target.value.toUpperCase())}
                      placeholder="KABC"
                      className="w-full bg-background border border-border rounded px-2 py-1 text-foreground uppercase text-xs"
                    />
                  </div>

                  {/* Remarks */}
                  <div>
                    <label className="block text-xs text-muted-foreground mb-0.5">Remarks</label>
                    <textarea
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      placeholder="..."
                      rows={1}
                      className="w-full bg-background border border-border rounded px-2 py-1 text-foreground text-xs"
                    />
                  </div>

                  {/* Fuel Settings */}
                  <div>
                    <label className="block text-xs text-muted-foreground mb-0.5">Fuel: {departureFuel}%</label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={departureFuel}
                      onChange={(e) => setDepartureFuel(parseInt(e.target.value))}
                      className="w-full"
                    />
                  </div>

                  {/* Range Calculator - compact inline */}
                  <div className="bg-background rounded p-2 space-y-1">
                    <div className="text-xs font-medium text-muted-foreground">Range</div>
                    <div className="grid grid-cols-3 gap-1 text-xs">
                      <div>
                        <div className="text-muted-foreground/60 text-[10px]">Gal</div>
                        <div className="text-foreground">{selectedAircraft.fuelCapacity}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground/60 text-[10px]">Burn</div>
                        <div className="text-foreground">{selectedAircraft.burnRate}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground/60 text-[10px]">Kts</div>
                        <div className="text-foreground">{selectedAircraft.speed}</div>
                      </div>
                    </div>
                    {routeStats && (
                      <div className="text-[10px] text-sky-400 pt-1 border-t border-border">
                        Max Range: {Math.round((selectedAircraft.fuelCapacity * departureFuel / 100 / selectedAircraft.burnRate) * selectedAircraft.speed)} NM
                      </div>
                    )}
                  </div>

                  {/* Route Weather Impact Button */}
                  {waypoints.length >= 2 && (
                    <div className="mt-2 pt-2 border-t border-border">
                      <button
                        onClick={fetchRouteWeather}
                        disabled={loadingRouteWeather}
                        className={`w-full text-xs px-2 py-1.5 rounded transition ${
                          routeWeather
                            ? 'bg-amber-600 hover:bg-amber-500 text-foreground'
                            : 'bg-secondary hover:bg-secondary/80 text-muted-foreground'
                        }`}
                      >
                        {loadingRouteWeather ? '💨 Calculating...' : routeWeather ? '💨 Update Wind Impact' : '💨 Calculate Wind Impact'}
                      </button>
                      
                      {routeWeather && (
                        <div className="mt-2 space-y-1">
                          <div className={`text-xs font-medium px-2 py-1 rounded ${
                            routeWeather.summary.significant 
                              ? routeWeather.summary.fuelImpactPercent > 0 
                                ? 'bg-red-900/50 text-red-400'
                                : 'bg-green-900/50 text-green-400'
                              : 'bg-background text-muted-foreground'
                          }`}>
                            {routeWeather.summary.significant ? (
                              routeWeather.summary.fuelImpactPercent > 0 
                                ? `⚠️ +${routeWeather.summary.fuelImpactPercent}% fuel (${routeWeather.summary.fuelImpact} gal more)`
                                : `✓ ${routeWeather.summary.fuelImpactPercent}% fuel saved (${Math.abs(routeWeather.summary.fuelImpact)} gal less)`
                            ) : (
                              `✓ Minimal wind impact (${routeWeather.summary.fuelImpactPercent}% change)`
                            )}
                          </div>
                          <div className="text-[10px] text-muted-foreground/60 px-1">
                            GS: {routeWeather.summary.totalTimeWithWind}min vs {routeWeather.summary.totalTimeStillAir}min still air
                          </div>
                        </div>
                      )}
                    </div>
                    )}
                  </div>
                ) : activeTab === 'wb' ? (
                  /* Weight & Balance Tab */
                  <div className="p-2 space-y-3">
                    <div className="text-sm font-semibold text-foreground">⚖️ Weight & Balance</div>
                    
                    {/* Aircraft Selection */}
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Aircraft</label>
                      <select
                        value={selectedAircraft.name}
                        onChange={(e) => {
                          const ac = AIRCRAFT_PROFILES.find(p => p.name === e.target.value);
                          if (ac) setSelectedAircraft(ac);
                        }}
                        className="w-full bg-background border border-border rounded px-2 py-1.5 text-foreground text-xs"
                      >
                        {[...new Set(AIRCRAFT_PROFILES.map(p => p.manufacturer))].map(mfr => (
                          <optgroup key={mfr} label={mfr}>
                            {AIRCRAFT_PROFILES.filter(p => p.manufacturer === mfr).map(p => (
                              <option key={p.name} value={p.name}>{p.name}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>

                    {/* Weight Inputs */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Front Seats (lbs)</label>
                        <input
                          type="number"
                          value={wbFrontPax}
                          onChange={(e) => setWbFrontPax(Number(e.target.value))}
                          className="w-full bg-background border border-border rounded px-2 py-1.5 text-foreground text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Rear Seat 1 (lbs)</label>
                        <input
                          type="number"
                          value={wbRearPax1}
                          onChange={(e) => setWbRearPax1(Number(e.target.value))}
                          className="w-full bg-background border border-border rounded px-2 py-1.5 text-foreground text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Rear Seat 2 (lbs)</label>
                        <input
                          type="number"
                          value={wbRearPax2}
                          onChange={(e) => setWbRearPax2(Number(e.target.value))}
                          className="w-full bg-background border border-border rounded px-2 py-1.5 text-foreground text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Baggage 1 (lbs)</label>
                        <input
                          type="number"
                          value={wbBaggage1}
                          onChange={(e) => setWbBaggage1(Number(e.target.value))}
                          className="w-full bg-background border border-border rounded px-2 py-1.5 text-foreground text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Baggage 2 (lbs)</label>
                        <input
                          type="number"
                          value={wbBaggage2}
                          onChange={(e) => setWbBaggage2(Number(e.target.value))}
                          className="w-full bg-background border border-border rounded px-2 py-1.5 text-foreground text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Fuel (gal)</label>
                        <input
                          type="number"
                          value={wbFuel}
                          onChange={(e) => setWbFuel(Number(e.target.value))}
                          className="w-full bg-background border border-border rounded px-2 py-1.5 text-foreground text-xs"
                        />
                      </div>
                    </div>

                    {/* Calculate W&B */}
                    {(() => {
                      const ac = selectedAircraft;
                      const fuelWeight = wbFuel * 6; // 6 lbs per gallon for 100LL
                      const emptyMoment = ac.emptyWeight * ac.emptyCG;
                      const frontMoment = wbFrontPax * (ac.arms?.frontSeats || 37);
                      const rear1Moment = wbRearPax1 * (ac.arms?.rearSeats || 73);
                      const rear2Moment = wbRearPax2 * (ac.arms?.rearSeats || 73);
                      const bag1Moment = wbBaggage1 * (ac.arms?.baggage1 || 95);
                      const bag2Moment = wbBaggage2 * (ac.arms?.baggage2 || 123);
                      const fuelMoment = fuelWeight * (ac.arms?.fuel || 48);
                      
                      const totalWeight = ac.emptyWeight + wbFrontPax + wbRearPax1 + wbRearPax2 + wbBaggage1 + wbBaggage2 + fuelWeight;
                      const totalMoment = emptyMoment + frontMoment + rear1Moment + rear2Moment + bag1Moment + bag2Moment + fuelMoment;
                      const cg = totalMoment / totalWeight;
                      const cgInLimits = cg >= (ac.cgLimits?.forward || 35) && cg <= (ac.cgLimits?.aft || 47.3);
                      
                      return (
                        <div className="bg-background rounded p-3 space-y-2">
                          {/* Weight Summary */}
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Empty:</span>
                              <span className="text-foreground">{ac.emptyWeight} lbs</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Payload:</span>
                              <span className="text-foreground">{wbFrontPax + wbRearPax1 + wbRearPax2 + wbBaggage1 + wbBaggage2} lbs</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Fuel:</span>
                              <span className="text-foreground">{fuelWeight} lbs</span>
                            </div>
                            <div className="flex justify-between font-medium">
                              <span className="text-muted-foreground">Total:</span>
                              <span className={totalWeight > ac.maxWeight ? 'text-red-400' : 'text-foreground'}>{totalWeight} lbs</span>
                            </div>
                          </div>
                          
                          {/* CG Display */}
                          <div className="pt-2 border-t border-border">
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-muted-foreground">CG:</span>
                              <span className={cgInLimits ? 'text-emerald-400' : 'text-red-400'}>{cg.toFixed(1)}"</span>
                            </div>
                            <div className="h-2 bg-secondary rounded-full overflow-hidden">
                              <div 
                                className={`h-full transition-all ${cgInLimits ? 'bg-emerald-500' : 'bg-red-500'}`}
                                style={{ 
                                  width: `${Math.min(100, Math.max(0, ((cg - (ac.cgLimits?.forward || 35)) / ((ac.cgLimits?.aft || 47.3) - (ac.cgLimits?.forward || 35))) * 100))}%`,
                                  marginLeft: `${Math.min(100, Math.max(0, ((cg - (ac.cgLimits?.forward || 35)) / ((ac.cgLimits?.aft || 47.3) - (ac.cgLimits?.forward || 35))) * 100))}%`
                                }}
                              />
                            </div>
                            <div className="flex justify-between text-[10px] text-muted-foreground/60 mt-1">
                              <span>{(ac.cgLimits?.forward || 35)}"</span>
                              <span className={cgInLimits ? 'text-emerald-400' : 'text-red-400'}>
                                {cgInLimits ? '✓ Within Limits' : '⚠️ Out of Limits'}
                              </span>
                              <span>{(ac.cgLimits?.aft || 47.3)}"</span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                    
                    <div className="text-xs text-muted-foreground/60">
                      Arms and limits based on POH data for selected aircraft.
                    </div>
                  </div>
                ) : activeTab === 'e6b' ? (
                /* E6B Calculator Tab */
                <div className="p-3 space-y-4">
                  <div className="text-sm font-semibold text-foreground">🧮 E6B Wind Correction</div>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">True Airspeed (TAS)</label>
                      <input
                        type="number"
                        value={e6bTAS}
                        onChange={(e) => setE6bTAS(Number(e.target.value))}
                        className="w-full bg-background border border-border rounded px-3 py-2 text-foreground text-sm"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Heading (°)</label>
                      <input
                        type="number"
                        value={e6bHeading}
                        onChange={(e) => setE6bHeading(Number(e.target.value))}
                        className="w-full bg-background border border-border rounded px-3 py-2 text-foreground text-sm"
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Wind From (°)</label>
                        <input
                          type="number"
                          value={e6bWindDir}
                          onChange={(e) => setE6bWindDir(Number(e.target.value))}
                          className="w-full bg-background border border-border rounded px-3 py-2 text-foreground text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Wind Speed (kts)</label>
                        <input
                          type="number"
                          value={e6bWindspeed}
                          onChange={(e) => setE6bWindspeed(Number(e.target.value))}
                          className="w-full bg-background border border-border rounded px-3 py-2 text-foreground text-sm"
                        />
                      </div>
                    </div>
                    
                    <button
                      onClick={calculateE6B}
                      className="w-full bg-sky-600 hover:bg-sky-500 text-foreground font-medium py-2 rounded text-sm"
                    >
                      Calculate
                    </button>
                    
                    {e6bResult && (
                      <div className="bg-background rounded p-3 space-y-2">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground text-sm">Ground Speed:</span>
                          <span className="text-foreground font-bold">{e6bResult.groundSpeed} kts</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground text-sm">Track:</span>
                          <span className="text-foreground font-bold">{e6bResult.track}°</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground text-sm">Wind Correction:</span>
                          <span className={`font-bold ${e6bResult.windCorrection > 0 ? 'text-amber-400' : e6bResult.windCorrection < 0 ? 'text-blue-400' : 'text-foreground'}`}>
                            {e6bResult.windCorrection > 0 ? '+' : ''}{e6bResult.windCorrection}°
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="text-xs text-muted-foreground/60">
                    Use weather data from your route to get wind info for accurate calculations.
                  </div>
                </div>
              ) : (
                /* Waypoints Tab */
                <div className="p-1.5">
                  {/* Weather Toggle */}
                  <div className="flex items-center justify-between mb-2 px-1">
                    <span className="text-xs text-muted-foreground">{waypoints.length} waypoints</span>
                    <button
                      onClick={() => {
                        if (!showWeather) {
                          fetchWaypointWeather();
                        }
                        setShowWeather(!showWeather);
                      }}
                      disabled={weatherLoading}
                      className={`text-xs px-2 py-1 rounded transition ${
                        showWeather 
                          ? 'bg-sky-600 text-foreground' 
                          : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                      }`}
                    >
                      {weatherLoading ? 'Loading...' : '🌤 Weather'}
                    </button>
                    
                    {/* Route buttons */}
                    <div className="flex gap-1">
                      <button
                        onClick={fitMapToWaypoints}
                        disabled={waypoints.length === 0}
                        className="flex-1 text-xs px-2 py-1 rounded bg-secondary text-muted-foreground hover:bg-secondary/80 disabled:opacity-30 min-w-[60px]"
                        title="Fit map to show all waypoints"
                      >
                        ⊙ Fit
                      </button>
                      <button
                        onClick={toggleRoundTrip}
                        disabled={waypoints.length < 2}
                        className="flex-1 text-xs px-2 py-1 rounded bg-secondary text-muted-foreground hover:bg-secondary/80 disabled:opacity-30 min-w-[60px]"
                        title={waypoints[0]?.icao === waypoints[waypoints.length-1]?.icao ? "Remove return leg" : "Add return leg"}
                      >
                        {waypoints[0]?.icao === waypoints[waypoints.length-1]?.icao ? '↩️ One-way' : '🔄 Round Trip'}
                      </button>
                      <button
                        onClick={optimizeRoute}
                        disabled={waypoints.length < 3}
                        className="flex-1 text-xs px-2 py-1 rounded bg-secondary text-muted-foreground hover:bg-secondary/80 disabled:opacity-30 min-w-[60px]"
                        title="Optimize route for shortest distance"
                      >
                        ⚡ Optimize
                      </button>
                    </div>
                  </div>

                  {waypoints.length > 0 && (
                    <div className="space-y-1">
                      {waypoints.map((wp, i) => {
                        const legInfo = routeStats?.legs?.[i];
                        
                        return (
                          <div key={wp.id} className="bg-background rounded p-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <span className="w-5 h-5 rounded-full bg-sky-600 text-foreground flex items-center justify-center font-bold text-xs">
                                  {i + 1}
                                </span>
                                <div>
                                  <div className="font-medium text-foreground text-xs">{wp.icao}</div>
                                  <div className="text-xs text-muted-foreground">{wp.city || wp.name}</div>
                                </div>
                              </div>
                              <div className="flex gap-0.5">
                                <button 
                                  onClick={() => moveWaypoint(wp.id, 'up')}
                                  disabled={i === 0}
                                  className="text-muted-foreground hover:text-foreground disabled:opacity-30 text-xs p-0.5"
                                >↑</button>
                                <button 
                                  onClick={() => moveWaypoint(wp.id, 'down')}
                                  disabled={i === waypoints.length - 1}
                                  className="text-muted-foreground hover:text-foreground disabled:opacity-30 text-xs p-0.5"
                                >↓</button>
                                <button 
                                  onClick={() => removeWaypoint(wp.id)}
                                  className="text-red-400 hover:text-red-300 text-xs p-0.5"
                                >✕</button>
                              </div>
                            </div>
                            
                            {/* Leg stats - shows for all except last waypoint */}
                            {legInfo && (
                              <div className="mt-1 pt-1 border-t border-border flex justify-between text-xs">
                                <span className="text-sky-400">→ {legInfo.to.icao}</span>
                                <span className="text-amber-400">{Math.round(legInfo.distance)}NM</span>
                                <span className="text-emerald-400">${legInfo.cost.toFixed(0)}</span>
                              </div>
                            )}

                            {/* Weather info for this waypoint */}
                            {showWeather && waypointWeather[wp.icao] && (
                              <div className="mt-2 pt-2 border-t border-border text-xs space-y-1">
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Flight Cat:</span>
                                  <span className={`font-medium ${
                                    waypointWeather[wp.icao].flightCategory === 'VFR' ? 'text-green-400' :
                                    waypointWeather[wp.icao].flightCategory === 'MVFR' ? 'text-blue-400' :
                                    waypointWeather[wp.icao].flightCategory === 'IFR' ? 'text-red-400' :
                                    'text-purple-400'
                                  }`}>
                                    {waypointWeather[wp.icao].flightCategory || 'N/A'}
                                  </span>
                                </div>
                                {waypointWeather[wp.icao].isForecast && (
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Type:</span>
                                    <span className="text-amber-400 text-xs">☁️ Forecast</span>
                                  </div>
                                )}
                                {waypointWeather[wp.icao].ws && (
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Wind:</span>
                                    <span className="text-foreground">
                                      {waypointWeather[wp.icao].ws.value}@{waypointWeather[wp.icao].wd?.value}°
                                    </span>
                                  </div>
                                )}
                                {waypointWeather[wp.icao].temp && (
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Temp:</span>
                                    <span className="text-foreground">{waypointWeather[wp.icao].temp}°C</span>
                                  </div>
                                )}
                                {waypointWeather[wp.icao].altimeter && (
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Alt:</span>
                                    <span className="text-foreground">{(waypointWeather[wp.icao].altimeter / 100).toFixed(2)}"</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              
              {/* Trip Finder - only in Tools tab */}
              {activeTab === 'e6b' && (
                <>
                  {/* NOTAMs Panel - shown in sidebar when there are waypoints */}
                  {waypoints.length > 0 && (
                    <NotamsPanel 
                      waypoints={waypoints} 
                      isPro={isPro}
                    />
                  )}
                  
                  <TripFinder
                  airports={airports}
                  waypoints={waypoints}
                  aircraft={selectedAircraft}
                  fuelPrices={fuelPrices}
                  onAddWaypoint={(airport) => addWaypoint(airport)}
                />

                  {/* Post-flight review: planned vs actual flown track */}
                  <div className="mt-3">
                    <PostFlightReview
                      plannedWaypoints={waypoints}
                      tasKts={selectedAircraft.speed}
                      burnGph={selectedAircraft.burnRate}
                    />
                  </div>
                </>
              )}
            </div>

            {/* Bottom Actions - Load/Save/Import */}
            <div className="p-2 border-t border-border bg-card flex-shrink-0 space-y-1">
              {/* Import Button */}
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Import Flight Plan</label>
                <input
                  type="file"
                  accept=".gpx,.fpl,.json,.csv"
                  onChange={handleFileUpload}
                  className="w-full text-xs text-muted-foreground file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-medium file:bg-secondary file:text-foreground hover:file:bg-slate-500"
                />
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => {
                    if (status === 'loading') return;
                    if (status !== 'authenticated') {
                      setAuthModalAction('load');
                      setAuthModalOpen(true);
                    } else {
                      setShowPlanList(!showPlanList);
                    }
                  }}
                  className="flex-1 bg-secondary hover:bg-secondary/80 text-foreground font-medium py-1.5 rounded text-xs"
                >
                  Load {savedPlans.length > 0 && `(${savedPlans.length})`}
                </button>
                <button
                  onClick={() => {
                    if (status === 'loading') return;
                    if (status !== 'authenticated') {
                      setAuthModalAction('save');
                      setAuthModalOpen(true);
                    } else {
                      saveFlightPlan();
                    }
                  }}
                  disabled={!canSave}
                  className={`flex-1 font-medium py-1.5 rounded text-xs ${canSave ? 'bg-emerald-500 hover:bg-emerald-600 text-foreground' : 'bg-secondary text-muted-foreground cursor-not-allowed'}`}
                >
                  Save
                </button>
              </div>
              
              {/* Saved Plans List */}
              {showPlanList && (
                <div className="bg-background rounded p-1.5 space-y-1 max-h-24 overflow-y-auto">
                  {status === 'authenticated' ? (
                    <div className="flex items-center justify-between text-xs text-emerald-400">
                      <span>Logged in as {session?.user?.email}</span>
                      <button onClick={() => signOut()} className="text-muted-foreground hover:text-foreground">Sign out</button>
                    </div>
                  ) : (
                    <button 
                      onClick={() => signIn()} 
                      className="w-full text-xs bg-secondary hover:bg-secondary/80 rounded py-1.5 text-sky-400"
                    >
                      Log in to save plans to your account
                    </button>
                  )}
                  
                  {savedPlans.length > 0 ? (
                    <>
                      <div className="text-sm font-semibold text-muted-foreground">Saved Plans ({savedPlans.length})</div>
                      {savedPlans.map((plan, i) => (
                        <div key={plan.id || i} className="flex items-center justify-between bg-secondary rounded p-2 text-sm">
                          <button onClick={() => loadFlightPlan(plan)} className="text-left flex-1 hover:text-sky-400">
                            <div className="font-medium flex items-center gap-2">
                              {plan.name || 'Untitled'}
                              {plan.isDemo && (
                                <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">DEMO</span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {plan.departureIcao || '---'} → {plan.arrivalIcao || '---'} • {plan.waypoints?.length || 0} waypoints
                            </div>
                          </button>
                          {!plan.isDemo && (
                            <button onClick={() => deleteFlightPlan(plan.id || i)} className="text-red-400 hover:text-red-300 px-2">✕</button>
                          )}
                        </div>
                      ))}
                    </>
                  ) : (
                    <div className="text-xs text-muted-foreground text-center py-2">No saved plans</div>
                  )}
                </div>
              )}
            </div>
          </div>
          )}
        </div>

        {/* Right Side - Map and Bottom Stats */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Map Section */}
          <div className="flex-1 overflow-hidden relative">
            {!mapLoaded ? (
              <div className="h-full flex items-center justify-center bg-card">
                <button onClick={() => setMapLoaded(true)} className="bg-sky-500 hover:bg-sky-600 text-foreground px-4 py-2 rounded-lg text-sm">
                  Load Map
                </button>
              </div>
            ) : (
              <>
                <LeafletMap
                  key={showPanel ? 'map-open' : 'map-closed'}
                  airports={airports.filter(a => {
                    // Filter by airport type
                    if (a.type === 'large_airport' && !mapOptions.showLarge) return false;
                    if (a.type === 'medium_airport' && !mapOptions.showMedium) return false;
                    if (a.type === 'small_airport' && !mapOptions.showSmall) return false;
                    if (a.type === 'seaplane_base' && !mapOptions.showSeaplane) return false;
                    // Filter by region - hide Canada/Mexico unless toggle is on
                    if (!showInternational && !isNorthAmerica(a)) return false;
                    return true;
                  })}
                  waypoints={waypoints}
                  fuelPrices={fuelPrices}
                  onBoundsChange={setMapBounds}
                  onAirportClick={handleAirportAdd}
                  mapCenter={mapCenter}
                  mapZoom={mapZoom}
                  showTerrain={performanceSettings.showTerrain}
                  showStateOverlay={mapOptions.showStatePrices}
                  showTfrs={mapOptions.showTfrs}
                  showPireps={mapOptions.showPireps}
                  onStateClick={setSelectedStateInfo}
                  onViewStateInfo={handleViewStateInfo}
                  baseLayer={mapOptions.baseLayer}
                  performanceMode={mapOptions.performanceMode}
                />
                {selectedStateInfo && (
                  <StateInfoPanel
                    stateInfo={selectedStateInfo}
                    onClose={() => setSelectedStateInfo(null)}
                    onAirportClick={(icao) => {
                      // Find and add airport to route
                      const airport = airports.find(a => a.icao === icao);
                      if (airport) {
                        handleAirportAdd(airport);
                      }
                    }}
                  />
                )}
                {/* International Toggle - Hidden by default, shows Canada/Mexico */}
                <div className="absolute top-4 left-4 z-[1001]">
                  <button
                    onClick={() => setShowInternational(!showInternational)}
                    className={`px-2 py-1.5 text-xs rounded-lg shadow-lg border transition-colors ${
                      showInternational 
                        ? 'bg-emerald-600 border-emerald-500 text-foreground' 
                        : 'bg-card/90 border-border text-muted-foreground hover:bg-background'
                    }`}
                    title={showInternational ? 'Hiding Canada/Mexico airports' : 'Show Canada/Mexico airports'}
                  >
                    🌍 Intl {showInternational ? 'ON' : 'OFF'}
                  </button>
                </div>
                <PerformanceSettingsPanel onSettingsChange={setPerformanceSettings} />
                <MapControls 
                  options={mapOptions} 
                  onOptionsChange={setMapOptions}
                />
              </>
            )}
          </div>

          {/* Bottom Stats Bar - Full Width */}
          {routeStats && (
            <div className="bg-card border-t border-border p-3 flex-shrink-0">
              {/* Cost Settings Toggle */}
              <div className="flex gap-2 mb-2">
                <label className="flex items-center gap-1 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeLandingFees}
                    onChange={(e) => setIncludeLandingFees(e.target.checked)}
                    className="rounded"
                  />
                  <span className={includeLandingFees ? 'text-foreground' : 'text-muted-foreground/60'}>Landing</span>
                </label>
                <label className="flex items-center gap-1 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeFboFees}
                    onChange={(e) => setIncludeFboFees(e.target.checked)}
                    className="rounded"
                  />
                  <span className={includeFboFees ? 'text-foreground' : 'text-muted-foreground/60'}>FBO</span>
                </label>
              </div>
              
              <div className="flex items-center justify-between">
                {/* Main Stats */}
                <div className="flex gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-sky-400">{Math.round(routeStats.totalDistance)}</div>
                    <div className="text-xs text-muted-foreground/60 uppercase tracking-wider">NM</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-amber-400">{routeStats.flightHours}h</div>
                    <div className="text-xs text-muted-foreground/60 uppercase tracking-wider">Flight Time</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-400">{routeStats.fuelNeeded}</div>
                    <div className="text-xs text-muted-foreground/60 uppercase tracking-wider">Gal Fuel</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-emerald-400">${routeStats.estimatedCost}</div>
                    <div className="text-xs text-muted-foreground/60 uppercase tracking-wider">Total</div>
                  </div>
                  {soulsOnBoard > 1 && (
                    <div className="text-center">
                      <div className="text-2xl font-bold text-cyan-400">${routeStats.costPerPerson}</div>
                      <div className="text-xs text-muted-foreground/60 uppercase tracking-wider">Per Person</div>
                    </div>
                  )}
                </div>

                {/* Aircraft Info */}
                <div className="hidden md:block text-right">
                  <div className="text-sm font-medium text-foreground">{selectedAircraft.name}</div>
                  <div className="text-xs text-muted-foreground">{selectedAircraft.speed} kts • {selectedAircraft.burnRate} gph</div>
                </div>
              </div>
              
              {/* Leg Breakdown - Drag and Drop */}
              {routeStats.legs.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border flex gap-2 overflow-x-auto pb-1">
                  {routeStats.legs.map((leg, toIdx) => {
                    const isDragging = draggedLegIndex === toIdx;
                    const isDragOver = draggedLegIndex !== null && draggedLegIndex !== toIdx;
                    
                    return (
                      <div
                        key={toIdx}
                        draggable
                        onDragStart={(e) => {
                          setDraggedLegIndex(toIdx);
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', String(toIdx));
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                        }}
                        onDragEnter={(e) => {
                          e.preventDefault();
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const fromIdx = draggedLegIndex;
                          if (fromIdx !== null && fromIdx !== toIdx) {
                            // When dropping leg fromIdx onto leg toIdx:
                            // - Take waypoint at position fromIdx + 1 (destination of dragged leg)
                            // - Move it to position toIdx + 1
                            const newWaypoints = [...waypoints];
                            const movedWp = newWaypoints[fromIdx + 1];
                            newWaypoints.splice(fromIdx + 1, 1);
                            newWaypoints.splice(toIdx + 1, 0, movedWp);
                            setWaypoints(newWaypoints.map((w, idx) => ({ ...w, sequence: idx })));
                          }
                          setDraggedLegIndex(null);
                        }}
                        onDragEnd={() => setDraggedLegIndex(null)}
                        className={`flex-shrink-0 bg-background rounded px-3 py-2 text-xs cursor-move select-none transition-all ${
                          isDragging ? 'opacity-30 scale-95 ring-2 ring-sky-500' : 
                          isDragOver ? 'ring-2 ring-amber-500 scale-105 bg-secondary' : 
                          'hover:bg-secondary hover:scale-105'
                        }`}
                        style={{ touchAction: 'none' }}
                      >
                        <span className="text-sky-400 font-medium">{leg.from.icao}</span>
                        <span className="text-muted-foreground/60 mx-1">→</span>
                        <span className="text-amber-400 font-medium">{leg.to.icao}</span>
                        <div className="text-muted-foreground mt-1">{Math.round(leg.distance)} NM • ${leg.cost.toFixed(0)}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Mobile Orientation Warning Popup */}
      {showOrientationWarning && (
        <div className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center p-8">
          <div className="text-center">
            {/* Phone Rotation Animation */}
            <div className="mb-8 relative w-24 h-40 mx-auto border-4 border-white rounded-3xl bg-card">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-16 h-1 bg-white rounded animate-pulse"></div>
              </div>
              <div className="absolute top-2 left-1/2 -translate-x-1/2 w-2 h-2 bg-secondary rounded-full"></div>
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-8 h-1 bg-secondary rounded"></div>
            </div>
            {/* Arrow Animation */}
            <div className="mb-6 text-6xl animate-bounce">↻</div>
            <h2 className="text-2xl font-bold text-foreground mb-2">Rotate Your Phone</h2>
            <p className="text-muted-foreground mb-6">For the best experience, please rotate your phone to landscape mode.</p>
            <button
              onClick={() => {
                setOrientationDismissed(true);
                setShowOrientationWarning(false);
              }}
              className="bg-sky-500 hover:bg-sky-600 text-foreground px-6 py-3 rounded-lg font-medium"
            >
              Continue Anyway
            </button>
          </div>
        </div>
      )}

      {/* Auth Modal */}
      <AuthModal 
        isOpen={authModalOpen} 
        onClose={() => setAuthModalOpen(false)} 
        action={authModalAction}
        onConfirm={() => {
          if (authModalAction === 'save') {
            saveFlightPlan();
          }
        }}
      />

      {/* Upgrade Modal */}
      <UpgradeModal 
        isOpen={upgradeModalOpen} 
        onClose={() => setUpgradeModalOpen(false)}
        feature={upgradeFeature}
      />

      {/* Tier Explainer Modal */}
      <TierExplainerModal 
        isOpen={showTierExplainer} 
        onClose={() => setShowTierExplainer(false)}
      />
    </div>
  );
}

// Wrapper component with Suspense for useSearchParams
export default function FuelSaverPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    }>
      <FuelSaverContent />
    </Suspense>
  );
}
