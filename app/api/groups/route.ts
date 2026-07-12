import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

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
    const { name } = body

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Group name is required' }, { status: 400 })
    }

    const orgId = crypto.randomUUID()
    const memberId = crypto.randomUUID()
    const orgName = name.trim()

    await prisma.$executeRaw`
      INSERT INTO [Organization] (id, name, type, ownerId, createdAt, updatedAt)
      VALUES (${orgId}, ${orgName}, 'club', ${userId}, GETDATE(), GETDATE())
    `

    await prisma.$executeRaw`
      INSERT INTO [OrganizationMember] (id, organizationId, userId, role, joinedAt)
      VALUES (${memberId}, ${orgId}, ${userId}, 'ADMIN', GETDATE())
    `

    return NextResponse.json({
      id: orgId,
      name: orgName,
      type: 'club',
      ownerId: userId,
      role: 'ADMIN',
      aircraft: []
    })
  } catch (error) {
    console.error('Error creating group:', error)
    return NextResponse.json({ error: 'Failed to create group', details: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
