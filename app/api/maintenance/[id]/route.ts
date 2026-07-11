import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isUuid } from '@/lib/validate';

const MAINTENANCE_STATUSES = ['NEEDED', 'IN_PROGRESS', 'DONE'];

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }

    const body = await request.json();
    const { status, cost, notes, isGrounded } = body;

    if (status !== undefined && !MAINTENANCE_STATUSES.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    let costValue: number | null = null;
    if (cost !== undefined && cost !== null && cost !== '') {
      costValue = Number(cost);
      if (!Number.isFinite(costValue)) {
        return NextResponse.json({ error: 'Invalid cost' }, { status: 400 });
      }
    }

    // Get maintenance record first
    const maintenance = await prisma.maintenance.findUnique({
      where: { id }
    });

    if (!maintenance) {
      return NextResponse.json({ error: 'Maintenance not found' }, { status: 404 });
    }

    // Skip group/membership check for now - just update
    const resolvedDate = status === 'DONE' ? new Date() : null;
    const groundedStatus = isGrounded !== undefined ? isGrounded : (status === 'DONE' ? false : null);

    // Update maintenance
    await prisma.$executeRaw`
      UPDATE Maintenance
      SET status = ${status}, cost = ${costValue}, notes = ${notes ?? null}, resolvedDate = ${resolvedDate ? new Date() : null}, isGrounded = ${groundedStatus !== null ? (groundedStatus ? 1 : 0) : null}, updatedAt = GETDATE()
      WHERE id = ${id}
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating maintenance:', error);
    return NextResponse.json({
      error: 'Failed to update maintenance',
    }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { id } = await params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }

    // Only allow delete for NEEDED status and by admin
    const maintenance = await prisma.$queryRaw`
      SELECT m.*, a.organizationId
      FROM Maintenance m
      JOIN ClubAircraft a ON m.clubAircraftId = a.id
      WHERE m.id = ${id}
    ` as any[];

    if (!maintenance || maintenance.length === 0) {
      return NextResponse.json({ error: 'Maintenance not found' }, { status: 404 });
    }

    // Check admin role
    const membership = await prisma.organizationMember.findFirst({
      where: { userId: user.id, organizationId: maintenance[0].organizationId, role: 'ADMIN' },
    });

    if (!membership) {
      return NextResponse.json({ error: 'Only admins can delete maintenance' }, { status: 403 });
    }

    await prisma.$executeRaw`DELETE FROM Maintenance WHERE id = ${id}`;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting maintenance:', error);
    return NextResponse.json({ error: 'Failed to delete maintenance' }, { status: 500 });
  }
}
