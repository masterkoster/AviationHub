import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isUuid } from '@/lib/validate';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

// GET aircraft for a group
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

    const aircraft = await prisma.clubAircraft.findMany({
      where: { organizationId: groupId },
      orderBy: { nNumber: 'asc' }
    });

    return NextResponse.json(aircraft);
  } catch (error) {
    console.error('Error fetching aircraft:', error);
    return NextResponse.json({ error: 'Failed to fetch aircraft' }, { status: 500 });
  }
}

// POST add aircraft to group
export async function POST(request: Request, { params }: RouteParams) {
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

    // Check admin role
    const membership = await prisma.organizationMember.findFirst({
      where: { organizationId: groupId, userId, role: 'ADMIN' }
    });

    if (!membership) {
      return NextResponse.json({ error: 'Only admins can add aircraft' }, { status: 403 });
    }

    const body = await request.json();
    const { nNumber, nickname, customName, make, model, year, hourlyRate } = body;

    if (!nNumber || typeof nNumber !== 'string' || !nNumber.trim()) {
      return NextResponse.json({ error: 'N-Number is required' }, { status: 400 });
    }

    const aircraft = await prisma.clubAircraft.create({
      data: {
        organizationId: groupId,
        nNumber: nNumber.trim().toUpperCase(),
        nickname: nickname || null,
        customName: customName || null,
        make: make || null,
        model: model || null,
        year: year ? parseInt(year) : null,
        hourlyRate: hourlyRate ? parseFloat(hourlyRate) : null,
        status: 'Available'
      }
    });

    return NextResponse.json(aircraft);
  } catch (error) {
    console.error('Error adding aircraft:', error);
    return NextResponse.json({ error: 'Failed to add aircraft' }, { status: 500 });
  }
}
