import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendQuoteStatusEmail } from '@/lib/email'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { status } = body || {}

    if (!status || !['ACCEPTED', 'DECLINED'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    // Get the user's pilot profile to compare
    const pilotProfile = await prisma.pilotProfile.findUnique({
      where: { userId: session.user.id },
    })

    const quote = await prisma.mechanicQuote.findUnique({
      where: { id },
      include: { maintenanceRequest: true, mechanic: true },
    })

    if (!quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
    }

    if (quote.maintenanceRequest.postedByPilotId !== pilotProfile?.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const updated = await prisma.mechanicQuote.update({
      where: { id },
      data: { status },
    })

    if (status === 'ACCEPTED') {
      await prisma.maintenanceRequest.update({
        where: { id: quote.maintenanceRequestId },
        data: { status: 'ACCEPTED' },
      })
    }

    if (quote.mechanic?.email) {
      await sendQuoteStatusEmail(quote.mechanic.email, quote.maintenanceRequest.title, status)
    }

    return NextResponse.json({ quote: updated })
  } catch (error) {
    console.error('Failed to update quote status', error)
    return NextResponse.json({ error: 'Failed to update quote status' }, { status: 500 })
  }
}
