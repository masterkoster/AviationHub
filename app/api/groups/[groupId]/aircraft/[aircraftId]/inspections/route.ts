import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isUuid } from '@/lib/validate';
import {
  computeInspection,
  INSPECTION_TYPES,
  type InspectionType,
} from '@/lib/club/inspections';

interface RouteParams {
  params: Promise<{ groupId: string; aircraftId: string }>;
}

const VALID_TYPES = Object.keys(INSPECTION_TYPES) as InspectionType[];

async function resolveMembership(groupId: string, userId: string) {
  return prisma.organizationMember.findFirst({
    where: { organizationId: groupId, userId },
    select: { role: true },
  });
}

// GET — all inspections for an aircraft, with live computed status.
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { groupId, aircraftId } = await params;
    if (!isUuid(groupId) || !isUuid(aircraftId)) {
      return NextResponse.json({ error: 'Invalid groupId or aircraftId' }, { status: 400 });
    }

    const membership = await resolveMembership(groupId, session.user.id);
    if (!membership) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }

    const aircraft = await prisma.clubAircraft.findFirst({
      where: { id: aircraftId, organizationId: groupId },
      select: { totalTachHours: true },
    });
    if (!aircraft) {
      return NextResponse.json({ error: 'Aircraft not found' }, { status: 404 });
    }

    const rows = await prisma.aircraftInspection.findMany({
      where: { clubAircraftId: aircraftId, isActive: true },
      orderBy: { type: 'asc' },
    });

    const currentTach = aircraft.totalTachHours ? Number(aircraft.totalTachHours) : null;
    const computed = rows.map((r) =>
      computeInspection(
        {
          id: r.id,
          type: r.type,
          label: r.label,
          lastDoneDate: r.lastDoneDate,
          lastDoneHours: r.lastDoneHours ? Number(r.lastDoneHours) : null,
          intervalMonths: r.intervalMonths,
          intervalHours: r.intervalHours ? Number(r.intervalHours) : null,
          isRequired: r.isRequired,
          isActive: r.isActive,
          notes: r.notes,
        },
        currentTach
      )
    );

    return NextResponse.json({ currentTachHours: currentTach, inspections: computed });
  } catch (error) {
    console.error('Error fetching inspections:', error);
    return NextResponse.json({ error: 'Failed to fetch inspections' }, { status: 500 });
  }
}

// POST — create an inspection (admin/owner only).
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { groupId, aircraftId } = await params;
    if (!isUuid(groupId) || !isUuid(aircraftId)) {
      return NextResponse.json({ error: 'Invalid groupId or aircraftId' }, { status: 400 });
    }

    const membership = await resolveMembership(groupId, session.user.id);
    if (!membership) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }
    if (membership.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const aircraft = await prisma.clubAircraft.findFirst({
      where: { id: aircraftId, organizationId: groupId },
      select: { id: true },
    });
    if (!aircraft) {
      return NextResponse.json({ error: 'Aircraft not found' }, { status: 404 });
    }

    const body = await request.json();
    const type = String(body.type || '').toUpperCase();
    if (!VALID_TYPES.includes(type as InspectionType)) {
      return NextResponse.json({ error: 'Invalid inspection type' }, { status: 400 });
    }

    const intervalMonths =
      body.intervalMonths != null && Number.isFinite(Number(body.intervalMonths))
        ? Math.max(0, Math.round(Number(body.intervalMonths)))
        : null;
    const intervalHours =
      body.intervalHours != null && Number.isFinite(Number(body.intervalHours))
        ? Math.max(0, Number(body.intervalHours))
        : null;
    const lastDoneHours =
      body.lastDoneHours != null && Number.isFinite(Number(body.lastDoneHours))
        ? Math.max(0, Number(body.lastDoneHours))
        : null;
    const lastDoneDate = body.lastDoneDate ? new Date(body.lastDoneDate) : null;
    if (lastDoneDate && isNaN(lastDoneDate.getTime())) {
      return NextResponse.json({ error: 'Invalid lastDoneDate' }, { status: 400 });
    }

    const created = await prisma.aircraftInspection.create({
      data: {
        clubAircraftId: aircraftId,
        organizationId: groupId,
        type,
        label: typeof body.label === 'string' ? body.label.trim().slice(0, 100) || null : null,
        lastDoneDate,
        lastDoneHours,
        intervalMonths,
        intervalHours,
        isRequired: body.isRequired !== false,
        notes: typeof body.notes === 'string' ? body.notes.trim().slice(0, 2000) || null : null,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('Error creating inspection:', error);
    return NextResponse.json({ error: 'Failed to create inspection' }, { status: 500 });
  }
}
