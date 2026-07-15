import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isUuid } from '@/lib/validate';
import { isFinanceRole } from '@/lib/club/roles';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

const DEFAULT_WINDOW_DAYS = 90;
// Sanity caps — this endpoint has no pagination yet, so bound the raw rows
// pulled per club to keep the aggregation fast for very large/old clubs.
const MAX_FLIGHT_LOGS = 20000;
const MAX_INVOICES = 5000;

// Mirrors lib/billing.ts hoursForFlight — that helper isn't exported, and the
// logic is small enough to duplicate rather than change a file another
// billing flow depends on. Keep in sync if the hobbs/tach fallback changes.
function hoursForFlight(flight: { hobbsStart: unknown; hobbsEnd: unknown; hobbsTime: unknown; tachTime: unknown }): number {
  const toNum = (v: unknown) => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return v;
    if (typeof v === 'object' && v !== null && 'toNumber' in v && typeof (v as { toNumber: unknown }).toNumber === 'function') {
      return (v as { toNumber: () => number }).toNumber();
    }
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  };
  const start = toNum(flight.hobbsStart);
  const end = toNum(flight.hobbsEnd);
  if (start !== null && end !== null) return Math.max(0, end - start);
  const hobbsTime = toNum(flight.hobbsTime);
  if (hobbsTime !== null) return hobbsTime;
  const tach = toNum(flight.tachTime);
  return tach ?? 0;
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// GET /api/groups/[groupId]/finance/overview — admin/treasurer: per-member
// roster with flight activity (period-filtered) and invoice balances
// (all-time) for the club's finance console.
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { groupId } = await params;
    if (!isUuid(groupId)) {
      return NextResponse.json({ error: 'Invalid groupId' }, { status: 400 });
    }

    const membership = await prisma.organizationMember.findFirst({
      where: { organizationId: groupId, userId: session.user.id },
    });
    if (!membership) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }
    if (!isFinanceRole(membership.role)) {
      return NextResponse.json({ error: 'Admin or treasurer access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const now = new Date();
    const to = parseDate(searchParams.get('to')) ?? now;
    const from = parseDate(searchParams.get('from')) ?? new Date(to.getTime() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    // Filter is inclusive of the whole "to" day.
    const toEnd = new Date(to.getTime());
    toEnd.setHours(23, 59, 59, 999);

    const aircraftIdParam = searchParams.get('aircraftId');
    const aircraftId = aircraftIdParam && isUuid(aircraftIdParam) ? aircraftIdParam : null;

    // Roster comes from OrganizationMember so members with zero flights in
    // the period still show up. Pilot identity flows through
    // PilotProfile.userId (the same chain lib/billing.ts and the invoices
    // route use) — OrganizationMember.pilotProfileId is not reliably kept in
    // sync, so it's not used here.
    const members = await prisma.organizationMember.findMany({
      where: { organizationId: groupId },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    const userIds = members.map(m => m.userId);
    const pilotProfiles = userIds.length
      ? await prisma.pilotProfile.findMany({
          where: { userId: { in: userIds } },
          select: { id: true, userId: true },
        })
      : [];
    const pilotProfileIdByUserId = new Map(pilotProfiles.map(p => [p.userId, p.id]));
    const pilotProfileIds = pilotProfiles.map(p => p.id);

    const flightLogs = pilotProfileIds.length
      ? await prisma.flightLog.findMany({
          where: {
            organizationId: groupId,
            pilotProfileId: { in: pilotProfileIds },
            date: { gte: from, lte: toEnd },
            ...(aircraftId ? { clubAircraftId: aircraftId } : {}),
          },
          select: {
            pilotProfileId: true,
            date: true,
            hobbsStart: true,
            hobbsEnd: true,
            hobbsTime: true,
            tachTime: true,
            clubAircraftId: true,
            clubAircraft: { select: { id: true, nNumber: true } },
          },
          orderBy: { date: 'desc' },
          take: MAX_FLIGHT_LOGS,
        })
      : [];

    const invoices = pilotProfileIds.length
      ? await prisma.invoice.findMany({
          where: { organizationId: groupId, pilotProfileId: { in: pilotProfileIds } },
          select: { pilotProfileId: true, totalAmount: true, status: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: MAX_INVOICES,
        })
      : [];

    interface AircraftAgg { id: string; nNumber: string | null; hours: number }
    interface MemberAgg {
      flights: number;
      hours: number;
      lastFlight: Date | null;
      aircraft: Map<string, AircraftAgg>;
      billedInPeriod: number;
      outstanding: number;
      oldestUnpaidAt: Date | null;
    }

    const aggByPilotProfileId = new Map<string, MemberAgg>();
    const getAgg = (pilotProfileId: string): MemberAgg => {
      let agg = aggByPilotProfileId.get(pilotProfileId);
      if (!agg) {
        agg = { flights: 0, hours: 0, lastFlight: null, aircraft: new Map(), billedInPeriod: 0, outstanding: 0, oldestUnpaidAt: null };
        aggByPilotProfileId.set(pilotProfileId, agg);
      }
      return agg;
    };

    for (const flight of flightLogs) {
      if (!flight.pilotProfileId) continue;
      const agg = getAgg(flight.pilotProfileId);
      const hours = hoursForFlight(flight);
      agg.flights += 1;
      agg.hours += hours;
      if (!agg.lastFlight || (flight.date && flight.date > agg.lastFlight)) {
        agg.lastFlight = flight.date;
      }
      if (flight.clubAircraft) {
        const existing = agg.aircraft.get(flight.clubAircraft.id);
        if (existing) {
          existing.hours += hours;
        } else {
          agg.aircraft.set(flight.clubAircraft.id, { id: flight.clubAircraft.id, nNumber: flight.clubAircraft.nNumber, hours });
        }
      }
    }

    for (const invoice of invoices) {
      if (!invoice.pilotProfileId) continue;
      const agg = getAgg(invoice.pilotProfileId);
      const amount = Number(invoice.totalAmount);
      if (invoice.createdAt >= from && invoice.createdAt <= toEnd) {
        agg.billedInPeriod += amount;
      }
      if (invoice.status === 'pending') {
        agg.outstanding += amount;
        if (!agg.oldestUnpaidAt || invoice.createdAt < agg.oldestUnpaidAt) {
          agg.oldestUnpaidAt = invoice.createdAt;
        }
      }
    }

    const result = members.map(m => {
      const pilotProfileId = pilotProfileIdByUserId.get(m.userId) ?? null;
      const agg = pilotProfileId ? aggByPilotProfileId.get(pilotProfileId) : undefined;
      const oldestUnpaidDays = agg?.oldestUnpaidAt
        ? Math.floor((now.getTime() - agg.oldestUnpaidAt.getTime()) / (24 * 60 * 60 * 1000))
        : null;

      return {
        userId: m.userId,
        pilotProfileId,
        name: m.user?.name ?? null,
        email: m.user?.email ?? '',
        role: m.role,
        flights: agg?.flights ?? 0,
        hours: agg?.hours ?? 0,
        billedInPeriod: agg?.billedInPeriod ?? 0,
        outstanding: agg?.outstanding ?? 0,
        lastFlight: agg?.lastFlight ?? null,
        aircraft: agg ? Array.from(agg.aircraft.values()) : [],
        oldestUnpaidDays,
      };
    });

    const totals = result.reduce(
      (acc, m) => {
        acc.hours += m.hours;
        acc.billed += m.billedInPeriod;
        acc.outstanding += m.outstanding;
        return acc;
      },
      { members: result.length, hours: 0, billed: 0, outstanding: 0 }
    );

    return NextResponse.json({ members: result, totals });
  } catch (error) {
    console.error('Error fetching finance overview:', error);
    return NextResponse.json({ error: 'Failed to fetch finance overview' }, { status: 500 });
  }
}
