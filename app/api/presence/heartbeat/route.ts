import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get or create pilot profile
    const pilotProfile = await prisma.pilotProfile.upsert({
      where: { userId: session.user.id },
      update: {},
      create: { userId: session.user.id },
    });

    // Try to upsert presence using pilotProfileId
    // This will fail gracefully if the table doesn't exist yet
    try {
      await prisma.userPresence.upsert({
        where: { pilotProfileId: pilotProfile.id },
        update: {
          isOnline: true,
          lastSeenAt: new Date(),
        },
        create: {
          pilotProfileId: pilotProfile.id,
          isOnline: true,
          lastSeenAt: new Date(),
        },
      });
    } catch (prismaError: any) {
      // Table might not exist yet - that's ok, we'll create it manually
      console.warn('UserPresence table not ready:', prismaError.message);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Presence heartbeat failed', error);
    return NextResponse.json({ error: 'Failed to update presence' }, { status: 500 });
  }
}
