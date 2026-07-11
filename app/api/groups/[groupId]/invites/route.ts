import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isUuid } from '@/lib/validate';
import { randomBytes } from 'crypto';

interface RouteParams {
  params: Promise<{ groupId: string }>;
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
      return NextResponse.json({ error: 'Only admins can view invites' }, { status: 403 });
    }

    // Get invites using raw SQL
    const invites = await prisma.$queryRaw`
      SELECT i.*, fg.name as groupName
      FROM Invite i
      JOIN FlyingGroup fg ON i.groupId = fg.id
      WHERE i.groupId = ${groupId}
      ORDER BY i.createdAt DESC
    ` as any[];

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
      return NextResponse.json({ error: 'Only admins can create invites' }, { status: 403 });
    }

    const body = await request.json();
    const { email, role, expiresInDays } = body;

    const allowedRoles = ['ADMIN', 'MEMBER', 'VIEWER'];
    if (role !== undefined && role !== null && !allowedRoles.includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }
    const inviteRole = role || 'VIEWER';

    // Check if invite already exists for this email+group (and not expired)
    if (email) {
      const emailLower = email.toLowerCase();
      const existingInvites = await prisma.$queryRaw`
        SELECT * FROM Invite
        WHERE groupId = ${groupId}
        AND LOWER(email) = ${emailLower}
        AND expiresAt > GETDATE()
      ` as any[];

      if (existingInvites && existingInvites.length > 0) {
        return NextResponse.json({ error: 'An invitation has already been sent to this email' }, { status: 400 });
      }

      // Also check if user is already a member
      const existingMembers = await prisma.$queryRaw`
        SELECT gm.* FROM GroupMember gm
        JOIN [User] u ON gm.userId = u.id
        WHERE gm.groupId = ${groupId} AND LOWER(u.email) = ${emailLower}
      ` as any[];

      if (existingMembers && existingMembers.length > 0) {
        return NextResponse.json({ error: 'This user is already a member of the group' }, { status: 400 });
      }
    }

    // Get group's default expiry setting using raw SQL
    const groups = await prisma.$queryRaw`
      SELECT defaultInviteExpiry FROM FlyingGroup WHERE id = ${groupId}
    ` as any[];

    // Determine expiry: use provided value, or group's default, or 7 days
    const neverExpires = expiresInDays === -1; // -1 means never
    let days = expiresInDays ?? groups?.[0]?.defaultInviteExpiry ?? 7;
    if (!neverExpires) {
      days = Number(days);
      if (!Number.isInteger(days)) {
        return NextResponse.json({ error: 'Invalid expiresInDays' }, { status: 400 });
      }
    }

    // Generate unique token
    const token = randomBytes(32).toString('hex');
    const emailValue = email ? email.toLowerCase() : null;

    // Insert using raw SQL
    if (neverExpires) {
      await prisma.$executeRaw`
        INSERT INTO Invite (id, groupId, token, email, role, createdBy, expiresAt, createdAt, updatedAt)
        VALUES (NEWID(), ${groupId}, ${token}, ${emailValue}, ${inviteRole}, ${userId}, DATEADD(year, 10, GETDATE()), GETDATE(), GETDATE())
      `;
    } else {
      await prisma.$executeRaw`
        INSERT INTO Invite (id, groupId, token, email, role, createdBy, expiresAt, createdAt, updatedAt)
        VALUES (NEWID(), ${groupId}, ${token}, ${emailValue}, ${inviteRole}, ${userId}, DATEADD(day, ${days}, GETDATE()), GETDATE(), GETDATE())
      `;
    }

    return NextResponse.json({
      token,
      expiresAt: neverExpires ? null : new Date(Date.now() + days * 24 * 60 * 60 * 1000),
      expiresNever: neverExpires
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

    if (!inviteId) {
      return NextResponse.json({ error: 'inviteId required' }, { status: 400 });
    }
    if (!isUuid(inviteId)) {
      return NextResponse.json({ error: 'Invalid inviteId' }, { status: 400 });
    }

    // Get user by email using raw SQL
    const users = await prisma.$queryRaw`
      SELECT id FROM [User] WHERE email = ${session.user.email}
    ` as any[];

    if (!users || users.length === 0) {
      return NextResponse.json({ error: '[User] not found' }, { status: 404 });
    }

    const userId = users[0].id;

    // Find the invite to check group ownership
    const invites = await prisma.$queryRaw`
      SELECT i.*, fg.name as groupName
      FROM Invite i
      JOIN FlyingGroup fg ON i.groupId = fg.id
      WHERE i.id = ${inviteId}
    ` as any[];

    if (!invites || invites.length === 0) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
    }

    const invite = invites[0];

    // Check if user is admin of the group
    const memberships = await prisma.$queryRaw`
      SELECT * FROM GroupMember WHERE groupId = ${invite.groupId} AND userId = ${userId} AND role = 'ADMIN'
    ` as any[];

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    await prisma.$executeRaw`DELETE FROM Invite WHERE id = ${inviteId}`;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting invite:', error);
    return NextResponse.json({ error: 'Failed to delete invite' }, { status: 500 });
  }
}
