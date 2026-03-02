import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getOrCreatePilotProfile } from '@/lib/pilot-profile'
import crypto from 'crypto'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getOrCreatePilotProfile(session.user.id)
  const links = await prisma.logbookSharingLink.findMany({
    where: { pilotProfileId: profile.id },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ links })
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await request.json()
  const token = crypto.randomBytes(24).toString('hex')

  const profile = await getOrCreatePilotProfile(session.user.id)
  const link = await prisma.logbookSharingLink.create({
    data: {
      pilotProfileId: profile.id,
      token,
      label: body.label || null,
      scope: body.scope || 'public',
    },
  })

  return NextResponse.json({ link })
}

export async function PUT(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await request.json()
  const link = await prisma.logbookSharingLink.update({
    where: { id: body.id },
    data: { revokedAt: new Date() },
  })

  return NextResponse.json({ link })
}
