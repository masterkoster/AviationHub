import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!('mechanicQuote' in prisma) || !('maintenanceRequest' in prisma)) {
      return NextResponse.json({ unread: 0 })
    }

    // Get the user's pilot profile
    const pilotProfile = await prisma.pilotProfile.findUnique({
      where: { userId: session.user.id },
    })

    if (!pilotProfile) {
      return NextResponse.json({ unread: 0 })
    }

    const preferences = await prisma.userPreferences.findUnique({
      where: { userId: session.user.id },
      select: { mechanicInboxLastViewed: true },
    })

    const lastViewed = preferences?.mechanicInboxLastViewed

    const count = await prisma.mechanicQuote.count({
      where: {
        maintenanceRequest: {
          postedByPilotId: pilotProfile.id,
        },
        ...(lastViewed ? { createdAt: { gt: lastViewed } } : {}),
      },
    })

    return NextResponse.json({ unread: count })
  } catch (error) {
    console.error('Failed to fetch unread mechanic quotes', error)
    return NextResponse.json({ error: 'Failed to fetch unread count' }, { status: 500 })
  }
}
