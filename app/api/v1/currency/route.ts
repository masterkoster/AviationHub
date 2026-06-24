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
    if (!profile) return NextResponse.json({ rules: [] })

    // Get all entries sorted by date
    const entries = await prisma.logbookEntry.findMany({
      where: { pilotProfileId: profile.id, isVoided: false },
      orderBy: { date: 'desc' },
      select: {
        date: true, totalTime: true, nightTime: true, instrumentTime: true,
        dayLandings: true, nightLandings: true, approaches: true,
      },
    })

    // Get user medical/bfr info
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { bfrExpiry: true, medicalExpiry: true },
    })

    const now = new Date()
    const rules: any[] = []

    // FAA Flight Review (61.56) - 24 calendar months
    if (entries.length > 0) {
      const lastFlight = entries[0]
      const bfrDate = user?.bfrExpiry ? new Date(user.bfrExpiry) : null
      const bfrRemaining = bfrDate ? Math.ceil((bfrDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null
      rules.push({
        code: 'FAA-FR',
        name: 'Flight Review',
        authority: 'FAA',
        status: bfrRemaining !== null ? (bfrRemaining <= 0 ? 'expired' : bfrRemaining <= 30 ? 'expiring' : 'current') : 'unknown',
        nextDue: bfrDate?.toISOString() || null,
        daysRemaining: bfrRemaining,
        requirement: 'Flight review every 24 calendar months',
      })
    }

    // FAA Night Currency (61.57(b)) - 3 takeoffs and landings in 90 days
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
    const nightFlights90 = entries.filter(e => e.date && new Date(e.date) >= ninetyDaysAgo)
    const nightLandings = nightFlights90.reduce((sum, e) => sum + e.nightLandings, 0)
    rules.push({
      code: 'FAA-NIGHT',
      name: 'Night Landing Currency',
      authority: 'FAA',
      status: nightLandings >= 3 ? 'current' : 'expiring',
      completed: nightLandings,
      required: 3,
      unit: 'night landings in 90 days',
      progress: [{ completed: nightLandings, required: 3, unit: 'night landings' }],
    })

    // FAA Instrument Currency (61.57(c)) - 6 approaches, holding, intercepting/tracking in 6 calendar months
    const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000)
    const recentInstrument = entries.filter(e => e.date && new Date(e.date) >= sixMonthsAgo)
    const approaches = recentInstrument.reduce((sum, e) => sum + e.approaches, 0)
    rules.push({
      code: 'FAA-IPC',
      name: 'Instrument Currency',
      authority: 'FAA',
      status: approaches >= 6 ? 'current' : 'expiring',
      completed: approaches,
      required: 6,
      unit: 'approaches in 6 months',
      progress: [{ completed: approaches, required: 6, unit: 'approaches' }],
    })

    // Medical
    if (user?.medicalExpiry) {
      const medExpiry = new Date(user.medicalExpiry)
      const medDays = Math.ceil((medExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      rules.push({
        code: 'FAA-MED',
        name: 'Medical Certificate',
        authority: 'FAA',
        status: medDays <= 0 ? 'expired' : medDays <= 30 ? 'expiring' : 'current',
        nextDue: medExpiry.toISOString(),
        daysRemaining: medDays,
        requirement: 'Valid medical certificate',
      })
    }

    return NextResponse.json({ rules })
  } catch (error) {
    console.error('GET /api/v1/currency error:', error)
    return NextResponse.json({ error: 'Failed to compute currency' }, { status: 500 })
  }
}
