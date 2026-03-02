import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getOrCreatePilotProfile } from '@/lib/pilot-profile'
import { addDays } from 'date-fns'

const DEFAULT_RULES = [
  { authority: 'FAA', code: 'FAA-FR', name: 'Flight Review (24 months)', days: 730, field: 'totalTime' },
  { authority: 'FAA', code: 'FAA-IPC', name: 'Instrument Proficiency (6 months)', days: 183, field: 'instrumentTime' },
  { authority: 'FAA', code: 'FAA-NIGHT', name: 'Night Takeoffs/Landings (90 days)', days: 90, field: 'nightLandings' },
  { authority: 'EASA', code: 'EASA-SEP', name: 'SEP Revalidation (12 months)', days: 365, field: 'totalTime' },
  { authority: 'EASA', code: 'EASA-LPC', name: 'LPC/OPC (12 months)', days: 365, field: 'totalTime' },
]

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const profile = await getOrCreatePilotProfile(session.user.id)
  const entries = await prisma.logbookEntry.findMany({
    where: { pilotProfileId: profile.id },
    orderBy: { date: 'desc' },
  })

  for (const rule of DEFAULT_RULES) {
    const last = entries.find((entry) => {
      if (rule.field === 'nightLandings') return entry.nightLandings > 0
      if (rule.field === 'instrumentTime') return entry.instrumentTime > 0
      return entry.totalTime > 0
    })

    const lastSatisfiedAt = last ? new Date(last.date) : null
    const nextDueAt = lastSatisfiedAt ? addDays(lastSatisfiedAt, rule.days) : null
    const status = nextDueAt ? (nextDueAt < new Date() ? 'expired' : 'current') : 'expired'

    const ruleRecord = await prisma.currencyRule.upsert({
      where: { code: rule.code },
      create: {
        authority: rule.authority,
        code: rule.code,
        name: rule.name,
        ruleJson: JSON.stringify({ days: rule.days, field: rule.field }),
      },
      update: {},
    })

    await prisma.currencyStatus.upsert({
      where: { pilotProfileId_ruleId: { pilotProfileId: profile.id, ruleId: ruleRecord.id } },
      create: {
        pilotProfileId: profile.id,
        ruleId: ruleRecord.id,
        status,
        lastSatisfiedAt,
        nextDueAt,
      },
      update: {
        status,
        lastSatisfiedAt,
        nextDueAt,
      },
    })
  }

  const statuses = await prisma.currencyStatus.findMany({
    where: { pilotProfileId: profile.id },
    include: { rule: true },
  })

  return NextResponse.json({ statuses })
}
