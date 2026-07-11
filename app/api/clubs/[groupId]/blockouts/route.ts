import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isUuid } from '@/lib/validate';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

// GET /api/clubs/[groupId]/blockouts - List blockouts
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

    // Verify admin membership
    const user = await prisma.$queryRaw`
      SELECT id FROM [User] WHERE email = ${session.user.email}
    ` as any[];

    if (!user || user.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userId = user[0].id;

    const memberships = await prisma.$queryRaw`
      SELECT role FROM GroupMember WHERE groupId = ${groupId} AND userId = ${userId}
    ` as any[];

    if (!memberships || memberships.length === 0 || memberships[0].role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const blockouts = await prisma.$queryRaw`
      SELECT
        bo.*,
        a.nNumber, a.customName
      FROM BlockOut bo
      LEFT JOIN ClubAircraft a ON bo.aircraftId = a.id
      WHERE bo.groupId = ${groupId}
      ORDER BY bo.startTime ASC
    ` as any[];

    return NextResponse.json(blockouts);
  } catch (error) {
    console.error('Error fetching blockouts:', error);
    return NextResponse.json({ error: 'Failed to fetch blockouts' }, { status: 500 });
  }
}

// POST /api/clubs/[groupId]/blockouts - Create blockout
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

    // Verify admin membership
    const user = await prisma.$queryRaw`
      SELECT id FROM [User] WHERE email = ${session.user.email}
    ` as any[];

    if (!user || user.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userId = user[0].id;

    const memberships = await prisma.$queryRaw`
      SELECT role FROM GroupMember WHERE groupId = ${groupId} AND userId = ${userId}
    ` as any[];

    if (!memberships || memberships.length === 0 || memberships[0].role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { aircraftId, title, startTime, endTime } = body;

    if (!title || !startTime || !endTime) {
      return NextResponse.json({ error: 'Title, startTime, and endTime required' }, { status: 400 });
    }

    if (aircraftId && !isUuid(aircraftId)) {
      return NextResponse.json({ error: 'Invalid aircraftId' }, { status: 400 });
    }

    if (isNaN(Date.parse(startTime)) || isNaN(Date.parse(endTime))) {
      return NextResponse.json({ error: 'Invalid startTime or endTime' }, { status: 400 });
    }

    const id = crypto.randomUUID();

    await prisma.$executeRaw`
      INSERT INTO BlockOut (id, groupId, aircraftId, title, startTime, endTime, createdAt)
      VALUES (
        ${id},
        ${groupId},
        ${aircraftId ?? null},
        ${title},
        ${new Date(startTime)},
        ${new Date(endTime)},
        GETDATE()
      )
    `;

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('Error creating blockout:', error);
    return NextResponse.json({ error: 'Failed to create blockout' }, { status: 500 });
  }
}
