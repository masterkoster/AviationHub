import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getOrCreatePilotProfile } from '@/lib/pilot-profile'

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.user.role !== 'mechanic' && session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Mechanic access only' }, { status: 403 })
    }

    const listings = await prisma.maintenanceRequest.findMany({
      where: { status: { in: ['OPEN', 'QUOTED', 'ACCEPTED', 'IN_PROGRESS'] }, visibility: 'MECHANIC' },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        urgency: true,
        neededBy: true,
        jobSize: true,
        aircraftType: true,
        airportIcao: true,
        city: true,
        state: true,
        anonymous: true,
        source: true,
        allowTailNumber: true,
        aircraftSnapshot: true,
        logbookSnapshot: true,
      },
    })

    return NextResponse.json({ listings })
  } catch (error) {
    console.error('Failed to fetch mechanic listings', error)
    return NextResponse.json({ error: 'Failed to fetch listings' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      title,
      description,
      category,
      urgency,
      neededBy,
      jobSize,
      allowTailNumber,
      groupId,
      aircraftType,
      airportIcao,
      airportName,
      city,
      state,
      locationLat,
      locationLng,
      locationPrivacy,
      source,
      requestedWork,
      anonymous,
    } = body || {}

    if (!title || !description || !category) {
      return NextResponse.json({ error: 'Title, description, and category required' }, { status: 400 })
    }

    // Get or create pilot profile
    const pilotProfile = await getOrCreatePilotProfile(session.user.id)

    const listing = await prisma.maintenanceRequest.create({
      data: {
        title,
        description,
        category,
        urgency: urgency || 'NORMAL',
        neededBy: neededBy ? new Date(neededBy) : null,
        jobSize: jobSize || 'MEDIUM',
        allowTailNumber: !!allowTailNumber,
        aircraftType: aircraftType ?? null,
        airportIcao: airportIcao ?? null,
        airportName: airportName ?? null,
        city: city ?? null,
        state: state ?? null,
        locationLat: typeof locationLat === 'number' ? locationLat : null,
        locationLng: typeof locationLng === 'number' ? locationLng : null,
        locationPrivacy: locationPrivacy ?? 'CITY',
        source: source || 'manual',
        organizationId: groupId ?? null,
        visibility: 'MECHANIC',
        requestedWork: requestedWork ?? null,
        anonymous: typeof anonymous === 'boolean' ? anonymous : true,
        postedByPilotId: pilotProfile.id,
        postedByName: anonymous ? null : session.user.name || null,
        postedByEmail: anonymous ? null : session.user.email || null,
      },
    })

    return NextResponse.json({ listing })
  } catch (error) {
    console.error('Failed to create mechanic listing', error)
    return NextResponse.json({ error: 'Failed to create listing' }, { status: 500 })
  }
}
