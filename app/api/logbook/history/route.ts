import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getOrCreatePilotProfile } from '@/lib/pilot-profile';

// GET - Fetch history for a specific entry or all entries
export async function GET(request: Request) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const profile = await getOrCreatePilotProfile(session.user.id);
    const { searchParams } = new URL(request.url);
    const entryId = searchParams.get('entryId');
    const limitParam = Number(searchParams.get('limit'));
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 50;

    // If entryId provided, get history for that specific entry
    if (entryId) {
      // Verify ownership
      const entry = await prisma.logbookEntry.findFirst({
        where: { id: entryId, pilotProfileId: profile.id },
      });

      if (!entry) {
        return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
      }

      const history = await prisma.logbookEntryHistory.findMany({
        where: { entryId },
        orderBy: { changedAt: 'desc' },
        take: limit,
      });

      return NextResponse.json({ history });
    }

    // Otherwise get all history for user's entries
    const entries = await prisma.logbookEntry.findMany({
      where: { pilotProfileId: profile.id },
      select: { id: true },
    });

    const entryIds = entries.map(e => e.id);

    const history = await prisma.logbookEntryHistory.findMany({
      where: { entryId: { in: entryIds } },
      orderBy: { changedAt: 'desc' },
      take: limit,
    });

    return NextResponse.json({ history });
  } catch (error) {
    console.error('Error fetching logbook history:', error);
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
  }
}
