import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const aircraftId = searchParams.get('aircraftId');
    const nNumber = searchParams.get('nNumber');

    if (!aircraftId && !nNumber) {
      return NextResponse.json({ error: 'Aircraft ID or N-Number required' }, { status: 400 });
    }

    // Get aircraft
    let aircraft;
    if (aircraftId) {
      aircraft = await prisma.clubAircraft.findUnique({
        where: { id: aircraftId }
      });
    } else if (nNumber) {
      aircraft = await prisma.clubAircraft.findFirst({
        where: { nNumber }
      });
    }

    if (!aircraft) {
      return NextResponse.json({ error: 'Aircraft not found' }, { status: 404 });
    }

    // Check user has access to this aircraft's group
    const membership = await prisma.organizationMember.findFirst({
      where: {
        userId: session.user.id,
        organizationId: aircraft.organizationId
      }
    });

    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Fetch all maintenance records for this aircraft
    const maintenanceRecords = await prisma.maintenance.findMany({
      where: { clubAircraftId: aircraft.id },
      orderBy: { reportedDate: 'desc' }
    });

    // Transform to display format
    const history = await Promise.all(maintenanceRecords.map(async (record) => {
      // Get flight log hobbs if linked
      let hobbs = null;
      if (record.flightLogId) {
        const flightLog = await prisma.flightLog.findUnique({
          where: { id: record.flightLogId },
          select: { hobbsEnd: true }
        });
        hobbs = flightLog?.hobbsEnd?.toNumber() || null;
      }

      // Map maintenance type to display type
      let type = 'Unscheduled';
      if (record.maintenanceType === 'CLUB') {
        type = 'Scheduled';
      } else if (record.maintenanceType === 'PERSONAL') {
        type = 'Personal';
      }
      
      // Try to determine if it's AD compliance or major from notes/description
      const desc = (record.description || '').toLowerCase();
      const notes = (record.notes || '').toLowerCase();
      if (desc.includes('ad ') || notes.includes('airworthiness directive')) {
        type = 'AD Compliance';
      } else if (desc.includes('overhaul') || desc.includes('annual')) {
        type = desc.includes('annual') ? 'Scheduled' : 'Major';
      }

      // Extract shop from notes (simple heuristic)
      let shop = '—';
      const shopMatch = notes.match(/shop[:\s]+([^,.\n]+)/i);
      if (shopMatch) {
        shop = shopMatch[1].trim();
      } else if (record.notes && record.notes.length > 0) {
        // If notes exist but no shop pattern, assume self-service
        shop = 'Self';
      }

      return {
        id: record.id,
        date: record.reportedDate?.toISOString().split('T')[0] || record.createdAt?.toISOString().split('T')[0] || 'N/A',
        item: record.description || 'Maintenance',
        type,
        status: record.status === 'DONE' ? 'Completed' : record.status === 'IN_PROGRESS' ? 'In Progress' : record.status || 'Needed',
        hobbs: hobbs || '—',
        shop,
        cost: record.cost ? record.cost.toNumber() : 0,
        notes: record.notes,
        reportedDate: record.reportedDate,
        resolvedDate: record.resolvedDate,
      };
    }));

    // Calculate summary stats
    const totalCost = history.reduce((sum, r) => sum + r.cost, 0);
    const eventCount = history.length;
    const avgCost = eventCount > 0 ? Math.round(totalCost / eventCount) : 0;

    return NextResponse.json({ 
      history,
      summary: {
        totalCost,
        eventCount,
        avgCost
      }
    });
  } catch (error) {
    console.error('Error fetching maintenance history:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
