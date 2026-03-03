import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getOrCreatePilotProfile } from '@/lib/pilot-profile'
import crypto from 'crypto'

function generateDisplayId() {
  return `LOG-${crypto.randomBytes(4).toString('hex').toUpperCase()}`
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getOrCreatePilotProfile(session.user.id)
  if (!profile.displayId) {
    const displayId = generateDisplayId()
    await prisma.pilotProfile.update({ where: { id: profile.id }, data: { displayId } })
    return NextResponse.json({ displayId })
  }

  return NextResponse.json({ displayId: profile.displayId })
}

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getOrCreatePilotProfile(session.user.id)
  const displayId = generateDisplayId()

  await prisma.pilotProfile.update({
    where: { id: profile.id },
    data: { displayId },
  })

  return NextResponse.json({ displayId })
}
