import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getOrCreatePilotProfile } from '@/lib/pilot-profile';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

// POST /api/clubs/[groupId]/flights/checkin - End a flight (record hobbs end, calculate cost)
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { groupId } = await params;

    // Get user
    const user = await prisma.$queryRawUnsafe(`
      SELECT id, name FROM [User] WHERE email = '${session.user.email}'
    `) as any[];

    if (!user || user.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userId = user[0].id;

    const body = await request.json();
    const { flightLogId, hobbsEnd, notes } = body;

    if (!flightLogId || !hobbsEnd) {
      return NextResponse.json({ error: 'flightLogId and hobbsEnd required' }, { status: 400 });
    }

    // Get the flight log
    const flight = await prisma.$queryRawUnsafe(`
      SELECT fl.*, a.hourlyRate, a.totalHobbsHours, a.organizationId, a.nNumber, a.customName, a.nickname, a.make, a.model
      FROM FlightLog fl
      JOIN ClubAircraft a ON fl.aircraftId = a.id
      WHERE fl.id = '${flightLogId}'
    `) as any[];

    if (!flight || flight.length === 0) {
      return NextResponse.json({ error: 'Flight not found' }, { status: 404 });
    }

    const flightData = flight[0];

    // Verify ownership
    if (flightData.userId !== userId) {
      return NextResponse.json({ error: 'Not your flight' }, { status: 403 });
    }

    // Calculate hobbs time
    const hobbsStart = parseFloat(flightData.hobbsStart);
    const hobbsEndVal = parseFloat(hobbsEnd);
    const hobbsTime = hobbsEndVal - hobbsStart;

    if (hobbsTime <= 0) {
      return NextResponse.json({ error: 'Hobbs end must be greater than hobbs start' }, { status: 400 });
    }

    // Calculate cost
    const hourlyRate = flightData.hourlyRate ? parseFloat(flightData.hourlyRate) : 0;
    const calculatedCost = hobbsTime * hourlyRate;

    // Calculate new total Hobbs for aircraft
    const currentTotal = flightData.totalHobbsHours ? parseFloat(flightData.totalHobbsHours) : 0;
    const newTotal = currentTotal + hobbsTime;

    // Update flight log
    const pilotProfile = await getOrCreatePilotProfile(userId);
    const homeAirport = pilotProfile?.homeAirport?.trim() || 'UNK';

    await prisma.$executeRawUnsafe(`
      UPDATE FlightLog 
      SET hobbsEnd = ${hobbsEnd},
          hobbsTime = ${hobbsTime},
          calculatedCost = ${calculatedCost},
          notes = ${notes ? "'" + notes.replace(/'/g, "''") + "'" : 'NULL'},
          pilotProfileId = '${pilotProfile.id}',
          organizationId = ${flightData.organizationId ? "'" + flightData.organizationId + "'" : 'NULL'},
          updatedAt = GETDATE()
      WHERE id = '${flightLogId}'
    `);

    // Update aircraft total Hobbs
    await prisma.$executeRawUnsafe(`
      UPDATE ClubAircraft 
      SET totalHobbsHours = ${newTotal}
      WHERE id = '${flightData.aircraftId}'
    `);

    const aircraftLabel = flightData.nNumber || flightData.customName || flightData.nickname || 'Aircraft';

    const logbookEntry = await prisma.logbookEntry.create({
      data: {
        pilotProfileId: pilotProfile.id,
        organizationId: flightData.organizationId || null,
        clubAircraftId: flightData.aircraftId,
        date: flightData.date || new Date(),
        aircraft: aircraftLabel,
        routeFrom: homeAirport,
        routeTo: homeAirport,
        hobbsStart: hobbsStart,
        hobbsEnd: hobbsEndVal,
        totalTime: hobbsTime,
        picTime: hobbsTime,
        isDay: true,
        remarks: notes || 'Club flight completion',
      },
    });

    await prisma.logbookEntryHistory.create({
      data: {
        entryId: logbookEntry.id,
        action: 'CREATED',
        changedBy: userId,
      },
    });

    // Fetch updated flight
    const updated = await prisma.$queryRawUnsafe(`
      SELECT fl.*, a.nNumber, a.customName, a.make, a.model, a.hourlyRate, u.name as userName
      FROM FlightLog fl
      JOIN ClubAircraft a ON fl.aircraftId = a.id
      JOIN [User] u ON fl.userId = u.id
      WHERE fl.id = '${flightLogId}'
    `) as any[];

    const f = updated[0];

    return NextResponse.json({
      success: true,
      flight: {
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
        hobbsEnd: f.hobbsEnd,
        hobbsTime: f.hobbsTime,
        hourlyRate: f.hourlyRate,
        calculatedCost: f.calculatedCost,
        date: f.date,
      }
    });
  } catch (error) {
    console.error('Error during checkin:', error);
    return NextResponse.json({ error: 'Failed to check in' }, { status: 500 });
  }
}
