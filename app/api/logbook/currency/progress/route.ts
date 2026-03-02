import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getOrCreatePilotProfile } from '@/lib/pilot-profile'
import { addDays, subDays } from 'date-fns'

type ProgressRule = {
  code: string
  authority: 'FAA' | 'EASA'
  name: string
  status: 'current' | 'expiring' | 'expired'
  progress: {
    required: number
    completed: number
    unit: string
  }[]
  nextDueAt?: string | null
}

const sum = (entries: any[], field: string) => entries.reduce((acc, e) => acc + (e[field] || 0), 0)

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const now = new Date()
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { bfrExpiry: true, medicalExpiry: true },
  })

  const profile = await getOrCreatePilotProfile(session.user.id)
  const entries = await prisma.logbookEntry.findMany({
    where: { pilotProfileId: profile.id },
    orderBy: { date: 'desc' },
  })

  const endorsements = await prisma.endorsement.findMany({
    where: {
      studentId: session.user.id,
    },
    select: { signedAt: true, template: { select: { code: true } } },
    orderBy: { signedAt: 'desc' },
  })

  const lastFlightReview = endorsements.find((e) => e.template.code === 'FAA-61.56-FR')?.signedAt || null
  const flightReviewDue = user?.bfrExpiry || (lastFlightReview ? addDays(new Date(lastFlightReview), 730) : null)

  const nightCutoff = subDays(now, 90)
  const nightEntries = entries.filter((e) => new Date(e.date) >= nightCutoff)
  const nightLandings = sum(nightEntries, 'nightLandings')

  const ipcCutoff = subDays(now, 183)
  const ipcEntries = entries.filter((e) => new Date(e.date) >= ipcCutoff)
  const approaches = sum(ipcEntries, 'approaches')
  const holds = sum(ipcEntries, 'holds')
  const intercepts = sum(ipcEntries, 'intercepts')

  const sepCutoff = subDays(now, 365)
  const sepEntries = entries.filter((e) => new Date(e.date) >= sepCutoff)
  const sepTime = sum(sepEntries, 'totalTime')
  const sepLandings = sum(sepEntries, 'dayLandings') + sum(sepEntries, 'nightLandings')
  const sepInstructor = sum(sepEntries, 'dualReceived')

  const lpcEndorsement = endorsements.find((e) => e.template.code === 'EASA-LPC-OPC')?.signedAt || null
  const lpcDue = lpcEndorsement ? addDays(new Date(lpcEndorsement), 365) : null

  const progress: ProgressRule[] = [
    {
      code: 'FAA-FR',
      authority: 'FAA',
      name: 'Flight Review (24 months)',
      status: flightReviewDue ? (flightReviewDue < now ? 'expired' : 'current') : 'expired',
      nextDueAt: flightReviewDue ? flightReviewDue.toISOString() : null,
      progress: [{ required: 1, completed: flightReviewDue ? 1 : 0, unit: 'review' }],
    },
    {
      code: 'FAA-IPC',
      authority: 'FAA',
      name: 'Instrument Proficiency (6 months)',
      status: approaches >= 6 && holds >= 1 && intercepts >= 1 ? 'current' : 'expired',
      progress: [
        { required: 6, completed: approaches, unit: 'approaches' },
        { required: 1, completed: holds, unit: 'holds' },
        { required: 1, completed: intercepts, unit: 'intercepts' },
      ],
    },
    {
      code: 'FAA-NIGHT',
      authority: 'FAA',
      name: 'Night Landings (90 days)',
      status: nightLandings >= 3 ? 'current' : 'expired',
      progress: [{ required: 3, completed: nightLandings, unit: 'landings' }],
    },
    {
      code: 'FAA-MED',
      authority: 'FAA',
      name: 'Medical Certificate',
      status: user?.medicalExpiry ? (user.medicalExpiry < now ? 'expired' : 'current') : 'expired',
      nextDueAt: user?.medicalExpiry ? user.medicalExpiry.toISOString() : null,
      progress: [{ required: 1, completed: user?.medicalExpiry ? 1 : 0, unit: 'medical' }],
    },
    {
      code: 'EASA-SEP',
      authority: 'EASA',
      name: 'SEP Revalidation (12 months)',
      status: sepTime >= 12 && sepLandings >= 12 && sepInstructor >= 1 ? 'current' : 'expired',
      progress: [
        { required: 12, completed: sepTime, unit: 'hours' },
        { required: 12, completed: sepLandings, unit: 'landings' },
        { required: 1, completed: sepInstructor, unit: 'instructor hours' },
      ],
    },
    {
      code: 'EASA-LPC',
      authority: 'EASA',
      name: 'LPC/OPC (12 months)',
      status: lpcDue ? (lpcDue < now ? 'expired' : 'current') : 'expired',
      nextDueAt: lpcDue ? lpcDue.toISOString() : null,
      progress: [{ required: 1, completed: lpcDue ? 1 : 0, unit: 'check' }],
    },
  ]

  return NextResponse.json({ progress })
}
