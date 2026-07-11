import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user by email using raw SQL
    const users = await prisma.$queryRawUnsafe(`
      SELECT id FROM [User] WHERE email = '${session.user.email}'
    `) as any[];

    if (!users || users.length === 0) {
      return NextResponse.json({ error: '[User] not found' }, { status: 404 });
    }

    const userId = users[0].id;

    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const trimmedName = name.trim();

    // Case-insensitive under the DB's CI collation; the unique index on
    // Organization.name is the race-safe backstop (handled in catch below)
    const existing = await prisma.organization.findFirst({
      where: { name: trimmedName },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: `A group named "${trimmedName}" already exists` },
        { status: 409 }
      );
    }

    // Create organization with only valid fields
    const group = await prisma.organization.create({
      data: {
        name: trimmedName,
        ownerId: userId,
      },
    });

    // Add creator as admin member
    await prisma.organizationMember.create({
      data: {
        userId: userId,
        organizationId: group.id,
        role: 'ADMIN',
      },
    });

    return NextResponse.json({
      id: group.id,
      name: group.name,
      ownerId: group.ownerId,
      type: group.type,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'A group with this name already exists' }, { status: 409 });
    }
    console.error('Error creating group:', error);
    return NextResponse.json({ error: 'Failed to create group', details: String(error) }, { status: 500 });
  }
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      console.log('No session found');
      return NextResponse.json([]);
    }

    // Get user by email using raw SQL
    const users = await prisma.$queryRawUnsafe(`
      SELECT id FROM [User] WHERE email = '${session.user.email}'
    `) as any[];

    if (!users || users.length === 0) {
      console.log('[User] not found for email:', session.user.email);
      return NextResponse.json([]);
    }

    const userId = users[0].id;

    // Use raw SQL to get organizations the user is a member of
    const memberships = await prisma.$queryRawUnsafe(`
      SELECT gm.role, o.id, o.name, o.type, o.ownerId, o.createdAt, o.updatedAt
      FROM OrganizationMember gm
      JOIN Organization o ON gm.organizationId = o.id
      WHERE gm.userId = '${userId}'
    `) as any[];

    // Now fetch aircraft for each group
    const groupIds = memberships.map((m: any) => m.id);
    let aircraftMap: Record<string, any[]> = {};
    
    if (groupIds.length > 0) {
      const aircraftList = await prisma.$queryRawUnsafe(`
        SELECT a.*, o.name as groupName
        FROM ClubAircraft a
        JOIN Organization o ON a.organizationId = o.id
        WHERE a.organizationId IN (${groupIds.map((id: string) => "'" + id + "'").join(',')})
      `) as any[];
      
      // Group aircraft by groupId
      aircraftList.forEach((a: any) => {
        if (!aircraftMap[a.organizationId]) aircraftMap[a.organizationId] = [];
        aircraftMap[a.organizationId].push({
          id: a.id,
          nNumber: a.nNumber,
          nickname: a.nickname,
          customName: a.customName,
          make: a.make,
          model: a.model,
          status: a.status,
          hourlyRate: a.hourlyRate ? Number(a.hourlyRate) : null,
          aircraftNotes: a.aircraftNotes,
        });
      });
    }

    const groups = memberships.map((m: any) => ({
      id: m.id,
      name: m.name,
      type: m.type,
      ownerId: m.ownerId,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      role: m.role,
      aircraft: aircraftMap[m.id] || [],
    }));
    
    return NextResponse.json(groups);
  } catch (error) {
    console.error('Error fetching groups:', error);
    // Return empty array instead of error to allow app to work
    return NextResponse.json([]);
  }
}
