import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getOrCreatePilotProfile } from '@/lib/pilot-profile'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getOrCreatePilotProfile(session.user.id)
  const deadlines = await prisma.logbookDeadline.findMany({
    where: { pilotProfileId: profile.id },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ deadlines })
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await request.json()
  const profile = await getOrCreatePilotProfile(session.user.id)
  const deadline = await prisma.logbookDeadline.create({
    data: {
      pilotProfileId: profile.id,
      name: body.name,
      aircraftId: body.aircraftId || null,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      dueHours: body.dueHours || null,
      hourType: body.hourType || null,
      notes: body.notes || null,
    },
  })

  return NextResponse.json({ deadline })
}
