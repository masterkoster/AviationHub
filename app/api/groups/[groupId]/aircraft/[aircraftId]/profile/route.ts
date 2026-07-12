import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isUuid } from '@/lib/validate';
import { getAircraftProfile } from '@/lib/club/aircraft-profile';

interface RouteParams {
  params: Promise<{ groupId: string; aircraftId: string }>;
}

// GET aggregated aircraft profile (info, maintenance, flight logs, upcoming bookings, utilization)
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

    const profile = await getAircraftProfile(groupId, aircraftId);

    if (!profile) {
      return NextResponse.json({ error: 'Aircraft not found' }, { status: 404 });
    }

    return NextResponse.json(profile);
  } catch (error) {
    console.error('Error fetching aircraft profile:', error);
    return NextResponse.json({ error: 'Failed to fetch aircraft profile', details: String(error) }, { status: 500 });
  }
}
