import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // Get all groups the user belongs to
    const memberships = await prisma.organizationMember.findMany({
      where: { userId },
      select: { organizationId: true }
    });

    const groupIds = memberships.map(m => m.organizationId).filter(Boolean) as string[];

    if (groupIds.length === 0) {
      return NextResponse.json([]);
    }

    // Default to a 90-days-past / 365-days-future window when no range is given,
    // so this doesn't pull every group's entire booking history unbounded.
    const now = Date.now();
    const { searchParams } = new URL(request.url);
    const startParam = searchParams.get('start');
    const endParam = searchParams.get('end');

    const start = startParam ? new Date(startParam) : new Date(now - 90 * 24 * 60 * 60 * 1000);
    const end = endParam ? new Date(endParam) : new Date(now + 365 * 24 * 60 * 60 * 1000);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return NextResponse.json({ error: 'Invalid start or end date' }, { status: 400 });
    }

    // Get bookings across all groups
    const bookings = await prisma.booking.findMany({
      where: { organizationId: { in: groupIds }, startTime: { gte: start, lte: end } },
      include: {
        organization: { select: { id: true, name: true } },
        clubAircraft: { select: { id: true, nNumber: true, customName: true, nickname: true, make: true, model: true } },
        pilotProfile: { select: { userId: true, user: { select: { id: true, name: true, email: true } } } }
      },
      orderBy: { startTime: 'desc' },
      take: 1000
    });

    const formatted = bookings.map(b => ({
      id: b.id,
      groupId: b.organizationId,
      groupName: b.organization?.name,
      aircraftId: b.clubAircraftId,
      userId: b.pilotProfileId,
      instructorId: b.instructorId,
      startTime: b.startTime,
      endTime: b.endTime,
      purpose: b.purpose,
      aircraft: b.clubAircraft ? {
        id: b.clubAircraft.id,
        nNumber: b.clubAircraft.nNumber,
        customName: b.clubAircraft.customName,
        nickname: b.clubAircraft.nickname,
        make: b.clubAircraft.make,
        model: b.clubAircraft.model
      } : null,
      user: b.pilotProfile?.user ? {
        id: b.pilotProfile.user.id,
        name: b.pilotProfile.user.name,
        email: b.pilotProfile.user.email
      } : null
    }));

    return NextResponse.json(formatted);
  } catch (error) {
    console.error('Error fetching all bookings:', error);
    return NextResponse.json({ error: 'Failed to fetch bookings' }, { status: 500 });
  }
}
