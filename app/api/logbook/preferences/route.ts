import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getOrCreatePilotProfile } from '@/lib/pilot-profile'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const profile = await getOrCreatePilotProfile(session.user.id)
  const prefs = await prisma.logbookPreferences.findUnique({
    where: { pilotProfileId: profile.id },
  })

  return NextResponse.json({ preferences: prefs })
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const body = await request.json()

  const profile = await getOrCreatePilotProfile(session.user.id)
  const prefs = await prisma.logbookPreferences.upsert({
    where: { pilotProfileId: profile.id },
    create: {
      pilotProfileId: profile.id,
      ...body,
    },
    update: {
      ...body,
    },
  })

  return NextResponse.json({ preferences: prefs })
}
