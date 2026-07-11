import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isUuid } from '@/lib/validate';

interface RouteParams {
  params: Promise<{ groupId: string; aircraftId: string }>;
}

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { groupId, aircraftId } = await params;
    if (!isUuid(groupId) || !isUuid(aircraftId)) {
      return NextResponse.json({ error: 'Invalid groupId or aircraftId' }, { status: 400 });
    }
    
    // Get user by email using raw SQL
    const users = await prisma.$queryRaw`
      SELECT id FROM [User] WHERE email = ${session.user.email}
    ` as any[];

    if (!users || users.length === 0) {
      return NextResponse.json({ error: '[User] not found' }, { status: 404 });
    }

    const userId = users[0].id;

    // Check admin role using raw SQL
    const memberships = await prisma.$queryRaw`
      SELECT * FROM GroupMember WHERE groupId = ${groupId} AND userId = ${userId} AND role = 'ADMIN'
    ` as any[];

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ error: 'Only admins can update aircraft' }, { status: 403 });
    }

    const body = await request.json();
    const { notes, status } = body;

    const allowedStatuses = ['Available', 'Maintenance', 'Grounded'];
    if (status !== undefined && !allowedStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    if (notes !== undefined && status !== undefined) {
      await prisma.$executeRaw`
        UPDATE ClubAircraft SET aircraftNotes = ${notes || null}, status = ${status}, updatedAt = GETDATE() WHERE id = ${aircraftId} AND groupId = ${groupId}
      `;
    } else if (notes !== undefined) {
      await prisma.$executeRaw`
        UPDATE ClubAircraft SET aircraftNotes = ${notes || null}, updatedAt = GETDATE() WHERE id = ${aircraftId} AND groupId = ${groupId}
      `;
    } else if (status !== undefined) {
      await prisma.$executeRaw`
        UPDATE ClubAircraft SET status = ${status}, updatedAt = GETDATE() WHERE id = ${aircraftId} AND groupId = ${groupId}
      `;
    } else {
      await prisma.$executeRaw`
        UPDATE ClubAircraft SET updatedAt = GETDATE() WHERE id = ${aircraftId} AND groupId = ${groupId}
      `;
    }

    // Fetch updated aircraft
    const aircraft = await prisma.$queryRaw`
      SELECT * FROM ClubAircraft WHERE id = ${aircraftId}
    ` as any[];

    return NextResponse.json(aircraft[0]);
  } catch (error) {
    console.error('Error updating aircraft:', error);
    return NextResponse.json({ error: 'Failed to update aircraft' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { groupId, aircraftId } = await params;
    if (!isUuid(groupId) || !isUuid(aircraftId)) {
      return NextResponse.json({ error: 'Invalid groupId or aircraftId' }, { status: 400 });
    }
    
    // Get user by email using raw SQL
    const users = await prisma.$queryRaw`
      SELECT id FROM [User] WHERE email = ${session.user.email}
    ` as any[];

    if (!users || users.length === 0) {
      return NextResponse.json({ error: '[User] not found' }, { status: 404 });
    }

    const userId = users[0].id;

    // Check admin role using raw SQL
    const memberships = await prisma.$queryRaw`
      SELECT * FROM GroupMember WHERE groupId = ${groupId} AND userId = ${userId} AND role = 'ADMIN'
    ` as any[];

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ error: 'Only admins can remove aircraft' }, { status: 403 });
    }

    await prisma.$executeRaw`
      DELETE FROM ClubAircraft WHERE id = ${aircraftId} AND groupId = ${groupId}
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing aircraft:', error);
    return NextResponse.json({ error: 'Failed to remove aircraft' }, { status: 500 });
  }
}
