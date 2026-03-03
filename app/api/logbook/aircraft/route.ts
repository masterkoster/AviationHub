import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getOrCreatePilotProfile } from '@/lib/pilot-profile'

// GET - List user's aircraft
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const profile = await getOrCreatePilotProfile(session.user.id)

    const aircraft = await prisma.aircraftProfile.findMany({
      where: { pilotProfileId: profile.id },
      include: {
        model: {
          select: {
            manufacturer: true,
            model: true,
            categoryClass: true,
            engineType: true,
          }
        }
      },
      orderBy: [{ nickname: 'asc' }, { nNumber: 'asc' }],
    })

    return NextResponse.json({ aircraft })
  } catch (error) {
    console.error('Error fetching aircraft:', error)
    return NextResponse.json({ error: 'Failed to fetch aircraft' }, { status: 500 })
  }
}

// POST - Add new aircraft
export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = await request.json()
    const { nNumber, nickname, categoryClass, engineType, notes, modelId } = body

    if (!nNumber) {
      return NextResponse.json({ error: 'Aircraft registration (N-number) is required' }, { status: 400 })
    }

    const profile = await getOrCreatePilotProfile(session.user.id)

    // Check if aircraft already exists for this user
    const existing = await prisma.aircraftProfile.findFirst({
      where: {
        pilotProfileId: profile.id,
        nNumber: nNumber.toUpperCase(),
      },
    })

    if (existing) {
      return NextResponse.json({ error: 'This aircraft is already in your list' }, { status: 400 })
    }

    const aircraft = await prisma.aircraftProfile.create({
      data: {
        pilotProfileId: profile.id,
        nNumber: nNumber.toUpperCase(),
        nickname: nickname || null,
        categoryClass: categoryClass || null,
        engineType: engineType || null,
        notes: notes || null,
        modelId: modelId || null,
      },
    })

    return NextResponse.json({ aircraft }, { status: 201 })
  } catch (error) {
    console.error('Error creating aircraft:', error)
    return NextResponse.json({ error: 'Failed to create aircraft' }, { status: 500 })
  }
}
