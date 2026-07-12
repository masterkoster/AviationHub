import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isUuid } from '@/lib/validate';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

// GET group details
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

    const group = await prisma.organization.findUnique({
      where: { id: groupId },
      include: {
        aircraft: true,
        members: {
          include: { user: { select: { id: true, name: true, email: true } } }
        }
      }
    });

    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: group.id,
      name: group.name,
      type: group.type,
      ownerId: group.ownerId,
      description: group.description,
      createdAt: group.createdAt,
      aircraft: group.aircraft,
      members: group.members.map(m => ({
        id: m.id,
        userId: m.userId,
        role: m.role,
        joinedAt: m.joinedAt,
        user: m.user
      }))
    });
  } catch (error) {
    console.error('Error fetching group:', error);
    return NextResponse.json({ error: 'Failed to fetch group', details: String(error) }, { status: 500 });
  }
}

// PUT update group settings (admin only)
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { groupId } = await params;
    const userId = session.user.id;

    // Check admin role
    const membership = await prisma.organizationMember.findFirst({
      where: { organizationId: groupId, userId, role: 'ADMIN' }
    });

    if (!membership) {
      return NextResponse.json({ error: 'Only admins can update group settings' }, { status: 403 });
    }

    const body = await request.json();
    const { name, description } = body;

    const updateData: Record<string, unknown> = {};
    if (name && typeof name === 'string') updateData.name = name.trim();
    if (description !== undefined) updateData.description = description;

    const group = await prisma.organization.update({
      where: { id: groupId },
      data: updateData
    });

    return NextResponse.json({
      id: group.id,
      name: group.name,
      description: group.description,
      type: group.type,
      ownerId: group.ownerId
    });
  } catch (error) {
    console.error('Error updating group:', error);
    return NextResponse.json({ error: 'Failed to update group', details: String(error) }, { status: 500 });
  }
}

// DELETE group (owner only)
export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { groupId } = await params;
    const userId = session.user.id;

    // Check ownership
    const group = await prisma.organization.findUnique({
      where: { id: groupId }
    });

    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    if (group.ownerId !== userId) {
      return NextResponse.json({ error: 'Only the owner can delete the group' }, { status: 403 });
    }

    // Delete related records first
    await prisma.organizationMember.deleteMany({ where: { organizationId: groupId } });
    await prisma.clubAircraft.deleteMany({ where: { organizationId: groupId } });
    await prisma.booking.deleteMany({ where: { organizationId: groupId } });
    await prisma.organization.delete({ where: { id: groupId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting group:', error);
    return NextResponse.json({ error: 'Failed to delete group', details: String(error) }, { status: 500 });
  }
}
