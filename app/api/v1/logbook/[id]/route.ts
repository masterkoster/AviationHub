import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const FLOAT_FIELDS = [
  'totalTime', 'picTime', 'sicTime', 'soloTime', 'dualGiven', 'dualReceived',
  'nightTime', 'instrumentTime', 'simulatedInstrumentTime', 'crossCountryTime',
  'blockTime', 'hobbsStart', 'hobbsEnd', 'tachStart', 'tachEnd',
  'groundTrainingReceived', 'simTrainingReceived', 'routeDistanceNm',
]
const INT_FIELDS = ['dayLandings', 'nightLandings', 'landingsFullStop', 'approaches', 'holds', 'dmeArcs', 'intercepts']
const BOOL_FIELDS = ['isSimulator', 'isPending', 'isCrossCountry', 'isNight', 'isDay', 'isSolo', 'isDual', 'requiresSafetyPilot']

// GET - Single entry
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const entry = await prisma.logbookEntry.findFirst({
      where: {
        id: params.id,
        pilotProfile: { userId: session.user.id },
      },
    })

    if (!entry) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
    }

    return NextResponse.json(entry)
  } catch (error) {
    console.error('GET /api/v1/logbook/[id] error:', error)
    return NextResponse.json({ error: 'Failed to fetch entry' }, { status: 500 })
  }
}

// PUT - Update entry (accepts all fields pass-through)
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const existing = await prisma.logbookEntry.findFirst({
      where: {
        id: params.id,
        pilotProfile: { userId: session.user.id },
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
    }

    const body = await request.json()

    // Build update data — only include fields present in body
    const data: any = {}

    if (body.date) data.date = new Date(body.date)
    if (body.aircraft !== undefined) data.aircraft = body.aircraft
    if (body.routeFrom !== undefined) data.routeFrom = body.routeFrom
    if (body.routeTo !== undefined) data.routeTo = body.routeTo

    for (const key of ['routeVia', 'remarks', 'instructor', 'instructorId', 'studentId',
      'safetyPilotName', 'crewRole', 'faaType', 'easaType', 'trainingDeviceId', 'trainingDeviceLocation']) {
      if (body[key] !== undefined) data[key] = body[key] || null
    }

    for (const key of ['departureTime', 'arrivalTime']) {
      if (body[key]) data[key] = new Date(body[key])
    }

    for (const key of FLOAT_FIELDS) {
      if (body[key] !== undefined) data[key] = parseFloat(body[key]) || 0
    }

    for (const key of INT_FIELDS) {
      if (body[key] !== undefined) data[key] = parseInt(body[key]) || 0
    }

    for (const key of BOOL_FIELDS) {
      if (body[key] !== undefined) data[key] = Boolean(body[key])
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const entry = await prisma.logbookEntry.update({
      where: { id: params.id },
      data,
    })

    // Record audit history for changed fields
    for (const [key, value] of Object.entries(data)) {
      if (key === 'date' || key === 'pilotProfileId') continue
      const oldVal = String((existing as any)[key] ?? '')
      const newVal = String(value ?? '')
      if (oldVal !== newVal) {
        await prisma.logbookEntryHistory.create({
          data: { entryId: params.id, action: 'UPDATED', fieldName: key, oldValue: oldVal, newValue: newVal, changedBy: session.user.id },
        })
      }
    }

    return NextResponse.json(entry)
  } catch (error) {
    console.error('PUT /api/v1/logbook/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update entry' }, { status: 500 })
  }
}
