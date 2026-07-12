import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isUuid } from '@/lib/validate';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

// GET block-outs (club-wide closures + per-aircraft downtime) for a group.
// Club-wide closures have clubAircraftId === null; per-aircraft downtime has it set.
// Creation/mutation of block-outs is owned by another engineer's admin console — this is read-only.
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

    const userId = session.user.id;

    // Check membership
    const membership = await prisma.organizationMember.findFirst({
      where: { organizationId: groupId, userId }
    });

    if (!membership) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }

    // Default window: anything still active now through the next 60 days,
    // enough to cover both an "active now" status banner and a 30-day downtime list.
    const now = Date.now();
    const { searchParams } = new URL(request.url);
    const startParam = searchParams.get('start');
    const endParam = searchParams.get('end');

    const windowStart = startParam ? new Date(startParam) : new Date(now);
    const windowEnd = endParam ? new Date(endParam) : new Date(now + 60 * 24 * 60 * 60 * 1000);

    if (isNaN(windowStart.getTime()) || isNaN(windowEnd.getTime())) {
      return NextResponse.json({ error: 'Invalid start or end date' }, { status: 400 });
    }

    // Overlaps the window: starts before window end, and ends after "now" (so still-active
    // block-outs that started in the past are included too).
    const blockOuts = await prisma.blockOut.findMany({
      where: {
        organizationId: groupId,
        startTime: { lte: windowEnd },
        endTime: { gte: new Date(now) }
      },
      include: {
        clubAircraft: { select: { id: true, nNumber: true, customName: true, nickname: true } }
      },
      orderBy: { startTime: 'asc' },
      take: 200
    });

    const formatted = blockOuts.map(b => ({
      id: b.id,
      title: b.title,
      startTime: b.startTime,
      endTime: b.endTime,
      clubAircraftId: b.clubAircraftId,
      aircraft: b.clubAircraft ? {
        id: b.clubAircraft.id,
        nNumber: b.clubAircraft.nNumber,
        customName: b.clubAircraft.customName,
        nickname: b.clubAircraft.nickname
      } : null
    }));

    return NextResponse.json(formatted);
  } catch (error) {
    console.error('Error fetching block-outs:', error);
    return NextResponse.json({ error: 'Failed to fetch block-outs', details: String(error) }, { status: 500 });
  }
}
