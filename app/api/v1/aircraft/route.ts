import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// GET - List user's aircraft
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const profile = await prisma.pilotProfile.findUnique({ where: { userId: session.user.id } })
    if (!profile) return NextResponse.json([])

    const aircraft = await prisma.aircraftProfile.findMany({
      where: { pilotProfileId: profile.id },
      include: { model: true },
      orderBy: { nNumber: 'asc' },
    })

    return NextResponse.json(aircraft)
  } catch (error) {
    console.error('GET /api/v1/aircraft error:', error)
    return NextResponse.json({ error: 'Failed to fetch aircraft' }, { status: 500 })
  }
}

// POST - Add aircraft
export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    let profile = await prisma.pilotProfile.findUnique({ where: { userId: session.user.id } })
    if (!profile) {
      const crypto = await import('crypto')
      profile = await prisma.pilotProfile.create({
        data: { userId: session.user.id, displayId: `LOG-${crypto.randomBytes(4).toString('hex').toUpperCase()}` },
      })
    }

    const body = await request.json()
    const { nNumber, nickname, categoryClass, engineType } = body

    if (!nNumber) {
      return NextResponse.json({ error: 'N-Number is required' }, { status: 400 })
    }

    // Check duplicate
    const existing = await prisma.aircraftProfile.findFirst({
      where: { pilotProfileId: profile.id, nNumber: nNumber.toUpperCase() },
    })
    if (existing) {
      return NextResponse.json({ error: 'Aircraft already exists' }, { status: 409 })
    }

    const aircraft = await prisma.aircraftProfile.create({
      data: {
        pilotProfileId: profile.id,
        nNumber: nNumber.toUpperCase(),
        nickname: nickname || null,
        categoryClass: categoryClass || null,
        engineType: engineType || null,
      },
    })

    return NextResponse.json(aircraft, { status: 201 })
  } catch (error) {
    console.error('POST /api/v1/aircraft error:', error)
    return NextResponse.json({ error: 'Failed to add aircraft' }, { status: 500 })
  }
}
