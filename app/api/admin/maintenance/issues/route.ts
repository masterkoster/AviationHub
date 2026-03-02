import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/auth';

// Helper function to ensure user is admin/owner for the group
async function ensureAdminForGroup(userId: string, groupId: string) {
  const membership = await prisma.organizationMember.findFirst({
    where: {
      userId,
      organizationId: groupId,
      role: { in: ['ADMIN', 'OWNER'] }
    }
  });
  return !!membership;
}

export async function GET(request: Request) {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get('groupId');

    if (!groupId) {
      return NextResponse.json({ error: 'Group ID required' }, { status: 400 });
    }

    // Check admin access
    const isAdmin = await ensureAdminForGroup(session.user.id, groupId);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Get all aircraft IDs for this group
    const aircraftList = await prisma.clubAircraft.findMany({
      where: { organizationId: groupId },
      select: { id: true, nNumber: true, nickname: true }
    });

    const aircraftIds = aircraftList.map(a => a.id);

    // Fetch pending maintenance issues (plane-specific only for admin review)
    const issues = await prisma.maintenance.findMany({
      where: {
        clubAircraftId: { in: aircraftIds },
        status: { in: ['NEEDED', 'IN_PROGRESS'] },
        isPlaneSpecific: true
      },
      orderBy: { reportedDate: 'desc' }
    });

    // Enrich with pilot names and aircraft details
    const enrichedIssues = await Promise.all(issues.map(async (issue) => {
      const pilot = issue.reportedByPilotId
        ? await prisma.pilotProfile.findUnique({
            where: { id: issue.reportedByPilotId },
            include: { user: { select: { name: true, email: true } } },
          })
        : null;

      const aircraft = aircraftList.find(a => a.id === issue.clubAircraftId);

      return {
        id: issue.id,
        pilot: pilot?.user?.name || 'Unknown',
        pilotEmail: pilot?.user?.email || '',
        aircraft: aircraft?.nNumber || 'N/A',
        aircraftNickname: aircraft?.nickname || '',
        aircraftId: issue.clubAircraftId,
        date: issue.reportedDate?.toISOString().split('T')[0] || issue.createdAt?.toISOString().split('T')[0] || 'N/A',
        issue: issue.description,
        category: issue.category || 'OTHER',
        severity: (issue.severity || 'LOW').toLowerCase(),
        status: issue.status || 'NEEDED',
        isPlaneSpecific: issue.isPlaneSpecific,
        isGrounded: issue.isGrounded,
        flightLogId: issue.flightLogId,
        notes: issue.notes,
        cost: issue.cost ? issue.cost.toNumber() : null,
        reportedDate: issue.reportedDate,
      };
    }));

    return NextResponse.json({ issues: enrichedIssues });
  } catch (error) {
    console.error('Error fetching maintenance issues:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
