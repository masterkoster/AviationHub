import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isUuid } from '@/lib/validate';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

// GET /api/clubs/[groupId]/flights/active - Get all active flights
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { groupId } = await params;

    if (!isUuid(groupId)) {
      return NextResponse.json({ error: 'Invalid groupId' }, { status: 400 });
    }

    // Get active flights (where hobbsEnd is null)
    const activeFlights = await prisma.$queryRaw`
      SELECT
        fl.id, fl.aircraftId, fl.userId, fl.hobbsStart, fl.createdAt as checkedOutAt,
        a.nNumber, a.customName, a.make, a.model,
        u.name as userName
      FROM FlightLog fl
      JOIN ClubAircraft a ON fl.aircraftId = a.id
      JOIN [User] u ON fl.userId = u.id
      WHERE a.groupId = ${groupId}
      AND fl.hobbsEnd IS NULL
      ORDER BY fl.createdAt DESC
    ` as any[];

    return NextResponse.json(
      activeFlights.map(f => ({
        id: f.id,
        aircraftId: f.aircraftId,
        aircraft: {
          nNumber: f.nNumber,
          name: f.customName,
          make: f.make,
          model: f.model,
        },
        user: {
          id: f.userId,
          name: f.userName,
        },
        hobbsStart: f.hobbsStart,
        checkedOutAt: f.checkedOutAt,
      }))
    );
  } catch (error) {
    console.error('Error fetching active flights:', error);
    return NextResponse.json({ error: 'Failed to fetch active flights' }, { status: 500 });
  }
}
