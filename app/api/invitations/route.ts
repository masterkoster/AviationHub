import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

// GET pending invitations for current user
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const users = await prisma.$queryRawUnsafe(`
      SELECT id, email FROM [User] WHERE email = '${session.user.email.replace(/'/g, "''")}'
    `) as any[];

    if (!users || users.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const email = users[0].email;

    const invites = await prisma.$queryRawUnsafe(`
      SELECT i.*, fg.name as groupName, fg.description as groupDescription
      FROM Invite i
      JOIN FlyingGroup fg ON i.groupId = fg.id
      WHERE i.email = '${email.replace(/'/g, "''")}' AND i.expiresAt > GETDATE()
      ORDER BY i.createdAt DESC
    `) as any[];

    const formattedInvites = (invites || []).map((i: any) => ({
      id: i.id,
      groupId: i.groupId,
      token: i.token,
      email: i.email,
      role: i.role,
      expiresAt: i.expiresAt,
      createdAt: i.createdAt,
      group: {
        id: i.groupId,
        name: i.groupName,
        description: i.groupDescription,
      },
    }));

    return NextResponse.json(formattedInvites);
  } catch (error) {
    console.error('Error fetching invitations:', error);
    return NextResponse.json({ error: 'Failed to fetch invitations: ' + String(error) }, { status: 500 });
  }
}

// Accept invitation
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Please log in to accept invitation' }, { status: 401 });
    }

    const users = await prisma.$queryRawUnsafe(`
      SELECT id, email FROM [User] WHERE email = '${session.user.email.replace(/'/g, "''")}'
    `) as any[];

    if (!users || users.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userId = users[0].id;
    const userEmail = users[0].email;

    const body = await request.json();
    const { inviteId } = body;

    // Find the invite
    const invites = await prisma.$queryRawUnsafe(`
      SELECT i.*, fg.name as groupName, fg.description as groupDescription
      FROM Invite i
      JOIN FlyingGroup fg ON i.groupId = fg.id
      WHERE i.id = '${String(inviteId).replace(/'/g, "''")}'
    `) as any[];

    if (!invites || invites.length === 0) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    }

    const invite = invites[0];

    if (invite.email !== userEmail) {
      return NextResponse.json({ error: 'This invitation is not for you' }, { status: 403 });
    }

    if (invite.expiresAt <= new Date()) {
      return NextResponse.json({ error: 'Invitation has expired' }, { status: 400 });
    }

    // Check if already a member
    const existingMembers = await prisma.$queryRawUnsafe(`
      SELECT * FROM GroupMember WHERE userId = '${userId}' AND groupId = '${invite.groupId}'
    `) as any[];

    if (existingMembers && existingMembers.length > 0) {
      return NextResponse.json({ error: 'You are already a member of this group' }, { status: 400 });
    }

    // Add user as member
    const memberId = crypto.randomUUID();
    await prisma.$executeRawUnsafe(`
      INSERT INTO GroupMember (id, userId, groupId, role, joinedAt)
      VALUES ('${memberId}', '${userId}', '${invite.groupId}', '${invite.role}', GETDATE())
    `);

    await prisma.$executeRawUnsafe(`DELETE FROM Invite WHERE id = '${inviteId}'`);

    return NextResponse.json({
      success: true,
      group: {
        id: invite.groupId,
        name: invite.groupName,
        description: invite.groupDescription,
      },
    });
  } catch (error) {
    console.error('Error accepting invitation:', error);
    return NextResponse.json({ error: 'Failed to accept invitation' }, { status: 500 });
  }
}
