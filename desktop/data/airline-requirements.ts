// ── Airline Hiring Requirements Database ─────────────────────────
// Real-world minimum requirements for pilot positions at major airlines
// worldwide. Data sourced from official career pages, AirlinePilotCentral,
// and verified against current (2025-2026) postings.
//
// "required: false" means preferred/competitive, not strictly required.
// Hours are minimums; competitive candidates typically exceed these.

export interface RequirementValue {
  hours: number
  /** If false, this is a "preferred" rather than hard minimum */
  required: boolean
  /** Optional display override (e.g. "4-year degree") */
  label?: string
}

export interface AirlineRequirements {
  /** FAR 61.159 total time */
  totalTime?: RequirementValue
  /** Fixed-wing turbine time (total) */
  turbineTime?: RequirementValue
  /** Turbine Pilot-in-Command */
  turbinePIC?: RequirementValue
  /** Total PIC (any aircraft) */
  pic?: RequirementValue
  /** Multi-engine time */
  multiEngine?: RequirementValue
  /** Cross-country time (>50nm) */
  crossCountry?: RequirementValue
  /** Night flying time */
  night?: RequirementValue
  /** Instrument time (actual or simulated in-flight) */
  instrument?: RequirementValue
  /** Flight time in last 12 months */
  recent12mo?: RequirementValue
  /** Flight time in last 24 months */
  recent24mo?: RequirementValue
  /** SIC time */
  sic?: RequirementValue
}

export interface AirlineNonFlightReqs {
  /** e.g. "FAA ATP", "EASA ATPL (frozen)", "UK CAA ATPL" */
  certificate?: string
  /** e.g. "FAA First Class" */
  medical?: string
  /** e.g. "4-year degree preferred", "No degree required" */
  education?: string
  /** e.g. "23 years minimum" */
  age?: string
  /** e.g. "US citizenship or right to work" */
  citizenship?: string
  /** e.g. "ICAO English Level 4" */
  language?: string
  /** e.g. "FCC Restricted Radiotelephone Operator Permit" */
  additional?: string[]
  /** Notes about ATP certificate requirement */
  atpNotes?: string
}

export interface Airline {
  id: string
  name: string
  /** Category for grouping */
  category: 'major' | 'regional' | 'cargo' | 'lcc' | 'corporate' | 'european'
  /** Region */
  region: 'US' | 'EU' | 'UK'
  /** IATA/ICAO code if applicable */
  code?: string
  /** Alliance */
  alliance?: 'Star Alliance' | 'SkyTeam' | 'oneworld' | 'None' | 'Multiple'
  /** Type of operations */
  operations?: string
  /** Fleet overview */
  fleet?: string
  /** Base cities */
  bases?: string
  /** Starting pay (FO Year 1) */
  pay?: string
  /** Flow-through program */
  flow?: string
  /** Flight requirements */
  flight: AirlineRequirements
  /** Non-flight requirements */
  nonFlight: AirlineNonFlightReqs
  /** Hiring status */
  hiringStatus?: 'active' | 'limited' | 'closed'
  /** Notes */
  notes?: string
  /** Source URL */
  sourceUrl?: string
}

export type AirlineCategory = {
  id: string
  label: string
  description: string
  airlines: Airline[]
}

// ── US MAJORS ────────────────────────────────────────────────────

const usMajors: Airline[] = [
  {
    id: 'delta',
    name: 'Delta Air Lines',
    category: 'major',
    region: 'US',
    code: 'DL',
    alliance: 'SkyTeam',
    fleet: 'A220, A320, A330, A350, B737, B757, B767, B777',
    bases: 'ATL, DTW, MSP, JFK, LAX, SLC, SEA, BOS',
    pay: '$105/hr FO Year 1',
    hiringStatus: 'active',
    flight: {
      totalTime: { hours: 1500, required: true },
      turbineTime: { hours: 1000, required: false, label: 'Fixed-wing turbine preferred' },
      multiEngine: { hours: 50, required: true },
      pic: { hours: 250, required: true, label: 'PIC or SIC per 61.159(a)(5)' },
    },
    nonFlight: {
      certificate: 'FAA ATP (or ATP written completed)',
      medical: 'FAA First Class',
      education: '4-year degree highly preferred',
      age: '23 years minimum',
      citizenship: 'US work authorization without sponsorship',
      additional: ['FCC Restricted Radiotelephone Operator Permit', 'Current passport', 'Yellow Fever vaccination'],
    },
    notes: 'Most competitive US major. Turbine time is heavily weighted. College degree nearly essential.',
    sourceUrl: 'https://www.delta.com/us/en/careers/pilots/hiring-faqs',
  },
  {
    id: 'united',
    name: 'United Airlines',
    category: 'major',
    region: 'US',
    code: 'UA',
    alliance: 'Star Alliance',
    fleet: 'A319, A320, A321, B737, B757, B767, B777, B787',
    bases: 'DEN, ORD, IAH, EWR, SFO, LAX, IAD',
    pay: 'Competitive',
    hiringStatus: 'active',
    flight: {
      totalTime: { hours: 1500, required: true },
      turbineTime: { hours: 1000, required: false, label: 'Fixed-wing turbine preferred' },
      recent12mo: { hours: 100, required: false, label: '100 hours in last 12mo preferred' },
    },
    nonFlight: {
      certificate: 'Unrestricted ATP (airplane multiengine)',
      medical: 'FAA First Class',
      education: '4-year degree preferred',
      age: '23 years minimum',
      citizenship: 'US work authorization without sponsorship',
      additional: ['FCC Restricted Radiotelephone Operator Permit', 'Current passport'],
      atpNotes: 'ATP not required to apply, but must meet transition requirements before starting',
    },
    notes: 'Has Aviate career development program. Large widebody fleet (220+ aircraft).',
    sourceUrl: 'https://careers.united.com/us/en/first-officer',
  },
  {
    id: 'american',
    name: 'American Airlines',
    category: 'major',
    region: 'US',
    code: 'AA',
    alliance: 'oneworld',
    fleet: 'A319, A320, A321, B737, B777, B787',
    bases: 'DFW, CLT, ORD, MIA, PHL, PHX, LAX, JFK, DCA, LGA',
    pay: 'Competitive',
    hiringStatus: 'active',
    flight: {
      totalTime: { hours: 2500, required: true },
      turbinePIC: { hours: 1000, required: true, label: 'Turbine PIC' },
    },
    nonFlight: {
      certificate: 'FAA ATP',
      medical: 'FAA First Class',
      education: '4-year degree preferred',
      citizenship: 'US work authorization',
    },
    notes: 'Requires 2,500 TT and 1,000 turbine PIC — higher bar than Delta/UA on paper.',
    sourceUrl: 'https://jobs.aa.com/go/Pilot/9286400/',
  },
  {
    id: 'southwest',
    name: 'Southwest Airlines',
    category: 'major',
    region: 'US',
    code: 'WN',
    alliance: 'None',
    fleet: 'B737-700, B737-800, B737 MAX 7/8',
    bases: 'DAL, HOU, MDW, BWI, DEN, LAS, PHX, STL, OAK',
    pay: 'Top of industry (Captain: $365k+)',
    hiringStatus: 'active',
    flight: {
      totalTime: { hours: 2500, required: true },
      turbinePIC: { hours: 1000, required: true, label: 'Turbine PIC' },
      turbineTime: { hours: 500, required: false, label: 'Fixed-wing turbine preferred' },
      recent24mo: { hours: 0, required: false, label: 'Actively flying 2 of last 5 years preferred' },
    },
    nonFlight: {
      certificate: 'FAA ATP (Airplane Multiengine Land)',
      medical: 'FAA First Class',
      education: 'No degree requirement (unique among US majors)',
      citizenship: 'US work authorization',
      additional: ['English proficient endorsement'],
      atpNotes: 'Only fixed-wing time counted (no helicopter, simulator, WSO, etc.)',
    },
    notes: 'No degree required — unique among legacies. Only B737 fleet. PIC time defined as Captain/AC of record, not sole manipulator.',
    sourceUrl: 'https://careers.southwestair.com/us/en/pilots/',
  },
  {
    id: 'alaska',
    name: 'Alaska Airlines',
    category: 'major',
    region: 'US',
    code: 'AS',
    alliance: 'oneworld',
    fleet: 'B737 MAX 9, B737-900, B737-800, A321neo (via Hawaiian)',
    bases: 'SEA, LAX, ANC, PDX, SFO',
    pay: 'Competitive',
    hiringStatus: 'active',
    flight: {
      totalTime: { hours: 1500, required: true },
      turbineTime: { hours: 500, required: true, label: 'Fixed-wing turbine' },
      turbinePIC: { hours: 500, required: false, label: 'Turbine PIC preferred' },
      multiEngine: { hours: 500, required: false, label: 'Multi-engine preferred' },
      recent12mo: { hours: 50, required: false, label: 'Hours in last 12mo preferred' },
    },
    nonFlight: {
      certificate: 'FAA ATP or ATP written completed',
      medical: 'FAA First Class',
      education: '4-year degree required',
      age: '23 years minimum',
      citizenship: 'US work authorization without sponsorship',
      additional: ['Current passport (6mo validity)', 'Valid US driver\'s license'],
    },
    notes: 'Now merged with Hawaiian Airlines. 4-year degree REQUIRED (not just preferred).',
    sourceUrl: 'https://careers.alaskaair.com/career-opportunities/pilots/alaska-airlines',
  },
  {
    id: 'hawaiian',
    name: 'Hawaiian Airlines',
    category: 'major',
    region: 'US',
    code: 'HA',
    alliance: 'oneworld',
    fleet: 'A321neo, A330-200, B717-200',
    bases: 'HNL, SEA, CVG',
    pay: 'Competitive',
    hiringStatus: 'active',
    flight: {
      totalTime: { hours: 1500, required: true },
      turbineTime: { hours: 500, required: true, label: 'Fixed-wing turbine' },
      turbinePIC: { hours: 500, required: false, label: 'Turbine PIC preferred' },
      multiEngine: { hours: 500, required: false, label: 'Multi-engine preferred' },
      recent12mo: { hours: 50, required: false, label: 'Hours in last 12mo preferred' },
    },
    nonFlight: {
      certificate: 'FAA ATP (Airplane Multiengine Land)',
      medical: 'FAA First Class',
      education: '4-year degree required',
      age: '23 years minimum',
      citizenship: 'US work authorization without sponsorship',
      additional: ['Current passport (6mo validity)', 'Valid US driver\'s license'],
    },
    notes: 'Now merged with Alaska Airlines. Same base requirements as Alaska. HNL base is unique.',
    sourceUrl: 'https://careers.alaskaair.com/career-opportunities/pilots/alaska-hawaiian-airlines/',
  },
]

// ── US REGIONALS ─────────────────────────────────────────────────

const usRegionals: Airline[] = [
  {
    id: 'endeavor',
    name: 'Endeavor Air',
    category: 'regional',
    region: 'US',
    code: '9E',
    alliance: 'SkyTeam',
    fleet: 'CRJ-900',
    bases: 'ATL, MSP, DTW, CVG, NYC (JFK/LGA), RDU',
    pay: '$105/hr FO Year 1',
    flow: 'Contractual flow to Delta Air Lines (20/mo or 50% of Delta positions)',
    hiringStatus: 'active',
    flight: {
      totalTime: { hours: 1475, required: true, label: '1,475 (R-ATP) or 1,500 (full ATP)' },
      multiEngine: { hours: 25, required: true },
      crossCountry: { hours: 200, required: true, label: '200 R-ATP / 500 full ATP' },
    },
    nonFlight: {
      certificate: 'FAA ATP or R-ATP',
      medical: 'FAA First Class',
      education: 'No degree requirement',
      additional: ['ATP-CTP sponsored training available'],
    },
    notes: 'Delta wholly-owned. Best flow agreement in the industry. $40k signing bonus.',
    sourceUrl: 'https://www.endeavorair.com/content/endeavor-air/en_us/careers/pilots/Facts/PilotFAQ.html',
  },
  {
    id: 'skywest',
    name: 'SkyWest Airlines',
    category: 'regional',
    region: 'US',
    code: 'OO',
    alliance: 'Multiple',
    fleet: 'CRJ-200, CRJ-700, CRJ-900, E175',
    bases: 'Multiple (flies for UA, DL, AA, AS)',
    pay: '$98/hr FO Year 1',
    hiringStatus: 'active',
    flight: {
      totalTime: { hours: 1500, required: true },
      crossCountry: { hours: 500, required: true },
      night: { hours: 100, required: true },
      instrument: { hours: 75, required: true },
    },
    nonFlight: {
      certificate: 'FAA ATP',
      medical: 'FAA First Class',
    },
    notes: 'Largest US regional. Flies for United, Delta, American, AND Alaska. No direct flow but multiple partnership programs. $35k signing bonus.',
    sourceUrl: 'https://www.skywest.com/skywest-airline-jobs/career-guides/pilot-jobs',
  },
  {
    id: 'psa',
    name: 'PSA Airlines',
    category: 'regional',
    region: 'US',
    code: 'OH',
    alliance: 'oneworld',
    fleet: 'CRJ-700, CRJ-900',
    bases: 'CLT, DCA, DAY, ORF',
    pay: '$100/hr FO Year 1',
    flow: 'Flow to American Airlines',
    hiringStatus: 'active',
    flight: {
      totalTime: { hours: 1500, required: true },
    },
    nonFlight: {
      certificate: 'FAA ATP or R-ATP',
      medical: 'FAA First Class',
    },
    notes: 'American wholly-owned. $45k signing bonus. 2-3 year upgrade.',
    sourceUrl: 'https://psaairlines.com/first-officers/',
  },
  {
    id: 'envoy',
    name: 'Envoy Air',
    category: 'regional',
    region: 'US',
    code: 'MQ',
    alliance: 'oneworld',
    fleet: 'E170, E175',
    bases: 'DFW, ORD, MIA',
    pay: '$102/hr FO Year 1',
    flow: 'Flow to American Airlines',
    hiringStatus: 'active',
    flight: {
      totalTime: { hours: 1500, required: true },
    },
    nonFlight: {
      certificate: 'FAA ATP or R-ATP',
      medical: 'FAA First Class',
    },
    notes: 'American wholly-owned. $42k signing bonus. New E175 fleet.',
  },
  {
    id: 'republic',
    name: 'Republic Airways',
    category: 'regional',
    region: 'US',
    code: 'YX',
    alliance: 'Multiple',
    fleet: 'E170, E175',
    bases: 'Multiple (flies for UA, DL, AA)',
    pay: '$100/hr FO Year 1',
    hiringStatus: 'active',
    flight: {
      totalTime: { hours: 1500, required: true },
    },
    nonFlight: {
      certificate: 'FAA ATP or R-ATP',
      medical: 'FAA First Class',
    },
    notes: 'Flies for all 3 major US alliances. $40k signing bonus. Fast upgrade (1.5-3 years).',
  },
  {
    id: 'piedmont',
    name: 'Piedmont Airlines',
    category: 'regional',
    region: 'US',
    code: 'PT',
    alliance: 'oneworld',
    fleet: 'E145',
    bases: 'SAL, PHL, CLT',
    pay: '$98/hr FO Year 1',
    flow: 'Flow to American Airlines',
    hiringStatus: 'active',
    flight: {
      totalTime: { hours: 1500, required: true },
    },
    nonFlight: {
      certificate: 'FAA ATP or R-ATP',
      medical: 'FAA First Class',
    },
    notes: 'American wholly-owned. $38k signing bonus. E145 only (turbofan).',
  },
  {
    id: 'mesa',
    name: 'Mesa Airlines',
    category: 'regional',
    region: 'US',
    code: 'YV',
    alliance: 'Star Alliance',
    fleet: 'CRJ-700, CRJ-900, E175',
    bases: 'Multiple',
    pay: '$95/hr FO Year 1',
    hiringStatus: 'active',
    flight: {
      totalTime: { hours: 1500, required: true },
    },
    nonFlight: {
      certificate: 'FAA ATP or R-ATP',
      medical: 'FAA First Class',
    },
    notes: 'Flies for United and American. $30k signing bonus. Fast upgrade (1-2 years).',
  },
  {
    id: 'air-wisconsin',
    name: 'Air Wisconsin',
    category: 'regional',
    region: 'US',
    code: 'ZW',
    alliance: 'oneworld',
    fleet: 'CRJ-200',
    bases: 'Multiple',
    pay: '$95/hr FO Year 1',
    hiringStatus: 'active',
    flight: {
      totalTime: { hours: 1500, required: true },
    },
    nonFlight: {
      certificate: 'FAA ATP or R-ATP',
      medical: 'FAA First Class',
    },
    notes: 'American affiliate. $30k signing bonus. CRJ-200 only.',
  },
  {
    id: 'gojet',
    name: 'GoJet Airlines',
    category: 'regional',
    region: 'US',
    code: 'G7',
    alliance: 'Star Alliance',
    fleet: 'CRJ-700, CRJ-900',
    bases: 'Multiple',
    pay: '$97/hr FO Year 1',
    hiringStatus: 'active',
    flight: {
      totalTime: { hours: 1500, required: true },
    },
    nonFlight: {
      certificate: 'FAA ATP or R-ATP',
      medical: 'FAA First Class',
    },
    notes: 'United affiliate. $35k signing bonus.',
  },
]

// ── US CARGO ─────────────────────────────────────────────────────

const usCargo: Airline[] = [
  {
    id: 'fedex',
    name: 'FedEx Express',
    category: 'cargo',
    region: 'US',
    code: 'FX',
    alliance: 'None',
    fleet: 'B757-200F, B767-300F, B777F, MD-11F',
    bases: 'MEM, IND, ANC, LAX, MIA, EWR',
    pay: '$4,000/mo new hire (top Captain: $401/hr)',
    hiringStatus: 'active',
    flight: {
      totalTime: { hours: 1500, required: true },
      turbinePIC: { hours: 1000, required: false, label: 'PIC multi-engine turbine preferred' },
      multiEngine: { hours: 0, required: false, label: 'Only fixed-wing time counted toward mins' },
    },
    nonFlight: {
      certificate: 'FAA ATP',
      medical: 'FAA First Class',
      education: 'Bachelor\'s degree preferred',
      citizenship: 'US work authorization',
      additional: ['FCC Restricted Radiotelephone Operator Permit', 'Current passport'],
    },
    notes: 'Most competitive cargo carrier. Most new hires have 4,000+ hours and significant turbine PIC. Only fixed-wing time counts.',
    sourceUrl: 'https://careers.fedex.com/career-areas/pilot/',
  },
  {
    id: 'ups',
    name: 'UPS Airlines',
    category: 'cargo',
    region: 'US',
    code: '5X',
    alliance: 'None',
    fleet: 'A300-600F, B747-400F, B757-200F, B767-300F, MD-11F',
    bases: 'SDF, ONT, PHL, DFW, MIA, EWR',
    pay: 'Top Captain: $401/hr (2025 contract)',
    hiringStatus: 'active',
    flight: {
      totalTime: { hours: 1500, required: true },
      turbinePIC: { hours: 1000, required: false, label: 'PIC fixed-wing preferred' },
    },
    nonFlight: {
      certificate: 'Unrestricted FAA ATP',
      medical: 'FAA First Class',
      education: 'Bachelor\'s degree preferred',
      citizenship: 'US work authorization (no sponsorship)',
      additional: ['FCC Restricted Radiotelephone Operator Permit', 'Current passport'],
      atpNotes: 'Military candidates can add 0.3 per sortie factor to flight time',
    },
    notes: 'Extremely competitive. 170+ pilots retiring/year through 2029. Top cargo pay.',
    sourceUrl: 'https://www.airlinepilotcentral.com/airlines/cargo/fedex_express',
  },
  {
    id: 'atlas',
    name: 'Atlas Air',
    category: 'cargo',
    region: 'US',
    code: '5Y',
    alliance: 'None',
    fleet: 'B747-400F, B767-200/300F, B777-200LRF',
    bases: 'MIA, CVG, JFK, LAX, HNL',
    pay: 'Competitive',
    hiringStatus: 'active',
    flight: {
      totalTime: { hours: 2500, required: true },
      turbineTime: { hours: 500, required: false, label: 'Turbine time preferred' },
      recent12mo: { hours: 200, required: false, label: 'Hours in last 12mo preferred' },
    },
    nonFlight: {
      certificate: 'FAA ATP',
      medical: 'FAA First Class',
      education: 'Bachelor\'s degree in aviation or related field preferred',
      citizenship: 'US work authorization',
      additional: ['Current passport (24 months validity)', 'CANPASS permit (Canadian customs)', 'Ability to obtain international visas'],
    },
    notes: 'ACMI/charter operator. Good stepping stone to FedEx/UPS. Heavy widebody experience.',
    sourceUrl: 'https://www.airlinepilotcentral.com/airlines/cargo/atlas_air/1000',
  },
  {
    id: 'kalitta',
    name: 'Kalitta Air',
    category: 'cargo',
    region: 'US',
    code: 'K4',
    alliance: 'None',
    fleet: 'B747-400F, B777F',
    bases: 'MIA, CVG, JFK, OSC',
    pay: 'Competitive',
    hiringStatus: 'active',
    flight: {
      totalTime: { hours: 1500, required: true },
      turbineTime: { hours: 500, required: false, label: 'Turbine time preferred' },
    },
    nonFlight: {
      certificate: 'FAA ATP',
      medical: 'FAA First Class',
      citizenship: 'US work authorization',
    },
    notes: 'ACMI cargo operator. Heavy 747 experience. Good on-ramp for cargo careers.',
  },
]

// ── US CORPORATE ─────────────────────────────────────────────────

const usCorporate: Airline[] = [
  {
    id: 'netjets',
    name: 'NetJets',
    category: 'corporate',
    region: 'US',
    code: '1I',
    alliance: 'None',
    fleet: 'Cessna Citation, Bombardier Challenger/Global, Dassault Falcon',
    bases: 'Multiple (regional)',
    pay: '$86k-$117k FO',
    hiringStatus: 'active',
    flight: {
      totalTime: { hours: 1500, required: true },
      pic: { hours: 250, required: true, label: 'Fixed-wing PIC' },
      crossCountry: { hours: 200, required: true, label: 'XC >50nm' },
      night: { hours: 100, required: true, label: '100 night, or 75 with 45+ night T/O & landings' },
      instrument: { hours: 75, required: true, label: 'Actual/simulated in-flight (excludes sim)' },
      multiEngine: { hours: 50, required: true },
    },
    nonFlight: {
      certificate: 'FAA ATP (or R-ATP with written completed)',
      medical: 'FAA First Class',
      education: 'High school diploma minimum',
      age: '21 years minimum',
      citizenship: 'US work authorization',
      additional: ['FCC Restricted Radiotelephone Operator Permit', 'Current passport', 'Valid state driver\'s license'],
    },
    notes: 'Fractional ownership (Berkshire Hathaway). Great quality of life. 7/7 or 14/7 schedules.',
    sourceUrl: 'https://www.netjets.com/en-us/netjets-careers-pilot-jobs',
  },
]

// ── US LOW COST ──────────────────────────────────────────────────

const usLcc: Airline[] = [
  {
    id: 'jetblue',
    name: 'JetBlue Airways',
    category: 'lcc',
    region: 'US',
    code: 'B6',
    alliance: 'None',
    fleet: 'A220-300, A320-200, A321-200/neo/LR',
    bases: 'JFK, BOS, FLL, MCO, LAX',
    pay: '$78k/yr FO Year 1',
    hiringStatus: 'active',
    flight: {
      totalTime: { hours: 2500, required: true },
      turbinePIC: { hours: 1000, required: false, label: 'Turbine PIC preferred' },
    },
    nonFlight: {
      certificate: 'FAA ATP',
      medical: 'FAA First Class',
    },
    notes: 'All-Airbus fleet. A220 expansion. Conservative hiring currently.',
    sourceUrl: 'https://www.rotatepilot.com/airlines/jetblue/recruitment',
  },
  {
    id: 'spirit',
    name: 'Spirit Airlines',
    category: 'lcc',
    region: 'US',
    code: 'NK',
    alliance: 'None',
    fleet: 'A319, A320, A321',
    bases: 'FLL, DTW, LAS, MCO, DFW, ATL',
    pay: 'Competitive',
    hiringStatus: 'active',
    flight: {
      totalTime: { hours: 1500, required: true },
      turbinePIC: { hours: 500, required: false, label: 'Turbine PIC preferred' },
    },
    nonFlight: {
      certificate: 'FAA ATP',
      medical: 'FAA First Class',
    },
    notes: 'All-Airbus, ultra-low-cost. Good entry point to 121 operations.',
  },
]

// ── EUROPEAN LEGACY ──────────────────────────────────────────────

const european: Airline[] = [
  {
    id: 'klm',
    name: 'KLM Royal Dutch Airlines',
    category: 'european',
    region: 'EU',
    code: 'KL',
    alliance: 'SkyTeam',
    fleet: 'B737, B777, B787, A330',
    bases: 'AMS (Schiphol)',
    pay: 'Competitive (CLA-based)',
    hiringStatus: 'active',
    flight: {
      totalTime: { hours: 1500, required: true },
      multiEngine: { hours: 500, required: true, label: 'ME >5,700kg MTOW' },
      recent12mo: { hours: 150, required: true, label: 'Hours in commercial aviation in last 12mo' },
    },
    nonFlight: {
      certificate: 'EASA Frozen ATPL(A) with valid Type Rating (multi-pilot)',
      medical: 'EASA Class 1',
      education: 'Minimum higher general secondary education (HAVO/VWO equivalent)',
      age: 'Height 1.58-2.03m',
      language: 'Dutch A2 within 12mo (B1 for Captain). English LPE6.',
      citizenship: 'EU passport (incl. Norway, Switzerland, Iceland, Liechtenstein)',
      additional: ['Advanced UPRT', 'Multi Crew Cooperation Course', 'Initial CRM', 'Swimming skills', 'Yellow Fever vaccination'],
      atpNotes: 'Preference for KFA, NLS/CAE, EPST, MFA flight school graduates. Military pilots with EU MPL and B2 Dutch also eligible.',
    },
    notes: 'Since 2025: non-Dutch speakers can apply (direct entry). Must reach A2 Dutch within 12 months.',
    sourceUrl: 'https://careers.klm.com/en/job-area/cockpit/',
  },
  {
    id: 'lufthansa',
    name: 'Lufthansa (Mainline)',
    category: 'european',
    region: 'EU',
    code: 'LH',
    alliance: 'Star Alliance',
    fleet: 'A319, A320, A321, A330, A340, A350, A380, B747, B777, B787',
    bases: 'FRA, MUC, ZRH, VIE, BRU',
    pay: 'Competitive (VC union agreement)',
    hiringStatus: 'active',
    flight: {},
    nonFlight: {
      certificate: 'EASA ATPL (frozen or full)',
      medical: 'EASA Class 1',
      education: 'Abitur or equivalent (REQUIRED even for direct entry)',
      language: 'English ICAO Level 4 minimum, German strongly advantageous',
      citizenship: 'EU/EEA right to work',
      additional: ['DLR aptitude test certificate required (5-10% pass rate, ~€400)'],
      atpNotes: 'DLR test is mandatory and must be obtained independently before applying. Pass rate ~5-10%.',
    },
    notes: 'Abitur REQUIRED — even for direct entry experienced pilots. DLR test is the gatekeeper.',
    sourceUrl: 'https://airmappr.com/articles/career/lufthansa-pilot-application-guide',
  },
  {
    id: 'air-france',
    name: 'Air France',
    category: 'european',
    region: 'EU',
    code: 'AF',
    alliance: 'SkyTeam',
    fleet: 'A318, A319, A320, A321, A330, A350, B777',
    bases: 'CDG, ORY',
    pay: 'Competitive (CDI contract)',
    hiringStatus: 'active',
    flight: {
      totalTime: { hours: 1500, required: true },
    },
    nonFlight: {
      certificate: 'EASA ATPL (frozen or full)',
      medical: 'EASA Class 1',
      language: 'French proficiency REQUIRED, ICAO English Level 4 minimum',
      citizenship: 'EU/EEA citizenship or work permit',
    },
    notes: 'French language required. Occasional non-French-speaker positions on widebody (A350, B777).',
    sourceUrl: 'https://corporate.airfrance.com/en/airline-pilot',
  },
  {
    id: 'ba',
    name: 'British Airways',
    category: 'european',
    region: 'UK',
    code: 'BA',
    alliance: 'oneworld',
    fleet: 'A320, A321, A350, A380, B777, B787',
    bases: 'LHR, LGW',
    pay: 'Competitive',
    hiringStatus: 'active',
    flight: {
      totalTime: { hours: 1500, required: true, label: '1,500+ (long-haul)' },
      turbineTime: { hours: 500, required: true, label: '500 hours on relevant type (long-haul)' },
    },
    nonFlight: {
      certificate: 'UK CAA ATPL(A) or EASA ATPL (with conversion)',
      medical: 'UK CAA Class 1 or EASA Class 1',
      language: 'English proficient',
      citizenship: 'UK/EU right to work',
      atpNotes: 'Third Country CPL/ATPL conversion possible. Must meet UK CAA conversion requirements.',
    },
    notes: 'Split into BA Mainline, Euroflyer, Cityflyer — can only apply to one at a time. Speedbird Pilot Academy cadet program.',
    sourceUrl: 'https://careers.ba.com/pilots',
  },
  {
    id: 'ryanair',
    name: 'Ryanair',
    category: 'european',
    region: 'EU',
    code: 'FR',
    alliance: 'None',
    fleet: 'B737-800, B737 MAX 200',
    bases: 'DUB, STN, BGY, MAN, BCN + 80+ bases',
    pay: 'Low base + sector pay',
    hiringStatus: 'active',
    flight: {},
    nonFlight: {
      certificate: 'EASA ATPL (frozen ok) with B737 type rating',
      medical: 'EASA Class 1',
      language: 'English proficient',
      citizenship: 'EU/EEA right to work (or UK for some bases)',
    },
    notes: 'Type-rated direct entry common. Pay-to-fly model via Ryanair Mentored/Pathways programs. Lowest total time entry point.',
  },
  {
    id: 'wizz',
    name: 'Wizz Air',
    category: 'european',
    region: 'EU',
    code: 'W6',
    alliance: 'None',
    fleet: 'A320, A321',
    bases: 'BUD, VIE, LTN, MXP, FCO + 30+ bases',
    pay: 'Competitive for LCC',
    hiringStatus: 'active',
    flight: {
      totalTime: { hours: 1500, required: true, label: 'Type-rated FO: 500hr on type. Non-type-rated FO: 1,500hr on MPA jet >50T MTOW' },
    },
    nonFlight: {
      certificate: 'EASA ATPL (frozen ok)',
      medical: 'EASA Class 1',
      language: 'English proficient',
      citizenship: 'EU/EEA right to work',
      atpNotes: 'Captain: 3,000hrs + 100 landings Airbus FBW. Uses factorization system for Captain hours.',
    },
    notes: 'Uses factorization for Captain hours (weighted by aircraft type). Rapid expansion.',
  },
]

// ── ALL CATEGORIES ───────────────────────────────────────────────

export const AIRLINE_CATEGORIES: AirlineCategory[] = [
  {
    id: 'majors',
    label: 'US Majors',
    description: 'Legacy US airlines — the most competitive and highest-paying',
    airlines: usMajors,
  },
  {
    id: 'regionals',
    label: 'US Regionals',
    description: 'Regional carriers with flow-through agreements to majors',
    airlines: usRegionals,
  },
  {
    id: 'cargo',
    label: 'US Cargo',
    description: 'Freight and package carriers — Part 121 cargo operations',
    airlines: usCargo,
  },
  {
    id: 'corporate',
    label: 'Corporate / Fractional',
    description: 'Private aviation and fractional ownership operators',
    airlines: usCorporate,
  },
  {
    id: 'lcc',
    label: 'US Low Cost',
    description: 'Low-cost carriers with point-to-point networks',
    airlines: usLcc,
  },
  {
    id: 'european',
    label: 'European',
    description: 'EASA-regulated airlines across Europe',
    airlines: european,
  },
]

// ── FLAT LIST FOR EASY LOOKUP ────────────────────────────────────

export const ALL_AIRLINES: Airline[] = AIRLINE_CATEGORIES.flatMap((c) => c.airlines)

export function getAirlineById(id: string): Airline | undefined {
  return ALL_AIRLINES.find((a) => a.id === id)
}

// ── REQUIREMENT KEY INFO ─────────────────────────────────────────

export interface ReqKeyInfo {
  key: string
  label: string
  shortLabel: string
  unit: 'hours' | 'count'
}

export const REQUIREMENT_KEYS: ReqKeyInfo[] = [
  { key: 'totalTime', label: 'Total Time', shortLabel: 'TT', unit: 'hours' },
  { key: 'turbineTime', label: 'Turbine Time', shortLabel: 'Turb', unit: 'hours' },
  { key: 'turbinePIC', label: 'Turbine PIC', shortLabel: 'Turb PIC', unit: 'hours' },
  { key: 'pic', label: 'PIC', shortLabel: 'PIC', unit: 'hours' },
  { key: 'multiEngine', label: 'Multi-Engine', shortLabel: 'ME', unit: 'hours' },
  { key: 'crossCountry', label: 'Cross-Country', shortLabel: 'XC', unit: 'hours' },
  { key: 'night', label: 'Night', shortLabel: 'Night', unit: 'hours' },
  { key: 'instrument', label: 'Instrument', shortLabel: 'Inst', unit: 'hours' },
  { key: 'recent12mo', label: 'Last 12 Months', shortLabel: '12mo', unit: 'hours' },
  { key: 'recent24mo', label: 'Last 24 Months', shortLabel: '24mo', unit: 'hours' },
  { key: 'sic', label: 'SIC', shortLabel: 'SIC', unit: 'hours' },
]
