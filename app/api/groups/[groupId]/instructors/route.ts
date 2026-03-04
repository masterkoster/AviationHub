import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isUuid } from '@/lib/validate'

interface RouteParams {
  params: Promise<{ groupId: string }>
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { groupId } = await params
    if (!isUuid(groupId)) {
      return NextResponse.json({ error: 'Invalid groupId' }, { status: 400 })
    }

    const users = await prisma.$queryRawUnsafe(`
      SELECT id FROM [User] WHERE email = '${session.user.email}'
    `) as any[]

    if (!users || users.length === 0) {
      return NextResponse.json({ error: '[User] not found' }, { status: 404 })
    }

    const userId = users[0].id

    const memberships = await prisma.$queryRawUnsafe(`
      SELECT * FROM OrganizationMember WHERE organizationId = '${groupId}' AND userId = '${userId}'
    `) as any[]

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 })
    }

    const instructors = await prisma.$queryRawUnsafe(`
      SELECT DISTINCT u.id, u.name, u.email, ip.certificateNumber, ip.certificateType
      FROM OrganizationMember om
      JOIN [User] u ON om.userId = u.id
      JOIN InstructorProfile ip ON ip.userId = u.id
      WHERE om.organizationId = '${groupId}'
        AND ip.verificationStatus = 'verified'
    `) as any[]

    return NextResponse.json({ instructors })
  } catch (error) {
    console.error('Error fetching instructors:', error)
    return NextResponse.json({ error: 'Failed to fetch instructors' }, { status: 500 })
  }
}
