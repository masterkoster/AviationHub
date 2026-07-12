import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isUuid } from '@/lib/validate';

interface RouteParams {
  params: Promise<{ clubId: string }>;
}

// GET /api/admin/clubs/[clubId] - Full club details (admin only, no membership check)
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = (session.user as any)?.role;
    if (role !== 'admin' && role !== 'owner') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { clubId } = await params;
    if (!isUuid(clubId)) {
      return NextResponse.json({ error: 'Invalid clubId' }, { status: 400 });
    }

    const club = await prisma.organization.findUnique({
      where: { id: clubId },
      include: {
        owner: { select: { id: true, name: true, email: true, username: true } },
        members: {
          include: {
            user: { select: { id: true, name: true, email: true, username: true } },
          },
          orderBy: { joinedAt: 'desc' },
        },
        aircraft: {
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: {
            bookings: true,
            members: true,
            aircraft: true,
          },
        },
      },
    });

    if (!club) {
      return NextResponse.json({ error: 'Club not found' }, { status: 404 });
    }

    return NextResponse.json({
      club: {
        id: club.id,
        name: club.name,
        description: club.description,
        type: club.type,
        publicSlug: club.publicSlug,
        ownerId: club.ownerId,
        owner: club.owner,
        createdAt: club.createdAt?.toISOString() || null,
        updatedAt: club.updatedAt?.toISOString() || null,
        stats: {
          members: club._count.members,
          aircraft: club._count.aircraft,
          bookings: club._count.bookings,
        },
        members: club.members.map(m => ({
          id: m.id,
          userId: m.userId,
          role: m.role,
          joinedAt: m.joinedAt?.toISOString() || null,
          user: m.user,
        })),
        aircraft: club.aircraft.map(a => ({
          id: a.id,
          make: a.make,
          model: a.model,
          nickname: a.nickname,
          customName: a.customName,
          nNumber: a.nNumber,
          status: a.status,
          hourlyRate: a.hourlyRate ? Number(a.hourlyRate) : null,
          year: a.year,
        })),
      },
    });
  } catch (error) {
    console.error('Error fetching club detail:', error);
    return NextResponse.json({ error: 'Failed to fetch club detail' }, { status: 500 });
  }
}
