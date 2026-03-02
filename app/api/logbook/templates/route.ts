import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getOrCreatePilotProfile } from '@/lib/pilot-profile'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getOrCreatePilotProfile(session.user.id)
  const templates = await prisma.logbookTemplate.findMany({
    where: { pilotProfileId: profile.id },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ templates })
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await request.json()
  const profile = await getOrCreatePilotProfile(session.user.id)
  const template = await prisma.logbookTemplate.create({
    data: {
      pilotProfileId: profile.id,
      name: body.name,
      description: body.description || null,
      fieldsJson: body.fieldsJson || null,
    },
  })

  return NextResponse.json({ template })
}
