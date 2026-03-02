import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/admin/clubs - List all flying clubs (site-wide)
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = (session.user as any)?.role;
    if (role !== 'admin' && role !== 'owner') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const groups = await prisma.organization.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            members: true,
          },
        },
      },
    });

    const groupIds = groups.map(g => g.id);
    const aircraftCounts = await prisma.clubAircraft.groupBy({
      by: ['organizationId'],
      _count: { _all: true },
      where: { organizationId: { in: groupIds } },
    });
    const aircraftCountMap = new Map(aircraftCounts.map(a => [a.organizationId, a._count._all]));

    return NextResponse.json({
      clubs: groups.map(g => ({
        id: g.id,
        name: g.name,
        description: g.description,
        ownerId: g.ownerId,
        createdAt: g.createdAt?.toISOString() || null,
        members: Number(g._count?.members || 0),
        aircraft: Number(aircraftCountMap.get(g.id) || 0),
        plan: 'Free',
        revenue: 0,
        status: 'active',
      }))
    });
  } catch (error) {
    console.error('Error fetching clubs:', error);
    return NextResponse.json({ error: 'Failed to fetch clubs' }, { status: 500 });
  }
}
