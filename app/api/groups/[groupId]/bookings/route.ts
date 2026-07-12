import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isUuid } from '@/lib/validate';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

// Thrown inside the booking transaction to signal a 409 conflict without
// triggering the generic 500 handler at the bottom of POST.
class ConflictError extends Error {}

// GET bookings for a group
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

    // Default to a 90-days-past / 365-days-future window when no range is given,
    // so this doesn't pull a group's entire booking history unbounded.
    const now = Date.now();
    const { searchParams } = new URL(request.url);
    const startParam = searchParams.get('start');
    const endParam = searchParams.get('end');

    const start = startParam ? new Date(startParam) : new Date(now - 90 * 24 * 60 * 60 * 1000);
    const end = endParam ? new Date(endParam) : new Date(now + 365 * 24 * 60 * 60 * 1000);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return NextResponse.json({ error: 'Invalid start or end date' }, { status: 400 });
    }

    // Get bookings with aircraft and user info
    const bookings = await prisma.booking.findMany({
      where: { organizationId: groupId, startTime: { gte: start, lte: end } },
      include: {
        clubAircraft: { select: { id: true, nNumber: true, customName: true, nickname: true, make: true, model: true } },
        pilotProfile: { include: { user: { select: { id: true, name: true, email: true } } } },
        instructor: { select: { id: true, name: true, email: true } }
      },
      orderBy: { startTime: 'asc' },
      take: 1000
    });

    const formatted = bookings.map(b => ({
      id: b.id,
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
      } : null,
      instructor: b.instructor ? {
        id: b.instructor.id,
        name: b.instructor.name,
        email: b.instructor.email
      } : null
    }));

    return NextResponse.json(formatted);
  } catch (error) {
    console.error('Error fetching bookings:', error);
    return NextResponse.json({ error: 'Failed to fetch bookings' }, { status: 500 });
  }
}

// POST create a booking
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

    const userId = session.user.id;

    // Check membership
    const membership = await prisma.organizationMember.findFirst({
      where: { organizationId: groupId, userId }
    });

    if (!membership) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }

    const body = await request.json();
    const { aircraftId, startTime, endTime, purpose, instructorId } = body;

    if (!aircraftId || !startTime || !endTime) {
      return NextResponse.json({ error: 'aircraftId, startTime, and endTime are required' }, { status: 400 });
    }
    if (!isUuid(aircraftId)) {
      return NextResponse.json({ error: 'Invalid aircraftId' }, { status: 400 });
    }
    if (instructorId !== undefined && instructorId !== null && !isUuid(instructorId)) {
      return NextResponse.json({ error: 'Invalid instructorId' }, { status: 400 });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) {
      return NextResponse.json({ error: 'startTime and endTime must be valid dates with startTime before endTime' }, { status: 400 });
    }

    // Verify aircraft belongs to group
    const aircraft = await prisma.clubAircraft.findFirst({
      where: { id: aircraftId, organizationId: groupId }
    });

    if (!aircraft) {
      return NextResponse.json({ error: 'Aircraft not found in this group' }, { status: 404 });
    }

    // Check if aircraft is grounded for maintenance
    const groundingIssue = await prisma.maintenance.findFirst({
      where: { clubAircraftId: aircraftId, isGrounded: true, status: { in: ['NEEDED', 'IN_PROGRESS'] } }
    });

    if (groundingIssue) {
      return NextResponse.json(
        { error: 'This aircraft is currently Grounded for maintenance. Please contact your admin.' },
        { status: 403 }
      );
    }

    // Get or create pilot profile for this user
    let pilotProfile = await prisma.pilotProfile.findUnique({ where: { userId } });
    if (!pilotProfile) {
      pilotProfile = await prisma.pilotProfile.create({
        data: { userId }
      });
    }

    let booking;
    try {
      booking = await prisma.$transaction(async (tx) => {
        const overlappingBooking = await tx.booking.findFirst({
          where: { clubAircraftId: aircraftId, startTime: { lt: end }, endTime: { gt: start } }
        });

        if (overlappingBooking) {
          throw new ConflictError('Aircraft is already booked during this time');
        }

        const overlappingBlockOut = await tx.blockOut.findFirst({
          where: { clubAircraftId: aircraftId, startTime: { lt: end }, endTime: { gt: start } }
        });

        if (overlappingBlockOut) {
          throw new ConflictError('Aircraft is blocked out during this time');
        }

        return tx.booking.create({
          data: {
            clubAircraftId: aircraftId,
            organizationId: groupId,
            pilotProfileId: pilotProfile.id,
            startTime: start,
            endTime: end,
            purpose: purpose || null,
            instructorId: instructorId || null,
          },
          include: {
            clubAircraft: { select: { id: true, nNumber: true, customName: true, nickname: true, make: true, model: true } },
            pilotProfile: { include: { user: { select: { id: true, name: true, email: true } } } },
            instructor: { select: { id: true, name: true, email: true } }
          }
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof ConflictError) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        return NextResponse.json({ error: 'Booking conflict detected, please try again' }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json({
      id: booking.id,
      aircraftId: booking.clubAircraftId,
      userId: booking.pilotProfileId,
      instructorId: booking.instructorId,
      startTime: booking.startTime,
      endTime: booking.endTime,
      purpose: booking.purpose,
      aircraft: booking.clubAircraft ? {
        id: booking.clubAircraft.id,
        nNumber: booking.clubAircraft.nNumber,
        customName: booking.clubAircraft.customName,
        nickname: booking.clubAircraft.nickname,
        make: booking.clubAircraft.make,
        model: booking.clubAircraft.model
      } : null,
      user: booking.pilotProfile?.user ? {
        id: booking.pilotProfile.user.id,
        name: booking.pilotProfile.user.name,
        email: booking.pilotProfile.user.email
      } : null,
      instructor: booking.instructor ? {
        id: booking.instructor.id,
        name: booking.instructor.name,
        email: booking.instructor.email
      } : null
    });
  } catch (error) {
    console.error('Error creating booking:', error);
    return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 });
  }
}
