// ── PIREP ──
export interface PirepData {
  rawText: string
  type: 'icing' | 'turbulence' | 'sky' | 'ui'
  severity?: 'light' | 'moderate' | 'severe' | 'extreme'
  altitudeFt?: number
  aircraftType?: string
  location: { lat: number; lon: number }
  time?: string
}

// ── TFR ──
export interface TfrData {
  notamId: string
  type: string
  description: string
  polygon: [number, number][]
  validFrom?: string
  validTo?: string
  facility?: string
  state?: string
}

// ── NOTAM (per-airport) ──
export interface NotamData {
  icao: string
  count: number
  notams: string[]
}

// ── Surface observation (derived from METAR) ──
export interface SurfaceObs {
  icao: string
  lat: number
  lon: number
  tempC?: number
  windDirDeg?: number
  windSpeedKts?: number
  windGustKts?: number
  visibilitySm?: number
  ceilingFt?: number
  flightCategory?: FlightCategory
}

// ── METAR ──
export interface MetarData {
  icao: string
  observationTime?: string
  rawText?: string
  tempC?: number
  dewpointC?: number
  windDirDeg?: number
  windSpeedKts?: number
  windGustKts?: number
  visibilitySm?: number
  altimeterHg?: number
  flightCategory?: FlightCategory
  ceilingFt?: number
  humidity?: number
}

export type FlightCategory = 'VFR' | 'MVFR' | 'IFR' | 'LIFR'

export function flightCategoryColor(cat: FlightCategory): string {
  switch (cat) {
    case 'VFR': return 'text-green-600 dark:text-green-400'
    case 'MVFR': return 'text-blue-600 dark:text-blue-400'
    case 'IFR': return 'text-red-600 dark:text-red-400'
    case 'LIFR': return 'text-purple-600 dark:text-purple-400'
  }
}

export function flightCategoryBg(cat: FlightCategory): string {
  switch (cat) {
    case 'VFR': return 'bg-green-500/10 border-green-500/30'
    case 'MVFR': return 'bg-blue-500/10 border-blue-500/30'
    case 'IFR': return 'bg-red-500/10 border-red-500/30'
    case 'LIFR': return 'bg-purple-500/10 border-purple-500/30'
  }
}

// ── TAF ──
export interface TafData {
  icao: string
  rawText?: string
  issueTime?: string
  validFrom?: string
  validTo?: string
}

// ── Winds Aloft ──
export interface WindsAloftPoint {
  altitudeFt: number
  windDirDeg: number
  windSpeedKts: number
  tempC?: number
}

export interface WindsAloftData {
  icao: string
  levels: WindsAloftPoint[]
}

// ── Hazards ──
export interface HazardData {
  type: 'AIRMET' | 'SIGMET' | 'TFR' | 'NOTAM' | 'PIREP'
  title: string
  description: string
  severity: 'advisory' | 'warning' | 'caution'
  location?: string
  validFrom?: string
  validTo?: string
}

// ── Route Weather ──
export interface RouteWeatherSegment {
  from: string
  to: string
  distanceNm: number
  windDirDeg: number
  windSpeedKts: number
  groundSpeedKts: number
  timeStillAirMin: number
  timeWithWindMin: number
}

export interface RouteWeatherImpact {
  totalDistanceNm: number
  totalTimeStillAirMin: number
  totalTimeWithWindMin: number
  fuelImpactPercent: number
  segments: RouteWeatherSegment[]
}

// ── Freezing Level ──
export interface FreezingLevel {
  altitudeFt: number
  source: 'estimated' | 'winds_aloft'
}

// ── Pilot Cert Status ──
export interface PilotCertStatus {
  hasInstrumentRating: boolean
  licenseType: 'PPL' | 'CPL' | 'ATP' | 'Student' | 'Recreational' | 'Unknown'
  medicalClass: 1 | 2 | 3 | null
  medicalExpiry: string | null
  medicalExpired: boolean
  bfrCurrent: boolean
  bfrExpiry: string | null
  ipcCurrent: boolean
  nightCurrency: { completed: number; required: number; current: boolean }
  ifrCurrency: { completed: number; required: number; current: boolean }
  dayCurrency: { completed: number; required: number; current: boolean }
}

// ── Weather Warnings ──
export type WarningSeverity = 'warning' | 'caution' | 'info'

export interface WeatherWarning {
  severity: WarningSeverity
  message: string
  detail?: string
  rule: string
}

// ── Full Briefing ──
export interface WeatherBriefing {
  departureIcao: string
  destinationIcao?: string
  metarDeparture?: MetarData
  metarDestination?: MetarData
  tafDeparture?: TafData
  tafDestination?: TafData
  windsAloft?: WindsAloftData[]
  hazards?: HazardData[]
  routeWeather?: RouteWeatherImpact
  freezingLevel?: FreezingLevel
  warnings?: WeatherWarning[]
  pilotStatus?: PilotCertStatus
  briefingTime: string
}
