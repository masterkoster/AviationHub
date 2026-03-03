import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getOrCreatePilotProfile } from '@/lib/pilot-profile';

// Helper to record history
async function recordHistory(
  entryId: string,
  action: 'CREATED' | 'UPDATED' | 'VOIDED' | 'UNVOIDED',
  userId: string,
  fieldName?: string,
  oldValue?: string,
  newValue?: string,
  reason?: string
) {
  await prisma.logbookEntryHistory.create({
    data: {
      entryId,
      action,
      fieldName: fieldName || null,
      oldValue: oldValue || null,
      newValue: newValue || null,
      changedBy: userId,
      reason: reason || null,
    },
  });
}

// Helper to format value for storage
function formatValueForStorage(value: any): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// GET - Fetch user's logbook entries
export async function GET(request: Request) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Check if user has Pro+ tier (admins always allowed)
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { tier: true, role: true }
    });

    const isAdmin = user?.role === 'admin' || user?.role === 'owner';
    if (!isAdmin && user?.tier !== 'proplus') {
      return NextResponse.json({ 
        error: 'Pro+ subscription required',
        code: 'PROPLUS_REQUIRED'
      }, { status: 403 });
    }

    const profile = await getOrCreatePilotProfile(session.user.id);

    const { searchParams } = new URL(request.url);
    const limitParam = Number(searchParams.get('limit'));
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 200) : 50;
    const cursor = searchParams.get('cursor');
    const includeVoided = searchParams.get('includeVoided') === 'true';

    // Default: exclude voided entries
    const where: any = { pilotProfileId: profile.id };
    if (!includeVoided) {
      where.isVoided = false;
    }

    const entries = await prisma.logbookEntry.findMany({
      where,
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = entries.length > limit;
    const pageEntries = hasMore ? entries.slice(0, limit) : entries;
    const nextCursor = hasMore ? pageEntries[pageEntries.length - 1]?.id ?? null : null;

    return NextResponse.json({ entries: pageEntries, nextCursor });
  } catch (error) {
    console.error('Error fetching logbook entries:', error);
    return NextResponse.json({ error: 'Failed to fetch entries' }, { status: 500 });
  }
}

// POST - Create new logbook entry OR void/delete existing
export async function POST(request: Request) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Check if user has Pro+ tier (admins always allowed)
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { tier: true, emailVerified: true, role: true }
    });

    if (!user?.emailVerified) {
      return NextResponse.json({ 
        error: 'Please verify your email first',
        code: 'EMAIL_NOT_VERIFIED'
      }, { status: 403 });
    }

    const isAdmin = user?.role === 'admin' || user?.role === 'owner';
    if (!isAdmin && user?.tier !== 'proplus') {
      return NextResponse.json({ 
        error: 'Pro+ subscription required',
        code: 'PROPLUS_REQUIRED'
      }, { status: 403 });
    }

    const body = await request.json();
    const profile = await getOrCreatePilotProfile(session.user.id);

    // Handle void action
    if (body.action === 'void') {
      const { id, reason } = body;
      if (!id) {
        return NextResponse.json({ error: 'Entry ID required' }, { status: 400 });
      }
      if (!reason) {
        return NextResponse.json({ error: 'Reason required for voiding' }, { status: 400 });
      }

      // Get existing entry to verify ownership and capture old values
      const existing = await prisma.logbookEntry.findFirst({
        where: { id, pilotProfileId: profile.id },
      });

      if (!existing) {
        return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
      }

      // Update entry to voided
      const entry = await prisma.logbookEntry.update({
        where: { id },
        data: {
          isVoided: true,
          voidedAt: new Date(),
          voidedBy: session.user.id,
          voidReason: reason,
        },
      });

      // Record history
      await recordHistory(
        id,
        'VOIDED',
        session.user.id,
        undefined,
        undefined,
        undefined,
        reason
      );

      return NextResponse.json({ entry, message: 'Entry voided' });
    }

    // Handle unvoid action
    if (body.action === 'unvoid') {
      const { id } = body;
      if (!id) {
        return NextResponse.json({ error: 'Entry ID required' }, { status: 400 });
      }

      const existing = await prisma.logbookEntry.findFirst({
        where: { id, pilotProfileId: profile.id },
      });

      if (!existing) {
        return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
      }

      const entry = await prisma.logbookEntry.update({
        where: { id },
        data: {
          isVoided: false,
          voidedAt: null,
          voidedBy: null,
          voidReason: null,
        },
      });

      await recordHistory(id, 'UNVOIDED', session.user.id);

      return NextResponse.json({ entry, message: 'Entry restored' });
    }

    // Handle create new entry
    const entry = await prisma.logbookEntry.create({
      data: {
        pilotProfileId: profile.id,
        date: new Date(body.date),
        aircraft: body.aircraft,
        routeFrom: body.routeFrom,
        routeTo: body.routeTo,
        totalTime: body.totalTime || 0,
        picTime: body.picTime || 0,
        sicTime: body.sicTime || 0,
        soloTime: body.soloTime || 0,
        dualGiven: body.dualGiven || 0,
        dualReceived: body.dualReceived || 0,
        nightTime: body.nightTime || 0,
        instrumentTime: body.instrumentTime || 0,
        crossCountryTime: body.crossCountryTime || 0,
        dayLandings: body.dayLandings || 0,
        nightLandings: body.nightLandings || 0,
        authority: body.authority || 'FAA',
        isPending: !!body.isPending,
        isNight: (body.nightTime || 0) > 0,
        isCrossCountry: (body.crossCountryTime || 0) > 0,
        isSolo: (body.soloTime || 0) > 0,
        isDual: (body.dualReceived || 0) > 0,
        isDay: !!body.isDay,
        requiresSafetyPilot: !!body.requiresSafetyPilot,
        safetyPilotName: body.safetyPilotName || null,
        groundTrainingReceived: body.groundTrainingReceived || 0,
        simTrainingReceived: body.simTrainingReceived || 0,
        simulatedInstrumentTime: body.simulatedInstrumentTime || 0,
        trainingDeviceId: body.trainingDeviceId || null,
        trainingDeviceLocation: body.trainingDeviceLocation || null,
        isSimulator: !!body.isSimulator,
        remarks: body.remarks,
        instructor: body.instructor,
        flightPlanId: body.flightPlanId,
      },
    });

    // Record creation in history
    await recordHistory(entry.id, 'CREATED', session.user.id);

    return NextResponse.json({ entry, message: 'Entry saved' });
  } catch (error) {
    console.error('Error creating logbook entry:', error);
    return NextResponse.json({ error: 'Failed to save entry' }, { status: 500 });
  }
}

// PUT - Update a logbook entry
export async function PUT(request: Request) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { tier: true, role: true }
    });

    const isAdmin = user?.role === 'admin' || user?.role === 'owner';
    if (!isAdmin && user?.tier !== 'proplus') {
      return NextResponse.json({ 
        error: 'Pro+ subscription required',
        code: 'PROPLUS_REQUIRED'
      }, { status: 403 });
    }

    const profile = await getOrCreatePilotProfile(session.user.id);
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Entry ID required' }, { status: 400 });
    }

    // Get existing entry to capture old values
    const existing = await prisma.logbookEntry.findFirst({
      where: { id, pilotProfileId: profile.id },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }

    // Build update data
    const updateData: any = {};
    const fieldsToTrack = [
      'date', 'aircraft', 'routeFrom', 'routeTo', 'totalTime', 'picTime', 'sicTime',
      'soloTime', 'dualGiven', 'dualReceived', 'nightTime', 'instrumentTime',
      'crossCountryTime', 'dayLandings', 'nightLandings', 'authority', 'isPending',
      'remarks', 'instructor', 'isNight', 'isCrossCountry', 'isSolo', 'isDual'
    ];

    for (const field of fieldsToTrack) {
      if (updates[field] !== undefined) {
        updateData[field] = updates[field];
      }
    }

    // Recalculate boolean fields
    if (updates.nightTime !== undefined) {
      updateData.isNight = updates.nightTime > 0;
    }
    if (updates.crossCountryTime !== undefined) {
      updateData.isCrossCountry = updates.crossCountryTime > 0;
    }
    if (updates.soloTime !== undefined) {
      updateData.isSolo = updates.soloTime > 0;
    }
    if (updates.dualReceived !== undefined) {
      updateData.isDual = updates.dualReceived > 0;
    }

    const entry = await prisma.logbookEntry.update({
      where: { id },
      data: updateData,
    });

    // Record history for each changed field
    for (const field of fieldsToTrack) {
      if (updates[field] !== undefined) {
        const oldValue = formatValueForStorage(existing[field as keyof typeof existing]);
        const newValue = formatValueForStorage(updates[field]);
        
        if (oldValue !== newValue) {
          await recordHistory(
            id,
            'UPDATED',
            session.user.id,
            field,
            oldValue,
            newValue
          );
        }
      }
    }

    return NextResponse.json({ entry, message: 'Entry updated' });
  } catch (error) {
    console.error('Error updating logbook entry:', error);
    return NextResponse.json({ error: 'Failed to update entry' }, { status: 500 });
  }
}

// DELETE - Legacy support - returns error suggesting void instead
export async function DELETE(request: Request) {
  return NextResponse.json({ 
    error: 'Use POST with action=void to void an entry instead of deleting',
    hint: 'Send POST to /api/logbook with { action: "void", id: "...", reason: "..." }'
  }, { status: 400 });
}
