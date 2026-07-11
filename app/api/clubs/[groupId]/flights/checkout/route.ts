import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isUuid } from '@/lib/validate';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

// POST /api/clubs/[groupId]/flights/checkout - Start a flight (record hobbs start)
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { groupId } = await params;

    if (!isUuid(groupId)) {
      return NextResponse.json({ error: 'Invalid groupId' }, { status: 400 });
    }

    // Get user
    const user = await prisma.$queryRaw`
      SELECT id, name FROM [User] WHERE email = ${session.user.email}
    ` as any[];

    if (!user || user.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userId = user[0].id;
    const userName = user[0].name;

    // Verify membership
    const memberships = await prisma.$queryRaw`
      SELECT role FROM GroupMember WHERE groupId = ${groupId} AND userId = ${userId}
    ` as any[];

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }

    const body = await request.json();
    const { aircraftId, hobbsStart, notes } = body;

    if (!aircraftId || !hobbsStart) {
      return NextResponse.json({ error: 'aircraftId and hobbsStart required' }, { status: 400 });
    }

    if (!isUuid(aircraftId)) {
      return NextResponse.json({ error: 'Invalid aircraftId' }, { status: 400 });
    }

    const hobbsStartNum = Number(hobbsStart);
    if (!Number.isFinite(hobbsStartNum)) {
      return NextResponse.json({ error: 'Invalid hobbsStart' }, { status: 400 });
    }

    // Verify aircraft belongs to group
    const aircraft = await prisma.$queryRaw`
      SELECT * FROM ClubAircraft WHERE id = ${aircraftId} AND groupId = ${groupId}
    ` as any[];

    if (!aircraft || aircraft.length === 0) {
      return NextResponse.json({ error: 'Aircraft not found in this club' }, { status: 404 });
    }

    const aircraftData = aircraft[0];

    // Check if aircraft is already checked out
    const activeFlights = await prisma.$queryRaw`
      SELECT * FROM FlightLog
      WHERE aircraftId = ${aircraftId} AND hobbsEnd IS NULL
    ` as any[];

    if (activeFlights && activeFlights.length > 0) {
      return NextResponse.json({
        error: 'Aircraft already checked out',
        checkedOutBy: activeFlights[0].userId
      }, { status: 409 });
    }

    // Check for conflicting booking at current time
    const now = new Date();
    const conflicts = await prisma.$queryRaw`
      SELECT * FROM Booking
      WHERE aircraftId = ${aircraftId}
      AND startTime <= ${now}
      AND endTime >= ${now}
    ` as any[];

    // Create flight log entry
    const flightLogId = crypto.randomUUID();
    await prisma.$executeRaw`
      INSERT INTO FlightLog (id, aircraftId, userId, date, hobbsStart, hobbsEnd, hobbsTime, notes, createdAt)
      VALUES (
        ${flightLogId},
        ${aircraftId},
        ${userId},
        GETDATE(),
        ${hobbsStartNum},
        NULL,
        NULL,
        ${notes ? String(notes) : null},
        GETDATE()
      )
    `;

    // Fetch created entry
    const created = await prisma.$queryRaw`
      SELECT fl.*, a.nNumber, a.customName, u.name as userName
      FROM FlightLog fl
      JOIN ClubAircraft a ON fl.aircraftId = a.id
      JOIN [User] u ON fl.userId = u.id
      WHERE fl.id = ${flightLogId}
    ` as any[];

    return NextResponse.json({
      success: true,
      flight: {
        id: created[0].id,
        aircraftId: created[0].aircraftId,
        aircraft: {
          nNumber: created[0].nNumber,
          name: created[0].customName,
        },
        user: {
          id: created[0].userId,
          name: created[0].userName,
        },
        hobbsStart: created[0].hobbsStart,
        checkedOutAt: created[0].createdAt,
      }
    });
  } catch (error) {
    console.error('Error during checkout:', error);
    return NextResponse.json({ error: 'Failed to check out' }, { status: 500 });
  }
}
