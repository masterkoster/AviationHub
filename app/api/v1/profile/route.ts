import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// GET - Fetch profile
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, name: true, email: true, username: true, bfrExpiry: true, medicalExpiry: true, medicalClass: true, homeState: true },
    })

    const profile = await prisma.pilotProfile.findUnique({
      where: { userId: session.user.id },
      select: { homeAirport: true },
    })

    return NextResponse.json({ user, homeAirport: profile?.homeAirport || null })
  } catch (error) {
    console.error('GET /api/v1/profile error:', error)
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 })
  }
}

// PUT - Update profile
export async function PUT(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = await request.json()

    // Update user fields
    if (body.name !== undefined || body.homeAirport !== undefined || body.medicalExpiry !== undefined || body.bfrExpiry !== undefined) {
      await prisma.user.update({
        where: { id: session.user.id },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.medicalExpiry !== undefined && { medicalExpiry: body.medicalExpiry ? new Date(body.medicalExpiry) : null }),
          ...(body.medicalClass !== undefined && { medicalClass: body.medicalClass || null }),
          ...(body.bfrExpiry !== undefined && { bfrExpiry: body.bfrExpiry ? new Date(body.bfrExpiry) : null }),
        },
      })
    }

    // Update pilot profile home airport
    if (body.homeAirport !== undefined) {
      let profile = await prisma.pilotProfile.findUnique({ where: { userId: session.user.id } })
      if (!profile) {
        const crypto = await import('crypto')
        profile = await prisma.pilotProfile.create({
          data: { userId: session.user.id, displayId: `LOG-${crypto.randomBytes(4).toString('hex').toUpperCase()}`, homeAirport: body.homeAirport || null },
        })
      } else {
        await prisma.pilotProfile.update({
          where: { userId: session.user.id },
          data: { homeAirport: body.homeAirport || null },
        })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('PUT /api/v1/profile error:', error)
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
  }
}
