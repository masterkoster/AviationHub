import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isUuid } from '@/lib/validate';
import { sendBookingCancellation } from '@/lib/club/notifications';

interface RouteParams {
  params: Promise<{ groupId: string; bookingId: string }>;
}

// DELETE cancel a booking. Allowed for the booking's owner (pilot) or a
// group ADMIN. When an admin cancels someone else's booking, a `reason`
// note is required in the JSON body and is passed on to the member in the
// cancellation email.
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const rawReason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    const reason = rawReason ? rawReason.slice(0, 500) : '';

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
      include: {
        pilotProfile: { include: { user: { select: { id: true, name: true, email: true } } } },
        clubAircraft: { select: { nNumber: true, customName: true, nickname: true } },
      }
    });

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    const isOwner = booking.pilotProfile?.userId === userId;
    const isAdmin = membership.role === 'ADMIN';

    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: 'Only the booking owner or a club admin can cancel this booking' }, { status: 403 });
    }

    if (!isOwner && !reason) {
      return NextResponse.json(
        { error: "A note explaining the cancellation is required when cancelling another member's booking" },
        { status: 400 }
      );
    }

    await prisma.booking.delete({ where: { id: bookingId } });

    // Best-effort cancellation email — never fails the request.
    if (booking.pilotProfile?.user?.email) {
      const [club, canceller] = await Promise.all([
        prisma.organization.findUnique({ where: { id: groupId }, select: { name: true } }),
        isOwner ? Promise.resolve(null) : prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
      ]);
      const aircraftLabel = booking.clubAircraft
        ? booking.clubAircraft.nickname || booking.clubAircraft.customName || booking.clubAircraft.nNumber || 'the aircraft'
        : 'the aircraft';
      try {
        await sendBookingCancellation({
          to: booking.pilotProfile.user.email,
          memberName: booking.pilotProfile.user.name || 'Member',
          clubName: club?.name || 'Your Flying Club',
          aircraftLabel,
          start: booking.startTime,
          end: booking.endTime,
          purpose: booking.purpose,
          cancelledBy: isOwner ? 'you' : (canceller?.name || 'a club admin'),
          reason: reason || null,
        });
      } catch (err) {
        console.error('Error sending booking cancellation email:', err);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error cancelling booking:', error);
    return NextResponse.json({ error: 'Failed to cancel booking' }, { status: 500 });
  }
}
