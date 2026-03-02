import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getOrCreatePilotProfile } from '@/lib/pilot-profile'

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const profile = await getOrCreatePilotProfile(session.user.id)
    const totals = await prisma.logbookStartingTotal.findUnique({
      where: { userId: session.user.id },
    })

    return NextResponse.json({ totals })
  } catch (error) {
    console.error('Error fetching starting totals:', error)
    return NextResponse.json({ error: 'Failed to fetch starting totals' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = await request.json()

    await getOrCreatePilotProfile(session.user.id)
    const totals = await prisma.logbookStartingTotal.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        totalTime: body.totalTime || 0,
        picTime: body.picTime || 0,
        sicTime: body.sicTime || 0,
        nightTime: body.nightTime || 0,
        instrumentTime: body.instrumentTime || 0,
        crossCountryTime: body.crossCountryTime || 0,
        landingsDay: body.landingsDay || 0,
        landingsNight: body.landingsNight || 0,
        asOfDate: body.asOfDate ? new Date(body.asOfDate) : null,
      },
      update: {
        totalTime: body.totalTime || 0,
        picTime: body.picTime || 0,
        sicTime: body.sicTime || 0,
        nightTime: body.nightTime || 0,
        instrumentTime: body.instrumentTime || 0,
        crossCountryTime: body.crossCountryTime || 0,
        landingsDay: body.landingsDay || 0,
        landingsNight: body.landingsNight || 0,
        asOfDate: body.asOfDate ? new Date(body.asOfDate) : null,
      },
    })

    return NextResponse.json({ totals })
  } catch (error) {
    console.error('Error saving starting totals:', error)
    return NextResponse.json({ error: 'Failed to save starting totals' }, { status: 500 })
  }
}
