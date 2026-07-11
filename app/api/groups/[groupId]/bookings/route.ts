import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isUuid } from '@/lib/validate';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

// GET all bookings for a group
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
    
    // Get user by email using raw SQL
    const users = await prisma.$queryRaw`
      SELECT id FROM [User] WHERE email = ${session.user.email}
    ` as any[];

    if (!users || users.length === 0) {
      return NextResponse.json({ error: '[User] not found' }, { status: 404 });
    }

    const userId = users[0].id;

    // Check membership using raw SQL
    const memberships = await prisma.$queryRaw`
      SELECT * FROM GroupMember WHERE groupId = ${groupId} AND userId = ${userId}
    ` as any[];

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }

    // Get bookings using raw SQL
    const bookings = await prisma.$queryRaw`
      SELECT
        b.id, b.aircraftId, b.userId, b.instructorId, b.startTime, b.endTime, b.purpose, b.createdAt, b.updatedAt,
        a.nNumber, a.customName, a.nickname, a.make, a.model, a.groupId as aircraftGroupId,
        u.name as userName, u.email as userEmail,
        i.name as instructorName, i.email as instructorEmail
      FROM Booking b
      JOIN ClubAircraft a ON b.aircraftId = a.id
      JOIN [User] u ON b.userId = u.id
      LEFT JOIN [User] i ON b.instructorId = i.id
      WHERE a.groupId = ${groupId}
      ORDER BY b.startTime ASC
    ` as any[];

    const formattedBookings = (bookings || []).map((b: any) => ({
      id: b.id,
      aircraftId: b.aircraftId,
      userId: b.userId,
      instructorId: b.instructorId,
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
        groupId: b.aircraftGroupId,
      },
      user: {
        id: b.userId,
        name: b.userName,
        email: b.userEmail,
      },
      instructor: b.instructorId ? {
        id: b.instructorId,
        name: b.instructorName,
        email: b.instructorEmail,
      } : null,
    }));

    return NextResponse.json(formattedBookings);
  } catch (error) {
    console.error('Error fetching bookings:', error);
    return NextResponse.json({ error: 'Failed to fetch bookings' }, { status: 500 });
  }
}

// POST create a booking
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
    
    // Get user by email using raw SQL
    const users = await prisma.$queryRaw`
      SELECT id FROM [User] WHERE email = ${session.user.email}
    ` as any[];

    if (!users || users.length === 0) {
      return NextResponse.json({ error: '[User] not found' }, { status: 404 });
    }

    const userId = users[0].id;

    // Check membership and role using raw SQL
    const memberships = await prisma.$queryRaw`
      SELECT * FROM GroupMember WHERE groupId = ${groupId} AND userId = ${userId} AND role IN ('MEMBER', 'ADMIN')
    ` as any[];

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ error: 'Only members can book' }, { status: 403 });
    }

    const body = await request.json();
    const { aircraftId, startTime, endTime, purpose, instructorId } = body;

    if (!isUuid(aircraftId)) {
      return NextResponse.json({ error: 'Invalid aircraftId' }, { status: 400 });
    }
    if (instructorId !== undefined && instructorId !== null && !isUuid(instructorId)) {
      return NextResponse.json({ error: 'Invalid instructorId' }, { status: 400 });
    }

    // Verify aircraft belongs to group
    const aircraftList = await prisma.$queryRaw`
      SELECT * FROM ClubAircraft WHERE id = ${aircraftId} AND groupId = ${groupId}
    ` as any[];

    if (!aircraftList || aircraftList.length === 0) {
      return NextResponse.json({ error: 'Aircraft not found in group' }, { status: 404 });
    }

    // Check if aircraft is grounded for maintenance
    const maintenanceList = await prisma.$queryRaw`
      SELECT * FROM Maintenance
      WHERE aircraftId = ${aircraftId} AND isGrounded = 1 AND status IN ('NEEDED', 'IN_PROGRESS')
    ` as any[];

    if (maintenanceList && maintenanceList.length > 0) {
      return NextResponse.json({ 
        error: 'This aircraft is currently Grounded for maintenance. Please contact your admin.' 
      }, { status: 403 });
    }

    // Check for conflicts - need to parse dates
    const startDate = new Date(startTime).toISOString();
    const endDate = new Date(endTime).toISOString();
    
    const conflicts = await prisma.$queryRaw`
      SELECT * FROM Booking
      WHERE aircraftId = ${aircraftId}
      AND startTime < ${endDate}
      AND endTime > ${startDate}
    ` as any[];

    if (conflicts && conflicts.length > 0) {
      return NextResponse.json({ error: 'Time slot conflicts with existing booking' }, { status: 409 });
    }

    // Create booking using raw SQL
    const bookingId = crypto.randomUUID();
    await prisma.$executeRaw`
      INSERT INTO Booking (id, aircraftId, userId, instructorId, startTime, endTime, purpose, createdAt, updatedAt)
      VALUES (
        ${bookingId},
        ${aircraftId},
        ${userId},
        ${instructorId || null},
        ${startDate},
        ${endDate},
        ${purpose || null},
        GETDATE(),
        GETDATE()
      )
    `;

    // Fetch created booking
    const bookings = await prisma.$queryRaw`
      SELECT b.*, a.nNumber, a.customName, a.nickname, a.make, a.model, u.name as userName, u.email as userEmail,
        i.name as instructorName, i.email as instructorEmail
      FROM Booking b
      JOIN ClubAircraft a ON b.aircraftId = a.id
      JOIN [User] u ON b.userId = u.id
      LEFT JOIN [User] i ON b.instructorId = i.id
      WHERE b.id = ${bookingId}
    ` as any[];

    const b = bookings[0];
    return NextResponse.json({
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
      },
      user: {
        id: userId,
        name: b.userName,
        email: b.userEmail,
      },
      instructor: b.instructorId ? {
        id: b.instructorId,
        name: b.instructorName,
        email: b.instructorEmail,
      } : null,
    });
  } catch (error) {
    console.error('Error creating booking:', error);
    return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 });
  }
}
