import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const displayId = searchParams.get('displayId')?.trim()

  if (!displayId) {
    return NextResponse.json({ error: 'Reference ID required' }, { status: 400 })
  }

  const profile = await prisma.pilotProfile.findUnique({
    where: { displayId },
    select: {
      id: true,
      displayId: true,
      user: { select: { name: true } },
    }
  })

  if (!profile) {
    return NextResponse.json({ error: 'No logbook found for that reference ID' }, { status: 404 })
  }

  const link = await prisma.logbookSharingLink.findFirst({
    where: { pilotProfileId: profile.id, revokedAt: null },
    orderBy: { createdAt: 'desc' }
  })

  return NextResponse.json({
    displayId: profile.displayId,
    profile: { name: profile.user?.name || 'Pilot' },
    link,
  })
}
