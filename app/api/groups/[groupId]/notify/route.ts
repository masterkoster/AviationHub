import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isUuid } from '@/lib/validate';
import { sendEmail } from '@/lib/email';
import { rateLimit } from '@/lib/rate-limit';
import { FINANCE_ROLES } from '@/lib/club/roles';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

const SUBJECT_MAX = 200;
const MESSAGE_MAX = 5000;

// POST /api/groups/[groupId]/notify — admin or treasurer: email every member
// of the club a one-off notice (used by the "Also email this notice to all
// members" option on club Updates posts).
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { groupId } = await params;
    if (!isUuid(groupId)) {
      return NextResponse.json({ error: 'Invalid groupId' }, { status: 400 });
    }

    const membership = await prisma.organizationMember.findFirst({
      where: { organizationId: groupId, userId: session.user.id, role: { in: [...FINANCE_ROLES] } },
    });
    if (!membership) {
      return NextResponse.json({ error: 'Admin or treasurer access required' }, { status: 403 });
    }

    // Abuse guard: one notify blast per club per 5 minutes. `rateLimit` is
    // the in-memory bucket from lib/rate-limit.ts — per-instance only (not
    // shared across serverless instances/regions or across a redeploy), but
    // good enough to stop accidental double-sends/rapid-fire abuse here.
    const rl = rateLimit({ key: `notify:${groupId}`, limit: 1, windowMs: 5 * 60 * 1000 });
    if (!rl.ok) {
      return NextResponse.json({ error: 'A notice was already sent recently for this club. Try again in a few minutes.' }, { status: 429 });
    }

    const body = await request.json().catch(() => ({}));
    const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
    const message = typeof body.message === 'string' ? body.message.trim() : '';

    if (!subject) {
      return NextResponse.json({ error: 'Subject is required' }, { status: 400 });
    }
    if (subject.length > SUBJECT_MAX) {
      return NextResponse.json({ error: `Subject must be ${SUBJECT_MAX} characters or fewer` }, { status: 400 });
    }
    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }
    if (message.length > MESSAGE_MAX) {
      return NextResponse.json({ error: `Message must be ${MESSAGE_MAX} characters or fewer` }, { status: 400 });
    }

    const club = await prisma.organization.findUnique({ where: { id: groupId }, select: { name: true } });
    const clubName = club?.name || 'Your Flying Club';

    const members = await prisma.organizationMember.findMany({
      where: { organizationId: groupId },
      include: { user: { select: { email: true, name: true } } },
    });

    const recipients = members.filter(m => !!m.user?.email);

    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>${subject}</h2>
        <p style="white-space: pre-wrap;">${message}</p>
        <p style="color: #666; font-size: 12px; margin-top: 30px;">Sent by an admin of ${clubName}.</p>
      </div>
    `;

    let sent = 0;
    let failed = 0;

    for (const member of recipients) {
      const result = await sendEmail(member.user.email, `[${clubName}] ${subject}`, html);
      if (result.success) sent += 1;
      else failed += 1;
    }

    return NextResponse.json({ sent, failed });
  } catch (error) {
    console.error('Error sending club notice:', error);
    return NextResponse.json({ error: 'Failed to send notice' }, { status: 500 });
  }
}
