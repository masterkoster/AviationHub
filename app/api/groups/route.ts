import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id

    const groups = await prisma.organization.findMany({
      where: {
        members: { some: { userId } }
      },
      include: {
        aircraft: { select: { id: true, nNumber: true, nickname: true, customName: true, make: true, model: true, status: true, hourlyRate: true } },
        members: { where: { userId }, select: { role: true } }
      },
      orderBy: { createdAt: 'desc' }
    })

    const formatted = groups.map(g => ({
      id: g.id,
      name: g.name,
      type: g.type,
      ownerId: g.ownerId,
      role: g.members[0]?.role || 'MEMBER',
      aircraft: g.aircraft
    }))

    return NextResponse.json(formatted)
  } catch (error) {
    console.error('Error fetching groups:', error)
    return NextResponse.json({ error: 'Failed to fetch groups' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id
    const body = await request.json()
    const { name, type, description, website, homeAirport, sizeBracket, showOnMap } = body

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Group name is required' }, { status: 400 })
    }

    const trimmedName = name.trim()

    // Two-path creation: partnership (small co-ownership) or club (full profile)
    const groupType = type === 'partnership' ? 'partnership' : 'club'

    const SIZE_BRACKETS = ['1-5', '6-15', '16-40', '40+']
    const profile = {
      description:
        typeof description === 'string' && description.trim()
          ? description.trim().slice(0, 2000)
          : null,
      website:
        typeof website === 'string' && website.trim()
          ? website.trim().slice(0, 500)
          : null,
      homeAirport:
        typeof homeAirport === 'string' && /^[A-Za-z0-9]{3,7}$/.test(homeAirport.trim())
          ? homeAirport.trim().toUpperCase()
          : null,
      sizeBracket:
        typeof sizeBracket === 'string' && SIZE_BRACKETS.includes(sizeBracket) ? sizeBracket : null,
      // Map opt-in only makes sense for clubs with a public profile
      showOnMap: groupType === 'club' && showOnMap === true,
    }
    if (profile.website && !/^https?:\/\//i.test(profile.website)) {
      profile.website = `https://${profile.website}`
    }

    // Case-insensitive under the DB's CI collation; the unique index on
    // Organization.name is the race-safe backstop (handled in catch below)
    const existing = await prisma.organization.findFirst({
      where: { name: trimmedName },
      select: { id: true },
    })
    if (existing) {
      return NextResponse.json(
        { error: `A group named "${trimmedName}" already exists` },
        { status: 409 }
      )
    }

    const group = await prisma.organization.create({
      data: {
        name: trimmedName,
        ownerId: userId,
        type: groupType,
        ...profile,
      },
    })

    await prisma.organizationMember.create({
      data: {
        userId: userId,
        organizationId: group.id,
        role: 'ADMIN',
      },
    })

    return NextResponse.json({
      id: group.id,
      name: group.name,
      type: group.type,
      ownerId: group.ownerId,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
      role: 'ADMIN',
      aircraft: []
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'A group with this name already exists' }, { status: 409 })
    }
    console.error('Error creating group:', error)
    return NextResponse.json({ error: 'Failed to create group' }, { status: 500 })
  }
}
