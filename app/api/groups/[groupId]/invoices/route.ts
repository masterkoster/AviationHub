import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isUuid } from '@/lib/validate';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

const MAX_ROWS = 100;

function serializeInvoice(invoice: {
  id: string;
  organizationId: string | null;
  pilotProfileId: string | null;
  billingRunId: string | null;
  totalAmount: unknown;
  status: string;
  stripePaymentId: string | null;
  pdfUrl: string | null;
  sentAt: Date | null;
  createdAt: Date;
  items: { id: string; hobbsHours: unknown; hourlyRate: unknown; amount: unknown; clubAircraft: { nNumber: string | null } | null; flightLog: { date: Date } | null }[];
  pilotProfile?: { user: { id: string; name: string | null; email: string } | null } | null;
}) {
  return {
    id: invoice.id,
    organizationId: invoice.organizationId,
    billingRunId: invoice.billingRunId,
    totalAmount: Number(invoice.totalAmount),
    status: invoice.status,
    stripePaymentId: invoice.stripePaymentId,
    pdfUrl: invoice.pdfUrl,
    sentAt: invoice.sentAt,
    createdAt: invoice.createdAt,
    items: invoice.items.map(item => ({
      id: item.id,
      hobbsHours: Number(item.hobbsHours),
      hourlyRate: Number(item.hourlyRate),
      amount: Number(item.amount),
      aircraft: item.clubAircraft?.nNumber ?? null,
      date: item.flightLog?.date ?? null,
    })),
    ...(invoice.pilotProfile !== undefined
      ? {
          member: invoice.pilotProfile?.user
            ? { id: invoice.pilotProfile.user.id, name: invoice.pilotProfile.user.name, email: invoice.pilotProfile.user.email }
            : null,
        }
      : {}),
  };
}

// GET /api/groups/[groupId]/invoices — the current member's own invoices,
// newest first. Admins may pass ?scope=all to see every member's invoices.
export async function GET(request: Request, { params }: RouteParams) {
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
      where: { organizationId: groupId, userId: session.user.id },
    });
    if (!membership) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const scope = searchParams.get('scope');

    if (scope === 'all') {
      if (membership.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
      }

      const invoices = await prisma.invoice.findMany({
        where: { organizationId: groupId },
        include: {
          items: {
            include: {
              clubAircraft: { select: { nNumber: true } },
              flightLog: { select: { date: true } },
            },
          },
          pilotProfile: { include: { user: { select: { id: true, name: true, email: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: MAX_ROWS,
      });

      return NextResponse.json(invoices.map(serializeInvoice));
    }

    const pilotProfile = await prisma.pilotProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });

    if (!pilotProfile) {
      return NextResponse.json([]);
    }

    const invoices = await prisma.invoice.findMany({
      where: { organizationId: groupId, pilotProfileId: pilotProfile.id },
      include: {
        items: {
          include: {
            clubAircraft: { select: { nNumber: true } },
            flightLog: { select: { date: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_ROWS,
    });

    return NextResponse.json(invoices.map(serializeInvoice));
  } catch (error) {
    console.error('Error fetching invoices:', error);
    return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 });
  }
}
