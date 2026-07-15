import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { runBillingCycle } from '@/lib/billing';

// POST /api/cron/billing — PUBLIC BY DESIGN. No session; the caller is a
// scheduled job (see .github/workflows/billing-cron.yml), authenticated by a
// shared secret in the x-cron-secret header (constant-time-ish strict
// equality check — this is a low-value secret, not a signing key).
//
// For every club whose ClubPolicy.billingDayOfMonth matches today's UTC
// day-of-month, runs a billing cycle unless that club already started one
// this UTC calendar month. Runs generate pending invoices only — no platform
// charges (see lib/billing.ts).
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'Cron not configured' }, { status: 503 });
  }

  const provided = request.headers.get('x-cron-secret');
  if (provided !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();
    const todayUtcDay = now.getUTCDate();
    const monthStartUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    // billingDayOfMonth predates the generated Prisma Client — read via raw SQL.
    const dueRows = await prisma.$queryRaw<{ organizationId: string }[]>`
      SELECT organizationId FROM ClubPolicy WHERE billingDayOfMonth = ${todayUtcDay}
    `;

    const results: {
      organizationId: string;
      clubName: string | null;
      ran: boolean;
      reason?: string;
      summary?: { totalMembers: number; successful: number; failed: number; totalAmount: number; emailsSent: number; emailsFailed: number };
      error?: string;
    }[] = [];

    for (const { organizationId } of dueRows) {
      const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } });

      const existingRun = await prisma.billingRun.findFirst({
        where: { organizationId, startedAt: { gte: monthStartUtc } },
        select: { id: true },
      });

      if (existingRun) {
        results.push({ organizationId, clubName: org?.name ?? null, ran: false, reason: 'already run this month' });
        continue;
      }

      try {
        const billingResults = await runBillingCycle(organizationId);
        results.push({
          organizationId,
          clubName: org?.name ?? null,
          ran: true,
          summary: {
            totalMembers: billingResults.length,
            successful: billingResults.filter(r => r.success).length,
            failed: billingResults.filter(r => !r.success).length,
            totalAmount: billingResults.reduce((sum, r) => sum + r.amount, 0),
            emailsSent: billingResults.filter(r => r.emailSent === true).length,
            emailsFailed: billingResults.filter(r => r.emailSent === false).length,
          },
        });
      } catch (err) {
        console.error(`[cron/billing] Failed to run billing for org ${organizationId}:`, err);
        results.push({
          organizationId,
          clubName: org?.name ?? null,
          ran: false,
          error: err instanceof Error ? err.message : 'Billing run failed',
        });
      }
    }

    return NextResponse.json({ checked: dueRows.length, results });
  } catch (error) {
    console.error('Error in cron billing run:', error);
    return NextResponse.json({ error: 'Cron billing run failed' }, { status: 500 });
  }
}
