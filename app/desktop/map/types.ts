// Shared types for the desktop map page and its panel/toolbar components.
// Keeping these in a separate file avoids circular imports between page.tsx and components.

export interface Airport {
  icao: string
  iata?: string
  name: string
  city?: string
  latitude: number
  longitude: number
  type?: string
}

export interface Waypoint {
  id: string
  icao: string
  name: string
  latitude: number
  longitude: number
}

export interface AirportDetails {
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

export interface AirportWeather {
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

export interface RouteWeatherSummary {
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

// StoredRoute is defined in route-planner-storage.ts — re-export for convenience.
// This avoids type conflicts between our types and the storage module's types.
export type { StoredRoute } from '@/apps/desktop/src/lib/route-planner-storage'
