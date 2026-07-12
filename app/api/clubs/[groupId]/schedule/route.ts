import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isUuid } from '@/lib/validate';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

// GET /api/clubs/[groupId]/schedule - Get full schedule with bookings and blockouts
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { groupId } = await params;

    if (!isUuid(groupId)) {
      return NextResponse.json({ error: 'Invalid groupId' }, { status: 400 });
    }

    // Verify membership
    const user = await prisma.$queryRaw`
      SELECT id FROM [User] WHERE email = ${session.user.email}
    ` as any[];

    if (!user || user.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userId = user[0].id;

    const memberships = await prisma.$queryRaw`
      SELECT * FROM GroupMember WHERE groupId = ${groupId} AND userId = ${userId}
    ` as any[];

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }

    // Get bookings
    const bookings = await prisma.$queryRaw`
      SELECT
        b.id, b.aircraftId, b.userId, b.startTime, b.endTime, b.purpose,
        a.nNumber, a.customName, a.nickname, a.make, a.model,
        u.name as userName
      FROM Booking b
      JOIN ClubAircraft a ON b.aircraftId = a.id
      JOIN [User] u ON b.userId = u.id
      WHERE a.groupId = ${groupId}
      ORDER BY b.startTime ASC
    ` as any[];

    // Get blockouts
    const blockouts = await prisma.$queryRaw`
      SELECT
        bo.id, bo.aircraftId, bo.title, bo.startTime, bo.endTime,
        a.nNumber, a.customName
      FROM BlockOut bo
      LEFT JOIN ClubAircraft a ON bo.aircraftId = a.id
      WHERE bo.groupId = ${groupId}
      ORDER BY bo.startTime ASC
    ` as any[];

    // Get aircraft
    const aircraft = await prisma.$queryRaw`
      SELECT id, nNumber, customName, nickname, make, model, status, hourlyRate
      FROM ClubAircraft
      WHERE groupId = ${groupId}
    ` as any[];

    // Get members for the response
    const members = await prisma.$queryRaw`
      SELECT gm.userId, gm.role, u.name as userName
      FROM GroupMember gm
      JOIN [User] u ON gm.userId = u.id
      WHERE gm.groupId = ${groupId}
    ` as any[];

    return NextResponse.json({
      bookings: bookings.map(b => ({
        id: b.id,
        title: b.purpose || `${b.nNumber} flight`,
        start: b.startTime,
        end: b.endTime,
        aircraftId: b.aircraftId,
        aircraft: {
          nNumber: b.nNumber,
          name: b.customName || b.nickname || `${b.make} ${b.model}`,
        },
        user: {
          id: b.userId,
          name: b.userName,
        },
        type: 'booking',
      })),
      blockouts: blockouts.map(b => ({
        id: b.id,
        title: b.title,
        start: b.startTime,
        end: b.endTime,
        aircraftId: b.aircraftId,
        aircraft: b.aircraftId ? {
          nNumber: b.nNumber,
          name: b.customName,
        } : null,
        type: 'blockout',
      })),
      aircraft,
      members,
    });
  } catch (error) {
    console.error('Error fetching schedule:', error);
    return NextResponse.json({ error: 'Failed to fetch schedule' }, { status: 500 });
  }
}
