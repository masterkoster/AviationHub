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
      return NextResponse.json({ requests: [] })
    }

    const requests = await prisma.mechanicFileRequest.findMany({
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

    return NextResponse.json({ requests })
  } catch (error) {
    console.error('Failed to load file requests', error)
    return NextResponse.json({ error: 'Failed to load file requests' }, { status: 500 })
  }
}
