import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isUuid } from '@/lib/validate';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

// GET members of a group
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
    let userId: string | null = null;
    try {
      const users = await prisma.$queryRaw`
        SELECT id FROM [User] WHERE email = ${session.user.email}
      ` as any[];
      if (users && users.length > 0) {
        userId = users[0].id;
      }
    } catch (e) {
      console.error('Error fetching user:', e);
      return NextResponse.json({ error: 'Failed to find user' }, { status: 500 });
    }

    if (!userId) {
      return NextResponse.json({ error: '[User] not found' }, { status: 404 });
    }

    // Check membership using raw SQL
    let memberships: any[] = [];
    try {
      memberships = await prisma.$queryRaw`
        SELECT * FROM GroupMember WHERE groupId = ${groupId} AND userId = ${userId}
      ` as any[];
    } catch (e) {
      console.error('Error checking membership:', e);
      return NextResponse.json({ error: 'Failed to check membership' }, { status: 500 });
    }

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }

    // Get members using raw SQL
    let members: any[] = [];
    try {
      members = await prisma.$queryRaw`
        SELECT gm.*, u.name as userName, u.email as userEmail
        FROM GroupMember gm
        JOIN [User] u ON gm.userId = u.id
        WHERE gm.groupId = ${groupId}
      ` as any[];
    } catch (e) {
      console.error('Error fetching members:', e);
      return NextResponse.json({ error: 'Failed to fetch members' }, { status: 500 });
    }

    const formattedMembers = (members || []).map((m: any) => ({
      id: m.id,
      userId: m.userId,
      groupId: m.groupId,
      role: m.role,
      joinedAt: m.joinedAt,
      user: {
        id: m.userId,
        name: m.userName,
        email: m.userEmail
      }
    }));

    return NextResponse.json(formattedMembers);
  } catch (error) {
    console.error('Error fetching members:', error);
    return NextResponse.json({ error: 'Failed to fetch members' }, { status: 500 });
  }
}

// PUT update a member's role (admin only)
export async function PUT(request: Request, { params }: RouteParams) {
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

    // Check admin role
    const memberships = await prisma.$queryRaw`
      SELECT * FROM GroupMember WHERE groupId = ${groupId} AND userId = ${userId} AND role = 'ADMIN'
    ` as any[];

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ error: 'Only admins can update members' }, { status: 403 });
    }

    const body = await request.json();
    const { memberId, role } = body;

    if (!isUuid(memberId)) {
      return NextResponse.json({ error: 'Invalid memberId' }, { status: 400 });
    }
    const allowedRoles = ['ADMIN', 'MEMBER', 'VIEWER'];
    if (!allowedRoles.includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    await prisma.$executeRaw`
      UPDATE GroupMember SET role = ${role} WHERE id = ${memberId}
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating member:', error);
    return NextResponse.json({ error: 'Failed to update member' }, { status: 500 });
  }
}

// DELETE remove a member from group
export async function DELETE(request: Request, { params }: RouteParams) {
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

    const url = new URL(request.url);
    const memberId = url.searchParams.get('memberId');

    if (!memberId) {
      return NextResponse.json({ error: 'memberId required' }, { status: 400 });
    }
    if (!isUuid(memberId)) {
      return NextResponse.json({ error: 'Invalid memberId' }, { status: 400 });
    }

    // Get target member
    const targetMembers = await prisma.$queryRaw`
      SELECT * FROM GroupMember WHERE id = ${memberId} AND groupId = ${groupId}
    ` as any[];

    if (!targetMembers || targetMembers.length === 0) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    const targetMember = targetMembers[0];
    const isSelfRemoval = targetMember.userId === userId;

    // Check if user is admin
    const adminMemberships = await prisma.$queryRaw`
      SELECT * FROM GroupMember WHERE groupId = ${groupId} AND userId = ${userId} AND role = 'ADMIN'
    ` as any[];

    if ((!adminMemberships || adminMemberships.length === 0) && !isSelfRemoval) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    await prisma.$executeRaw`DELETE FROM GroupMember WHERE id = ${memberId}`;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing member:', error);
    return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 });
  }
}
