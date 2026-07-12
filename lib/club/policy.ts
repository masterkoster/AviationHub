/**
 * Club booking-policy evaluation. Pure functions so both the booking API and
 * (later) the UI can predict whether a booking is allowed and why.
 */
import { computeInspection, isGroundedByInspection, type InspectionInput } from './inspections';

export interface ClubPolicySettings {
  maxBookingHours: number | null;
  maxAdvanceDays: number | null;
  minBookingNoticeHours: number | null;
  blockOnOverdueInspection: boolean;
  blockOnGroundedSquawk: boolean;
  requireCurrencyToBook: boolean;
  blockOnUnpaidBalance: boolean;
}

/** Safe defaults when a club has no policy row yet. */
export const DEFAULT_POLICY: ClubPolicySettings = {
  maxBookingHours: null,
  maxAdvanceDays: null,
  minBookingNoticeHours: null,
  blockOnOverdueInspection: true,
  blockOnGroundedSquawk: true,
  requireCurrencyToBook: false,
  blockOnUnpaidBalance: false,
};

export interface BookingContext {
  start: Date;
  end: Date;
  /** Aircraft is grounded by an active maintenance squawk. */
  hasGroundingSquawk: boolean;
  /** Aircraft's active inspections + current tach, for airworthiness eval. */
  inspections: InspectionInput[];
  currentTachHours: number | null;
  now?: Date;
}

export interface PolicyViolation {
  code:
    | 'MAX_DURATION'
    | 'MAX_ADVANCE'
    | 'MIN_NOTICE'
    | 'GROUNDED_SQUAWK'
    | 'OVERDUE_INSPECTION';
  message: string;
}

/**
 * Evaluate a prospective booking against a club's policy.
 * Returns the first blocking violation (null = allowed). Order matters:
 * airworthiness blocks are surfaced before scheduling-limit blocks.
 */
export function evaluateBooking(
  policy: ClubPolicySettings,
  ctx: BookingContext
): PolicyViolation | null {
  const now = ctx.now ?? new Date();

  // Airworthiness first — safety over convenience.
  if (policy.blockOnGroundedSquawk && ctx.hasGroundingSquawk) {
    return {
      code: 'GROUNDED_SQUAWK',
      message: 'This aircraft is grounded for maintenance. Please contact your admin.',
    };
  }

  if (policy.blockOnOverdueInspection) {
    const computed = ctx.inspections.map((i) => computeInspection(i, ctx.currentTachHours, now));
    if (isGroundedByInspection(computed)) {
      const overdue = computed
        .filter((c) => c.isRequired && c.status === 'OVERDUE')
        .map((c) => c.label)
        .join(', ');
      return {
        code: 'OVERDUE_INSPECTION',
        message: `This aircraft has an overdue required inspection (${overdue}) and can't be booked.`,
      };
    }
  }

  const durationHours = (ctx.end.getTime() - ctx.start.getTime()) / 3_600_000;

  if (policy.maxBookingHours != null && durationHours > policy.maxBookingHours) {
    return {
      code: 'MAX_DURATION',
      message: `Bookings are limited to ${policy.maxBookingHours} hours at this club.`,
    };
  }

  if (policy.minBookingNoticeHours != null) {
    const noticeHours = (ctx.start.getTime() - now.getTime()) / 3_600_000;
    if (noticeHours < policy.minBookingNoticeHours) {
      return {
        code: 'MIN_NOTICE',
        message: `Bookings must be made at least ${policy.minBookingNoticeHours} hours in advance.`,
      };
    }
  }

  if (policy.maxAdvanceDays != null) {
    const advanceDays = (ctx.start.getTime() - now.getTime()) / 86_400_000;
    if (advanceDays > policy.maxAdvanceDays) {
      return {
        code: 'MAX_ADVANCE',
        message: `Bookings can't be made more than ${policy.maxAdvanceDays} days in advance.`,
      };
    }
  }

  return null;
}

/** Normalize a raw DB/API policy row (Decimals as strings) into settings. */
export function normalizePolicy(row: Record<string, unknown> | null): ClubPolicySettings {
  if (!row) return { ...DEFAULT_POLICY };
  const num = (v: unknown): number | null => {
    if (v === null || v === undefined) return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    return Number.isFinite(n) ? n : null;
  };
  return {
    maxBookingHours: num(row.maxBookingHours),
    maxAdvanceDays: row.maxAdvanceDays == null ? null : Math.round(Number(row.maxAdvanceDays)),
    minBookingNoticeHours: num(row.minBookingNoticeHours),
    blockOnOverdueInspection: row.blockOnOverdueInspection !== false,
    blockOnGroundedSquawk: row.blockOnGroundedSquawk !== false,
    requireCurrencyToBook: row.requireCurrencyToBook === true,
    blockOnUnpaidBalance: row.blockOnUnpaidBalance === true,
  };
}
