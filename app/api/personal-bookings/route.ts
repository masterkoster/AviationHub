import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isUuid } from '@/lib/validate';

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userRow = await prisma.$queryRaw`
      SELECT id FROM [User] WHERE email = ${session.user.email}
    ` as any[];

    if (!userRow || userRow.length === 0) {
      return NextResponse.json({ error: '[User] not found' }, { status: 404 });
    }

    const userId = userRow[0].id;
    const { searchParams } = new URL(request.url);
    const daysParam = searchParams.get('days') || '7';
    const now = new Date();
    const windowEnd = daysParam === 'all'
      ? null
      : new Date(now.getTime() + Number(daysParam) * 24 * 60 * 60 * 1000);

    const startFilter = now.toISOString();
    const endFilter = windowEnd ? windowEnd.toISOString() : null;

    const rows = endFilter
      ? await prisma.$queryRaw`
          SELECT
            pb.id, pb.userId, pb.userAircraftId, pb.startTime, pb.endTime, pb.purpose, pb.createdAt, pb.updatedAt,
            ua.nNumber, ua.nickname
          FROM PersonalBooking pb
          JOIN UserAircraft ua ON pb.userAircraftId = ua.id
          WHERE pb.userId = ${userId}
            AND pb.startTime >= ${startFilter}
            AND pb.startTime <= ${endFilter}
          ORDER BY pb.startTime ASC
        ` as any[]
      : await prisma.$queryRaw`
          SELECT
            pb.id, pb.userId, pb.userAircraftId, pb.startTime, pb.endTime, pb.purpose, pb.createdAt, pb.updatedAt,
            ua.nNumber, ua.nickname
          FROM PersonalBooking pb
          JOIN UserAircraft ua ON pb.userAircraftId = ua.id
          WHERE pb.userId = ${userId}
            AND pb.startTime >= ${startFilter}
          ORDER BY pb.startTime ASC
        ` as any[];

    const bookings = (rows || []).map((b: any) => ({
      id: b.id,
      userId: b.userId,
      userAircraftId: b.userAircraftId,
      startTime: b.startTime,
      endTime: b.endTime,
      purpose: b.purpose,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
      aircraft: {
        id: b.userAircraftId,
        nNumber: b.nNumber,
        nickname: b.nickname,
      },
    }));

    return NextResponse.json({ bookings });
  } catch (error) {
    console.error('Error fetching personal bookings:', error);
    return NextResponse.json({ error: 'Failed to fetch personal bookings' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userRow = await prisma.$queryRaw`
      SELECT id FROM [User] WHERE email = ${session.user.email}
    ` as any[];

    if (!userRow || userRow.length === 0) {
      return NextResponse.json({ error: '[User] not found' }, { status: 404 });
    }

    const userId = userRow[0].id;
    const body = await request.json();
    const { userAircraftId, startTime, endTime, purpose } = body || {};

    if (!userAircraftId || !startTime || !endTime) {
      return NextResponse.json({ error: 'Aircraft, start time, and end time are required' }, { status: 400 });
    }

    if (!isUuid(userAircraftId)) {
      return NextResponse.json({ error: 'Invalid userAircraftId' }, { status: 400 });
    }

    const owned = await prisma.$queryRaw`
      SELECT id FROM UserAircraft WHERE id = ${userAircraftId} AND userId = ${userId}
    ` as any[];

    if (!owned || owned.length === 0) {
      return NextResponse.json({ error: 'Aircraft not found' }, { status: 404 });
    }

    const startDate = new Date(startTime).toISOString();
    const endDate = new Date(endTime).toISOString();

    const conflicts = await prisma.$queryRaw`
      SELECT * FROM PersonalBooking
      WHERE userAircraftId = ${userAircraftId}
        AND startTime < ${endDate}
        AND endTime > ${startDate}
    ` as any[];

    if (conflicts && conflicts.length > 0) {
      return NextResponse.json({ error: 'Time slot conflicts with existing booking' }, { status: 409 });
    }

    const bookingId = crypto.randomUUID();
    await prisma.$executeRaw`
      INSERT INTO PersonalBooking (id, userId, userAircraftId, startTime, endTime, purpose, createdAt, updatedAt)
      VALUES (${bookingId}, ${userId}, ${userAircraftId}, ${startDate}, ${endDate}, ${purpose ?? null}, GETDATE(), GETDATE())
    `;

    return NextResponse.json({
      id: bookingId,
      userId,
      userAircraftId,
      startTime: startDate,
      endTime: endDate,
      purpose: purpose || null,
    });
  } catch (error) {
    console.error('Error creating personal booking:', error);
    return NextResponse.json({ error: 'Failed to create personal booking' }, { status: 500 });
  }
}
