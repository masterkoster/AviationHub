import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// TrainingRelationship is a raw-SQL-only table (not in the generated client).
// studentUserId / instructorUserId are User ids, matching the endorsement flow.

type RelRow = {
  id: string;
  studentUserId: string;
  instructorUserId: string;
  organizationId: string | null;
  status: string;
  initiatedBy: string;
  goal: string | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  endedAt: Date | null;
};

// GET - the current user's training relationships (as student and/or instructor).
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const me = session.user.id;

    const rows = await prisma.$queryRaw<RelRow[]>`
      SELECT [id], [studentUserId], [instructorUserId], [organizationId], [status],
             [initiatedBy], [goal], [note], [createdAt], [updatedAt], [endedAt]
      FROM [TrainingRelationship]
      WHERE [studentUserId] = ${me} OR [instructorUserId] = ${me}
      ORDER BY [createdAt] DESC
    `;

    const otherIds = Array.from(
      new Set(rows.map((r) => (r.studentUserId === me ? r.instructorUserId : r.studentUserId)))
    );
    const users = otherIds.length
      ? await prisma.user.findMany({
          where: { id: { in: otherIds } },
          select: { id: true, name: true, username: true },
        })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));

    const relationships = rows.map((r) => {
      const myRole = r.studentUserId === me ? 'student' : 'instructor';
      const otherId = myRole === 'student' ? r.instructorUserId : r.studentUserId;
      const u = byId.get(otherId);
      return {
        id: r.id,
        myRole,
        counterpart: { userId: otherId, name: u?.name ?? null, username: u?.username ?? null },
        organizationId: r.organizationId,
        status: r.status,
        initiatedBy: r.initiatedBy,
        goal: r.goal,
        note: r.note,
        createdAt: r.createdAt,
        endedAt: r.endedAt,
        // The counterpart (not the initiator) responds to a pending request.
        canRespond: r.status === 'pending' && r.initiatedBy !== myRole,
      };
    });

    return NextResponse.json({ relationships });
  } catch (error) {
    console.error('Failed to list training relationships', error);
    return NextResponse.json({ error: 'Failed to list training relationships' }, { status: 500 });
  }
}

// POST - request/invite a training relationship.
// body: { counterpartUserId, myRole: 'student'|'instructor', organizationId?, goal?, note? }
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const me = session.user.id;

    const body = await request.json().catch(() => ({}));
    const counterpartUserId = typeof body?.counterpartUserId === 'string' ? body.counterpartUserId : '';
    const myRole = body?.myRole === 'instructor' ? 'instructor' : body?.myRole === 'student' ? 'student' : '';
    const organizationId = typeof body?.organizationId === 'string' ? body.organizationId : null;
    const goal = typeof body?.goal === 'string' ? body.goal.trim().slice(0, 100) : null;
    const note = typeof body?.note === 'string' ? body.note.trim() : null;

    if (!counterpartUserId || !myRole) {
      return NextResponse.json({ error: 'counterpartUserId and myRole are required' }, { status: 400 });
    }
    if (counterpartUserId === me) {
      return NextResponse.json({ error: "You can't train with yourself." }, { status: 400 });
    }

    const studentUserId = myRole === 'student' ? me : counterpartUserId;
    const instructorUserId = myRole === 'instructor' ? me : counterpartUserId;

    const other = await prisma.user.findUnique({ where: { id: counterpartUserId }, select: { id: true } });
    if (!other) {
      return NextResponse.json({ error: 'That user was not found.' }, { status: 404 });
    }

    // The instructor side must be a registered instructor.
    const instructorProfile = await prisma.instructorProfile.findUnique({
      where: { userId: instructorUserId },
      select: { id: true },
    });
    if (!instructorProfile) {
      return NextResponse.json(
        {
          error:
            myRole === 'instructor'
              ? 'Register your instructor certificate before taking students.'
              : "That user isn't registered as an instructor.",
        },
        { status: 400 }
      );
    }

    // Don't allow duplicate open relationships for the same pair.
    const existing = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT TOP 1 [id] FROM [TrainingRelationship]
      WHERE [studentUserId] = ${studentUserId} AND [instructorUserId] = ${instructorUserId}
        AND [status] IN ('pending','active')
    `;
    if (existing.length > 0) {
      return NextResponse.json({ error: 'A request or active relationship already exists.' }, { status: 409 });
    }

    const id = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO [TrainingRelationship]
        ([id],[studentUserId],[instructorUserId],[organizationId],[status],[initiatedBy],[goal],[note],[createdAt],[updatedAt])
      VALUES
        (${id}, ${studentUserId}, ${instructorUserId}, ${organizationId}, 'pending', ${myRole}, ${goal}, ${note}, GETDATE(), GETDATE())
    `;

    return NextResponse.json({ id, status: 'pending' }, { status: 201 });
  } catch (error) {
    console.error('Failed to create training relationship', error);
    return NextResponse.json({ error: 'Failed to create training relationship' }, { status: 500 });
  }
}
