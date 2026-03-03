export type Authority = 'FAA' | 'EASA' | 'BOTH'

export type LogbookEntry = {
  id: string
  date: string
  aircraft: string
  routeFrom: string
  routeTo: string
  totalTime: number
  picTime: number
  sicTime: number
  soloTime: number
  dualGiven: number
  dualReceived: number
  nightTime: number
  instrumentTime: number
  crossCountryTime: number
  dayLandings: number
  nightLandings: number
  remarks?: string | null
  authority?: Authority
  isPending?: boolean
  // Void tracking (aviation compliance)
  isVoided?: boolean
  voidedAt?: string | null
  voidedBy?: string | null
  voidReason?: string | null
}

export type StartingTotals = {
  totalTime: number
  picTime: number
  sicTime: number
  nightTime: number
  instrumentTime: number
  crossCountryTime: number
  landingsDay: number
  landingsNight: number
  asOfDate?: string | null
}

export type LogbookPreferences = {
  timeDisplayFormat: string
  sumTimeMode: string
  preferredTimeZone: string
  dateInterpretation: string
  showInstructorTime: boolean
  showSicTime: boolean
  showHobbsTach: boolean
  autoFillTimes: boolean
  autoFillLandings: boolean
  includeHeliports: boolean
  estimateNight: boolean
  roundNearestTenth: boolean
  nightStartRule: string
  nightLandingRule: string
  totalsByCategoryClass: boolean
  totalsByModel: boolean
  totalsByModelFamily: boolean
  totalsByFeatures: boolean
  currencyAuthorities: string
  currencyByCategory: boolean
  currencyByModel: boolean
  allowNightTouchAndGo: boolean
  requireDayLandings: boolean
  expiredCurrencyDisplay: string
  maintenanceDueWindowDays: number
  notifyCurrencyWeekly: boolean
  notifyCurrencyOnExpiry: boolean
  notifyTotalsWeekly: boolean
  notifyTotalsMonthly: boolean
}

export type PaginatedEntriesResponse = {
  entries: LogbookEntry[]
  nextCursor: string | null
}

export type CurrencyProgressRule = {
  code: string
  authority: 'FAA' | 'EASA'
  name: string
  status: 'current' | 'expiring' | 'expired'
  progress: { required: number; completed: number; unit: string }[]
  nextDueAt?: string | null
}
