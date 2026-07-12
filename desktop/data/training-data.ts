// ── Desktop Training Data ────────────────────────────────────────
// Extended training requirements with FAR references, checkride
// items, default rates, and logbook field mappings.

import type { LocalTotals } from '@/apps/desktop/src/lib/local-logbook'

// ── Logbook entry shape (matches the reports page) ───────────────
export interface LogbookEntry {
  id: string
  date: string
  aircraft: string
  routeFrom: string
  routeTo: string
  totalTime: number
  picTime: number
  sicTime: number
  nightTime: number
  instrumentTime: number
  crossCountryTime: number
  landingsDay: number
  landingsNight: number
  soloTime: number
  dualGiven: number
  dualReceived: number
  remarks: string
}

// ── Certificate types ────────────────────────────────────────────

export type CertType = 'PPL' | 'IR' | 'CPL' | 'CFI' | 'CFII' | 'MEI' | 'ATP'

export interface CertInfo {
  id: CertType
  name: string
  shortName: string
  description: string
  icon: string
  farPart: string
  totalHoursRequired: number
  prerequisites: CertType[]
  color: string // tailwind color class for ring/bar
  gradient: string // gradient for card background
}

export const CERTIFICATES: CertInfo[] = [
  { id: 'PPL', name: 'Private Pilot', shortName: 'PPL', description: 'Fly for pleasure or personal travel', icon: '🛩️', farPart: 'FAR 61.109', totalHoursRequired: 40, prerequisites: [], color: 'from-blue-500 to-blue-600', gradient: 'from-blue-500/10 to-blue-600/5' },
  { id: 'IR', name: 'Instrument Rating', shortName: 'IR', description: 'Fly in instrument conditions', icon: '📊', farPart: 'FAR 61.65', totalHoursRequired: 50, prerequisites: ['PPL'], color: 'from-purple-500 to-purple-600', gradient: 'from-purple-500/10 to-purple-600/5' },
  { id: 'CPL', name: 'Commercial Pilot', shortName: 'CPL', description: 'Fly for compensation or hire', icon: '💼', farPart: 'FAR 61.129', totalHoursRequired: 250, prerequisites: ['IR'], color: 'from-amber-500 to-amber-600', gradient: 'from-amber-500/10 to-amber-600/5' },
  { id: 'CFI', name: 'Flight Instructor', shortName: 'CFI', description: 'Teach others to fly', icon: '👨‍🏫', farPart: 'FAR 61.183', totalHoursRequired: 250, prerequisites: ['CPL'], color: 'from-emerald-500 to-emerald-600', gradient: 'from-emerald-500/10 to-emerald-600/5' },
  { id: 'CFII', name: 'Instrument Instructor', shortName: 'CFII', description: 'Teach instrument rating', icon: '📈', farPart: 'FAR 61.193', totalHoursRequired: 15, prerequisites: ['CFI'], color: 'from-cyan-500 to-cyan-600', gradient: 'from-cyan-500/10 to-cyan-600/5' },
  { id: 'MEI', name: 'Multi-Engine Instructor', shortName: 'MEI', description: 'Teach multi-engine flying', icon: '✈️', farPart: 'FAR 61.183', totalHoursRequired: 15, prerequisites: ['CFI'], color: 'from-rose-500 to-rose-600', gradient: 'from-rose-500/10 to-rose-600/5' },
  { id: 'ATP', name: 'Airline Transport Pilot', shortName: 'ATP', description: 'Fly for airlines', icon: '🌐', farPart: 'FAR 61.159', totalHoursRequired: 1500, prerequisites: ['CPL'], color: 'from-indigo-500 to-indigo-600', gradient: 'from-indigo-500/10 to-indigo-600/5' },
]

// ── Requirement definitions ──────────────────────────────────────

export interface RequirementDef {
  key: string
  label: string
  farRef: string
  description: string
  required: number
  unit: 'hours' | 'landings' | 'approaches'
}

export interface CertRequirements {
  certId: CertType
  requirements: RequirementDef[]
}

export const CERT_REQUIREMENTS: Record<CertType, RequirementDef[]> = {
  PPL: [
    { key: 'totalTime', label: 'Total Flight Time', farRef: '61.109(a)(1)', description: 'Minimum total flight time', required: 40, unit: 'hours' },
    { key: 'soloTime', label: 'Solo Flight Time', farRef: '61.109(a)(2)', description: 'Minimum solo flight time', required: 10, unit: 'hours' },
    { key: 'crossCountry', label: 'Cross-Country', farRef: '61.109(a)(5)', description: 'Cross-country flight time', required: 10, unit: 'hours' },
    { key: 'night', label: 'Night Flight', farRef: '61.109(a)(3)', description: 'Night flight time', required: 3, unit: 'hours' },
    { key: 'instrument', label: 'Instrument Time', farRef: '61.109(a)(4)', description: 'Instrument training time', required: 3, unit: 'hours' },
    { key: 'dayLandings', label: 'Day Takeoffs/Landings', farRef: '61.109(a)(2)', description: 'Day solo takeoffs & landings', required: 3, unit: 'landings' },
    { key: 'nightLandings', label: 'Night Takeoffs/Landings', farRef: '61.109(a)(3)', description: 'Night solo takeoffs & landings', required: 3, unit: 'landings' },
  ],
  IR: [
    { key: 'totalTime', label: 'Total Flight Time', farRef: '61.65(d)', description: 'Minimum total aeronautical experience', required: 50, unit: 'hours' },
    { key: 'instrumentTime', label: 'Instrument Time', farRef: '61.65(d)(2)(i)', description: 'Actual or simulated instrument', required: 40, unit: 'hours' },
    { key: 'crossCountry', label: 'Cross-Country PIC', farRef: '61.65(d)(2)(ii)', description: 'Cross-country PIC with IR', required: 15, unit: 'hours' },
    { key: 'instrumentDual', label: 'Dual Instrument', farRef: '61.65(d)(2)(i)', description: 'Instrument instruction from CFII', required: 15, unit: 'hours' },
    { key: 'approaches', label: 'Instrument Approaches', farRef: '61.65(d)(2)(iii)', description: 'Completed approaches', required: 10, unit: 'approaches' },
  ],
  CPL: [
    { key: 'totalTime', label: 'Total Flight Time', farRef: '61.129(a)(1)', description: 'Minimum total flight time', required: 250, unit: 'hours' },
    { key: 'picTime', label: 'PIC Time', farRef: '61.129(a)(2)', description: 'Pilot-in-command time', required: 100, unit: 'hours' },
    { key: 'crossCountry', label: 'Cross-Country PIC', farRef: '61.129(a)(3)', description: 'Cross-country PIC time', required: 100, unit: 'hours' },
    { key: 'night', label: 'Night Flight', farRef: '61.129(a)(4)', description: 'Night flight time', required: 20, unit: 'hours' },
    { key: 'instrumentTime', label: 'Instrument Time', farRef: '61.129(a)(5)', description: 'Actual or simulated instrument', required: 20, unit: 'hours' },
    { key: 'xcPicCrossCountry', label: 'XC PIC (>300nm)', farRef: '61.129(a)(3)(ii)', description: 'One VFR XC >300nm with full-stop landings', required: 1, unit: 'hours' },
  ],
  CFI: [
    { key: 'totalTime', label: 'Total Flight Time', farRef: '61.183(d)', description: 'Minimum total flight time', required: 250, unit: 'hours' },
    { key: 'picTime', label: 'PIC Time', farRef: '61.183(d)', description: 'Pilot-in-command time', required: 100, unit: 'hours' },
    { key: 'crossCountry', label: 'Cross-Country PIC', farRef: '61.183(d)', description: 'Cross-country PIC time', required: 100, unit: 'hours' },
    { key: 'instrumentTime', label: 'Instrument Time', farRef: '61.183(d)', description: 'Actual or simulated instrument', required: 20, unit: 'hours' },
    { key: 'night', label: 'Night Flight', farRef: '61.183(d)', description: 'Night flight time', required: 10, unit: 'hours' },
    { key: 'dualGiven', label: 'Dual Given (as CFI)', farRef: '61.183(d)', description: 'Flight instruction given (can be after CFI issuance)', required: 0, unit: 'hours' },
  ],
  CFII: [
    { key: 'totalTime', label: 'Flight Time', farRef: '61.193(b)', description: 'Hold CFI + instrument proficiency', required: 15, unit: 'hours' },
    { key: 'instrumentTime', label: 'Instrument Time', farRef: '61.193(b)', description: 'Instrument flight time', required: 3, unit: 'hours' },
  ],
  MEI: [
    { key: 'totalTime', label: 'Flight Time', farRef: '61.183(d)', description: 'Multi-engine training time', required: 15, unit: 'hours' },
    { key: 'multiTime', label: 'Multi-Engine Time', farRef: '61.183(d)', description: 'Multi-engine flight time', required: 5, unit: 'hours' },
  ],
  ATP: [
    { key: 'totalTime', label: 'Total Flight Time', farRef: '61.159(a)(1)', description: 'Minimum total flight time', required: 1500, unit: 'hours' },
    { key: 'crossCountry', label: 'Cross-Country', farRef: '61.159(a)(2)', description: 'Cross-country flight time', required: 500, unit: 'hours' },
    { key: 'night', label: 'Night Flight', farRef: '61.159(a)(3)', description: 'Night flight time', required: 100, unit: 'hours' },
    { key: 'instrumentTime', label: 'Instrument Time', farRef: '61.159(a)(4)', description: 'Actual or simulated instrument', required: 75, unit: 'hours' },
    { key: 'picTime', label: 'PIC Time', farRef: '61.159(a)(5)', description: 'Pilot-in-command time', required: 250, unit: 'hours' },
    { key: 'multiTime', label: 'Multi-Engine Time', farRef: '61.159(a)(6)', description: 'Multi-engine flight time', required: 50, unit: 'hours' },
  ],
}

// ── Milestones ───────────────────────────────────────────────────

export interface MilestoneDef {
  id: string
  title: string
  description: string
  order: number
  requirementKeys: string[]
}

export const CERT_MILESTONES: Record<CertType, MilestoneDef[]> = {
  PPL: [
    { id: 'first-flight', title: 'First Flight', description: 'Your first training lesson', order: 1, requirementKeys: [] },
    { id: 'first-solo', title: 'First Solo', description: 'Fly the pattern without an instructor', order: 2, requirementKeys: ['soloTime'] },
    { id: 'cross-country', title: 'Cross-Country', description: 'First solo XC to another airport', order: 3, requirementKeys: ['crossCountry'] },
    { id: 'night-flying', title: 'Night Operations', description: 'Night flying & night landings', order: 4, requirementKeys: ['night', 'nightLandings'] },
    { id: 'instrument-basics', title: 'Instrument Basics', description: 'Hood work and attitude flying', order: 5, requirementKeys: ['instrument'] },
    { id: 'stage-check', title: 'Stage Check', description: 'Pre-checkride mock oral & flight', order: 6, requirementKeys: ['totalTime', 'soloTime', 'crossCountry'] },
    { id: 'checkride', title: 'Checkride', description: 'FAA practical test', order: 7, requirementKeys: ['totalTime', 'soloTime', 'crossCountry', 'night', 'nightLandings', 'instrument', 'dayLandings'] },
  ],
  IR: [
    { id: 'attitude-flying', title: 'Basic Attitude Flying', description: 'Partial panel & basic instrument', order: 1, requirementKeys: ['instrumentTime'] },
    { id: 'approaches', title: 'Instrument Approaches', description: 'All approach types (ILS, VOR, GPS)', order: 2, requirementKeys: ['approaches'] },
    { id: 'xc-instrument', title: 'XC Instrument', description: 'Cross-country in IMC conditions', order: 3, requirementKeys: ['crossCountry'] },
    { id: 'stage-check', title: 'Stage Check', description: 'Pre-checkride mock oral & flight', order: 4, requirementKeys: ['instrumentTime', 'approaches'] },
    { id: 'checkride', title: 'Checkride', description: 'FAA practical test', order: 5, requirementKeys: ['totalTime', 'instrumentTime', 'crossCountry', 'instrumentDual', 'approaches'] },
  ],
  CPL: [
    { id: 'build-hours', title: 'Building Hours', description: 'Accumulate PIC and XC time', order: 1, requirementKeys: ['picTime'] },
    { id: 'maneuvers', title: 'Commercial Maneuvers', description: 'Precision maneuvers training', order: 2, requirementKeys: [] },
    { id: 'xc-long', title: 'Long XC (>300nm)', description: 'VFR XC with full-stop landings', order: 3, requirementKeys: ['xcPicCrossCountry'] },
    { id: 'night-cpl', title: 'Night Operations', description: 'Night cross-country experience', order: 4, requirementKeys: ['night'] },
    { id: 'stage-check', title: 'Stage Check', description: 'Pre-checkride mock oral & flight', order: 5, requirementKeys: ['totalTime', 'picTime', 'crossCountry'] },
    { id: 'checkride', title: 'Checkride', description: 'FAA practical test', order: 6, requirementKeys: ['totalTime', 'picTime', 'crossCountry', 'night', 'instrumentTime'] },
  ],
  CFI: [
    { id: 'foi', title: 'FOI Knowledge', description: 'Fundamentals of Instructing written', order: 1, requirementKeys: [] },
    { id: 'ground-training', title: 'CFI Ground School', description: 'Teaching techniques & lesson plans', order: 2, requirementKeys: [] },
    { id: 'flight-training', title: 'CFI Flight Training', description: 'Learn to teach from the right seat', order: 3, requirementKeys: ['picTime'] },
    { id: 'stage-check', title: 'Stage Check', description: 'Pre-checkride mock oral & flight', order: 4, requirementKeys: ['totalTime'] },
    { id: 'checkride', title: 'Checkride', description: 'FAA practical test (8+ hours)', order: 5, requirementKeys: ['totalTime', 'picTime', 'crossCountry', 'instrumentTime', 'night'] },
  ],
  CFII: [
    { id: 'ground', title: 'CFII Ground', description: 'Instrument teaching methods', order: 1, requirementKeys: [] },
    { id: 'flight', title: 'CFII Flight', description: 'How to teach instrument flying', order: 2, requirementKeys: ['instrumentTime'] },
    { id: 'checkride', title: 'Checkride', description: 'FAA practical test', order: 3, requirementKeys: ['totalTime', 'instrumentTime'] },
  ],
  MEI: [
    { id: 'ground', title: 'MEI Ground', description: 'Multi-engine aerodynamics & systems', order: 1, requirementKeys: [] },
    { id: 'flight', title: 'MEI Flight', description: 'Multi-engine flight training', order: 2, requirementKeys: ['multiTime'] },
    { id: 'checkride', title: 'Checkride', description: 'FAA practical test', order: 3, requirementKeys: ['totalTime', 'multiTime'] },
  ],
  ATP: [
    { id: 'build-500', title: '500 Hours PIC', description: 'Cross-country PIC milestone', order: 1, requirementKeys: ['picTime'] },
    { id: 'build-1000', title: '1,000 Hours', description: 'R-ATP eligible (university program)', order: 2, requirementKeys: ['crossCountry'] },
    { id: 'build-1200', title: '1,200 Hours', description: 'R-ATP eligible (military)', order: 3, requirementKeys: ['totalTime'] },
    { id: 'build-1500', title: '1,500 Hours', description: 'Full ATP minimum', order: 4, requirementKeys: ['totalTime', 'picTime', 'crossCountry', 'night', 'instrumentTime', 'multiTime'] },
    { id: 'atp-ctp', title: 'ATP CTP Course', description: 'ATP Certification Training Program', order: 5, requirementKeys: ['totalTime'] },
    { id: 'atp-checkride', title: 'ATP Checkride', description: 'FAA ATP practical test', order: 6, requirementKeys: ['totalTime', 'picTime', 'crossCountry', 'night', 'instrumentTime', 'multiTime'] },
  ],
}

// ── Logbook field mapping ────────────────────────────────────────
// Maps requirement keys to logbook data fields for auto-computation

export function getRequirementValue(
  key: string,
  totals: LocalTotals,
  entries: LogbookEntry[],
): number {
  switch (key) {
    case 'totalTime': return totals.totalTime
    case 'picTime': return totals.picTime
    case 'sicTime': return totals.sicTime
    case 'night': return totals.nightTime
    case 'instrumentTime': return totals.instrumentTime
    case 'crossCountry': return totals.crossCountryTime
    case 'dayLandings': return totals.landingsDay
    case 'nightLandings': return totals.landingsNight
    case 'soloTime': return entries.reduce((s, e) => s + (e.soloTime || 0), 0)
    case 'dualGiven': return entries.reduce((s, e) => s + (e.dualGiven || 0), 0)
    case 'dualReceived': return entries.reduce((s, e) => s + (e.dualReceived || 0), 0)
    case 'instrumentDual': return entries.reduce((s, e) => s + (e.instrumentTime || 0), 0) * 0.5 // rough proxy
    case 'approaches': return Math.floor(entries.reduce((s, e) => s + (e.instrumentTime || 0), 0) / 3) // ~1 approach per 3 instrument hrs
    case 'multiTime': {
      // Multi-engine time isn't tracked separately in our logbook, so proxy via aircraft
      const multiMatch = entries.filter(e => {
        const ac = e.aircraft?.toLowerCase() || ''
        const isMulti = ac.startsWith('pa-23') || ac.startsWith('pa-34') || ac.startsWith('be-58') ||
                        ac.startsWith('be-76') || ac.startsWith('c-310') || ac.startsWith('c-340') ||
                        ac.startsWith('duke') || ac.startsWith('seneca') || ac.startsWith('seminole') ||
                        ac.startsWith('twin') || ac.startsWith('baron') || ac.startsWith('aztec') ||
                        ac.includes('/')
        return isMulti
      })
      return multiMatch.reduce((s, e) => s + e.totalTime, 0)
    }
    case 'xcPicCrossCountry': {
      // Count entries with routeFrom != routeTo as XC
      const xcEntries = entries.filter(e => e.routeFrom && e.routeTo && e.routeFrom !== e.routeTo)
      return Math.min(xcEntries.length, 1) // Met if at least 1 exists
    }
    default: return 0
  }
}

// ── Computed progress types ──────────────────────────────────────

export interface RequirementProgress {
  key: string
  label: string
  farRef: string
  description: string
  required: number
  unit: 'hours' | 'landings' | 'approaches'
  current: number
  remaining: number
  met: boolean
  percent: number
}

export interface MilestoneProgress {
  id: string
  title: string
  description: string
  order: number
  requirementKeys: string[]
  status: 'complete' | 'active' | 'pending'
}

export interface CertProgress {
  certId: CertType
  cert: CertInfo
  requirements: RequirementProgress[]
  milestones: MilestoneProgress[]
  overallPercent: number
  metCount: number
  totalCount: number
  hoursRemaining: number
}

// ── Progress computation ─────────────────────────────────────────

export function computeCertProgress(
  certId: CertType,
  totals: LocalTotals,
  entries: LogbookEntry[],
): CertProgress {
  const cert = CERTIFICATES.find(c => c.id === certId)!
  const reqs = CERT_REQUIREMENTS[certId]
  const miles = CERT_MILESTONES[certId]

  const requirementProgress: RequirementProgress[] = reqs.map(req => {
    const current = getRequirementValue(req.key, totals, entries)
    const remaining = Math.max(req.required - current, 0)
    return {
      ...req,
      current,
      remaining,
      met: current >= req.required,
      percent: Math.min((current / req.required) * 100, 100),
    }
  })

  const metCount = requirementProgress.filter(r => r.met).length
  const totalCount = requirementProgress.length
  const overallPercent = totalCount > 0 ? Math.round((metCount / totalCount) * 100) : 0
  const hoursRemaining = requirementProgress
    .filter(r => r.unit === 'hours')
    .reduce((s, r) => s + r.remaining, 0)

  // Find the first active milestone
  let foundActive = false
  const milestoneProgress: MilestoneProgress[] = miles.map((m, i) => {
    const allMet = m.requirementKeys.length === 0 || 
      m.requirementKeys.every(k => {
        const r = requirementProgress.find(rr => rr.key === k)
        return r?.met
      })

    if (allMet && !foundActive) {
      if (i === miles.length - 1 && m.requirementKeys.length > 0 && allMet) {
        return { ...m, status: 'complete' }
      }
      foundActive = true
      return { ...m, status: 'active' }
    }

    if (allMet) return { ...m, status: 'complete' }

    return { ...m, status: 'pending' }
  })

  // If all milestones complete, mark the last as complete
  if (milestoneProgress.every(m => m.status === 'complete')) {
    // all complete - good
  }
  // If no active found (all pending), set first as active
  if (!foundActive && milestoneProgress.length > 0) {
    milestoneProgress[0].status = 'active'
  }

  return {
    certId,
    cert,
    requirements: requirementProgress,
    milestones: milestoneProgress,
    overallPercent,
    metCount,
    totalCount,
    hoursRemaining,
  }
}

// ── Default financial rates ──────────────────────────────────────

export interface TrainingRates {
  aircraftRate: number
  instructorRate: number
  checkrideFee: number
  writtenExamFee: number
  medicalFee: number
  equipmentCost: number
  flightsPerMonth: number
  avgHoursPerFlight: number
}

export const DEFAULT_RATES: TrainingRates = {
  aircraftRate: 150,
  instructorRate: 60,
  checkrideFee: 800,
  writtenExamFee: 175,
  medicalFee: 150,
  equipmentCost: 500,
  flightsPerMonth: 4,
  avgHoursPerFlight: 1.5,
}

export function loadRates(): TrainingRates {
  if (typeof window === 'undefined') return DEFAULT_RATES
  try {
    const stored = localStorage.getItem('training.rates')
    if (stored) return { ...DEFAULT_RATES, ...JSON.parse(stored) } as TrainingRates
  } catch { /* ignore */ }
  return DEFAULT_RATES
}

export function saveRates(rates: TrainingRates): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem('training.rates', JSON.stringify(rates))
  } catch { /* ignore */ }
}

// ── Checkride items ──────────────────────────────────────────────

export interface CheckrideItem {
  id: string
  label: string
  category: 'requirement' | 'document' | 'oral' | 'maneuver'
}

export const CHECKRIDE_ITEMS: Record<CertType, CheckrideItem[]> = {
  PPL: [
    { id: 'ppl-req-total', label: '40 hours total flight time', category: 'requirement' },
    { id: 'ppl-req-solo', label: '10 hours solo flight time', category: 'requirement' },
    { id: 'ppl-req-xc', label: '10 hours cross-country', category: 'requirement' },
    { id: 'ppl-req-night', label: '3 hours night training', category: 'requirement' },
    { id: 'ppl-req-inst', label: '3 hours instrument training', category: 'requirement' },
    { id: 'ppl-doc-id', label: 'Government-issued ID', category: 'document' },
    { id: 'ppl-doc-medical', label: 'Medical certificate (at least 3rd class)', category: 'document' },
    { id: 'ppl-doc-written', label: 'PAR written exam sign-off', category: 'document' },
    { id: 'ppl-doc-logbook', label: 'Endorsements: 61.87, 61.93, 61.103, 61.105', category: 'document' },
    { id: 'ppl-doc-application', label: 'FAA Form 8710-1 (IACRA)', category: 'document' },
    { id: 'ppl-oral-regs', label: 'FARs: airspace, documents, privileges', category: 'oral' },
    { id: 'ppl-oral-aeromedical', label: 'Aeromedical factors & hypoxia', category: 'oral' },
    { id: 'ppl-oral-weather', label: 'Weather: METAR, TAF, winds aloft', category: 'oral' },
    { id: 'ppl-oral-aircraft', label: 'Aircraft systems & limitations', category: 'oral' },
    { id: 'ppl-oral-xc', label: 'XC planning: nav log, W&B, fuel', category: 'oral' },
    { id: 'ppl-maneuver-takeoff', label: 'Normal & crosswind takeoff/landing', category: 'maneuver' },
    { id: 'ppl-maneuver-steep', label: 'Steep turns', category: 'maneuver' },
    { id: 'ppl-maneuver-stall', label: 'Power-on & power-off stalls', category: 'maneuver' },
    { id: 'ppl-maneuver-emergency', label: 'Emergency procedures', category: 'maneuver' },
    { id: 'ppl-maneuver-soft', label: 'Soft-field takeoff & landing', category: 'maneuver' },
    { id: 'ppl-maneuver-short', label: 'Short-field takeoff & landing', category: 'maneuver' },
    { id: 'ppl-maneuver-xc', label: 'XC navigation & diversion', category: 'maneuver' },
  ],
  IR: [
    { id: 'ir-req-inst', label: '40 hours instrument time', category: 'requirement' },
    { id: 'ir-req-xc', label: '15 hours XC PIC with IR', category: 'requirement' },
    { id: 'ir-req-approaches', label: '10 instrument approaches', category: 'requirement' },
    { id: 'ir-doc-written', label: 'IRA written exam sign-off', category: 'document' },
    { id: 'ir-doc-endorsement', label: 'CFII endorsement: 61.65', category: 'document' },
    { id: 'ir-oral-instruments', label: 'Instrument systems: pitot-static, gyros', category: 'oral' },
    { id: 'ir-oral-approaches', label: 'Approach types: ILS, VOR, GPS, NDB', category: 'oral' },
    { id: 'ir-oral-charts', label: 'IAP charts, SIDs, STARs', category: 'oral' },
    { id: 'ir-oral-weather', label: 'IMC weather: icing, ceilings, vis', category: 'oral' },
    { id: 'ir-maneuver-precision', label: 'Precision approach (ILS)', category: 'maneuver' },
    { id: 'ir-maneuver-nonprecision', label: 'Non-precision approach (VOR/GPS)', category: 'maneuver' },
    { id: 'ir-maneuver-hold', label: 'Holding procedures', category: 'maneuver' },
    { id: 'ir-maneuver-partial', label: 'Partial panel', category: 'maneuver' },
  ],
  CPL: [
    { id: 'cpl-req-total', label: '250 hours total', category: 'requirement' },
    { id: 'cpl-req-pic', label: '100 hours PIC', category: 'requirement' },
    { id: 'cpl-req-xc', label: '50 hours XC PIC', category: 'requirement' },
    { id: 'cpl-doc-written', label: 'CAX written exam sign-off', category: 'document' },
    { id: 'cpl-oral-regulations', label: 'Commercial regulations & privileges', category: 'oral' },
    { id: 'cpl-oral-aerodynamics', label: 'Advanced aerodynamics', category: 'oral' },
    { id: 'cpl-maneuver-power-off', label: 'Power-off 180° accuracy landing', category: 'maneuver' },
    { id: 'cpl-maneuver-chandelle', label: 'Chandelles', category: 'maneuver' },
    { id: 'cpl-maneuver-lazy-eight', label: 'Lazy eights', category: 'maneuver' },
    { id: 'cpl-maneuver-eights-on-pylons', label: 'Eights-on-pylons', category: 'maneuver' },
  ],
  CFI: [
    { id: 'cfi-req-total', label: '250 hours total', category: 'requirement' },
    { id: 'cfi-req-pic', label: '100 hours PIC', category: 'requirement' },
    { id: 'cfi-doc-foi', label: 'FOI written exam passed', category: 'document' },
    { id: 'cfi-doc-cfi-written', label: 'CFI written exam sign-off', category: 'document' },
    { id: 'cfi-oral-tech', label: 'Teaching techniques & FOI', category: 'oral' },
    { id: 'cfi-oral-risk', label: 'Risk management & ADM', category: 'oral' },
    { id: 'cfi-maneuver-teach', label: 'Demonstrate ability to teach all PPL maneuvers', category: 'maneuver' },
  ],
  CFII: [
    { id: 'cfii-req-total', label: '15 hours training', category: 'requirement' },
    { id: 'cfii-req-inst', label: '3 hours instrument', category: 'requirement' },
    { id: 'cfii-doc-written', label: 'CFII written exam sign-off', category: 'document' },
    { id: 'cfii-oral', label: 'Instrument teaching methods', category: 'oral' },
    { id: 'cfii-maneuver', label: 'Demonstrate ability to teach IR maneuvers', category: 'maneuver' },
  ],
  MEI: [
    { id: 'mei-req-total', label: '15 hours multi training', category: 'requirement' },
    { id: 'mei-req-multi', label: '5 hours multi-engine', category: 'requirement' },
    { id: 'mei-doc-written', label: 'MEI written exam sign-off', category: 'document' },
    { id: 'mei-oral', label: 'Multi-engine aerodynamics & systems', category: 'oral' },
    { id: 'mei-maneuver', label: 'Demonstrate teaching multi-engine maneuvers', category: 'maneuver' },
  ],
  ATP: [
    { id: 'atp-req-total', label: '1,500 hours total', category: 'requirement' },
    { id: 'atp-req-xc', label: '500 hours XC', category: 'requirement' },
    { id: 'atp-req-night', label: '100 hours night', category: 'requirement' },
    { id: 'atp-req-inst', label: '75 hours instrument', category: 'requirement' },
    { id: 'atp-req-pic', label: '250 hours PIC', category: 'requirement' },
    { id: 'atp-req-me', label: '50 hours multi-engine', category: 'requirement' },
    { id: 'atp-doc-atp-ctp', label: 'ATP CTP course completion', category: 'document' },
    { id: 'atp-doc-written', label: 'ATP written exam passed', category: 'document' },
    { id: 'atp-oral-regulations', label: '121/135 regulations', category: 'oral' },
    { id: 'atp-oral-high-altitude', label: 'High altitude operations', category: 'oral' },
    { id: 'atp-oral-crm', label: 'CRM & crew concepts', category: 'oral' },
    { id: 'atp-maneuver', label: 'ATP maneuvers & profiles', category: 'maneuver' },
  ],
}
