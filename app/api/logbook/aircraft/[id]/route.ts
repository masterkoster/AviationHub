import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getOrCreatePilotProfile } from '@/lib/pilot-profile'

// PUT - Update aircraft
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const { nNumber, nickname, categoryClass, engineType, notes, modelId } = body

    const profile = await getOrCreatePilotProfile(session.user.id)

    // Verify ownership
    const existing = await prisma.aircraftProfile.findFirst({
      where: {
        id,
        pilotProfileId: profile.id,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Aircraft not found' }, { status: 404 })
    }

    const aircraft = await prisma.aircraftProfile.update({
      where: { id },
      data: {
        nNumber: nNumber ? nNumber.toUpperCase() : undefined,
        nickname: nickname !== undefined ? nickname : undefined,
        categoryClass: categoryClass !== undefined ? categoryClass : undefined,
        engineType: engineType !== undefined ? engineType : undefined,
        notes: notes !== undefined ? notes : undefined,
        modelId: modelId !== undefined ? modelId : undefined,
      },
    })

    return NextResponse.json({ aircraft })
  } catch (error) {
    console.error('Error updating aircraft:', error)
    return NextResponse.json({ error: 'Failed to update aircraft' }, { status: 500 })
  }
}

// DELETE - Remove aircraft
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { id } = await params

    const profile = await getOrCreatePilotProfile(session.user.id)

    // Verify ownership
    const existing = await prisma.aircraftProfile.findFirst({
      where: {
        id,
        pilotProfileId: profile.id,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Aircraft not found' }, { status: 404 })
    }

    await prisma.aircraftProfile.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting aircraft:', error)
    return NextResponse.json({ error: 'Failed to delete aircraft' }, { status: 500 })
  }
}
