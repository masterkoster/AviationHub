import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ENDORSEMENT_TEMPLATES } from '@/lib/endorsements/templates'

// Seeds the global endorsement template library. Admin-only: this is a
// one-time data-loading operation, not something regular users should
// be able to trigger.
export async function POST() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const role = (session.user as any)?.role
    if (role !== 'admin' && role !== 'owner') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const existing = await prisma.endorsementTemplate.findFirst()
    if (existing) {
      return NextResponse.json({ message: 'Templates already seeded' })
    }

    await prisma.endorsementTemplate.createMany({
      data: ENDORSEMENT_TEMPLATES.map((tpl) => ({
        authority: tpl.authority,
        name: tpl.name,
        code: tpl.code,
        category: tpl.category,
        text: tpl.text,
      })),
    })

    return NextResponse.json({ message: 'Templates seeded' })
  } catch (error) {
    console.error('Failed to seed endorsements', error)
    return NextResponse.json({ error: 'Failed to seed templates' }, { status: 500 })
  }
}

export async function GET() {
  const templates = await prisma.endorsementTemplate.findMany({
    orderBy: [{ authority: 'asc' }, { name: 'asc' }],
  })
  return NextResponse.json({ templates })
}
