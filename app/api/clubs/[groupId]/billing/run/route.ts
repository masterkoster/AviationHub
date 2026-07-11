import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { runBillingCycle } from '@/lib/billing';
import { sendInvoiceEmail } from '@/lib/resend';
import { generateInvoicePDF, generateSimpleInvoiceHTML } from '@/lib/invoice';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { isUuid } from '@/lib/validate';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

// POST /api/clubs/[groupId]/billing/run - Run monthly billing cycle
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { groupId } = await params;

    if (!isUuid(groupId)) {
      return NextResponse.json({ error: 'Invalid groupId' }, { status: 400 });
    }

    // Verify admin
    const user = await prisma.$queryRaw`
      SELECT id FROM [User] WHERE email = ${session.user.email}
    ` as any[];

    if (!user || user.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userId = user[0].id;

    const memberships = await prisma.$queryRaw`
      SELECT role FROM GroupMember WHERE groupId = ${groupId} AND userId = ${userId}
    ` as any[];

    if (!memberships || memberships.length === 0 || memberships[0].role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Get club name
    const club = await prisma.$queryRaw`
      SELECT name FROM FlyingGroup WHERE id = ${groupId}
    ` as any[];

    const clubName = club && club.length > 0 ? club[0].name : 'Your Flying Club';

    // Run the billing cycle
    console.log('Starting billing cycle for group:', groupId);
    const results = await runBillingCycle(groupId);
    console.log('Billing cycle complete:', results.length, 'members processed');

    // Send invoice emails (only for successful charges)
    for (const result of results) {
      if (result.success && result.invoiceId) {
        // Get invoice details
        const invoiceItems = await prisma.$queryRaw`
          SELECT
            fl.date, a.nNumber, fl.hobbsTime, a.hourlyRate,
            fl.hobbsTime * a.hourlyRate as amount
          FROM InvoiceItem ii
          JOIN FlightLog fl ON ii.flightLogId = fl.id
          JOIN ClubAircraft a ON ii.aircraftId = a.id
          WHERE ii.invoiceId = ${result.invoiceId}
        ` as any[];

        const pdfBuffer = await generateInvoicePDF({
          id: result.invoiceId,
          clubName,
          memberName: result.name,
          memberEmail: result.email,
          date: new Date().toLocaleDateString(),
          items: invoiceItems.map((item: any) => ({
            date: new Date(item.date).toLocaleDateString(),
            aircraft: item.nNumber,
            hobbsHours: parseFloat(item.hobbsTime),
            hourlyRate: parseFloat(item.hourlyRate),
            amount: parseFloat(item.amount),
          })),
          totalAmount: result.amount,
        });

        // Save PDF temporarily
        const pdfPath = join('/tmp', `invoice-${result.invoiceId}.pdf`);
        writeFileSync(pdfPath, pdfBuffer);

        // Send email
        await sendInvoiceEmail({
          to: result.email,
          clubName,
          memberName: result.name,
          totalAmount: result.amount,
          invoiceId: result.invoiceId,
          pdfBuffer,
        });
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
