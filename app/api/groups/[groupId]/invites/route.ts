import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isUuid } from '@/lib/validate';
import { randomBytes } from 'crypto';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

const VALID_ROLES = ['ADMIN', 'MEMBER', 'INSTRUCTOR', 'VIEWER'];

// GET all invites for a group (admin only)
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { groupId } = await params;
    if (!isUuid(groupId)) {
      return NextResponse.json({ error: 'Invalid groupId' }, { status: 400 });
    }

    const userId = session.user.id;

    // Check admin role
    const membership = await prisma.organizationMember.findFirst({
      where: { organizationId: groupId, userId, role: 'ADMIN' }
    });

    if (!membership) {
      return NextResponse.json({ error: 'Only admins can view invites' }, { status: 403 });
    }

    const invites = await prisma.invite.findMany({
      where: { groupId },
      orderBy: { createdAt: 'desc' }
    });

    const formatted = invites.map(i => ({
      id: i.id,
      groupId: i.groupId,
      token: i.token,
      email: i.email,
      role: i.role,
      expiresAt: i.expiresAt,
      createdAt: i.createdAt
    }));

    return NextResponse.json(formatted);
  } catch (error) {
    console.error('Error fetching invites:', error);
    return NextResponse.json({ error: 'Failed to fetch invites' }, { status: 500 });
  }
}

// POST create an invite
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { groupId } = await params;
    if (!isUuid(groupId)) {
      return NextResponse.json({ error: 'Invalid groupId' }, { status: 400 });
    }

    const userId = session.user.id;

    // Check admin role
    const membership = await prisma.organizationMember.findFirst({
      where: { organizationId: groupId, userId, role: 'ADMIN' }
    });

    if (!membership) {
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

    // Email is optional — omitting it creates an open invite link that
    // anyone with the URL can redeem.
    const normalizedEmail = typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : null;

    if (normalizedEmail) {
      // Check if a pending invite already exists for this email
      const existingInvite = await prisma.invite.findFirst({
        where: {
          groupId,
          email: normalizedEmail,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
        }
      });

      if (existingInvite) {
        return NextResponse.json({ error: 'An invitation has already been sent to this email' }, { status: 400 });
      }

      // Check if user is already a member
      const existingMember = await prisma.organizationMember.findFirst({
        where: {
          organizationId: groupId,
          user: { email: normalizedEmail }
        }
      });

      if (existingMember) {
        return NextResponse.json({ error: 'This user is already a member of the group' }, { status: 400 });
      }
    }

    // Enforce max 5 pending (unexpired, unaccepted) invites per club
    const pendingCount = await prisma.invite.count({
      where: {
        groupId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
      }
    });

    if (pendingCount >= 5) {
      return NextResponse.json(
        { error: 'This club already has 5 pending invites. Revoke one before sending another.' },
        { status: 400 }
      );
    }

    // Determine expiry: -1 means "never" (10 years), otherwise the provided
    // value, or 7 days by default.
    const expiryDays = expiresInDays === -1 ? 3650 : Number(expiresInDays ?? 7);

    // Note: membership is only ever created when the invited user accepts —
    // nobody may be force-added, so we always create an invite token here,
    // even if a user account with this email already exists.
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);
    const siteUrl = process.env.NEXTAUTH_URL || 'https://koster.im';

    await prisma.invite.create({
      data: {
        groupId,
        token,
        email: normalizedEmail,
        role: inviteRole,
        createdBy: userId,
        expiresAt
      }
    });

    return NextResponse.json({
      type: 'invite',
      token,
      inviteLink: `${siteUrl}/join/${token}`,
      email: normalizedEmail,
      role: inviteRole,
      expiresAt: expiresInDays === -1 ? null : expiresAt,
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
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const inviteId = url.searchParams.get('inviteId');
    if (!inviteId || !isUuid(inviteId)) {
      return NextResponse.json({ error: 'Valid inviteId required' }, { status: 400 });
    }

    // Find the invite
    const invite = await prisma.invite.findUnique({ where: { id: inviteId } });

    if (!invite) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
    }

    // Check if user is admin of the group
    const membership = await prisma.organizationMember.findFirst({
      where: { organizationId: invite.groupId, userId: session.user.id, role: 'ADMIN' }
    });

    if (!membership) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    await prisma.invite.delete({ where: { id: inviteId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting invite:', error);
    return NextResponse.json({ error: 'Failed to delete invite' }, { status: 500 });
  }
}
