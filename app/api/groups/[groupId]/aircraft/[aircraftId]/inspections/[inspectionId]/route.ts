import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isUuid } from '@/lib/validate';

interface RouteParams {
  params: Promise<{ groupId: string; aircraftId: string; inspectionId: string }>;
}

async function requireAdmin(groupId: string, userId: string) {
  const m = await prisma.organizationMember.findFirst({
    where: { organizationId: groupId, userId },
    select: { role: true },
  });
  if (!m) return { ok: false as const, status: 403, error: 'Not a member' };
  if (m.role !== 'ADMIN') return { ok: false as const, status: 403, error: 'Admin access required' };
  return { ok: true as const };
}

// PATCH — update an inspection or record a completion.
// A completion is just setting lastDoneDate / lastDoneHours to the latest
// values; due dates/hours recompute automatically on the next GET.
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { groupId, aircraftId, inspectionId } = await params;
    if (!isUuid(groupId) || !isUuid(aircraftId) || !isUuid(inspectionId)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }

    const gate = await requireAdmin(groupId, session.user.id);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const existing = await prisma.aircraftInspection.findFirst({
      where: { id: inspectionId, clubAircraftId: aircraftId, organizationId: groupId },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Inspection not found' }, { status: 404 });
    }

    const body = await request.json();
    const data: Record<string, unknown> = {};

    if ('lastDoneDate' in body) {
      if (body.lastDoneDate === null) data.lastDoneDate = null;
      else {
        const d = new Date(body.lastDoneDate);
        if (isNaN(d.getTime())) return NextResponse.json({ error: 'Invalid lastDoneDate' }, { status: 400 });
        data.lastDoneDate = d;
      }
    }
    if ('lastDoneHours' in body) {
      data.lastDoneHours =
        body.lastDoneHours === null || body.lastDoneHours === ''
          ? null
          : Math.max(0, Number(body.lastDoneHours));
    }
    if ('intervalMonths' in body) {
      data.intervalMonths =
        body.intervalMonths === null ? null : Math.max(0, Math.round(Number(body.intervalMonths)));
    }
    if ('intervalHours' in body) {
      data.intervalHours =
        body.intervalHours === null ? null : Math.max(0, Number(body.intervalHours));
    }
    if ('isRequired' in body) data.isRequired = body.isRequired !== false;
    if ('label' in body) {
      data.label = typeof body.label === 'string' ? body.label.trim().slice(0, 100) || null : null;
    }
    if ('notes' in body) {
      data.notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 2000) || null : null;
    }

    const updated = await prisma.aircraftInspection.update({
      where: { id: inspectionId },
      data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating inspection:', error);
    return NextResponse.json({ error: 'Failed to update inspection' }, { status: 500 });
  }
}

// DELETE — soft-delete (isActive=false) so history is preserved.
export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { groupId, aircraftId, inspectionId } = await params;
    if (!isUuid(groupId) || !isUuid(aircraftId) || !isUuid(inspectionId)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }

    const gate = await requireAdmin(groupId, session.user.id);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const existing = await prisma.aircraftInspection.findFirst({
      where: { id: inspectionId, clubAircraftId: aircraftId, organizationId: groupId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Inspection not found' }, { status: 404 });
    }

    await prisma.aircraftInspection.update({
      where: { id: inspectionId },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting inspection:', error);
    return NextResponse.json({ error: 'Failed to delete inspection' }, { status: 500 });
  }
}
