import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user by email using raw SQL
    const users = await prisma.$queryRaw`
      SELECT id FROM [User] WHERE email = ${session.user.email}
    ` as any[];

    if (!users || users.length === 0) {
      return NextResponse.json({ error: '[User] not found' }, { status: 404 });
    }

    const userId = users[0].id;

    // Get all bookings for user's groups using raw SQL
    const bookings = await prisma.$queryRaw`
      SELECT
        b.id,
        b.aircraftId,
        b.userId,
        b.startTime,
        b.endTime,
        b.purpose,
        b.createdAt,
        b.updatedAt,
        a.nNumber,
        a.customName,
        a.nickname,
        a.make,
        a.model,
        a.groupId as aircraftGroupId,
        fg.name as groupName,
        u.name as userName,
        u.email as userEmail
      FROM Booking b
      JOIN ClubAircraft a ON b.aircraftId = a.id
      JOIN FlyingGroup fg ON a.groupId = fg.id
      JOIN GroupMember gm ON fg.id = gm.groupId AND gm.userId = ${userId}
      JOIN [User] u ON b.userId = u.id
      ORDER BY b.startTime ASC
    ` as any[];

    const formattedBookings = (bookings || []).map((b: any) => ({
      id: b.id,
      aircraftId: b.aircraftId,
      userId: b.userId,
      startTime: b.startTime,
      endTime: b.endTime,
      purpose: b.purpose,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
      aircraft: {
        id: b.aircraftId,
        nNumber: b.nNumber,
        customName: b.customName,
        nickname: b.nickname,
        make: b.make,
        model: b.model,
        groupName: b.groupName,
      },
      groupName: b.groupName,
      user: {
        id: b.userId,
        name: b.userName,
        email: b.userEmail,
      },
    }));

    return NextResponse.json(formattedBookings);
  } catch (error) {
    console.error('Error fetching all bookings:', error);
    return NextResponse.json([]);
  }
}
