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
    const type = searchParams.get('type'); // 'past', 'dispatched', 'awaiting'

    if (!groupId) {
      return NextResponse.json({ error: 'Group ID required' }, { status: 400 });
    }

    // Get all aircraft IDs for this group
    const aircraftList = await prisma.clubAircraft.findMany({
      where: { organizationId: groupId },
      select: { id: true, nNumber: true }
    });

    const aircraftIds = aircraftList.map(a => a.id);

    if (type === 'past') {
      // Fetch past flight logs
      const flights = await prisma.flightLog.findMany({
        where: {
          clubAircraftId: { in: aircraftIds }
        },
        orderBy: { date: 'desc' },
        take: 50
      });

      // Get user details for each flight
      const flightsWithDetails = await Promise.all(flights.map(async (flight) => {
        const pilot = flight.pilotProfileId
          ? await prisma.pilotProfile.findUnique({
              where: { id: flight.pilotProfileId },
              include: { user: { select: { name: true } } },
            })
          : null;

        const aircraft = aircraftList.find(a => a.id === flight.clubAircraftId);

        return {
          id: flight.id,
          pilot: pilot?.user?.name || 'Unknown',
          aircraft: aircraft?.nNumber || 'N/A',
          date: flight.date.toISOString().split('T')[0],
          hobbs: flight.hobbsTime?.toNumber() || 0,
          route: flight.notes || 'N/A', // TODO: Add route field to schema
          cost: flight.calculatedCost?.toNumber() || 0,
        };
      }));

      return NextResponse.json({ flights: flightsWithDetails });
    }

    if (type === 'dispatched') {
      // Fetch currently active bookings (today, in progress)
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayEnd = new Date(todayStart);
      todayEnd.setDate(todayEnd.getDate() + 1);

      const bookings = await prisma.booking.findMany({
        where: {
          clubAircraftId: { in: aircraftIds },
          startTime: { lte: now },
          endTime: { gte: now }
        },
        orderBy: { startTime: 'asc' }
      });

      const dispatchedFlights = await Promise.all(bookings.map(async (booking) => {
        const pilot = booking.pilotProfileId
          ? await prisma.pilotProfile.findUnique({
              where: { id: booking.pilotProfileId },
              include: { user: { select: { name: true } } },
            })
          : null;

        const aircraft = aircraftList.find(a => a.id === booking.clubAircraftId);

        return {
          id: booking.id,
          pilot: pilot?.user?.name || 'Unknown',
          aircraft: aircraft?.nNumber || 'N/A',
          departed: booking.startTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          eta: booking.endTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          route: booking.purpose || 'N/A',
          fuel: 0, // TODO: Add fuel planning
          status: 'Airborne'
        };
      }));

      return NextResponse.json({ flights: dispatchedFlights });
    }

    if (type === 'awaiting') {
      // Fetch upcoming bookings (future, not yet started)
      const now = new Date();

      const bookings = await prisma.booking.findMany({
        where: {
          clubAircraftId: { in: aircraftIds },
          startTime: { gt: now }
        },
        orderBy: { startTime: 'asc' },
        take: 20
      });

      const awaitingFlights = await Promise.all(bookings.map(async (booking) => {
        const pilot = booking.pilotProfileId
          ? await prisma.pilotProfile.findUnique({
              where: { id: booking.pilotProfileId },
              include: { user: { select: { name: true } } },
            })
          : null;

        const aircraft = aircraftList.find(a => a.id === booking.clubAircraftId);

        return {
          id: booking.id,
          pilot: pilot?.user?.name || 'Unknown',
          aircraft: aircraft?.nNumber || 'N/A',
          plannedDep: booking.startTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          route: booking.purpose || 'N/A',
          filed: booking.createdAt?.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) || 'N/A'
        };
      }));

      return NextResponse.json({ flights: awaitingFlights });
    }

    return NextResponse.json({ error: 'Invalid type parameter' }, { status: 400 });
  } catch (error) {
    console.error('Error fetching flights:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
