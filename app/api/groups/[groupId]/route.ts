import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isUuid } from '@/lib/validate';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

// GET group details
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { groupId } = await params;
    if (!isUuid(groupId)) {
      return NextResponse.json({ error: 'Invalid groupId' }, { status: 400 });
    }

    const userId = session.user.id;

    // Check membership
    const membership = await prisma.organizationMember.findFirst({
      where: { organizationId: groupId, userId }
    });

    if (!membership) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }

    const group = await prisma.organization.findUnique({
      where: { id: groupId },
      include: {
        aircraft: true,
        members: {
          include: { user: { select: { id: true, name: true, email: true } } }
        }
      }
    });

    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: group.id,
      name: group.name,
      type: group.type,
      ownerId: group.ownerId,
      description: group.description,
      createdAt: group.createdAt,
      aircraft: group.aircraft,
      members: group.members.map(m => ({
        id: m.id,
        userId: m.userId,
        role: m.role,
        joinedAt: m.joinedAt,
        user: m.user
      }))
    });
  } catch (error) {
    console.error('Error fetching group:', error);
    return NextResponse.json({ error: 'Failed to fetch group' }, { status: 500 });
  }
}

// PUT update group settings (admin only)
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { groupId } = await params;
    if (!isUuid(groupId)) {
      return NextResponse.json({ error: 'Invalid groupId' }, { status: 400 });
    }

    const userId = session.user.id;

    // Check admin role
    const membership = await prisma.organizationMember.findFirst({
      where: { organizationId: groupId, userId, role: 'ADMIN' }
    });

    if (!membership) {
      return NextResponse.json({ error: 'Only admins can update group settings' }, { status: 403 });
    }

    const body = await request.json();
    const { name, description } = body;

    const updateData: Record<string, unknown> = {};
    if (name && typeof name === 'string') updateData.name = name.trim();
    if (description !== undefined) updateData.description = description;

    const group = await prisma.organization.update({
      where: { id: groupId },
      data: updateData
    });

    return NextResponse.json({
      id: group.id,
      name: group.name,
      description: group.description,
      type: group.type,
      ownerId: group.ownerId
    });
  } catch (error) {
    console.error('Error updating group:', error);
    return NextResponse.json({ error: 'Failed to update group' }, { status: 500 });
  }
}

// DELETE group (owner only)
export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { groupId } = await params;
    if (!isUuid(groupId)) {
      return NextResponse.json({ error: 'Invalid groupId' }, { status: 400 });
    }

    const userId = session.user.id;

    // Check ownership
    const group = await prisma.organization.findUnique({
      where: { id: groupId }
    });

    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    if (group.ownerId !== userId) {
      return NextResponse.json({ error: 'Only the owner can delete the group' }, { status: 403 });
    }

    // The Organization row is referenced (directly or via its ClubAircraft/FlightLog rows)
    // by a large web of tables, almost all with onDelete: NoAction constraints, so a bare
    // `organization.delete` throws a FK violation the moment any of them has a row. Clean
    // up every dependent in FK-safe order inside one transaction, then delete the org.
    //
    // LogbookEntry is the exception: it's a pilot's personal/legal flight record, so we
    // detach it (null out organizationId/clubAircraftId) instead of deleting it.
    await prisma.$transaction(async (tx) => {
      const aircraft = await tx.clubAircraft.findMany({
        where: { organizationId: groupId },
        select: { id: true },
      });
      const aircraftIds = aircraft.map(a => a.id);

      const flightLogs = await tx.flightLog.findMany({
        where: { OR: [{ organizationId: groupId }, { clubAircraftId: { in: aircraftIds } }] },
        select: { id: true },
      });
      const flightLogIds = flightLogs.map(f => f.id);

      const maintenanceRequests = await tx.maintenanceRequest.findMany({
        where: { organizationId: groupId },
        select: { id: true },
      });
      const maintenanceRequestIds = maintenanceRequests.map(m => m.id);

      // Preserve pilots' personal logbook entries — just detach them from the club/aircraft.
      await tx.logbookEntry.updateMany({
        where: { OR: [{ organizationId: groupId }, { clubAircraftId: { in: aircraftIds } }] },
        data: { organizationId: null, clubAircraftId: null },
      });

      // Mechanic marketplace records tied to this club's maintenance requests
      // (children of MaintenanceRequest before the request itself).
      await tx.mechanicJobSchedule.deleteMany({ where: { maintenanceRequestId: { in: maintenanceRequestIds } } });
      await tx.mechanicReview.deleteMany({ where: { maintenanceRequestId: { in: maintenanceRequestIds } } });
      await tx.mechanicFileRequest.deleteMany({ where: { maintenanceRequestId: { in: maintenanceRequestIds } } });
      await tx.mechanicQuote.deleteMany({ where: { maintenanceRequestId: { in: maintenanceRequestIds } } });
      await tx.maintenanceRequest.deleteMany({ where: { organizationId: groupId } });

      // Billing (children before parents) and aircraft-usage records that reference the
      // org's aircraft or flight logs.
      await tx.invoiceItem.deleteMany({
        where: {
          OR: [
            { invoice: { organizationId: groupId } },
            { clubAircraftId: { in: aircraftIds } },
            { flightLogId: { in: flightLogIds } },
          ],
        },
      });
      await tx.maintenance.deleteMany({
        where: {
          OR: [
            { organizationId: groupId },
            { clubAircraftId: { in: aircraftIds } },
            { flightLogId: { in: flightLogIds } },
          ],
        },
      });
      await tx.fuelExpense.deleteMany({
        where: {
          OR: [
            { organizationId: groupId },
            { clubAircraftId: { in: aircraftIds } },
            { flightLogId: { in: flightLogIds } },
          ],
        },
      });
      await tx.invoice.deleteMany({ where: { organizationId: groupId } });
      await tx.billingRun.deleteMany({ where: { organizationId: groupId } });
      await tx.flightLog.deleteMany({
        where: { OR: [{ organizationId: groupId }, { clubAircraftId: { in: aircraftIds } }] },
      });

      // Bookings/blockouts on the org's aircraft, then the aircraft themselves.
      await tx.booking.deleteMany({
        where: { OR: [{ organizationId: groupId }, { clubAircraftId: { in: aircraftIds } }] },
      });
      await tx.blockOut.deleteMany({
        where: { OR: [{ organizationId: groupId }, { clubAircraftId: { in: aircraftIds } }] },
      });
      await tx.clubAircraft.deleteMany({ where: { organizationId: groupId } });

      // Membership, chat, and club content.
      await tx.groupChatMessage.deleteMany({ where: { organizationId: groupId } });
      await tx.organizationMember.deleteMany({ where: { organizationId: groupId } });
      await tx.invite.deleteMany({ where: { groupId } });
      await tx.organizationPost.deleteMany({ where: { organizationId: groupId } });
      await tx.organizationDocument.deleteMany({ where: { organizationId: groupId } });

      // Third-party integrations (QuickBooks, etc.) and their sync history.
      await tx.syncLog.deleteMany({ where: { integration: { organizationId: groupId } } });
      await tx.quickBooksMapping.deleteMany({ where: { integration: { organizationId: groupId } } });
      await tx.integration.deleteMany({ where: { organizationId: groupId } });

      await tx.organization.delete({ where: { id: groupId } });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting group:', error);
    return NextResponse.json({ error: 'Failed to delete group' }, { status: 500 });
  }
}
