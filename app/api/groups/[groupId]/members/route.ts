import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isUuid } from '@/lib/validate';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

const VALID_ROLES = ['ADMIN', 'MEMBER', 'INSTRUCTOR', 'VIEWER'];

async function getUserId(email: string): Promise<string | null> {
  const users = await prisma.$queryRaw<any[]>`
    SELECT id FROM [User] WHERE email = ${email}
  `;
  return users?.[0]?.id ?? null;
}

async function isGroupAdmin(groupId: string, userId: string): Promise<boolean> {
  const memberships = await prisma.$queryRaw<any[]>`
    SELECT id FROM GroupMember WHERE groupId = ${groupId} AND userId = ${userId} AND role = 'ADMIN'
  `;
  return memberships.length > 0;
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

    const userId = await getUserId(session.user.email);
    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const memberships = await prisma.$queryRaw<any[]>`
      SELECT id FROM GroupMember WHERE groupId = ${groupId} AND userId = ${userId}
    `;
    if (memberships.length === 0) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }

    const members = await prisma.$queryRaw<any[]>`
      SELECT gm.*, u.name as userName, u.email as userEmail
      FROM GroupMember gm
      JOIN [User] u ON gm.userId = u.id
      WHERE gm.groupId = ${groupId}
    `;

    const formattedMembers = members.map((m: any) => ({
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

    const userId = await getUserId(session.user.email);
    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!(await isGroupAdmin(groupId, userId))) {
      return NextResponse.json({ error: 'Only admins can update members' }, { status: 403 });
    }

    const body = await request.json();
    const { memberId, role } = body;

    if (!isUuid(memberId)) {
      return NextResponse.json({ error: 'Invalid memberId' }, { status: 400 });
    }
    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    await prisma.$executeRaw`
      UPDATE GroupMember SET role = ${role} WHERE id = ${memberId} AND groupId = ${groupId}
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

    const userId = await getUserId(session.user.email);
    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const url = new URL(request.url);
    const memberId = url.searchParams.get('memberId');
    if (!memberId || !isUuid(memberId)) {
      return NextResponse.json({ error: 'Valid memberId required' }, { status: 400 });
    }

    const targetMembers = await prisma.$queryRaw<any[]>`
      SELECT * FROM GroupMember WHERE id = ${memberId} AND groupId = ${groupId}
    `;
    if (targetMembers.length === 0) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    const isSelfRemoval = targetMembers[0].userId === userId;
    if (!isSelfRemoval && !(await isGroupAdmin(groupId, userId))) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    await prisma.$executeRaw`DELETE FROM GroupMember WHERE id = ${memberId}`;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing member:', error);
    return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 });
  }
}
