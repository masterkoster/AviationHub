import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { isUuid } from '@/lib/validate';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

// GET all flight logs for a group
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

    // Get logs using raw SQL - simplified query
    let logs: any[] = [];
    try {
      const logResult = await prisma.$queryRaw`
        SELECT TOP 100
          fl.id, fl.aircraftId, fl.userId, fl.date, fl.tachTime, fl.hobbsTime, fl.notes, fl.createdAt, fl.updatedAt
        FROM FlightLog fl
        JOIN ClubAircraft a ON fl.aircraftId = a.id
        WHERE a.groupId = ${groupId}
        ORDER BY fl.date DESC
      `;
      logs = logResult as any[];
    } catch (e) {
      console.error('Error fetching logs:', e);
      return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 });
    }

    // Get aircraft and user data separately
    const aircraftIds = [...new Set((logs || []).map((l: any) => l.aircraftId))] as string[];
    const userIds = [...new Set((logs || []).map((l: any) => l.userId))] as string[];

    let aircraftMap: Record<string, any> = {};
    let userMap: Record<string, any> = {};

    if (aircraftIds.length > 0) {
      const aircraftList = await prisma.$queryRaw`
        SELECT id, nNumber, customName, nickname, make, model, groupId
        FROM ClubAircraft
        WHERE id IN (${Prisma.join(aircraftIds)})
      ` as any[];
      (aircraftList || []).forEach((a: any) => { aircraftMap[a.id] = a; });
    }

    if (userIds.length > 0) {
      const userList = await prisma.$queryRaw`
        SELECT id, name, email FROM [User] WHERE id IN (${Prisma.join(userIds)})
      ` as any[];
      (userList || []).forEach((u: any) => { userMap[u.id] = u; });
    }

    const formattedLogs = (logs || []).map((l: any) => ({
      id: l.id,
      aircraftId: l.aircraftId,
      userId: l.userId,
      date: l.date,
      tachTime: l.tachTime ? Number(l.tachTime) : null,
      hobbsTime: l.hobbsTime ? Number(l.hobbsTime) : null,
      notes: l.notes,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
      aircraft: aircraftMap[l.aircraftId] || {},
      user: userMap[l.userId] || {},
    }));

    // Get maintenance for this group
    let maintenance: any[] = [];
    try {
      const maintResult = await prisma.$queryRaw`
        SELECT TOP 20 m.*, a.nNumber, a.customName, a.nickname
        FROM Maintenance m
        JOIN ClubAircraft a ON m.aircraftId = a.id
        WHERE a.groupId = ${groupId}
        ORDER BY m.reportedDate DESC
      `;
      maintenance = maintResult as any[];
    } catch (e) {
      console.error('Error fetching maintenance:', e);
    }

    const formattedMaintenance = (maintenance || []).map((m: any) => ({
      id: m.id,
      aircraftId: m.aircraftId,
      userId: m.userId,
      groupId: m.groupId,
      description: m.description,
      notes: m.notes,
      status: m.status,
      cost: m.cost ? Number(m.cost) : null,
      isGrounded: m.isGrounded,
      reportedDate: m.reportedDate,
      resolvedDate: m.resolvedDate,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      aircraft: {
        id: m.aircraftId,
        nNumber: m.nNumber,
        customName: m.customName,
        nickname: m.nickname,
      },
    }));

    return NextResponse.json({ logs: formattedLogs, maintenance: formattedMaintenance });
  } catch (error) {
    console.error('Error fetching logs:', error);
    return NextResponse.json({
      error: 'Failed to fetch flight logs'
    }, { status: 500 });
  }
}

// POST create a flight log
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

    // Check membership and role (MEMBER or ADMIN can log flights)
    const memberships = await prisma.$queryRaw`
      SELECT * FROM GroupMember WHERE groupId = ${groupId} AND userId = ${userId} AND role IN ('MEMBER', 'ADMIN')
    ` as any[];

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ error: 'Only members can log flights' }, { status: 403 });
    }

    const body = await request.json();
    const {
      aircraftId,
      date,
      tachStart,
      tachEnd,
      hobbsStart,
      hobbsEnd,
      notes,
      maintenance
    } = body;

    if (!isUuid(aircraftId)) {
      return NextResponse.json({ error: 'Invalid aircraftId' }, { status: 400 });
    }

    // Calculate hours
    const hobbsUsed = (hobbsEnd && hobbsStart) ? (parseFloat(hobbsEnd) - parseFloat(hobbsStart)) : 0;
    const tachUsed = (tachEnd && tachStart) ? (parseFloat(tachEnd) - parseFloat(tachStart)) : 0;

    // Create log using raw SQL
    const logId = crypto.randomUUID();
    const dateStr = new Date(date).toISOString();

    await prisma.$executeRaw`
      INSERT INTO FlightLog (id, aircraftId, userId, date, tachTime, hobbsTime, notes, createdAt, updatedAt)
      VALUES (${logId}, ${aircraftId}, ${userId}, ${dateStr}, ${tachUsed || null}, ${hobbsUsed || null}, ${notes || null}, GETDATE(), GETDATE())
    `;

    // Create maintenance if provided
    if (maintenance && maintenance.description) {
      const maintId = crypto.randomUUID();
      await prisma.$executeRaw`
        INSERT INTO Maintenance (id, aircraftId, userId, groupId, description, notes, status, isGrounded, reportedDate, createdAt, updatedAt)
        VALUES (${maintId}, ${aircraftId}, ${userId}, ${groupId}, ${maintenance.description}, ${maintenance.notes || null}, 'NEEDED', 0, GETDATE(), GETDATE(), GETDATE())
      `;
    }

    // Fetch created log
    const logs = await prisma.$queryRaw`
      SELECT fl.*, a.nNumber, a.customName, a.nickname
      FROM FlightLog fl
      JOIN ClubAircraft a ON fl.aircraftId = a.id
      WHERE fl.id = ${logId}
    ` as any[];

    const l = logs[0];
    return NextResponse.json({
      id: l.id,
      aircraftId: l.aircraftId,
      userId: l.userId,
      date: l.date,
      tachTime: l.tachTime ? Number(l.tachTime) : null,
      hobbsTime: l.hobbsTime ? Number(l.hobbsTime) : null,
      notes: l.notes,
      createdAt: l.createdAt,
      aircraft: {
        id: l.aircraftId,
        nNumber: l.nNumber,
        customName: l.customName,
        nickname: l.nickname,
      },
    });
  } catch (error) {
    console.error('Error creating flight log:', error);
    return NextResponse.json({ error: 'Failed to create flight log' }, { status: 500 });
  }
}
