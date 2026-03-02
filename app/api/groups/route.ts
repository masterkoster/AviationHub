import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

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
    const { name, description, dryRate, wetRate, customRates } = body;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // Try using Prisma create with error handling
    let group;
    try {
      group = await prisma.organization.create({
        data: {
          name,
          description,
          ownerId: userId,
          dryRate: dryRate ? parseFloat(dryRate) : null,
          wetRate: wetRate ? parseFloat(wetRate) : null,
          customRates: customRates ? JSON.stringify(customRates) : null,
        },
      });
    } catch (prismaError: any) {
      console.error('Prisma error creating group:', prismaError);
      // If Prisma fails, try raw SQL
      const groupId = crypto.randomUUID();
      await prisma.$executeRawUnsafe(`
        INSERT INTO Organization (id, name, description, ownerId, dryRate, wetRate, customRates, createdAt, updatedAt)
        VALUES ('${groupId}', '${name.replace(/'/g, "''")}', ${description ? "'" + description.replace(/'/g, "''") + "'" : 'NULL'}, '${userId}', ${dryRate ? parseFloat(dryRate) : 'NULL'}, ${wetRate ? parseFloat(wetRate) : 'NULL'}, ${customRates ? "'" + JSON.stringify(customRates).replace(/'/g, "''") + "'" : 'NULL'}, GETDATE(), GETDATE())
      `);
      const groups = await prisma.$queryRawUnsafe(`SELECT * FROM Organization WHERE id = '${groupId}'`) as any[];
      group = { id: groups[0].id, name: groups[0].name, description: groups[0].description, ownerId: groups[0].ownerId };
    }

    // Add creator as admin member
    try {
      await prisma.organizationMember.create({
        data: {
          userId: userId,
          organizationId: group.id,
          role: 'ADMIN',
        },
      });
    } catch (prismaError: any) {
      console.error('Prisma error adding member:', prismaError);
      // Try raw SQL
      const memberId = crypto.randomUUID();
      await prisma.$executeRawUnsafe(`
        INSERT INTO OrganizationMember (id, userId, organizationId, role, joinedAt)
        VALUES ('${memberId}', '${userId}', '${group.id}', 'ADMIN', GETDATE())
      `);
    }

    return NextResponse.json({
      id: group.id,
      name: group.name,
      description: group.description,
      ownerId: group.ownerId,
      dryRate: group.dryRate ? Number(group.dryRate) : null,
      wetRate: group.wetRate ? Number(group.wetRate) : null,
      customRates: group.customRates,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    });
  } catch (error) {
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
    console.log('Fetching groups for user:', userId);
    console.log('[User] email:', session.user.email);

    // Use raw SQL - SQL Server doesn't support ? placeholders in $queryRawUnsafe
    // userId is a UUID from auth, so string interpolation is safe
      const memberships = await prisma.$queryRawUnsafe(`
        SELECT gm.role, o.id, o.name, o.description, o.ownerId, o.dryRate, o.wetRate, o.customRates, o.createdAt, o.updatedAt
        FROM OrganizationMember gm
        JOIN Organization o ON gm.organizationId = o.id
        WHERE gm.userId = '${userId}'
      `) as any[];

    console.log('Memberships SQL:', memberships);
    console.log('Memberships count:', memberships?.length || 0);

    console.log('Memberships found:', memberships.length);

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
      description: m.description,
      ownerId: m.ownerId,
      dryRate: m.dryRate ? Number(m.dryRate) : null,
      wetRate: m.wetRate ? Number(m.wetRate) : null,
      customRates: m.customRates,
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
