import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getOrCreatePilotProfile } from '@/lib/pilot-profile'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getOrCreatePilotProfile(session.user.id)
  const imports = await prisma.logbookImport.findMany({
    where: { pilotProfileId: profile.id },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ imports })
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await request.json()
  const profile = await getOrCreatePilotProfile(session.user.id)
  const created = await prisma.logbookImport.create({
    data: {
      pilotProfileId: profile.id,
      source: body.source || 'CSV',
      fileUrl: body.fileUrl || null,
      summaryJson: body.summaryJson || null,
    },
  })

  return NextResponse.json({ import: created })
}
