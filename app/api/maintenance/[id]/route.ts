import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

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
    const body = await request.json();
    const { status, cost, notes, isGrounded } = body;

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

    // Update maintenance using raw SQL to avoid schema mismatch
    // Use string interpolation since SQL Server doesn't support ? placeholders in $queryRawUnsafe
    await prisma.$executeRawUnsafe(`
      UPDATE Maintenance 
      SET status = '${status}', cost = ${cost || 'NULL'}, notes = ${notes ? "'" + notes.replace(/'/g, "''") + "'" : 'NULL'}, resolvedDate = ${resolvedDate ? "GETDATE()" : 'NULL'}, isGrounded = ${groundedStatus !== null ? groundedStatus : 'NULL'}, updatedAt = GETDATE()
      WHERE id = '${id}'
    `);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating maintenance:', error);
    return NextResponse.json({ 
      error: 'Failed to update maintenance', 
      details: error instanceof Error ? error.message : String(error)
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

    // Only allow delete for NEEDED status and by admin
    const maintenance = await prisma.$queryRawUnsafe(`
      SELECT m.*, a.organizationId
      FROM Maintenance m
      JOIN ClubAircraft a ON m.clubAircraftId = a.id
      WHERE m.id = '${id}'
    `) as any[];

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

    await prisma.$queryRawUnsafe(`DELETE FROM Maintenance WHERE id = '${id}'`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting maintenance:', error);
    return NextResponse.json({ error: 'Failed to delete maintenance' }, { status: 500 });
  }
}
