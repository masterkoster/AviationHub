import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

// Statuses that mark a Maintenance/squawk item as no longer open. Verified against
// actual usage in this codebase: app/api/flying-club/maintenance/queue/route.ts
// filters open items with `status: { not: 'COMPLETED' }`, and the only status values
// ever written by the app are 'NEEDED', 'IN_PROGRESS', and 'COMPLETED' (see
// app/flying-club/squawks/page.tsx). 'RESOLVED' is included defensively per the
// schema comment/spec even though nothing in the app currently writes it.
const CLOSED_MAINTENANCE_STATUSES = ['COMPLETED', 'RESOLVED'];

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  // Prisma Decimal (decimal.js) instances expose toNumber(); fall back to Number() for plain values.
  if (typeof value === 'object' && value !== null && 'toNumber' in value && typeof (value as { toNumber: unknown }).toNumber === 'function') {
    return (value as { toNumber: () => number }).toNumber();
  }
  // AircraftSpecs/AircraftCache store several numeric-looking columns as strings; coerce
  // and hide anything that doesn't parse cleanly (blank strings, 'N/A', etc.) as null.
  if (typeof value === 'string' && value.trim() === '') return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

export interface EquipmentItem {
  category: string;
  name: string;
}

// Parses the ClubAircraft.equipment JSON column defensively — malformed JSON, a
// non-array payload, or items missing a usable `name` are dropped rather than thrown.
function parseEquipment(raw: string | null | undefined): EquipmentItem[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is { category?: unknown; name?: unknown } => !!item && typeof item === 'object' && typeof (item as Record<string, unknown>).name === 'string' && (item as Record<string, unknown>).name !== '')
      .map(item => ({
        category: typeof item.category === 'string' && item.category.trim() ? item.category : 'Other',
        name: item.name as string,
      }));
  } catch {
    return [];
  }
}

export interface AircraftTypeSpecs {
  source: 'AircraftSpecs' | 'AircraftCache';
  manufacturer: string | null;
  model: string | null;
  cruiseSpeedKts: number | null;
  rangeNm: number | null;
  fuelCapacityGal: number | null;
  usefulLoadLbs: number | null;
  serviceCeilingFt: number | null;
  rateOfClimbFpm: number | null;
  horsepowerHp: number | null;
}

function normalizeText(s: string | null | undefined): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function tokenize(s: string | null | undefined): string[] {
  const n = normalizeText(s);
  return n ? n.split(' ') : [];
}

/**
 * Finds the reference row whose `model` best matches the club aircraft's model string.
 * Two-pass strategy: first look for an exact token match on the most specific token of
 * the club model (e.g. "172n" within "cessna 172n hawk 100 thru 80" tokens), preferring
 * the shortest/most-general matching model string; then fall back to loose substring
 * containment between the fully-normalized strings (e.g. "172" within "cessna172n").
 * Manufacturer, when present on both sides, must match in one direction as a substring
 * to avoid cross-manufacturer collisions on generic model numbers.
 */
function findBestMatch<T extends { manufacturer: string | null; model: string | null }>(
  rows: T[],
  clubMake: string | null,
  clubModel: string,
): T | null {
  const clubTokens = tokenize(clubModel);
  if (clubTokens.length === 0) return null;
  const clubKey = clubTokens.find(t => /\d/.test(t)) || clubTokens[clubTokens.length - 1];
  const clubMakeNorm = normalizeText(clubMake);
  const clubModelNorm = clubTokens.join('');

  const candidates = rows.filter(row => {
    if (!clubMakeNorm) return true;
    const rowMakeNorm = normalizeText(row.manufacturer);
    if (!rowMakeNorm) return true;
    return rowMakeNorm.includes(clubMakeNorm) || clubMakeNorm.includes(rowMakeNorm);
  });

  let best: T | null = null;
  let bestLen = Infinity;
  for (const row of candidates) {
    if (tokenize(row.model).includes(clubKey)) {
      const len = (row.model || '').length;
      if (len < bestLen) {
        bestLen = len;
        best = row;
      }
    }
  }
  if (best) return best;

  bestLen = Infinity;
  for (const row of candidates) {
    const rowNorm = tokenize(row.model).join('');
    if (!rowNorm) continue;
    if (rowNorm.includes(clubModelNorm) || clubModelNorm.includes(rowNorm)) {
      const diff = Math.abs(rowNorm.length - clubModelNorm.length);
      if (diff < bestLen) {
        bestLen = diff;
        best = row;
      }
    }
  }
  return best;
}

/**
 * Looks up type-level performance/specs for a club aircraft by make+model, preferring
 * AircraftSpecs (richer field set) and falling back to AircraftCache. Returns null when
 * no reasonable match is found — callers should treat this as "no data available", not
 * an error. This is reference/type data, not tail-specific, and must be presented to
 * users with a "verify against your POH" disclaimer rather than as authoritative.
 */
export async function findTypeSpecs(make: string | null, model: string | null): Promise<AircraftTypeSpecs | null> {
  if (!model || !model.trim()) return null;

  const specsRows = await prisma.aircraftSpecs.findMany({
    select: {
      manufacturer: true,
      model: true,
      cruise_speed_kts: true,
      range_nm: true,
      fuel_capacity_gal: true,
      horsepower: true,
      rate_of_climb_fpm: true,
      service_ceiling_ft: true,
      empty_weight_lbs: true,
      gross_weight_lbs: true,
    },
  });
  const specsMatch = findBestMatch(specsRows, make, model);
  if (specsMatch) {
    const emptyWeight = toNumber(specsMatch.empty_weight_lbs);
    const grossWeight = toNumber(specsMatch.gross_weight_lbs);
    return {
      source: 'AircraftSpecs',
      manufacturer: specsMatch.manufacturer,
      model: specsMatch.model,
      cruiseSpeedKts: toNumber(specsMatch.cruise_speed_kts),
      rangeNm: toNumber(specsMatch.range_nm),
      fuelCapacityGal: toNumber(specsMatch.fuel_capacity_gal),
      usefulLoadLbs: emptyWeight !== null && grossWeight !== null ? grossWeight - emptyWeight : null,
      serviceCeilingFt: toNumber(specsMatch.service_ceiling_ft),
      rateOfClimbFpm: toNumber(specsMatch.rate_of_climb_fpm),
      horsepowerHp: toNumber(specsMatch.horsepower),
    };
  }

  const cacheRows = await prisma.aircraftCache.findMany({
    select: {
      manufacturer: true,
      model: true,
      cruise_speed_kts: true,
      range_nm: true,
      fuel_capacity_gal: true,
      useful_load_lbs: true,
    },
  });
  const cacheMatch = findBestMatch(cacheRows, make, model);
  if (cacheMatch) {
    return {
      source: 'AircraftCache',
      manufacturer: cacheMatch.manufacturer,
      model: cacheMatch.model,
      cruiseSpeedKts: toNumber(cacheMatch.cruise_speed_kts),
      rangeNm: toNumber(cacheMatch.range_nm),
      fuelCapacityGal: toNumber(cacheMatch.fuel_capacity_gal),
      usefulLoadLbs: toNumber(cacheMatch.useful_load_lbs),
      serviceCeilingFt: null,
      rateOfClimbFpm: null,
      horsepowerHp: null,
    };
  }

  return null;
}

export interface AircraftProfileAircraft {
  id: string;
  organizationId: string | null;
  nNumber: string | null;
  nickname: string | null;
  customName: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  hourlyRate: number | null;
  totalTachHours: number | null;
  totalHobbsHours: number | null;
  registrationType: string | null;
  maxPassengers: number | null;
  aircraftNotes: string | null;
  status: string | null;
  bookingWindowDays: number;
  equipment: EquipmentItem[];
}

export interface MaintenanceItemSummary {
  id: string;
  description: string;
  status: string | null;
  category: string | null;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  isGrounded: boolean;
  reportedDate: string | null;
  resolvedDate: string | null;
  cost: number | null;
  notes: string | null;
  reportedByName: string | null;
}

export interface FlightLogSummary {
  id: string;
  date: string;
  tachTime: number | null;
  hobbsTime: number | null;
  hobbsStart: number | null;
  hobbsEnd: number | null;
  calculatedCost: number | null;
  notes: string | null;
  pilotName: string | null;
}

export interface BookingSummary {
  id: string;
  startTime: string;
  endTime: string;
  purpose: string | null;
  pilotName: string | null;
}

export interface AircraftProfileData {
  aircraft: AircraftProfileAircraft;
  status: {
    isGrounded: boolean;
    openSquawkCount: number;
    highestOpenSeverity: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  };
  openSquawks: MaintenanceItemSummary[];
  maintenanceHistory: MaintenanceItemSummary[];
  recentFlightLogs: FlightLogSummary[];
  upcomingBookings: BookingSummary[];
  utilization: {
    flightsLast30d: number;
    hoursLast30d: number;
    flightsLast90d: number;
    hoursLast90d: number;
  };
  typeSpecs: AircraftTypeSpecs | null;
  generatedAt: string;
}

function summarizeMaintenance(m: {
  id: string;
  description: string;
  status: string | null;
  category: string | null;
  severity: string | null;
  isGrounded: boolean;
  reportedDate: Date | null;
  resolvedDate: Date | null;
  cost: unknown;
  notes: string | null;
  reportedByPilot: { user: { name: string | null } | null } | null;
}): MaintenanceItemSummary {
  return {
    id: m.id,
    description: m.description,
    status: m.status,
    category: m.category,
    severity: (m.severity as 'LOW' | 'MEDIUM' | 'HIGH' | null) ?? null,
    isGrounded: m.isGrounded,
    reportedDate: m.reportedDate ? m.reportedDate.toISOString() : null,
    resolvedDate: m.resolvedDate ? m.resolvedDate.toISOString() : null,
    cost: toNumber(m.cost),
    notes: m.notes,
    reportedByName: m.reportedByPilot?.user?.name ?? null,
  };
}

// Flight hours for a single FlightLog row: prefer hobbsEnd - hobbsStart when both are
// present, otherwise fall back to hobbsTime, then tachTime.
function flightHours(log: { hobbsStart: unknown; hobbsEnd: unknown; hobbsTime: unknown; tachTime: unknown }): number {
  const hobbsStart = toNumber(log.hobbsStart);
  const hobbsEnd = toNumber(log.hobbsEnd);
  if (hobbsStart !== null && hobbsEnd !== null) {
    return Math.max(0, hobbsEnd - hobbsStart);
  }
  const hobbsTime = toNumber(log.hobbsTime);
  if (hobbsTime !== null) return hobbsTime;
  const tachTime = toNumber(log.tachTime);
  if (tachTime !== null) return tachTime;
  return 0;
}

/**
 * Aggregates a single club aircraft's profile: display info, open/resolved
 * maintenance, recent flight logs, upcoming bookings, and utilization stats.
 *
 * NOTE: This function does NOT perform authorization/membership checks — callers
 * are responsible for verifying the requesting user may access `groupId` before
 * calling this. It is intentionally auth-agnostic so it can be reused outside the
 * flying-club member context (e.g. a future marketplace listing snapshot, or a
 * mechanic-request flow, where the caller's auth model differs).
 */
export async function getAircraftProfile(groupId: string, aircraftId: string): Promise<AircraftProfileData | null> {
  const aircraft = await prisma.clubAircraft.findFirst({
    where: { id: aircraftId, organizationId: groupId },
  });

  if (!aircraft) {
    return null;
  }

  const now = new Date();
  const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const since90d = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  // "Open" means status is anything other than COMPLETED/RESOLVED, including a null
  // status (the column is nullable even though the DB default is 'NEEDED'). Prisma's
  // `notIn` filter excludes NULL rows at the SQL level, so open/closed are expressed
  // explicitly here rather than via `notIn`/`in` alone.
  const openWhere: Prisma.MaintenanceWhereInput = {
    clubAircraftId: aircraftId,
    OR: [{ status: null }, { status: { notIn: CLOSED_MAINTENANCE_STATUSES } }],
  };
  const closedWhere: Prisma.MaintenanceWhereInput = {
    clubAircraftId: aircraftId,
    status: { in: CLOSED_MAINTENANCE_STATUSES },
  };

  const [
    openSquawksRaw,
    maintenanceHistoryRaw,
    recentFlightLogsRaw,
    upcomingBookingsRaw,
    flightLogsLast90dRaw,
    openSquawkCount,
    groundedOpenCount,
    highSeverityOpenCount,
    mediumSeverityOpenCount,
    typeSpecs,
  ] = await Promise.all([
    prisma.maintenance.findMany({
      where: openWhere,
      include: { reportedByPilot: { include: { user: { select: { name: true } } } } },
      orderBy: { reportedDate: 'desc' },
      take: 50,
    }),
    prisma.maintenance.findMany({
      where: closedWhere,
      include: { reportedByPilot: { include: { user: { select: { name: true } } } } },
      orderBy: { resolvedDate: 'desc' },
      take: 50,
    }),
    prisma.flightLog.findMany({
      where: { clubAircraftId: aircraftId },
      include: { pilotProfile: { include: { user: { select: { name: true } } } } },
      orderBy: { date: 'desc' },
      take: 25,
    }),
    prisma.booking.findMany({
      where: { clubAircraftId: aircraftId, startTime: { gte: now } },
      include: { pilotProfile: { include: { user: { select: { name: true } } } } },
      orderBy: { startTime: 'asc' },
      take: 10,
    }),
    // Separate bounded query for utilization math so recentFlightLogs (take 25) doesn't
    // silently truncate the 90-day window used for hours/flight counts.
    prisma.flightLog.findMany({
      where: { clubAircraftId: aircraftId, date: { gte: since90d } },
      select: { date: true, hobbsStart: true, hobbsEnd: true, hobbsTime: true, tachTime: true },
      take: 1000,
    }),
    // These counts (not derived from the take-50 openSquawks list) keep
    // isGrounded/openSquawkCount/highestOpenSeverity accurate even if an aircraft has
    // more than 50 open items.
    prisma.maintenance.count({ where: openWhere }),
    prisma.maintenance.count({ where: { ...openWhere, isGrounded: true } }),
    prisma.maintenance.count({ where: { ...openWhere, severity: 'HIGH' } }),
    prisma.maintenance.count({ where: { ...openWhere, severity: 'MEDIUM' } }),
    findTypeSpecs(aircraft.make, aircraft.model),
  ]);

  const openSquawks = openSquawksRaw.map(summarizeMaintenance);
  const maintenanceHistory = maintenanceHistoryRaw.map(summarizeMaintenance);

  const recentFlightLogs: FlightLogSummary[] = recentFlightLogsRaw.map(fl => ({
    id: fl.id,
    date: fl.date.toISOString(),
    tachTime: toNumber(fl.tachTime),
    hobbsTime: toNumber(fl.hobbsTime),
    hobbsStart: toNumber(fl.hobbsStart),
    hobbsEnd: toNumber(fl.hobbsEnd),
    calculatedCost: toNumber(fl.calculatedCost),
    notes: fl.notes,
    pilotName: fl.pilotProfile?.user?.name ?? null,
  }));

  const upcomingBookings: BookingSummary[] = upcomingBookingsRaw.map(b => ({
    id: b.id,
    startTime: b.startTime.toISOString(),
    endTime: b.endTime.toISOString(),
    purpose: b.purpose,
    pilotName: b.pilotProfile?.user?.name ?? null,
  }));

  const flightsLast30d = flightLogsLast90dRaw.filter(fl => fl.date >= since30d).length;
  const hoursLast30d = flightLogsLast90dRaw.filter(fl => fl.date >= since30d).reduce((sum, fl) => sum + flightHours(fl), 0);
  const flightsLast90d = flightLogsLast90dRaw.length;
  const hoursLast90d = flightLogsLast90dRaw.reduce((sum, fl) => sum + flightHours(fl), 0);

  const highestOpenSeverity: 'LOW' | 'MEDIUM' | 'HIGH' | null =
    highSeverityOpenCount > 0 ? 'HIGH' : mediumSeverityOpenCount > 0 ? 'MEDIUM' : openSquawkCount > 0 ? 'LOW' : null;

  return {
    aircraft: {
      id: aircraft.id,
      organizationId: aircraft.organizationId,
      nNumber: aircraft.nNumber,
      nickname: aircraft.nickname,
      customName: aircraft.customName,
      make: aircraft.make,
      model: aircraft.model,
      year: aircraft.year,
      hourlyRate: toNumber(aircraft.hourlyRate),
      totalTachHours: toNumber(aircraft.totalTachHours),
      totalHobbsHours: toNumber(aircraft.totalHobbsHours),
      registrationType: aircraft.registrationType,
      maxPassengers: aircraft.maxPassengers,
      aircraftNotes: aircraft.aircraftNotes,
      status: aircraft.status,
      bookingWindowDays: aircraft.bookingWindowDays,
      equipment: parseEquipment(aircraft.equipment),
    },
    status: {
      isGrounded: groundedOpenCount > 0,
      openSquawkCount,
      highestOpenSeverity,
    },
    openSquawks,
    maintenanceHistory,
    recentFlightLogs,
    upcomingBookings,
    utilization: {
      flightsLast30d,
      hoursLast30d,
      flightsLast90d,
      hoursLast90d,
    },
    typeSpecs,
    generatedAt: now.toISOString(),
  };
}
