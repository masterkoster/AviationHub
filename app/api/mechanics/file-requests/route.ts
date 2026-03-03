import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.user.role !== 'mechanic' && session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Mechanic access only' }, { status: 403 })
    }

    const body = await request.json()
    const { maintenanceRequestId, requestedFiles } = body || {}

    if (!maintenanceRequestId || !Array.isArray(requestedFiles)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const mechanic = await prisma.mechanic.findUnique({
      where: { userId: session.user.id },
    })

    if (!mechanic) {
      return NextResponse.json({ error: 'Mechanic profile not found' }, { status: 404 })
    }

    const requestRecord = await prisma.mechanicFileRequest.create({
      data: {
        maintenanceRequestId,
        mechanicId: mechanic.id,
        requestedFiles: JSON.stringify(requestedFiles),
      },
    })

    return NextResponse.json({ request: requestRecord })
  } catch (error) {
    console.error('Failed to create file request', error)
    return NextResponse.json({ error: 'Failed to create file request' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { requestId, status } = body || {}

    if (!requestId || !['SENT', 'DECLINED'].includes(status)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    // Get the user's pilot profile to compare
    const pilotProfile = await prisma.pilotProfile.findUnique({
      where: { userId: session.user.id },
    })

    const fileRequest = await prisma.mechanicFileRequest.findUnique({
      where: { id: requestId },
      include: { maintenanceRequest: true },
    })

    if (!fileRequest || fileRequest.maintenanceRequest.postedByPilotId !== pilotProfile?.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const updated = await prisma.mechanicFileRequest.update({
      where: { id: requestId },
      data: { status },
    })

    return NextResponse.json({ request: updated })
  } catch (error) {
    console.error('Failed to update file request', error)
    return NextResponse.json({ error: 'Failed to update file request' }, { status: 500 })
  }
}
