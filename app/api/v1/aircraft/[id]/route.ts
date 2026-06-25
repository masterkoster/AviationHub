import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// PUT - Update aircraft
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const profile = await prisma.pilotProfile.findUnique({ where: { userId: session.user.id } })
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    const aircraft = await prisma.aircraftProfile.findFirst({
      where: { id, pilotProfileId: profile.id },
    })
    if (!aircraft) return NextResponse.json({ error: 'Aircraft not found' }, { status: 404 })

    const body = await request.json()
    const updated = await prisma.aircraftProfile.update({
      where: { id },
      data: {
        nNumber: body.nNumber?.toUpperCase() ?? undefined,
        nickname: body.nickname ?? undefined,
        categoryClass: body.categoryClass ?? undefined,
        engineType: body.engineType ?? undefined,
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('PUT /api/v1/aircraft/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update aircraft' }, { status: 500 })
  }
}

// DELETE - Remove aircraft
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const profile = await prisma.pilotProfile.findUnique({ where: { userId: session.user.id } })
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    const aircraft = await prisma.aircraftProfile.findFirst({
      where: { id, pilotProfileId: profile.id },
    })
    if (!aircraft) return NextResponse.json({ error: 'Aircraft not found' }, { status: 404 })

    await prisma.aircraftProfile.delete({ where: { id } })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('DELETE /api/v1/aircraft/[id] error:', error)
    return NextResponse.json({ error: 'Failed to delete aircraft' }, { status: 500 })
  }
}
