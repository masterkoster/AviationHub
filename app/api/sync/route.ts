import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { sendGroundingAlert } from '@/lib/club/notifications';
import { FINANCE_ROLES } from '@/lib/club/roles';

// Best-effort: email every ADMIN/TREASURER in the aircraft's org when a
// synced-from-offline maintenance change grounds an aircraft. Never throws.
async function notifyGroundingForAircraft(clubAircraftId: string, description: string, reporterUserId: string) {
  try {
    const aircraft = await prisma.clubAircraft.findUnique({
      where: { id: clubAircraftId },
      select: { organizationId: true, nNumber: true, customName: true, nickname: true },
    });
    if (!aircraft?.organizationId) return;

    const [club, reporter, admins] = await Promise.all([
      prisma.organization.findUnique({ where: { id: aircraft.organizationId }, select: { name: true } }),
      prisma.user.findUnique({ where: { id: reporterUserId }, select: { name: true } }),
      prisma.organizationMember.findMany({
        where: { organizationId: aircraft.organizationId, role: { in: [...FINANCE_ROLES] } },
        include: { user: { select: { email: true } } },
      }),
    ]);

    const to = admins.map(a => a.user?.email).filter((email): email is string => !!email);
    if (to.length === 0) return;

    await sendGroundingAlert({
      to,
      clubName: club?.name || 'Your Flying Club',
      aircraftLabel: aircraft.nickname || aircraft.customName || aircraft.nNumber || 'An aircraft',
      description,
      reporterName: reporter?.name || 'A member',
    });
  } catch (err) {
    console.error('Error sending grounding alert email (sync):', err);
  }
}

interface SyncChange {
  type: 'flight_log' | 'maintenance' | 'aircraft_status' | 'booking';
  action: 'create' | 'update' | 'delete';
  data: Record<string, unknown>;
  localCreatedAt: string;
  localLastSyncedAt?: string;
  localId: string;
}

interface SyncRequest {
  changes: SyncChange[];
  userId: string;
}

interface ConflictResponse {
  type: string;
  action: string;
  localId: string;
  conflictType: 'modified' | 'deleted';
  serverData: Record<string, unknown>;
  serverModifiedAt: string;
}

interface AppliedChange {
  localId: string;
  serverId: string;
}

interface SyncResponse {
  applied: AppliedChange[];
  conflicts: ConflictResponse[];
  errors: string[];
}

// Get the modification timestamp field for each type
function getModifiedField(type: string): string {
  switch (type) {
    case 'flight_log':
      return 'updatedAt';
    case 'maintenance':
      return 'updatedAt';
    case 'aircraft_status':
      return 'updatedAt';
    case 'booking':
      return 'updatedAt';
    default:
      return 'updatedAt';
  }
}

// Get the ID field for each type
function getIdField(type: string): string {
  switch (type) {
    case 'flight_log':
      return 'id';
    case 'maintenance':
      return 'id';
    case 'aircraft_status':
      return 'id';
    case 'booking':
      return 'id';
    default:
      return 'id';
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get pilot profile for this user
    const pilotProfile = await prisma.pilotProfile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });

    const pilotProfileId = pilotProfile?.id || null;

    const body: SyncRequest = await request.json();
    const { changes, userId } = body;

    if (!changes || !Array.isArray(changes)) {
      return NextResponse.json({ error: 'Invalid changes array' }, { status: 400 });
    }

    const response: SyncResponse = {
      applied: [],
      conflicts: [],
      errors: [],
    };

    for (const change of changes) {
      try {
        const result = await processChange(change, user.id, pilotProfileId);
        
        if (result.conflict) {
          response.conflicts.push({
            type: change.type,
            action: change.action,
            localId: change.localId,
            conflictType: result.conflict.type,
            serverData: result.conflict.serverData,
            serverModifiedAt: result.conflict.serverModifiedAt,
          });
        } else if (result.applied) {
          response.applied.push({
            localId: change.localId,
            serverId: result.applied,
          });
        }
      } catch (error) {
        response.errors.push(`Error processing ${change.type} ${change.action}: ${String(error)}`);
      }
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('Sync error:', error);
    return NextResponse.json({ error: 'Sync failed: ' + String(error) }, { status: 500 });
  }
}

async function processChange(
  change: SyncChange,
  userId: string,
  pilotProfileId: string | null
): Promise<{ conflict?: { type: 'modified' | 'deleted'; serverData: Record<string, unknown>; serverModifiedAt: string }; applied?: string }> {
  const { type, action, data, localLastSyncedAt, localId } = change;

  // If no last synced timestamp, just apply without conflict check
  if (!localLastSyncedAt) {
    const applied = await applyChange(type, action, data, userId, pilotProfileId);
    return { applied };
  }

  // Check for conflicts based on type
  const conflictCheck = await checkForConflict(type, data, localLastSyncedAt);
  
  if (conflictCheck.hasConflict) {
    return {
      conflict: {
        type: conflictCheck.type!,
        serverData: conflictCheck.serverData!,
        serverModifiedAt: conflictCheck.serverModifiedAt!,
      },
    };
  }

  // No conflict, apply the change
  const applied = await applyChange(type, action, data, userId, pilotProfileId);
  return { applied };
}

async function checkForConflict(
  type: string,
  data: Record<string, unknown>,
  localLastSyncedAt: string
): Promise<{
  hasConflict: boolean;
  type?: 'modified' | 'deleted';
  serverData?: Record<string, unknown>;
  serverModifiedAt?: string;
}> {
  const id = data.id as string;
  
  if (!id) {
    return { hasConflict: false };
  }

  const lastSynced = new Date(localLastSyncedAt);

  switch (type) {
    case 'flight_log': {
      const existing = await prisma.flightLog.findUnique({
        where: { id },
      });
      
      if (!existing) {
        return { hasConflict: false }; // New item, not a conflict
      }
      
      if (!existing.updatedAt) {
        return { hasConflict: false };
      }
      
      const modifiedAt = new Date(existing.updatedAt);
      if (modifiedAt > lastSynced) {
        return {
          hasConflict: true,
          type: 'modified',
          serverData: existing,
          serverModifiedAt: existing.updatedAt.toISOString(),
        };
      }
      break;
    }
    
    case 'maintenance': {
      const existing = await prisma.maintenance.findUnique({
        where: { id },
      });
      
      if (!existing) {
        return { hasConflict: false };
      }
      
      if (!existing.updatedAt) {
        return { hasConflict: false };
      }
      
      const modifiedAt = new Date(existing.updatedAt);
      if (modifiedAt > lastSynced) {
        return {
          hasConflict: true,
          type: 'modified',
          serverData: existing,
          serverModifiedAt: existing.updatedAt.toISOString(),
        };
      }
      break;
    }
    
    case 'aircraft_status': {
      const existing = await prisma.clubAircraft.findUnique({
        where: { id },
      });
      
      if (!existing) {
        return { hasConflict: false };
      }
      
      if (!existing.updatedAt) {
        return { hasConflict: false };
      }
      
      const modifiedAt = new Date(existing.updatedAt);
      if (modifiedAt > lastSynced) {
        return {
          hasConflict: true,
          type: 'modified',
          serverData: { status: existing.status },
          serverModifiedAt: existing.updatedAt.toISOString(),
        };
      }
      break;
    }
    
    case 'booking': {
      const existing = await prisma.booking.findUnique({
        where: { id },
      });
      
      if (!existing) {
        return { hasConflict: true, type: 'deleted' };
      }
      
      if (!existing.updatedAt) {
        return { hasConflict: false };
      }
      
      const modifiedAt = new Date(existing.updatedAt);
      if (modifiedAt > lastSynced) {
        return {
          hasConflict: true,
          type: 'modified',
          serverData: existing,
          serverModifiedAt: existing.updatedAt.toISOString(),
        };
      }
      break;
    }
  }

  return { hasConflict: false };
}

async function applyChange(
  type: string,
  action: 'create' | 'update' | 'delete',
  data: Record<string, unknown>,
  userId: string,
  pilotProfileId: string | null
): Promise<string | undefined> {
  switch (type) {
    case 'flight_log': {
      if (action === 'create') {
        const flightLog = await prisma.flightLog.create({
          data: {
            clubAircraftId: data.aircraftId as string,
            pilotProfileId: data.pilotProfileId as string,
            date: new Date(data.date as string),
            tachTime: data.tachTime ? Number(data.tachTime) : null,
            hobbsTime: data.hobbsTime ? Number(data.hobbsTime) : null,
            notes: data.notes as string | null,
          },
        });
        return flightLog.id;
      }
      
      if (action === 'update') {
        await prisma.flightLog.update({
          where: { id: data.id as string },
          data: {
            date: data.date ? new Date(data.date as string) : undefined,
            tachTime: data.tachTime !== undefined ? (data.tachTime ? Number(data.tachTime) : null) : undefined,
            hobbsTime: data.hobbsTime !== undefined ? (data.hobbsTime ? Number(data.hobbsTime) : null) : undefined,
            notes: data.notes !== undefined ? (data.notes as string | null) : undefined,
          },
        });
        return data.id as string;
      }
      
      if (action === 'delete') {
        await prisma.flightLog.delete({
          where: { id: data.id as string },
        });
        return data.id as string;
      }
      break;
    }
    
    case 'maintenance': {
      if (action === 'create') {
        const maintenance = await prisma.maintenance.create({
          data: {
            clubAircraftId: data.aircraftId as string,
            reportedByUserId: userId,
            description: data.description as string,
            notes: data.notes as string | null,
            status: 'NEEDED',
            isGrounded: data.isGrounded as boolean | false,
            reportedDate: new Date(),
          },
        });
        return maintenance.id;
      }
      
      if (action === 'update') {
        await prisma.maintenance.update({
          where: { id: data.id as string },
          data: {
            status: data.status as string | undefined,
            notes: data.notes !== undefined ? (data.notes as string | null) : undefined,
            cost: data.cost !== undefined ? (data.cost ? Number(data.cost) : null) : undefined,
            isGrounded: data.isGrounded !== undefined ? (data.isGrounded as boolean) : undefined,
            resolvedDate: data.status === 'DONE' ? new Date() : undefined,
          },
        });
        return data.id as string;
      }
      
      if (action === 'delete') {
        await prisma.maintenance.delete({
          where: { id: data.id as string },
        });
        return data.id as string;
      }
      break;
    }
    
    case 'aircraft_status': {
      if (action === 'update') {
        await prisma.clubAircraft.update({
          where: { id: data.id as string },
          data: {
            status: data.status as string,
          },
        });
        return data.id as string;
      }
      break;
    }
    
    case 'booking': {
      if (action === 'create') {
        const booking = await prisma.booking.create({
          data: {
            clubAircraftId: data.aircraftId as string,
            pilotProfileId: pilotProfileId,
            startTime: new Date(data.startTime as string),
            endTime: new Date(data.endTime as string),
            purpose: data.purpose as string | null,
          },
        });
        return booking.id;
      }
      
      if (action === 'update') {
        await prisma.booking.update({
          where: { id: data.id as string },
          data: {
            startTime: data.startTime ? new Date(data.startTime as string) : undefined,
            endTime: data.endTime ? new Date(data.endTime as string) : undefined,
            purpose: data.purpose !== undefined ? (data.purpose as string | null) : undefined,
          },
        });
        return data.id as string;
      }
      
      if (action === 'delete') {
        await prisma.booking.delete({
          where: { id: data.id as string },
        });
        return data.id as string;
      }
      break;
    }
  }

  return undefined;
}

// GET endpoint to fetch sync status
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Return current server time for sync reference
    return NextResponse.json({
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Sync status error:', error);
    return NextResponse.json({ error: 'Failed to get sync status' }, { status: 500 });
  }
}
