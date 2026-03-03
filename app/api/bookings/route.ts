import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get pilot profile for the user
    const pilotProfile = await prisma.pilotProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });

    if (!pilotProfile) {
      return NextResponse.json({ bookings: [] });
    }

    const { searchParams } = new URL(request.url);
    const daysParam = searchParams.get('days') || '7';
    const now = new Date();
    const windowEnd = daysParam === 'all'
      ? null
      : new Date(now.getTime() + Number(daysParam) * 24 * 60 * 60 * 1000);

    // Build the date filter
    const dateFilter: any = { gte: now };
    if (windowEnd) {
      dateFilter.lte = windowEnd;
    }

    // Get club bookings using Prisma
    const clubBookings = await prisma.booking.findMany({
      where: {
        pilotProfileId: pilotProfile.id,
        startTime: dateFilter,
      },
      include: {
        clubAircraft: true,
        organization: {
          select: { id: true, name: true },
        },
      },
      orderBy: { startTime: 'asc' },
    });

    const formattedBookings = clubBookings.map((b) => ({
      id: b.id,
      aircraftId: b.clubAircraftId,
      pilotProfileId: b.pilotProfileId,
      startTime: b.startTime,
      endTime: b.endTime,
      purpose: b.purpose,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
      groupId: b.organizationId,
      groupName: b.organization?.name,
      aircraft: {
        id: b.clubAircraft?.id,
        nNumber: b.clubAircraft?.nNumber,
        customName: b.clubAircraft?.customName,
        nickname: b.clubAircraft?.nickname,
        make: b.clubAircraft?.make,
        model: b.clubAircraft?.model,
        groupId: b.organizationId,
      },
      source: 'club',
    }));

    // Get personal bookings
    const personalBookings = await prisma.personalBooking.findMany({
      where: {
        userId: session.user.id,
        startTime: dateFilter,
      },
      orderBy: { startTime: 'asc' },
    });

    // Get user aircraft for personal bookings
    const userAircraftIds = personalBookings.map(b => b.userAircraftId).filter(Boolean);
    const userAircraftMap = new Map();
    if (userAircraftIds.length > 0) {
      const userAircraftList = await prisma.userAircraft.findMany({
        where: { id: { in: userAircraftIds } },
        select: { id: true, nNumber: true, nickname: true },
      });
      userAircraftList.forEach(ua => userAircraftMap.set(ua.id, ua));
    }

    const personalFormatted = personalBookings.map((b) => ({
      id: b.id,
      userId: b.userId,
      userAircraftId: b.userAircraftId,
      startTime: b.startTime,
      endTime: b.endTime,
      purpose: b.purpose,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
      aircraft: userAircraftMap.get(b.userAircraftId) || null,
      source: 'personal',
    }));

    return NextResponse.json({ bookings: [...formattedBookings, ...personalFormatted] });
  } catch (error) {
    console.error('Error fetching bookings:', error);
    return NextResponse.json({ error: 'Failed to fetch bookings' }, { status: 500 });
  }
}
