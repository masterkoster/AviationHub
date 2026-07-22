import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

type RelRow = {
  id: string;
  studentUserId: string;
  instructorUserId: string;
  initiatedBy: string;
  status: string;
};

// PATCH - respond to or close a training relationship.
// body: { action: 'accept' | 'decline' | 'end' }
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const me = session.user.id;
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const action = body?.action;
    if (!['accept', 'decline', 'end'].includes(action)) {
      return NextResponse.json({ error: 'action must be accept, decline, or end' }, { status: 400 });
    }

    const rows = await prisma.$queryRaw<RelRow[]>`
      SELECT [id], [studentUserId], [instructorUserId], [initiatedBy], [status]
      FROM [TrainingRelationship] WHERE [id] = ${id}
    `;
    const rel = rows[0];
    if (!rel) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const isStudent = rel.studentUserId === me;
    const isInstructor = rel.instructorUserId === me;
    if (!isStudent && !isInstructor) {
      return NextResponse.json({ error: 'Not your relationship.' }, { status: 403 });
    }
    const myRole = isStudent ? 'student' : 'instructor';

    if (action === 'accept' || action === 'decline') {
      if (rel.status !== 'pending') {
        return NextResponse.json({ error: 'This request is no longer pending.' }, { status: 400 });
      }
      // Only the party who did NOT send the request may respond to it.
      if (rel.initiatedBy === myRole) {
        return NextResponse.json(
          { error: 'You sent this request — the other party responds.' },
          { status: 403 }
        );
      }
      const newStatus = action === 'accept' ? 'active' : 'declined';
      await prisma.$executeRaw`
        UPDATE [TrainingRelationship] SET [status] = ${newStatus}, [updatedAt] = GETDATE() WHERE [id] = ${id}
      `;
      return NextResponse.json({ status: newStatus });
    }

    // action === 'end' — either party can end an open relationship.
    if (rel.status === 'ended' || rel.status === 'declined') {
      return NextResponse.json({ error: 'This relationship is already closed.' }, { status: 400 });
    }
    await prisma.$executeRaw`
      UPDATE [TrainingRelationship]
      SET [status] = 'ended', [endedAt] = GETDATE(), [updatedAt] = GETDATE()
      WHERE [id] = ${id}
    `;
    return NextResponse.json({ status: 'ended' });
  } catch (error) {
    console.error('Failed to update training relationship', error);
    return NextResponse.json({ error: 'Failed to update training relationship' }, { status: 500 });
  }
}
