import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/admin/clubs - List all flying clubs (site-wide)
// Optional query params: ?search=name
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = (session.user as any)?.role;
    if (role !== 'admin' && role !== 'owner') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    // Default cap kept generous so existing full-list consumers (e.g. the
    // desktop admin club list) aren't truncated; pass ?limit= for paginated UIs.
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '100')));
    const offset = (page - 1) * limit;

    const where = search ? { name: { contains: search } } : undefined;

    const [total, groups] = await prisma.$transaction([
      prisma.organization.count({ where }),
      prisma.organization.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        include: {
          owner: { select: { id: true, name: true, email: true, username: true } },
          _count: {
            select: {
              members: true,
            },
          },
        },
      }),
    ]);

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
        owner: g.owner,
        createdAt: g.createdAt?.toISOString() || null,
        members: Number(g._count?.members || 0),
        aircraft: Number(aircraftCountMap.get(g.id) || 0),
        plan: 'Free',
        revenue: 0,
        status: 'active',
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching clubs:', error);
    return NextResponse.json({ error: 'Failed to fetch clubs' }, { status: 500 });
  }
}
