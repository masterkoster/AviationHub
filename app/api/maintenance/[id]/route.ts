import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const VALID_STATUSES = ['NEEDED', 'IN_PROGRESS', 'COMPLETED'];

function serialize(m: any) {
  return {
    ...m,
    cost: m.cost !== null && m.cost !== undefined ? Number(m.cost) : null,
  };
}

// Shared handler for PATCH/PUT: update a squawk's status, cost, notes, and/or
// grounded flag. Requires the caller to be an ADMIN member of the squawk's
// organization.
async function updateMaintenance(request: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const { status, cost, notes, isGrounded } = body ?? {};

  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `status must be one of ${VALID_STATUSES.join(', ')}` },
      { status: 400 }
    );
  }

  const maintenance = await prisma.maintenance.findUnique({ where: { id } });
  if (!maintenance) {
    return NextResponse.json({ error: 'Maintenance item not found' }, { status: 404 });
  }

  // Resolve the owning organization. Maintenance rows carry organizationId
  // directly, but fall back to the linked aircraft's org for older/partial rows.
  let organizationId = maintenance.organizationId;
  if (!organizationId && maintenance.clubAircraftId) {
    const aircraft = await prisma.clubAircraft.findUnique({
      where: { id: maintenance.clubAircraftId },
      select: { organizationId: true },
    });
    organizationId = aircraft?.organizationId ?? null;
  }

  if (!organizationId) {
    return NextResponse.json({ error: 'Maintenance item has no associated club' }, { status: 400 });
  }

  const membership = await prisma.organizationMember.findFirst({
    where: { organizationId, userId: session.user.id, role: 'ADMIN' },
  });

  if (!membership) {
    return NextResponse.json({ error: 'Only club admins can update maintenance items' }, { status: 403 });
  }

  const updateData: Record<string, unknown> = {};

  if (status !== undefined) {
    updateData.status = status;
    if (status === 'COMPLETED') {
      updateData.resolvedDate = new Date();
      // Completing a squawk clears grounding by default; callers may still
      // pass isGrounded explicitly (handled below) to override this.
      updateData.isGrounded = false;
    } else {
      updateData.resolvedDate = null;
    }
  }

  if (cost !== undefined) {
    if (cost === null) {
      updateData.cost = null;
    } else {
      const numericCost = typeof cost === 'number' ? cost : Number(cost);
      if (Number.isNaN(numericCost) || numericCost < 0) {
        return NextResponse.json({ error: 'cost must be a non-negative number' }, { status: 400 });
      }
      updateData.cost = numericCost;
    }
  }

  if (notes !== undefined) {
    updateData.notes = notes === null ? null : String(notes);
  }

  if (isGrounded !== undefined) {
    updateData.isGrounded = !!isGrounded;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  try {
    const updated = await prisma.maintenance.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ success: true, maintenance: serialize(updated) });
  } catch (error) {
    console.error('Error updating maintenance:', error);
    return NextResponse.json(
      { error: 'Failed to update maintenance', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, ctx: RouteParams) {
  return updateMaintenance(request, ctx);
}

// Kept for backwards compatibility with any existing PUT callers.
export async function PUT(request: Request, ctx: RouteParams) {
  return updateMaintenance(request, ctx);
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const maintenance = await prisma.maintenance.findUnique({ where: { id } });
    if (!maintenance) {
      return NextResponse.json({ error: 'Maintenance not found' }, { status: 404 });
    }

    let organizationId = maintenance.organizationId;
    if (!organizationId && maintenance.clubAircraftId) {
      const aircraft = await prisma.clubAircraft.findUnique({
        where: { id: maintenance.clubAircraftId },
        select: { organizationId: true },
      });
      organizationId = aircraft?.organizationId ?? null;
    }

    if (!organizationId) {
      return NextResponse.json({ error: 'Maintenance item has no associated club' }, { status: 400 });
    }

    const membership = await prisma.organizationMember.findFirst({
      where: { organizationId, userId: session.user.id, role: 'ADMIN' },
    });

    if (!membership) {
      return NextResponse.json({ error: 'Only admins can delete maintenance' }, { status: 403 });
    }

    await prisma.maintenance.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting maintenance:', error);
    return NextResponse.json({ error: 'Failed to delete maintenance' }, { status: 500 });
  }
}
