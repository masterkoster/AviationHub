import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    
    // Get the user's pilot profile to compare
    const pilotProfile = await prisma.pilotProfile.findUnique({
      where: { userId: session.user.id },
    })

    const listing = await prisma.maintenanceRequest.findUnique({ where: { id } })

    if (!listing || listing.postedByPilotId !== pilotProfile?.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const updated = await prisma.maintenanceRequest.update({
      where: { id },
      data: { status: 'REVOKED' },
    })

    return NextResponse.json({ listing: updated })
  } catch (error) {
    console.error('Failed to revoke listing', error)
    return NextResponse.json({ error: 'Failed to revoke listing' }, { status: 500 })
  }
}
