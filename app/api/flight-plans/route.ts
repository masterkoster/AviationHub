import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// Helper to get pilotProfileId from user session
async function getPilotProfileId(userId: string) {
  const pilotProfile = await prisma.pilotProfile.findUnique({
    where: { userId },
  });
  return pilotProfile?.id || null;
}

// GET - Fetch user's flight plans
export async function GET() {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      // Return empty list if not logged in
      return NextResponse.json({ flightPlans: [], message: 'Not authenticated' });
    }

    const pilotProfileId = await getPilotProfileId(session.user.id);
    if (!pilotProfileId) {
      return NextResponse.json({ flightPlans: [] });
    }

    const flightPlans = await prisma.flightPlan.findMany({
      where: { pilotProfileId },
      include: { waypoints: { orderBy: { sequence: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ flightPlans });
  } catch (error) {
    console.error('Error fetching flight plans:', error);
    return NextResponse.json({ error: 'Failed to fetch flight plans' }, { status: 500 });
  }
}

// POST - Create new flight plan
export async function POST(request: Request) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Check if email is verified
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { emailVerified: true, email: true }
    });

    if (!user?.emailVerified) {
      return NextResponse.json({ 
        error: 'Please verify your email before saving flight plans',
        code: 'EMAIL_NOT_VERIFIED'
      }, { status: 403 });
    }

    // Get or create pilot profile
    const pilotProfile = await prisma.pilotProfile.upsert({
      where: { userId: session.user.id },
      update: {},
      create: { userId: session.user.id },
    });

    const body = await request.json();
    
    const {
      name,
      callsign,
      aircraftType,
      aircraftSpeed,
      aircraftBurnRate,
      aircraftFuelCapacity,
      pilotName,
      departureTime,
      cruisingAlt,
      alternateIcao,
      remarks,
      soulsOnBoard,
      departureIcao,
      arrivalIcao,
      departureFuel,
      waypoints,
    } = body;

    const planName = name || `Flight Plan ${new Date().toLocaleDateString()}`;
    
    // Check for duplicate name
    const duplicateName = await prisma.flightPlan.findFirst({
      where: { 
        pilotProfileId: pilotProfile.id,
        name: planName
      },
    });
    if (duplicateName) {
      return NextResponse.json({ error: 'A flight plan with this name already exists' }, { status: 400 });
    }

    // Create flight plan with waypoints in a transaction
    const flightPlan = await prisma.flightPlan.create({
      data: {
        pilotProfileId: pilotProfile.id,
        name: planName,
        callsign,
        aircraftType,
        aircraftSpeed: typeof aircraftSpeed === 'number' ? Math.max(0, Math.round(aircraftSpeed)) : null,
        aircraftBurnRate: typeof aircraftBurnRate === 'number' ? Math.max(0, aircraftBurnRate) : null,
        aircraftFuelCapacity: typeof aircraftFuelCapacity === 'number' ? Math.max(0, Math.round(aircraftFuelCapacity)) : null,
        pilotName,
        departureTime: departureTime ? new Date(departureTime) : null,
        departureFuel,
        cruisingAlt,
        arrivalIcao,
        alternateIcao,
        remarks,
        soulsOnBoard,
        departureIcao,
        waypoints: waypoints ? {
          create: waypoints.map((wp: any, index: number) => ({
            sequence: index,
            icao: wp.icao,
            name: wp.name,
            city: wp.city,
            latitude: wp.latitude,
            longitude: wp.longitude,
            altitude: wp.altitude,
          }))
        } : undefined,
      },
      include: { waypoints: { orderBy: { sequence: 'asc' } } },
    });

    return NextResponse.json({ flightPlan, message: 'Flight plan saved' });
  } catch (error) {
    console.error('Error creating flight plan:', error);
    return NextResponse.json({ error: 'Failed to create flight plan' }, { status: 500 });
  }
}

// DELETE - Delete a flight plan
export async function DELETE(request: Request) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Flight plan ID required' }, { status: 400 });
    }

    const pilotProfileId = await getPilotProfileId(session.user.id);
    if (!pilotProfileId) {
      return NextResponse.json({ error: 'Pilot profile not found' }, { status: 404 });
    }

    // Only delete if it belongs to the user
    await prisma.flightPlan.deleteMany({
      where: { id, pilotProfileId },
    });

    return NextResponse.json({ message: 'Flight plan deleted' });
  } catch (error) {
    console.error('Error deleting flight plan:', error);
    return NextResponse.json({ error: 'Failed to delete flight plan' }, { status: 500 });
  }
}

// PUT - Update a flight plan
export async function PUT(request: Request) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Check if email is verified
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { emailVerified: true, email: true }
    });

    if (!user?.emailVerified) {
      return NextResponse.json({ 
        error: 'Please verify your email before saving flight plans',
        code: 'EMAIL_NOT_VERIFIED'
      }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Flight plan ID required' }, { status: 400 });
    }

    const pilotProfileId = await getPilotProfileId(session.user.id);
    if (!pilotProfileId) {
      return NextResponse.json({ error: 'Pilot profile not found' }, { status: 404 });
    }

    const body = await request.json();
    
    const {
      name,
      callsign,
      aircraftType,
      aircraftSpeed,
      aircraftBurnRate,
      aircraftFuelCapacity,
      pilotName,
      departureTime,
      cruisingAlt,
      alternateIcao,
      remarks,
      soulsOnBoard,
      departureIcao,
      arrivalIcao,
      departureFuel,
      waypoints,
    } = body;

    // First check if the plan exists and belongs to the user
    const existingPlan = await prisma.flightPlan.findFirst({
      where: { id, pilotProfileId },
    });
    
    if (!existingPlan) {
      return NextResponse.json({ error: 'Flight plan not found or not owned by user' }, { status: 404 });
    }

    // Check for duplicate name (but allow the same name if it's the same plan)
    if (name && name !== existingPlan.name) {
      const duplicateName = await prisma.flightPlan.findFirst({
        where: { 
          pilotProfileId,
          name: name,
          id: { not: id } // exclude current plan
        },
      });
      if (duplicateName) {
        return NextResponse.json({ error: 'A flight plan with this name already exists' }, { status: 400 });
      }
    }

    // Delete existing waypoints
    await prisma.flightPlanWaypoint.deleteMany({
      where: { flightPlanId: id },
    });

    // Then update the flight plan with new waypoints
    const flightPlan = await prisma.flightPlan.update({
      where: { id },
      data: {
        name: name || `Flight Plan ${new Date().toLocaleDateString()}`,
        callsign,
        aircraftType,
        aircraftSpeed: typeof aircraftSpeed === 'number' ? Math.max(0, Math.round(aircraftSpeed)) : null,
        aircraftBurnRate: typeof aircraftBurnRate === 'number' ? Math.max(0, aircraftBurnRate) : null,
        aircraftFuelCapacity: typeof aircraftFuelCapacity === 'number' ? Math.max(0, Math.round(aircraftFuelCapacity)) : null,
        pilotName,
        departureTime: departureTime ? new Date(departureTime) : null,
        departureFuel,
        cruisingAlt,
        arrivalIcao,
        alternateIcao,
        remarks,
        soulsOnBoard,
        departureIcao,
        waypoints: waypoints && waypoints.length > 0 ? {
          create: waypoints.map((wp: any, index: number) => ({
            sequence: index,
            icao: wp.icao,
            name: wp.name,
            city: wp.city,
            latitude: wp.latitude,
            longitude: wp.longitude,
            altitude: wp.altitude,
          }))
        } : undefined,
      },
      include: { waypoints: { orderBy: { sequence: 'asc' } } },
    });

    return NextResponse.json({ flightPlan, message: 'Flight plan updated' });
  } catch (error: any) {
    console.error('Error updating flight plan:', error);
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    return NextResponse.json({ error: 'Failed to update flight plan: ' + (error.message || 'Unknown error') }, { status: 500 });
  }
}
