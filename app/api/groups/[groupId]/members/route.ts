import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isUuid } from '@/lib/validate';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

// GET members of a group
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

    // Check membership
    const membership = await prisma.organizationMember.findFirst({
      where: { organizationId: groupId, userId }
    });

    if (!membership) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }

    // Get members
    const members = await prisma.organizationMember.findMany({
      where: { organizationId: groupId },
      include: {
        user: { select: { id: true, name: true, email: true } }
      },
      orderBy: { joinedAt: 'desc' }
    });

    const formatted = members.map(m => ({
      id: m.id,
      userId: m.userId,
      groupId: m.organizationId,
      role: m.role,
      joinedAt: m.joinedAt,
      user: m.user
    }));

    return NextResponse.json(formatted);
  } catch (error) {
    console.error('Error fetching members:', error);
    return NextResponse.json({ error: 'Failed to fetch members', details: String(error) }, { status: 500 });
  }
}

// PUT update a member's role (admin only)
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { groupId } = await params;
    const userId = session.user.id;

    // Check admin role
    const adminMembership = await prisma.organizationMember.findFirst({
      where: { organizationId: groupId, userId, role: 'ADMIN' }
    });

    if (!adminMembership) {
      return NextResponse.json({ error: 'Only admins can update members' }, { status: 403 });
    }

    const body = await request.json();
    const { memberId, role } = body;

    if (!memberId || !role) {
      return NextResponse.json({ error: 'memberId and role required' }, { status: 400 });
    }

    const targetMember = await prisma.organizationMember.findFirst({
      where: { id: memberId, organizationId: groupId }
    });

    if (!targetMember) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    const organization = await prisma.organization.findUnique({
      where: { id: groupId },
      select: { ownerId: true }
    });

    if (organization && targetMember.userId === organization.ownerId) {
      return NextResponse.json({ error: 'Cannot change the club owner\'s role' }, { status: 400 });
    }

    // Prevent demoting yourself if you are the last ADMIN
    if (targetMember.userId === userId && targetMember.role === 'ADMIN' && role !== 'ADMIN') {
      const adminCount = await prisma.organizationMember.count({
        where: { organizationId: groupId, role: 'ADMIN' }
      });
      if (adminCount <= 1) {
        return NextResponse.json(
          { error: 'You are the last admin — promote another member before stepping down' },
          { status: 400 }
        );
      }
    }

    await prisma.organizationMember.update({
      where: { id: memberId },
      data: { role }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating member:', error);
    return NextResponse.json({ error: 'Failed to update member', details: String(error) }, { status: 500 });
  }
}

// DELETE remove a member from group
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { groupId } = await params;
    const userId = session.user.id;
    const url = new URL(request.url);
    const memberId = url.searchParams.get('memberId');

    if (!memberId) {
      return NextResponse.json({ error: 'memberId required' }, { status: 400 });
    }

    // Get target member
    const targetMember = await prisma.organizationMember.findFirst({
      where: { id: memberId, organizationId: groupId }
    });

    if (!targetMember) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    const isSelfRemoval = targetMember.userId === userId;

    const organization = await prisma.organization.findUnique({
      where: { id: groupId },
      select: { ownerId: true }
    });

    if (organization && targetMember.userId === organization.ownerId) {
      return NextResponse.json({ error: 'Cannot remove the club owner' }, { status: 400 });
    }

    // Check if user is admin (unless self-removal)
    if (!isSelfRemoval) {
      const adminMembership = await prisma.organizationMember.findFirst({
        where: { organizationId: groupId, userId, role: 'ADMIN' }
      });
      if (!adminMembership) {
        return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
      }
    }

    // Prevent the last ADMIN from leaving while other members remain
    if (targetMember.role === 'ADMIN') {
      const [adminCount, totalCount] = await Promise.all([
        prisma.organizationMember.count({ where: { organizationId: groupId, role: 'ADMIN' } }),
        prisma.organizationMember.count({ where: { organizationId: groupId } })
      ]);
      if (adminCount <= 1 && totalCount > 1) {
        return NextResponse.json(
          { error: 'You are the last admin — promote another member before leaving' },
          { status: 400 }
        );
      }
    }

    await prisma.organizationMember.delete({ where: { id: memberId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing member:', error);
    return NextResponse.json({ error: 'Failed to remove member', details: String(error) }, { status: 500 });
  }
}
