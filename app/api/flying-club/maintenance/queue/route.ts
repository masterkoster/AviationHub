import { NextResponse } from 'next/server';
import { auth, prisma } from '@/lib/auth';
import { isUuid } from '@/lib/validate';

const SEVERITY_RANK: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };

// GET maintenance queue. Optionally scoped to a single club via ?groupId=.
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get('groupId');

    let orgIds: string[];

    if (groupId) {
      if (!isUuid(groupId)) {
        return NextResponse.json({ error: 'Invalid groupId' }, { status: 400 });
      }
      const membership = await prisma.organizationMember.findFirst({
        where: { organizationId: groupId, userId, role: 'ADMIN' },
      });
      if (!membership) {
        return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
      }
      orgIds = [groupId];
    } else {
      // No groupId provided: aggregate across every club the caller admins.
      const memberships = await prisma.organizationMember.findMany({
        where: { userId, role: { in: ['ADMIN', 'OWNER'] } },
        select: { organizationId: true },
      });
      orgIds = memberships.map(m => m.organizationId).filter(Boolean) as string[];
    }

    if (orgIds.length === 0) {
      return NextResponse.json({ queue: [] });
    }

    const maintenance = await prisma.maintenance.findMany({
      where: {
        organizationId: { in: orgIds },
        status: { not: 'COMPLETED' },
      },
      include: {
        organization: { select: { id: true, name: true } },
        clubAircraft: { select: { id: true, nNumber: true, customName: true, nickname: true } },
        reportedByPilot: { select: { user: { select: { id: true, name: true, email: true } } } },
      },
      orderBy: [{ reportedDate: 'desc' }],
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
    const fallbackUsers = missingReporterUserIds.length
      ? await prisma.user.findMany({
          where: { id: { in: missingReporterUserIds } },
          select: { id: true, name: true },
        })
      : [];
    const fallbackNameMap = new Map(fallbackUsers.map(u => [u.id, u.name]));

    const formatted = maintenance.map(m => ({
      id: m.id,
      organizationId: m.organizationId,
      organizationName: m.organization?.name,
      clubAircraftId: m.clubAircraftId,
      aircraftNNumber: m.clubAircraft?.nNumber,
      aircraftNickname: m.clubAircraft?.nickname ?? m.clubAircraft?.customName,
      description: m.description,
      status: m.status,
      isGrounded: m.isGrounded,
      severity: m.severity,
      category: m.category,
      reportedByUserId: m.reportedByUserId,
      reportedByName: m.reportedByPilot?.user?.name ?? fallbackNameMap.get(m.reportedByUserId ?? '') ?? null,
      reportedDate: m.reportedDate,
      resolvedDate: m.resolvedDate,
      cost: m.cost !== null && m.cost !== undefined ? Number(m.cost) : null,
      notes: m.notes,
    }));

    // Sort by severity (HIGH first), then grounded, then most recently reported.
    formatted.sort((a, b) => {
      const sevDiff = (SEVERITY_RANK[b.severity ?? 'LOW'] ?? 0) - (SEVERITY_RANK[a.severity ?? 'LOW'] ?? 0);
      if (sevDiff !== 0) return sevDiff;
      if (a.isGrounded !== b.isGrounded) return a.isGrounded ? -1 : 1;
      const aDate = a.reportedDate ? new Date(a.reportedDate).getTime() : 0;
      const bDate = b.reportedDate ? new Date(b.reportedDate).getTime() : 0;
      return bDate - aDate;
    });

    return NextResponse.json({ queue: formatted });
  } catch (error) {
    console.error('Error fetching maintenance queue:', error);
    return NextResponse.json({ error: 'Failed to fetch maintenance queue', details: String(error) }, { status: 500 });
  }
}

// POST report maintenance
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();
    const { organizationId, clubAircraftId, description, severity, category, isGrounded } = body;

    if (!organizationId || !description) {
      return NextResponse.json({ error: 'organizationId and description are required' }, { status: 400 });
    }

    // Check membership
    const membership = await prisma.organizationMember.findFirst({
      where: { organizationId, userId }
    });

    if (!membership) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }

    const maintenance = await prisma.maintenance.create({
      data: {
        organizationId,
        clubAircraftId: clubAircraftId || null,
        description,
        status: 'NEEDED',
        severity: severity || 'LOW',
        category: category || 'OTHER',
        isGrounded: isGrounded || false,
        isPlaneSpecific: !!clubAircraftId,
        reportedByUserId: userId,
        reportedDate: new Date()
      }
    });

    return NextResponse.json(maintenance);
  } catch (error) {
    console.error('Error reporting maintenance:', error);
    return NextResponse.json({ error: 'Failed to report maintenance', details: String(error) }, { status: 500 });
  }
}

// PATCH aircraft-level ground/unground shortcut. Grounding creates a new
// high-severity Maintenance item; ungrounding resolves every open grounding
// item for that aircraft (matches how lib/club/aircraft-profile.ts derives
// grounded state: any OPEN Maintenance row with isGrounded=true).
export async function PATCH(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();
    const { clubAircraftId, action, description } = body;

    if (!clubAircraftId || !['ground', 'unground'].includes(action)) {
      return NextResponse.json({ error: 'clubAircraftId and action (ground|unground) are required' }, { status: 400 });
    }

    const aircraft = await prisma.clubAircraft.findUnique({
      where: { id: clubAircraftId },
      select: { id: true, organizationId: true },
    });

    if (!aircraft || !aircraft.organizationId) {
      return NextResponse.json({ error: 'Aircraft not found' }, { status: 404 });
    }

    const membership = await prisma.organizationMember.findFirst({
      where: { organizationId: aircraft.organizationId, userId, role: 'ADMIN' },
    });

    if (!membership) {
      return NextResponse.json({ error: 'Only club admins can ground/unground aircraft' }, { status: 403 });
    }

    if (action === 'ground') {
      const created = await prisma.maintenance.create({
        data: {
          organizationId: aircraft.organizationId,
          clubAircraftId: aircraft.id,
          description: description?.trim() || 'Grounded by admin',
          status: 'NEEDED',
          severity: 'HIGH',
          isGrounded: true,
          isPlaneSpecific: true,
          reportedByUserId: userId,
          reportedDate: new Date(),
        },
      });
      return NextResponse.json({ success: true, action, maintenance: created });
    }

    // unground: resolve every open, grounding maintenance item for this aircraft
    const result = await prisma.maintenance.updateMany({
      where: {
        clubAircraftId: aircraft.id,
        isGrounded: true,
        status: { not: 'COMPLETED' },
      },
      data: {
        status: 'COMPLETED',
        resolvedDate: new Date(),
        isGrounded: false,
      },
    });

    return NextResponse.json({ success: true, action, resolvedCount: result.count });
  } catch (error) {
    console.error('Error updating aircraft grounding:', error);
    return NextResponse.json({ error: 'Failed to update grounding', details: String(error) }, { status: 500 });
  }
}
