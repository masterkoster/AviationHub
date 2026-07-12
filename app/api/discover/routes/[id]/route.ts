import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getOrCreatePilotProfile } from '@/lib/pilot-profile'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { id } = await params
    const profile = await getOrCreatePilotProfile(session.user.id)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = prisma as any
    const route = await db.sharedRoute.findUnique({ where: { id } }) as {
      pilotProfileId: string
    } | null

    if (!route) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (route.pilotProfileId !== profile.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await db.sharedRoute.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('DELETE /api/discover/routes/[id] error:', error)
    return NextResponse.json({ error: 'Failed to delete route' }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({})) as { action?: string }

    if (body.action !== 'import') {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = prisma as any
    await db.sharedRoute.update({
      where: { id },
      data: { downloadsCount: { increment: 1 } },
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('POST /api/discover/routes/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update route' }, { status: 500 })
  }
}
