import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isUuid } from '@/lib/validate';
import { runBillingCycle } from '@/lib/billing';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

// POST /api/clubs/[groupId]/billing/run - Run monthly billing cycle (admin only)
// Statement emails (per the club's emailStatements policy) are sent inside
// runBillingCycle itself via lib/email.ts — see lib/billing.ts.
export async function POST(_request: Request, { params }: RouteParams) {
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
      where: { organizationId: groupId, userId: session.user.id, role: 'ADMIN' },
    });

    if (!membership) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    console.log('Starting billing cycle for group:', groupId);
    const results = await runBillingCycle(groupId);
    console.log('Billing cycle complete:', results.length, 'members processed');

    return NextResponse.json({
      success: true,
      summary: {
        totalMembers: results.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        totalAmount: results.reduce((sum, r) => sum + r.amount, 0),
        emailsSent: results.filter(r => r.emailSent === true).length,
        emailsFailed: results.filter(r => r.emailSent === false).length,
      },
      results,
    });
  } catch (error) {
    console.error('Error running billing:', error);
    return NextResponse.json({ error: 'Failed to run billing' }, { status: 500 });
  }
}
