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
      return NextResponse.json({ quotes: [] })
    }

    // Get the user's pilot profile
    const pilotProfile = await prisma.pilotProfile.findUnique({
      where: { userId: session.user.id },
    })

    if (!pilotProfile) {
      return NextResponse.json({ quotes: [] })
    }

    const quotes = await prisma.mechanicQuote.findMany({
      where: {
        maintenanceRequest: {
          postedByPilotId: pilotProfile.id,
        },
      },
      include: {
        mechanic: true,
        maintenanceRequest: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ quotes })
  } catch (error) {
    console.error('Failed to fetch mechanic quotes', error)
    return NextResponse.json({ error: 'Failed to fetch quotes' }, { status: 500 })
  }
}
