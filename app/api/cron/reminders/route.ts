import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendBookingReminder, sendInspectionDigest, InspectionDigestItem } from '@/lib/club/notifications';
import { computeInspection, inspectionCountdown } from '@/lib/club/inspections';
import { FINANCE_ROLES } from '@/lib/club/roles';

// POST /api/cron/reminders — PUBLIC BY DESIGN. No session; the caller is a
// scheduled job (see .github/workflows/reminders-cron.yml), authenticated by
// the same shared x-cron-secret header as /api/cron/billing.
//
// Designed to run HOURLY. Dedupe is stateless, by time window (no schema
// changes / no "reminderSent" flag):
//
//  - Booking reminders: bookings whose startTime falls in [now+23h, now+24h).
//    The window is exactly one hour wide — the same as the run cadence — so
//    consecutive hourly runs tile the timeline without gaps or overlaps and
//    each booking is picked up by exactly one run (~24h before it starts).
//    If a run is skipped, that hour's bookings miss their reminder rather
//    than being double-sent later.
//
//  - Inspection digest: only fires when the current UTC time is Monday
//    06:00–06:59 (one run per week under hourly scheduling). For each org,
//    computes live inspection status for every active inspection across its
//    fleet and emails ADMINs/TREASURERs a digest of DUE_SOON/OVERDUE items.
//    Orgs with nothing due are skipped.
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'Cron not configured' }, { status: 503 });
  }

  const provided = request.headers.get('x-cron-secret');
  if (provided !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();

    // ── Booking reminders: startTime in [now+23h, now+24h) ─────────────────
    const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const upcoming = await prisma.booking.findMany({
      where: { startTime: { gte: windowStart, lt: windowEnd } },
      include: {
        organization: { select: { name: true } },
        clubAircraft: { select: { nNumber: true, customName: true, nickname: true } },
        pilotProfile: { include: { user: { select: { name: true, email: true } } } },
      },
    });

    let remindersSent = 0;
    let remindersFailed = 0;
    let remindersSkipped = 0;

    for (const booking of upcoming) {
      const email = booking.pilotProfile?.user?.email;
      if (!email) {
        remindersSkipped += 1;
        continue;
      }
      const aircraftLabel = booking.clubAircraft
        ? booking.clubAircraft.nickname || booking.clubAircraft.customName || booking.clubAircraft.nNumber || 'the aircraft'
        : 'the aircraft';
      const result = await sendBookingReminder({
        to: email,
        memberName: booking.pilotProfile?.user?.name || 'Member',
        clubName: booking.organization?.name || 'Your Flying Club',
        aircraftLabel,
        start: booking.startTime,
        end: booking.endTime,
        purpose: booking.purpose,
      });
      remindersSent += result.sent;
      remindersFailed += result.failed;
      if (result.sent === 0 && result.failed === 0) remindersSkipped += 1;
    }

    // ── Weekly inspection digest: Monday 06:00 UTC only ─────────────────────
    const isDigestHour = now.getUTCDay() === 1 && now.getUTCHours() === 6;

    let digestOrgs = 0;
    let digestEmailsSent = 0;
    let digestEmailsFailed = 0;
    let digestItems = 0;

    if (isDigestHour) {
      const aircraftWithInspections = await prisma.clubAircraft.findMany({
        where: {
          organizationId: { not: null },
          inspections: { some: { isActive: true } },
        },
        select: {
          organizationId: true,
          nNumber: true,
          customName: true,
          nickname: true,
          totalTachHours: true,
          inspections: { where: { isActive: true } },
        },
      });

      // Group DUE_SOON/OVERDUE items per org.
      const itemsByOrg = new Map<string, InspectionDigestItem[]>();
      for (const aircraft of aircraftWithInspections) {
        const orgId = aircraft.organizationId as string;
        const tach = aircraft.totalTachHours !== null ? Number(aircraft.totalTachHours) : null;
        const aircraftLabel = aircraft.nickname || aircraft.customName || aircraft.nNumber || 'Aircraft';

        for (const insp of aircraft.inspections) {
          const computed = computeInspection(
            {
              id: insp.id,
              type: insp.type,
              label: insp.label,
              lastDoneDate: insp.lastDoneDate,
              lastDoneHours: insp.lastDoneHours !== null ? Number(insp.lastDoneHours) : null,
              intervalMonths: insp.intervalMonths,
              intervalHours: insp.intervalHours !== null ? Number(insp.intervalHours) : null,
              isRequired: insp.isRequired,
              isActive: insp.isActive,
              notes: insp.notes,
            },
            tach,
            now,
          );

          if (computed.status !== 'DUE_SOON' && computed.status !== 'OVERDUE') continue;

          const list = itemsByOrg.get(orgId) ?? [];
          list.push({
            aircraft: aircraftLabel,
            label: computed.label,
            status: computed.status,
            countdown: inspectionCountdown(computed),
          });
          itemsByOrg.set(orgId, list);
        }
      }

      for (const [orgId, items] of itemsByOrg) {
        // OVERDUE first, then DUE_SOON, for scannable emails.
        items.sort((a, b) => (a.status === b.status ? 0 : a.status === 'OVERDUE' ? -1 : 1));

        const [club, admins] = await Promise.all([
          prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } }),
          prisma.organizationMember.findMany({
            where: { organizationId: orgId, role: { in: [...FINANCE_ROLES] } },
            include: { user: { select: { email: true } } },
          }),
        ]);

        const to = admins.map(a => a.user?.email).filter((email): email is string => !!email);
        if (to.length === 0) continue;

        const result = await sendInspectionDigest({
          to,
          clubName: club?.name || 'Your Flying Club',
          items,
        });

        digestOrgs += 1;
        digestItems += items.length;
        digestEmailsSent += result.sent;
        digestEmailsFailed += result.failed;
      }
    }

    return NextResponse.json({
      window: { start: windowStart.toISOString(), end: windowEnd.toISOString() },
      bookingReminders: {
        matched: upcoming.length,
        sent: remindersSent,
        failed: remindersFailed,
        skipped: remindersSkipped,
      },
      inspectionDigest: {
        ran: isDigestHour,
        orgsNotified: digestOrgs,
        items: digestItems,
        emailsSent: digestEmailsSent,
        emailsFailed: digestEmailsFailed,
      },
    });
  } catch (error) {
    console.error('Error in cron reminders run:', error);
    return NextResponse.json({ error: 'Cron reminders run failed' }, { status: 500 });
  }
}
