import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isUuid } from '@/lib/validate';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { groupId } = await params;
    if (!isUuid(groupId)) {
      return NextResponse.json({ error: 'Invalid groupId' }, { status: 400 });
    }

    const body = await request.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }
    if (!/^[0-9a-f]{64}$/i.test(token)) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
    }

    // Find invite for this group
    const invite = await prisma.invite.findFirst({
      where: {
        groupId,
        token,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
      }
    });

    if (!invite) {
      // Distinguish an expired invite from one that just doesn't belong to this group
      const anyInvite = await prisma.invite.findUnique({ where: { token } });
      if (anyInvite) {
        if (anyInvite.expiresAt && anyInvite.expiresAt <= new Date()) {
          return NextResponse.json({ error: 'Invite has expired. Please ask for a new one.' }, { status: 404 });
        }
        return NextResponse.json({ error: 'Invalid invite link for this group' }, { status: 404 });
      }
      return NextResponse.json({ error: 'Invalid or expired invite token' }, { status: 404 });
    }

    // Get group info (for VIEWER role - public access)
    const group = await prisma.organization.findUnique({
      where: { id: groupId },
      select: { id: true, name: true, description: true }
    });

    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    // VIEWER role — public access, no auth required
    if (invite.role === 'VIEWER') {
      return NextResponse.json({
        success: true,
        role: 'VIEWER',
        group
      });
    }

    // MEMBER/ADMIN role — requires auth
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Authentication required to join as member' }, { status: 401 });
    }

    const userId = session.user.id;

    // If the invite was addressed to a specific email, only that person may accept it
    if (invite.email && session.user.email?.toLowerCase() !== invite.email.toLowerCase()) {
      return NextResponse.json(
        { error: 'This invite was sent to a different email address' },
        { status: 403 }
      );
    }

    // Check if already a member
    const existingMember = await prisma.organizationMember.findFirst({
      where: { organizationId: groupId, userId }
    });

    if (existingMember) {
      return NextResponse.json({ error: 'Already a member' }, { status: 400 });
    }

    // Add member (for the authenticated caller only) and consume the invite
    await prisma.organizationMember.create({
      data: {
        organizationId: groupId,
        userId,
        role: invite.role
      }
    });

    await prisma.invite.delete({ where: { id: invite.id } });

    return NextResponse.json({
      success: true,
      role: invite.role,
      group
    });
  } catch (error) {
    console.error('Error joining group:', error);
    return NextResponse.json({ error: 'Failed to join group' }, { status: 500 });
  }
}
