import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Returns the current user's issued endorsements — both the ones they
// received as a student and the ones they signed as an instructor.
// Enrichment (template/user/signature) is done with batched `in` queries
// instead of Prisma `include` so this stays a fixed number of round-trips
// regardless of how many endorsements come back.
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  const me = session.user.id

  const endorsements = await prisma.endorsement.findMany({
    where: { OR: [{ studentId: me }, { instructorId: me }] },
    orderBy: { signedAt: 'desc' },
  })

  if (endorsements.length === 0) {
    return NextResponse.json({ endorsements: [] })
  }

  const templateIds = Array.from(new Set(endorsements.map((e) => e.templateId)))
  const userIds = Array.from(
    new Set(endorsements.flatMap((e) => [e.studentId, e.instructorId]))
  )
  const signatureIds = Array.from(new Set(endorsements.map((e) => e.signatureId)))

  const [templates, users, signatures] = await Promise.all([
    prisma.endorsementTemplate.findMany({
      where: { id: { in: templateIds } },
      select: { id: true, code: true, category: true, name: true },
    }),
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, username: true },
    }),
    prisma.signature.findMany({
      where: { id: { in: signatureIds } },
      select: { id: true, type: true, typedName: true, svgData: true },
    }),
  ])

  const templateMap = new Map(templates.map((t) => [t.id, t]))
  const userMap = new Map(users.map((u) => [u.id, u]))
  const signatureMap = new Map(signatures.map((s) => [s.id, s]))

  const result = endorsements.map((e) => {
    const template = templateMap.get(e.templateId)
    const student = userMap.get(e.studentId)
    const instructor = userMap.get(e.instructorId)
    const signature = signatureMap.get(e.signatureId)

    return {
      id: e.id,
      myRole: e.studentId === me ? ('student' as const) : ('instructor' as const),
      template: template
        ? { code: template.code, category: template.category, title: template.name }
        : null,
      studentName: student?.name || student?.username || null,
      instructorName: instructor?.name || instructor?.username || null,
      signedAt: e.signedAt,
      notes: e.notes,
      signature: signature
        ? { type: signature.type, typedName: signature.typedName, svgData: signature.svgData }
        : null,
    }
  })

  return NextResponse.json({ endorsements: result })
}
