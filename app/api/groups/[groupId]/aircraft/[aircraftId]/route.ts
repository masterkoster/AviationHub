import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isUuid } from '@/lib/validate';

interface RouteParams {
  params: Promise<{ groupId: string; aircraftId: string }>;
}

// GET single aircraft
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

    const userId = session.user.id;

    // Check membership
    const membership = await prisma.organizationMember.findFirst({
      where: { organizationId: groupId, userId }
    });

    if (!membership) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }

    const aircraft = await prisma.clubAircraft.findFirst({
      where: { id: aircraftId, organizationId: groupId }
    });

    if (!aircraft) {
      return NextResponse.json({ error: 'Aircraft not found' }, { status: 404 });
    }

    return NextResponse.json(aircraft);
  } catch (error) {
    console.error('Error fetching aircraft:', error);
    return NextResponse.json({ error: 'Failed to fetch aircraft' }, { status: 500 });
  }
}

// PUT update aircraft
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { groupId, aircraftId } = await params;
    if (!isUuid(groupId) || !isUuid(aircraftId)) {
      return NextResponse.json({ error: 'Invalid groupId or aircraftId' }, { status: 400 });
    }

    const userId = session.user.id;

    // Check admin role
    const membership = await prisma.organizationMember.findFirst({
      where: { organizationId: groupId, userId, role: 'ADMIN' }
    });

    if (!membership) {
      return NextResponse.json({ error: 'Only admins can update aircraft' }, { status: 403 });
    }

    const body = await request.json();
    const { nNumber, nickname, customName, make, model, year, hourlyRate, status, bookingWindowDays, equipment, notes } = body;

    const allowedStatuses = ['Available', 'Maintenance', 'Grounded'];
    if (status !== undefined && !allowedStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (nNumber) updateData.nNumber = nNumber.trim().toUpperCase();
    if (nickname !== undefined) updateData.nickname = nickname;
    if (customName !== undefined) updateData.customName = customName;
    if (make !== undefined) updateData.make = make;
    if (model !== undefined) updateData.model = model;
    if (year !== undefined) updateData.year = year;
    if (hourlyRate !== undefined) updateData.hourlyRate = hourlyRate;
    if (status !== undefined) updateData.status = status;
    if (notes !== undefined) updateData.aircraftNotes = notes || null;
    // equipment is a JSON-stringified array of { category, name } (see lib/club/aircraft-profile.ts);
    // callers are expected to send either a pre-serialized string or an array we serialize here.
    if (equipment !== undefined) updateData.equipment = typeof equipment === 'string' ? equipment : JSON.stringify(equipment);
    if (bookingWindowDays !== undefined) {
      const days = typeof bookingWindowDays === 'number' ? bookingWindowDays : parseInt(bookingWindowDays, 10);
      if (Number.isNaN(days) || days < 0) {
        return NextResponse.json({ error: 'bookingWindowDays must be a non-negative number' }, { status: 400 });
      }
      updateData.bookingWindowDays = days;
    }

    const aircraft = await prisma.clubAircraft.update({
      where: { id: aircraftId },
      data: updateData
    });

    return NextResponse.json(aircraft);
  } catch (error) {
    console.error('Error updating aircraft:', error);
    return NextResponse.json({ error: 'Failed to update aircraft' }, { status: 500 });
  }
}

// DELETE aircraft
export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { groupId, aircraftId } = await params;
    if (!isUuid(groupId) || !isUuid(aircraftId)) {
      return NextResponse.json({ error: 'Invalid groupId or aircraftId' }, { status: 400 });
    }

    const userId = session.user.id;

    // Check admin role
    const membership = await prisma.organizationMember.findFirst({
      where: { organizationId: groupId, userId, role: 'ADMIN' }
    });

    if (!membership) {
      return NextResponse.json({ error: 'Only admins can delete aircraft' }, { status: 403 });
    }

    await prisma.clubAircraft.delete({ where: { id: aircraftId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting aircraft:', error);
    return NextResponse.json({ error: 'Failed to delete aircraft' }, { status: 500 });
  }
}
