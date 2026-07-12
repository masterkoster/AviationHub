import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isUuid } from '@/lib/validate';
import { runBillingCycle } from '@/lib/billing';
import { sendInvoiceEmail } from '@/lib/resend';
import { generateInvoicePDF } from '@/lib/invoice';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

// POST /api/clubs/[groupId]/billing/run - Run monthly billing cycle (admin only)
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

    const club = await prisma.organization.findUnique({ where: { id: groupId }, select: { name: true } });
    const clubName = club?.name || 'Your Flying Club';

    console.log('Starting billing cycle for group:', groupId);
    const results = await runBillingCycle(groupId);
    console.log('Billing cycle complete:', results.length, 'members processed');

    // Send invoice emails (only for successful charges)
    for (const result of results) {
      if (!result.success || !result.invoiceId) continue;

      try {
        const invoiceItems = await prisma.invoiceItem.findMany({
          where: { invoiceId: result.invoiceId },
          include: { flightLog: { select: { date: true } }, clubAircraft: { select: { nNumber: true } } },
        });

        const pdfBuffer = await generateInvoicePDF({
          id: result.invoiceId,
          clubName,
          memberName: result.name,
          memberEmail: result.email,
          date: new Date().toLocaleDateString(),
          items: invoiceItems.map(item => ({
            date: item.flightLog?.date ? new Date(item.flightLog.date).toLocaleDateString() : '',
            aircraft: item.clubAircraft?.nNumber || '',
            hobbsHours: Number(item.hobbsHours),
            hourlyRate: Number(item.hourlyRate),
            amount: Number(item.amount),
          })),
          totalAmount: result.amount,
        });

        await sendInvoiceEmail({
          to: result.email,
          clubName,
          memberName: result.name,
          totalAmount: result.amount,
          invoiceId: result.invoiceId,
          pdfBuffer,
        });
      } catch (emailError) {
        console.error('Failed to send invoice email for', result.email, emailError);
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        totalMembers: results.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        totalAmount: results.reduce((sum, r) => sum + r.amount, 0),
      },
      results,
    });
  } catch (error) {
    console.error('Error running billing:', error);
    return NextResponse.json({ error: 'Failed to run billing' }, { status: 500 });
  }
}
