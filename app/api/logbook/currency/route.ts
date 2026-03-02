import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getOrCreatePilotProfile } from '@/lib/pilot-profile'

const FAA_RULES = [
  { code: 'FAA-FR', name: 'Flight Review (24 months)', days: 730 },
  { code: 'FAA-IPC', name: 'Instrument Proficiency (6 months)', days: 183 },
  { code: 'FAA-NIGHT', name: 'Night Takeoffs/Landings (90 days)', days: 90 },
]

const EASA_RULES = [
  { code: 'EASA-SEP', name: 'SEP Revalidation (12 months)', days: 365 },
  { code: 'EASA-LPC', name: 'LPC/OPC (12 months)', days: 365 },
]

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const profile = await getOrCreatePilotProfile(session.user.id)
  const statuses = await prisma.currencyStatus.findMany({
    where: { pilotProfileId: profile.id },
    include: { rule: true },
  })

  return NextResponse.json({ statuses })
}

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const rules = [...FAA_RULES.map((r) => ({ authority: 'FAA', ...r })), ...EASA_RULES.map((r) => ({ authority: 'EASA', ...r }))]

  for (const rule of rules) {
    await prisma.currencyRule.upsert({
      where: { code: rule.code },
      create: {
        authority: rule.authority,
        code: rule.code,
        name: rule.name,
        ruleJson: JSON.stringify({ days: rule.days }),
      },
      update: {},
    })
  }

  return NextResponse.json({ message: 'Currency rules seeded' })
}
