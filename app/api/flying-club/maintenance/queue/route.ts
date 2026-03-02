import { NextResponse } from 'next/server'
import { auth, prisma } from '@/lib/auth'

async function hasMaintenanceAccess(userId: string, groupId: string) {
  const member = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: groupId, userId } },
  })

  if (member?.role === 'ADMIN' || member?.role === 'OWNER') return true

  return false
}

export async function GET(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const groupId = url.searchParams.get('groupId')
    if (!groupId) {
      return NextResponse.json({ error: 'Group required' }, { status: 400 })
    }

    if (!await hasMaintenanceAccess(session.user.id, groupId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const queue = await prisma.$queryRaw`
      SELECT TOP 200 * FROM Maintenance WHERE organizationId = ${groupId} ORDER BY reportedDate DESC
    `

    return NextResponse.json({ queue })
  } catch (error) {
    console.error('Failed to load maintenance queue', error)
    return NextResponse.json({ error: 'Failed to load maintenance queue' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { description, aircraftLabel, isGrounded, neededBy, jobSize, allowTailNumber, groupId } = body || {}

    if (!description || !groupId) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    await prisma.$executeRaw`
      INSERT INTO Maintenance (id, clubAircraftId, reportedByUserId, organizationId, description, notes, status, isGrounded, reportedDate, createdAt, updatedAt)
      VALUES (NEWID(), NULL, ${session.user.id}, ${groupId}, ${description}, ${aircraftLabel || null}, 'NEEDED', ${isGrounded ? 1 : 0}, GETDATE(), GETDATE(), GETDATE())
    `

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to add to maintenance queue', error)
    return NextResponse.json({ error: 'Failed to add to queue' }, { status: 500 })
  }
}
