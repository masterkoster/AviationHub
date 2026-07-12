/**
 * Airworthiness inspection status computation.
 *
 * An inspection recurs by calendar months (intervalMonths), by tach hours
 * (intervalHours), or both. The due point is the last completion plus the
 * interval; when an inspection has both, whichever comes first governs.
 * Status is derived at read time from "now" and the aircraft's current tach
 * hours — never stored — so it's always live.
 */

export type InspectionType =
  | 'ANNUAL'
  | '100_HOUR'
  | 'TRANSPONDER'
  | 'PITOT_STATIC'
  | 'ELT'
  | 'VOR'
  | 'OIL_CHANGE'
  | 'REGISTRATION'
  | 'OTHER';

export type InspectionStatus = 'OK' | 'DUE_SOON' | 'OVERDUE' | 'UNKNOWN';

/** Human labels + sensible default intervals for the known inspection types. */
export const INSPECTION_TYPES: Record<
  InspectionType,
  { label: string; defaultMonths?: number; defaultHours?: number; note?: string }
> = {
  ANNUAL: { label: 'Annual Inspection', defaultMonths: 12 },
  '100_HOUR': { label: '100-Hour Inspection', defaultHours: 100, note: 'Required for aircraft flown for hire or instruction' },
  TRANSPONDER: { label: 'Transponder / Altimeter', defaultMonths: 24, note: 'IFR — 24 calendar months' },
  PITOT_STATIC: { label: 'Pitot-Static System', defaultMonths: 24, note: 'IFR — 24 calendar months' },
  ELT: { label: 'ELT Battery', defaultMonths: 12 },
  VOR: { label: 'VOR Check', defaultMonths: 1, note: 'IFR — 30 days' },
  OIL_CHANGE: { label: 'Oil Change', defaultHours: 50 },
  REGISTRATION: { label: 'Registration Renewal', defaultMonths: 84, note: 'FAA — 7 years' },
  OTHER: { label: 'Other', note: 'Custom inspection' },
};

// "Due soon" thresholds — when the nearer of date/hours falls inside these.
const DUE_SOON_DAYS = 30;
const DUE_SOON_HOURS = 10;

export interface InspectionInput {
  id: string;
  type: string;
  label: string | null;
  lastDoneDate: Date | string | null;
  lastDoneHours: number | string | null;
  intervalMonths: number | null;
  intervalHours: number | string | null;
  isRequired: boolean;
  isActive: boolean;
  notes?: string | null;
}

export interface InspectionComputed {
  id: string;
  type: string;
  label: string;
  isRequired: boolean;
  lastDoneDate: string | null;
  lastDoneHours: number | null;
  intervalMonths: number | null;
  intervalHours: number | null;
  dueDate: string | null;
  dueHours: number | null;
  daysRemaining: number | null;
  hoursRemaining: number | null;
  status: InspectionStatus;
  notes: string | null;
}

function toNum(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

/**
 * Compute live status for one inspection.
 * @param currentTachHours the aircraft's current tach hours (for hours-based).
 * @param now injectable clock for testing; defaults to new Date().
 */
export function computeInspection(
  insp: InspectionInput,
  currentTachHours: number | null,
  now: Date = new Date()
): InspectionComputed {
  const typeMeta = INSPECTION_TYPES[insp.type as InspectionType];
  const label = insp.label?.trim() || typeMeta?.label || insp.type;

  const lastDate = insp.lastDoneDate ? new Date(insp.lastDoneDate) : null;
  const lastHours = toNum(insp.lastDoneHours);
  const intervalMonths = insp.intervalMonths ?? null;
  const intervalHours = toNum(insp.intervalHours);
  const curHours = toNum(currentTachHours);

  // Date-based due
  let dueDate: Date | null = null;
  let daysRemaining: number | null = null;
  if (lastDate && intervalMonths && intervalMonths > 0) {
    dueDate = addMonths(lastDate, intervalMonths);
    daysRemaining = Math.floor((dueDate.getTime() - now.getTime()) / 86400000);
  }

  // Hours-based due
  let dueHours: number | null = null;
  let hoursRemaining: number | null = null;
  if (lastHours !== null && intervalHours && intervalHours > 0) {
    dueHours = Math.round((lastHours + intervalHours) * 100) / 100;
    if (curHours !== null) {
      hoursRemaining = Math.round((dueHours - curHours) * 100) / 100;
    }
  }

  // Status: worst of whichever dimensions apply. If we can't evaluate any
  // dimension (no last-done data), status is UNKNOWN so the UI prompts setup.
  const signals: InspectionStatus[] = [];
  if (daysRemaining !== null) {
    signals.push(daysRemaining < 0 ? 'OVERDUE' : daysRemaining <= DUE_SOON_DAYS ? 'DUE_SOON' : 'OK');
  }
  if (hoursRemaining !== null) {
    signals.push(hoursRemaining < 0 ? 'OVERDUE' : hoursRemaining <= DUE_SOON_HOURS ? 'DUE_SOON' : 'OK');
  }

  let status: InspectionStatus = 'UNKNOWN';
  if (signals.includes('OVERDUE')) status = 'OVERDUE';
  else if (signals.includes('DUE_SOON')) status = 'DUE_SOON';
  else if (signals.includes('OK')) status = 'OK';

  return {
    id: insp.id,
    type: insp.type,
    label,
    isRequired: insp.isRequired,
    lastDoneDate: lastDate ? lastDate.toISOString() : null,
    lastDoneHours: lastHours,
    intervalMonths,
    intervalHours,
    dueDate: dueDate ? dueDate.toISOString() : null,
    dueHours,
    daysRemaining,
    hoursRemaining,
    status,
    notes: insp.notes ?? null,
  };
}

/** Short human countdown, e.g. "14 days", "8.2 hrs", "overdue 3 days". */
export function inspectionCountdown(c: InspectionComputed): string {
  const parts: string[] = [];
  if (c.daysRemaining !== null) {
    parts.push(c.daysRemaining < 0 ? `${Math.abs(c.daysRemaining)}d overdue` : `${c.daysRemaining}d`);
  }
  if (c.hoursRemaining !== null) {
    parts.push(c.hoursRemaining < 0 ? `${Math.abs(c.hoursRemaining)} hrs overdue` : `${c.hoursRemaining} hrs`);
  }
  return parts.join(' · ') || 'not set';
}

/**
 * An aircraft is airworthiness-blocked when any REQUIRED, active inspection is
 * OVERDUE. Used by the fleet view and (later) booking policy enforcement.
 */
export function isGroundedByInspection(computed: InspectionComputed[]): boolean {
  return computed.some((c) => c.isRequired && c.status === 'OVERDUE');
}

export function worstStatus(computed: InspectionComputed[]): InspectionStatus {
  if (computed.some((c) => c.status === 'OVERDUE')) return 'OVERDUE';
  if (computed.some((c) => c.status === 'DUE_SOON')) return 'DUE_SOON';
  if (computed.some((c) => c.status === 'OK')) return 'OK';
  return 'UNKNOWN';
}
