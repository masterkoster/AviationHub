import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isUuid } from '@/lib/validate';

interface RouteParams {
  params: Promise<{ groupId: string; bookingId: string }>;
}

// DELETE cancel a booking. Allowed for the booking's owner (pilot) or a
// group ADMIN.
export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { groupId, bookingId } = await params;
    if (!isUuid(groupId)) {
      return NextResponse.json({ error: 'Invalid groupId' }, { status: 400 });
    }

    const userId = session.user.id;

    const membership = await prisma.organizationMember.findFirst({
      where: { organizationId: groupId, userId }
    });

    if (!membership) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }

    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, organizationId: groupId },
      include: { pilotProfile: { select: { userId: true } } }
    });

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    const isOwner = booking.pilotProfile?.userId === userId;
    const isAdmin = membership.role === 'ADMIN';

    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: 'Only the booking owner or a club admin can cancel this booking' }, { status: 403 });
    }

    await prisma.booking.delete({ where: { id: bookingId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error cancelling booking:', error);
    return NextResponse.json({ error: 'Failed to cancel booking', details: String(error) }, { status: 500 });
  }
}
