import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const profile = await prisma.pilotProfile.findUnique({ where: { userId: session.user.id } })
    if (!profile) return NextResponse.json({ totals: null })

    // Get all non-voided entries
    const entries = await prisma.logbookEntry.findMany({
      where: { pilotProfileId: profile.id, isVoided: false },
      select: {
        totalTime: true, picTime: true, sicTime: true, soloTime: true,
        nightTime: true, instrumentTime: true, simulatedInstrumentTime: true,
        crossCountryTime: true, dualGiven: true, dualReceived: true,
        dayLandings: true, nightLandings: true, approaches: true, holds: true,
      },
    })

    // Get starting totals
    const starting = await prisma.logbookStartingTotal.findUnique({ where: { userId: session.user.id } })

    // Sum entries
    const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0)
    const totals = {
      totalTime: sum(entries.map(e => e.totalTime)) + (starting?.totalTime || 0),
      picTime: sum(entries.map(e => e.picTime)) + (starting?.picTime || 0),
      sicTime: sum(entries.map(e => e.sicTime)) + (starting?.sicTime || 0),
      soloTime: sum(entries.map(e => e.soloTime)),
      nightTime: sum(entries.map(e => e.nightTime)) + (starting?.nightTime || 0),
      instrumentTime: sum(entries.map(e => e.instrumentTime)) + (starting?.instrumentTime || 0),
      simulatedInstrumentTime: sum(entries.map(e => e.simulatedInstrumentTime)),
      crossCountryTime: sum(entries.map(e => e.crossCountryTime)) + (starting?.crossCountryTime || 0),
      dualGiven: sum(entries.map(e => e.dualGiven)),
      dualReceived: sum(entries.map(e => e.dualReceived)),
      dayLandings: sum(entries.map(e => e.dayLandings)) + (starting?.landingsDay || 0),
      nightLandings: sum(entries.map(e => e.nightLandings)) + (starting?.landingsNight || 0),
      approaches: sum(entries.map(e => e.approaches)),
      holds: sum(entries.map(e => e.holds)),
      totalFlights: entries.length,
    }

    return NextResponse.json({ totals })
  } catch (error) {
    console.error('GET /api/v1/totals error:', error)
    return NextResponse.json({ error: 'Failed to compute totals' }, { status: 500 })
  }
}
