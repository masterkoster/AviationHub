import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Fields that are numeric (need parseFloat)
const FLOAT_FIELDS = [
  'totalTime', 'picTime', 'sicTime', 'soloTime', 'dualGiven', 'dualReceived',
  'nightTime', 'instrumentTime', 'simulatedInstrumentTime', 'crossCountryTime',
  'blockTime', 'hobbsStart', 'hobbsEnd', 'tachStart', 'tachEnd',
  'groundTrainingReceived', 'simTrainingReceived', 'routeDistanceNm',
]
// Fields that are integer
const INT_FIELDS = ['dayLandings', 'nightLandings', 'landingsFullStop', 'approaches', 'holds', 'dmeArcs', 'intercepts']
// Fields that are boolean
const BOOL_FIELDS = ['isSimulator', 'isPending', 'isCrossCountry', 'isNight', 'isDay', 'isSolo', 'isDual', 'requiresSafetyPilot']

// GET - List logbook entries (no tier gate)
export async function GET(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '200'), 500)
    const cursor = searchParams.get('cursor')

    const entries = await prisma.logbookEntry.findMany({
      where: {
        pilotProfile: { userId: session.user.id },
        isVoided: false,
      },
      orderBy: { date: 'desc' },
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })

    return NextResponse.json(entries)
  } catch (error) {
    console.error('GET /api/v1/logbook error:', error)
    return NextResponse.json({ error: 'Failed to fetch entries' }, { status: 500 })
  }
}

// POST - Create a new logbook entry (accepts all fields pass-through)
export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = await request.json()

    if (!body.date || !body.aircraft || body.totalTime === undefined) {
      return NextResponse.json({ error: 'Date, aircraft, and total time are required' }, { status: 400 })
    }

    // Get or create pilot profile
    let profile = await prisma.pilotProfile.findUnique({ where: { userId: session.user.id } })
    if (!profile) {
      const crypto = await import('crypto')
      profile = await prisma.pilotProfile.create({
        data: { userId: session.user.id, displayId: `LOG-${crypto.randomBytes(4).toString('hex').toUpperCase()}` },
      })
    }

    // Build data object from body — only include fields that exist in the body
    const data: any = {
      pilotProfileId: profile.id,
      date: new Date(body.date),
      aircraft: body.aircraft,
      routeFrom: body.routeFrom || '',
      routeTo: body.routeTo || '',
    }

    // Nullable string fields
    for (const key of ['aircraftId', 'routeFrom', 'routeTo', 'routeVia', 'remarks', 'instructor',
      'instructorId', 'studentId', 'safetyPilotName', 'crewRole', 'faaType', 'easaType',
      'trainingDeviceId', 'trainingDeviceLocation']) {
      if (body[key] !== undefined) data[key] = body[key] || null
    }

    // DateTime fields
    for (const key of ['departureTime', 'arrivalTime']) {
      if (body[key]) data[key] = new Date(body[key])
    }

    // Float fields
    for (const key of FLOAT_FIELDS) {
      if (body[key] !== undefined) data[key] = parseFloat(body[key]) || 0
    }

    // Int fields
    for (const key of INT_FIELDS) {
      if (body[key] !== undefined) data[key] = parseInt(body[key]) || 0
    }

    // Boolean fields
    for (const key of BOOL_FIELDS) {
      if (body[key] !== undefined) data[key] = Boolean(body[key])
    }

    const entry = await prisma.logbookEntry.create({ data })

    // Record audit history
    await prisma.logbookEntryHistory.create({
      data: {
        entryId: entry.id,
        action: 'CREATED',
        changedBy: session.user.id,
      },
    })

    return NextResponse.json(entry, { status: 201 })
  } catch (error) {
    console.error('POST /api/v1/logbook error:', error)
    return NextResponse.json({ error: 'Failed to create entry' }, { status: 500 })
  }
}
