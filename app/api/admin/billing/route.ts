import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin or owner
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true }
    });

    if (user?.role !== 'admin' && user?.role !== 'owner') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get('groupId');

    if (!groupId) {
      return NextResponse.json({ error: 'Group ID required' }, { status: 400 });
    }

    // Get all aircraft IDs for this group
    const aircraftList = await prisma.clubAircraft.findMany({
      where: { organizationId: groupId },
      select: { id: true, nNumber: true }
    });

    const aircraftIds = aircraftList.map(a => a.id);

    // Fetch recent flight logs as billing transactions
    const recentFlights = await prisma.flightLog.findMany({
      where: {
        clubAircraftId: { in: aircraftIds }
      },
      orderBy: { date: 'desc' },
      take: 50
    });

    const transactions = await Promise.all(recentFlights.map(async (flight) => {
      const pilot = flight.pilotProfileId
        ? await prisma.pilotProfile.findUnique({
            where: { id: flight.pilotProfileId },
            include: { user: { select: { name: true } } },
          })
        : null;

      const aircraft = aircraftList.find(a => a.id === flight.clubAircraftId);

      return {
        id: flight.id,
        member: pilot?.user?.name || 'Unknown',
        type: 'Flight',
        aircraft: aircraft?.nNumber || 'N/A',
        date: flight.date.toISOString().split('T')[0],
        amount: flight.calculatedCost?.toNumber() || 0,
        status: 'Paid', // TODO: Add payment status tracking
      };
    }));

    // Calculate stats
    const totalRevenue = transactions.reduce((sum, t) => sum + t.amount, 0);
    const pendingCount = 0; // TODO: Track pending payments
    const overdueBalance = 0; // TODO: Track overdue balances

    return NextResponse.json({ 
      transactions,
      stats: {
        totalRevenue,
        pendingCount,
        overdueBalance
      }
    });
  } catch (error) {
    console.error('Error fetching billing data:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
