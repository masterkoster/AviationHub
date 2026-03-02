import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/auth';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { action, notes, cost } = body;

    // Get the maintenance issue
    const issue = await prisma.maintenance.findUnique({
      where: { id },
    });

    if (!issue) {
      return NextResponse.json({ error: 'Issue not found' }, { status: 404 });
    }

    // Get the aircraft's group
    const aircraft = await prisma.clubAircraft.findUnique({
      where: { id: issue.clubAircraftId ?? undefined },
      select: { organizationId: true }
    });

    if (!aircraft) {
      return NextResponse.json({ error: 'Aircraft not found' }, { status: 404 });
    }

    // Check admin access
    const membership = await prisma.organizationMember.findFirst({
      where: {
        userId: session.user.id,
        organizationId: aircraft.organizationId,
        role: { in: ['ADMIN', 'OWNER'] }
      }
    });

    if (!membership) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Handle different actions
    let updateData: any = {
      updatedAt: new Date()
    };

    switch (action) {
      case 'resolve':
        updateData.status = 'DONE';
        updateData.resolvedDate = new Date();
        updateData.isGrounded = false;
        if (cost !== undefined) updateData.cost = cost;
        if (notes) updateData.notes = notes;
        break;

      case 'dismiss':
        // Mark as resolved without creating work order
        updateData.status = 'DONE';
        updateData.resolvedDate = new Date();
        updateData.isGrounded = false;
        if (notes) updateData.notes = (issue.notes || '') + '\n[Dismissed by admin] ' + notes;
        break;

      case 'ground':
        updateData.isGrounded = true;
        updateData.status = 'IN_PROGRESS';
        if (notes) updateData.notes = notes;
        break;

      case 'unground':
        updateData.isGrounded = false;
        if (notes) updateData.notes = notes;
        break;

      case 'create-work-order':
        updateData.status = 'IN_PROGRESS';
        if (notes) updateData.notes = notes;
        if (cost !== undefined) updateData.cost = cost;
        break;

      case 'update':
        if (notes !== undefined) updateData.notes = notes;
        if (cost !== undefined) updateData.cost = cost;
        break;

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    // Update the maintenance record
    const updated = await prisma.maintenance.update({
      where: { id },
      data: updateData
    });

    return NextResponse.json({ success: true, issue: updated });
  } catch (error) {
    console.error('Error updating maintenance issue:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
