import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

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

    // Fetch aircraft across all groups (or a specific group)
    const aircraft = await prisma.clubAircraft.findMany({
      where: groupId ? { organizationId: groupId } : undefined,
      orderBy: { createdAt: 'desc' }
    });

    const groupIds = [...new Set(aircraft.map(a => a.organizationId).filter(Boolean))] as string[];
    const groups = await prisma.organization.findMany({
      where: { id: { in: groupIds } },
      select: { id: true, name: true }
    });
    const groupMap = new Map(groups.map(g => [g.id, g.name]));

    // Get maintenance info for each aircraft
    const maintenance = await prisma.maintenance.findMany({
      where: { clubAircraftId: { in: aircraft.map(a => a.id) } },
      orderBy: { reportedDate: 'desc' },
      select: { clubAircraftId: true, reportedDate: true }
    });

    const maintenanceMap = new Map<string, { reportedDate: Date | null }>();
    for (const item of maintenance) {
      if (item.clubAircraftId && !maintenanceMap.has(item.clubAircraftId)) {
        maintenanceMap.set(item.clubAircraftId, { reportedDate: item.reportedDate || null });
      }
    }

    const aircraftWithMaintenance = aircraft.map((ac) => {
      const latestMaintenance = maintenanceMap.get(ac.id);
      const nextMxHours = ac.totalHobbsHours ? 50 - (ac.totalHobbsHours.toNumber() % 50) : 50;

      return {
        id: ac.id,
        groupId: ac.organizationId,
        groupName: ac.organizationId ? groupMap.get(ac.organizationId) || 'Unknown' : 'Unknown',
        nNumber: ac.nNumber || 'N/A',
        nickname: ac.nickname || '',
        make: ac.make || '',
        model: ac.model || '',
        year: ac.year || null,
        status: ac.status || 'Available',
        rate: ac.hourlyRate?.toNumber() || 0,
        hobbs: ac.totalHobbsHours?.toNumber() || 0,
        nextMx: latestMaintenance?.reportedDate?.toISOString().split('T')[0] || 'N/A',
        mxHours: nextMxHours,
      };
    });

    return NextResponse.json({ aircraft: aircraftWithMaintenance });
  } catch (error) {
    console.error('Error fetching aircraft:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { groupId, nNumber, nickname, make, model, year, hourlyRate, status } = body;

    if (!groupId || !nNumber) {
      return NextResponse.json({ error: 'Group ID and N-Number required' }, { status: 400 });
    }

    // Create aircraft
    const aircraft = await prisma.clubAircraft.create({
      data: {
        groupId,
        nNumber,
        nickname,
        make,
        model,
        year: year ? parseInt(year) : null,
        hourlyRate: hourlyRate ? parseFloat(hourlyRate) : null,
        status: status || 'Available',
        totalHobbsHours: 0,
        totalTachHours: 0,
      }
    });

    return NextResponse.json({ success: true, aircraft });
  } catch (error) {
    console.error('Error creating aircraft:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
