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

function money(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Merge tokens supported in subject/message: {name}, {balance}, {club}.
function applyMergeTokens(text: string, tokens: { name: string; balance: string; club: string }): string {
  return text
    .replace(/\{name\}/g, tokens.name)
    .replace(/\{balance\}/g, tokens.balance)
    .replace(/\{club\}/g, tokens.club);
}

// POST /api/groups/[groupId]/notify — admin or treasurer: email members of
// the club a one-off notice, or a personalized billing reminder.
//  - `userIds` (optional): restrict recipients to these member userIds
//    (invalid/non-member ids are silently dropped). Omitted = every member.
//  - `template` (optional): 'notice' (default, current behavior) or
//    'billing-reminder' (per-recipient {name}/{balance}/{club} merge tokens;
//    members with a zero outstanding balance are skipped).
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

    // Abuse guard: up to 3 notify sends per club per 5 minutes. `rateLimit`
    // is the in-memory bucket from lib/rate-limit.ts — per-instance only
    // (not shared across serverless instances/regions or across a
    // redeploy), but good enough to stop rapid-fire abuse here. Raised from
    // 1 to 3 now that the finance console sends small, targeted batches
    // (e.g. a notice followed by a billing reminder to a different subset)
    // rather than only one club-wide blast at a time.
    const rl = rateLimit({ key: `notify:${groupId}`, limit: 3, windowMs: 5 * 60 * 1000 });
    if (!rl.ok) {
      return NextResponse.json({ error: 'Too many notices sent recently for this club. Try again in a few minutes.' }, { status: 429 });
    }

    const body = await request.json().catch(() => ({}));
    const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const template = body.template === 'billing-reminder' ? 'billing-reminder' : 'notice';
    const requestedUserIds: string[] = Array.isArray(body.userIds)
      ? body.userIds.filter((id: unknown): id is string => typeof id === 'string' && isUuid(id))
      : [];

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
      include: { user: { select: { id: true, email: true, name: true } } },
    });

    // userIds present (even if every id was invalid/non-member and got
    // filtered out) restricts recipients to that set; omitted = everyone.
    const hasUserIdsFilter = Array.isArray(body.userIds) && body.userIds.length > 0;
    const targeted = hasUserIdsFilter
      ? members.filter(m => requestedUserIds.includes(m.userId))
      : members;

    const recipients = targeted.filter(m => !!m.user?.email);

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    if (template === 'billing-reminder') {
      const userIds = recipients.map(m => m.userId);
      const pilotProfiles = userIds.length
        ? await prisma.pilotProfile.findMany({ where: { userId: { in: userIds } }, select: { id: true, userId: true } })
        : [];
      const pilotProfileIdByUserId = new Map(pilotProfiles.map(p => [p.userId, p.id]));
      const pilotProfileIds = pilotProfiles.map(p => p.id);

      const pendingInvoices = pilotProfileIds.length
        ? await prisma.invoice.findMany({
            where: { organizationId: groupId, pilotProfileId: { in: pilotProfileIds }, status: 'pending' },
            select: { pilotProfileId: true, totalAmount: true },
          })
        : [];

      const outstandingByPilotProfileId = new Map<string, number>();
      for (const invoice of pendingInvoices) {
        if (!invoice.pilotProfileId) continue;
        outstandingByPilotProfileId.set(
          invoice.pilotProfileId,
          (outstandingByPilotProfileId.get(invoice.pilotProfileId) ?? 0) + Number(invoice.totalAmount)
        );
      }

      for (const member of recipients) {
        const pilotProfileId = pilotProfileIdByUserId.get(member.userId);
        const outstanding = pilotProfileId ? outstandingByPilotProfileId.get(pilotProfileId) ?? 0 : 0;

        if (outstanding <= 0) {
          skipped += 1;
          continue;
        }

        const tokens = { name: member.user.name || 'Member', balance: money(outstanding), club: clubName };
        const personalizedSubject = applyMergeTokens(subject, tokens);
        const personalizedMessage = applyMergeTokens(message, tokens);

        const html = `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>${personalizedSubject}</h2>
            <p style="white-space: pre-wrap;">${personalizedMessage}</p>
            <p style="color: #666; font-size: 12px; margin-top: 30px;">Sent by an admin of ${clubName}.</p>
          </div>
        `;

        const result = await sendEmail(member.user.email, `[${clubName}] ${personalizedSubject}`, html);
        if (result.success) sent += 1;
        else failed += 1;
      }

      return NextResponse.json({ sent, failed, skipped });
    }

    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>${subject}</h2>
        <p style="white-space: pre-wrap;">${message}</p>
        <p style="color: #666; font-size: 12px; margin-top: 30px;">Sent by an admin of ${clubName}.</p>
      </div>
    `;

    for (const member of recipients) {
      const result = await sendEmail(member.user.email, `[${clubName}] ${subject}`, html);
      if (result.success) sent += 1;
      else failed += 1;
    }

    return NextResponse.json({ sent, failed, skipped });
  } catch (error) {
    console.error('Error sending club notice:', error);
    return NextResponse.json({ error: 'Failed to send notice' }, { status: 500 });
  }
}
