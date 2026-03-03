import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  // Get pilot profile for the user
  const pilotProfile = await prisma.pilotProfile.findUnique({
    where: { userId: session.user.id },
  })

  if (!pilotProfile) {
    return NextResponse.json({ aircraft: [] })
  }

  const aircraft = await prisma.aircraftProfile.findMany({
    where: { pilotProfileId: pilotProfile.id },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ aircraft })
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await request.json()
  if (!body.nNumber) return NextResponse.json({ error: 'N-Number required' }, { status: 400 })

  // Get or create pilot profile for the user
  const pilotProfile = await prisma.pilotProfile.upsert({
    where: { userId: session.user.id },
    update: {},
    create: { userId: session.user.id },
  })

  const created = await prisma.aircraftProfile.create({
    data: {
      pilotProfileId: pilotProfile.id,
      nNumber: body.nNumber,
      nickname: body.nickname || null,
      categoryClass: body.categoryClass || null,
      engineType: body.engineType || null,
      notes: body.notes || null,
    },
  })

  return NextResponse.json({ aircraft: created })
}
