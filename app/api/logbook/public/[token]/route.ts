import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 })

  const link = await prisma.logbookSharingLink.findUnique({
    where: { token },
  })

  if (!link || link.revokedAt) {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 })
  }

  const profile = await prisma.pilotProfile.findUnique({
    where: { id: link.pilotProfileId },
    select: {
      id: true,
      displayId: true,
      user: { select: { name: true } },
    }
  })

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  const entries = await prisma.logbookEntry.findMany({
    where: {
      pilotProfileId: link.pilotProfileId,
      isVoided: false,
    },
    orderBy: { date: 'desc' },
    take: link.scope === 'public' ? 200 : 0,
  })

  const totals = entries.reduce((acc: any, e: any) => ({
    totalTime: acc.totalTime + (parseFloat(e.totalTime) || 0),
    picTime: acc.picTime + (parseFloat(e.picTime) || 0),
    nightTime: acc.nightTime + (parseFloat(e.nightTime) || 0),
    instrumentTime: acc.instrumentTime + (parseFloat(e.instrumentTime) || 0),
  }), { totalTime: 0, picTime: 0, nightTime: 0, instrumentTime: 0 })

  return NextResponse.json({
    scope: link.scope,
    profile: { name: profile.user?.name || 'Pilot', displayId: profile.displayId },
    entries: link.scope === 'public' ? entries : [],
    totals,
  })
}
