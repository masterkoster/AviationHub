import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isUuid } from '@/lib/validate';
import { randomBytes } from 'crypto';

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

// GET all invites for a group (admin only)
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

    if (!(await isGroupAdmin(groupId, userId))) {
      return NextResponse.json({ error: 'Only admins can view invites' }, { status: 403 });
    }

    const invites = await prisma.$queryRaw<any[]>`
      SELECT i.*, fg.name as groupName
      FROM Invite i
      JOIN FlyingGroup fg ON i.groupId = fg.id
      WHERE i.groupId = ${groupId}
      ORDER BY i.createdAt DESC
    `;

    const formattedInvites = invites.map((i: any) => ({
      id: i.id,
      groupId: i.groupId,
      token: i.token,
      email: i.email,
      role: i.role,
      expiresAt: i.expiresAt,
      createdAt: i.createdAt,
      group: {
        id: i.groupId,
        name: i.groupName
      }
    }));

    return NextResponse.json(formattedInvites);
  } catch (error) {
    console.error('Error fetching invites:', error);
    return NextResponse.json({ error: 'Failed to fetch invites' }, { status: 500 });
  }
}

// POST create an invite
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

    const userId = await getUserId(session.user.email);
    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!(await isGroupAdmin(groupId, userId))) {
      return NextResponse.json({ error: 'Only admins can create invites' }, { status: 403 });
    }

    const body = await request.json();
    const { email, role, expiresInDays } = body;

    const inviteRole = role ?? 'VIEWER';
    if (!VALID_ROLES.includes(inviteRole)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }
    if (expiresInDays != null && (!Number.isInteger(expiresInDays) || (expiresInDays < 1 && expiresInDays !== -1))) {
      return NextResponse.json({ error: 'Invalid expiresInDays' }, { status: 400 });
    }

    const normalizedEmail = typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : null;

    // Check if invite already exists for this email+group (and not expired)
    if (normalizedEmail) {
      const existingInvites = await prisma.$queryRaw<any[]>`
        SELECT id FROM Invite
        WHERE groupId = ${groupId}
        AND LOWER(email) = ${normalizedEmail}
        AND expiresAt > GETDATE()
      `;
      if (existingInvites.length > 0) {
        return NextResponse.json({ error: 'An invitation has already been sent to this email' }, { status: 400 });
      }

      // Also check if user is already a member
      const existingMembers = await prisma.$queryRaw<any[]>`
        SELECT gm.id FROM GroupMember gm
        JOIN [User] u ON gm.userId = u.id
        WHERE gm.groupId = ${groupId} AND LOWER(u.email) = ${normalizedEmail}
      `;
      if (existingMembers.length > 0) {
        return NextResponse.json({ error: 'This user is already a member of the group' }, { status: 400 });
      }
    }

    // Get group's default expiry setting
    const groups = await prisma.$queryRaw<any[]>`
      SELECT defaultInviteExpiry FROM FlyingGroup WHERE id = ${groupId}
    `;

    // Determine expiry: -1 means "never" (10 years), otherwise provided value, group default, or 7 days
    const expiryDays = expiresInDays === -1
      ? 3650
      : Number(expiresInDays ?? groups?.[0]?.defaultInviteExpiry ?? 7);

    // Generate unique token
    const token = randomBytes(32).toString('hex');

    await prisma.$executeRaw`
      INSERT INTO Invite (id, groupId, token, email, role, createdBy, expiresAt, createdAt, updatedAt)
      VALUES (NEWID(), ${groupId}, ${token}, ${normalizedEmail}, ${inviteRole}, ${userId}, DATEADD(day, ${expiryDays}, GETDATE()), GETDATE(), GETDATE())
    `;

    return NextResponse.json({
      token,
      expiresAt: expiresInDays === -1 ? null : new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000),
      expiresNever: expiresInDays === -1
    });
  } catch (error) {
    console.error('Error creating invite:', error);
    return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 });
  }
}

// DELETE revoke an invite
export async function DELETE(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const inviteId = url.searchParams.get('inviteId');
    if (!inviteId || !isUuid(inviteId)) {
      return NextResponse.json({ error: 'Valid inviteId required' }, { status: 400 });
    }

    const userId = await getUserId(session.user.email);
    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const invites = await prisma.$queryRaw<any[]>`
      SELECT id, groupId FROM Invite WHERE id = ${inviteId}
    `;
    if (invites.length === 0) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
    }

    if (!(await isGroupAdmin(invites[0].groupId, userId))) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    await prisma.$executeRaw`DELETE FROM Invite WHERE id = ${inviteId}`;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting invite:', error);
    return NextResponse.json({ error: 'Failed to delete invite' }, { status: 500 });
  }
}
