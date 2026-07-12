import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isUuid } from '@/lib/validate';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

// GET /api/clubs/[groupId]/blockouts - List block-out periods for a club's aircraft
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

    const membership = await prisma.organizationMember.findFirst({
      where: { organizationId: groupId, userId: session.user.id },
    });

    if (!membership) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }

    const blockOuts = await prisma.blockOut.findMany({
      where: { organizationId: groupId },
      include: { clubAircraft: { select: { id: true, nNumber: true, customName: true, nickname: true } } },
      orderBy: { startTime: 'asc' },
    });

    const formatted = blockOuts.map(b => ({
      id: b.id,
      organizationId: b.organizationId,
      clubAircraftId: b.clubAircraftId,
      aircraftNNumber: b.clubAircraft?.nNumber ?? null,
      aircraftLabel: b.clubAircraft?.nickname ?? b.clubAircraft?.customName ?? b.clubAircraft?.nNumber ?? null,
      title: b.title,
      startTime: b.startTime,
      endTime: b.endTime,
      createdAt: b.createdAt,
    }));

    return NextResponse.json({ blockOuts: formatted });
  } catch (error) {
    console.error('Error fetching blockouts:', error);
    return NextResponse.json({ error: 'Failed to fetch blockouts' }, { status: 500 });
  }
}

// POST /api/clubs/[groupId]/blockouts - Create a block-out period (admin only)
export async function POST(request: Request, { params }: RouteParams) {
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
      where: { organizationId: groupId, userId: session.user.id, role: 'ADMIN' },
    });

    if (!membership) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { clubAircraftId, title, startTime, endTime } = body;

    if (!title || !startTime || !endTime) {
      return NextResponse.json({ error: 'Title, startTime, and endTime required' }, { status: 400 });
    }

    if (clubAircraftId && !isUuid(clubAircraftId)) {
      return NextResponse.json({ error: 'Invalid clubAircraftId' }, { status: 400 });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return NextResponse.json({ error: 'endTime must be after startTime' }, { status: 400 });
    }

    if (clubAircraftId) {
      const aircraft = await prisma.clubAircraft.findFirst({
        where: { id: clubAircraftId, organizationId: groupId },
        select: { id: true },
      });
      if (!aircraft) {
        return NextResponse.json({ error: 'Aircraft not found in this club' }, { status: 404 });
      }
    }

    const blockOut = await prisma.blockOut.create({
      data: {
        organizationId: groupId,
        clubAircraftId: clubAircraftId || null,
        title,
        startTime: start,
        endTime: end,
      },
    });

    return NextResponse.json({ success: true, blockOut });
  } catch (error) {
    console.error('Error creating blockout:', error);
    return NextResponse.json({ error: 'Failed to create blockout' }, { status: 500 });
  }
}

// DELETE /api/clubs/[groupId]/blockouts?blockOutId=... - Remove a block-out (admin only)
export async function DELETE(request: Request, { params }: RouteParams) {
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
      where: { organizationId: groupId, userId: session.user.id, role: 'ADMIN' },
    });

    if (!membership) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const url = new URL(request.url);
    const blockOutId = url.searchParams.get('blockOutId');
    if (!blockOutId) {
      return NextResponse.json({ error: 'blockOutId required' }, { status: 400 });
    }

    const existing = await prisma.blockOut.findFirst({ where: { id: blockOutId, organizationId: groupId } });
    if (!existing) {
      return NextResponse.json({ error: 'Block-out not found' }, { status: 404 });
    }

    await prisma.blockOut.delete({ where: { id: blockOutId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting blockout:', error);
    return NextResponse.json({ error: 'Failed to delete blockout' }, { status: 500 });
  }
}
