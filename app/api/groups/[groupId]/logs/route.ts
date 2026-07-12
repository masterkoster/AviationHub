import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isUuid } from '@/lib/validate';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

// GET flight logs and maintenance for a group
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { groupId } = await params;
    if (!isUuid(groupId)) {
      return NextResponse.json({ error: 'Invalid groupId' }, { status: 400 });
    }

    const userId = session.user.id;

    // Check membership
    const membership = await prisma.organizationMember.findFirst({
      where: { organizationId: groupId, userId }
    });

    if (!membership) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }

    // Get flight logs
    const flightLogs = await prisma.flightLog.findMany({
      where: { organizationId: groupId },
      include: {
        clubAircraft: { select: { id: true, nNumber: true, customName: true, nickname: true } },
        pilotProfile: { select: { userId: true, user: { select: { id: true, name: true, email: true } } } }
      },
      orderBy: { date: 'desc' }
    });

    // Get maintenance items
    const maintenance = await prisma.maintenance.findMany({
      where: { organizationId: groupId },
      include: {
        clubAircraft: { select: { id: true, nNumber: true, customName: true, nickname: true, make: true, model: true } },
        reportedByPilot: { select: { user: { select: { id: true, name: true, email: true } } } }
      },
      orderBy: { reportedDate: 'desc' }
    });

    // Fall back to reportedByUserId for older/legacy rows that never got a
    // reportedByPilotId (Maintenance has no Prisma relation on that column,
    // so it's resolved with a small batch lookup here).
    const missingReporterUserIds = [
      ...new Set(
        maintenance
          .filter(m => !m.reportedByPilot?.user?.name && m.reportedByUserId)
          .map(m => m.reportedByUserId as string)
      ),
    ];
    const fallbackReporters = missingReporterUserIds.length
      ? await prisma.user.findMany({
          where: { id: { in: missingReporterUserIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const fallbackReporterMap = new Map(fallbackReporters.map(u => [u.id, u]));

    const formattedLogs = flightLogs.map(fl => ({
      id: fl.id,
      aircraftId: fl.clubAircraftId,
      userId: fl.pilotProfile?.userId,
      date: fl.date,
      // Prisma Decimal serializes to a string over JSON; coerce to number so
      // clients (which type these as number) can call numeric methods safely.
      tachTime: fl.tachTime != null ? Number(fl.tachTime) : null,
      hobbsTime: fl.hobbsTime != null ? Number(fl.hobbsTime) : null,
      notes: fl.notes,
      aircraft: fl.clubAircraft ? {
        id: fl.clubAircraft.id,
        nNumber: fl.clubAircraft.nNumber,
        customName: fl.clubAircraft.customName,
        nickname: fl.clubAircraft.nickname
      } : null,
      user: fl.pilotProfile?.user ? {
        id: fl.pilotProfile.user.id,
        name: fl.pilotProfile.user.name,
        email: fl.pilotProfile.user.email
      } : null
    }));

    const formattedMaintenance = maintenance.map(m => {
      const reporter = m.reportedByPilot?.user ?? fallbackReporterMap.get(m.reportedByUserId ?? '') ?? null;
      return {
        id: m.id,
        description: m.description,
        status: m.status,
        category: m.category,
        severity: m.severity,
        isGrounded: m.isGrounded,
        reportedDate: m.reportedDate,
        resolvedDate: m.resolvedDate,
        cost: m.cost !== null && m.cost !== undefined ? Number(m.cost) : null,
        notes: m.notes,
        reportedBy: reporter ? { id: reporter.id, name: reporter.name, email: reporter.email } : null,
        aircraft: m.clubAircraft ? {
          id: m.clubAircraft.id,
          nNumber: m.clubAircraft.nNumber,
          customName: m.clubAircraft.customName,
          nickname: m.clubAircraft.nickname,
          make: m.clubAircraft.make,
          model: m.clubAircraft.model
        } : null
      };
    });

    return NextResponse.json({
      logs: formattedLogs,
      maintenance: formattedMaintenance
    });
  } catch (error) {
    console.error('Error fetching logs:', error);
    return NextResponse.json({ error: 'Failed to fetch logs and maintenance' }, { status: 500 });
  }
}
