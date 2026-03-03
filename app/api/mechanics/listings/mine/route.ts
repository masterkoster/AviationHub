import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the user's pilot profile
    const pilotProfile = await prisma.pilotProfile.findUnique({
      where: { userId: session.user.id },
    })

    if (!pilotProfile) {
      return NextResponse.json({ listings: [] })
    }

    const listings = await prisma.maintenanceRequest.findMany({
      where: { postedByPilotId: pilotProfile.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        status: true,
        category: true,
        jobSize: true,
        neededBy: true,
        aircraftSnapshot: true,
        logbookSnapshot: true,
      },
    })

    return NextResponse.json({ listings })
  } catch (error) {
    console.error('Failed to fetch user listings', error)
    return NextResponse.json({ error: 'Failed to fetch listings' }, { status: 500 })
  }
}
