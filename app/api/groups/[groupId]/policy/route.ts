import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isUuid } from '@/lib/validate';
import { normalizePolicy } from '@/lib/club/policy';

interface RouteParams {
  params: Promise<{ groupId: string }>;
}

// GET — the club's effective booking policy (defaults when no row exists).
export async function GET(_request: Request, { params }: RouteParams) {
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
      select: { role: true },
    });
    if (!membership) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }

    const row = await prisma.clubPolicy.findUnique({ where: { organizationId: groupId } });
    return NextResponse.json(normalizePolicy(row as Record<string, unknown> | null));
  } catch (error) {
    console.error('Error fetching policy:', error);
    return NextResponse.json({ error: 'Failed to fetch policy' }, { status: 500 });
  }
}

// PUT — upsert the club's booking policy (admin only).
export async function PUT(request: Request, { params }: RouteParams) {
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
      select: { role: true },
    });
    if (!membership) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }
    if (membership.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();

    // Positive number or null (clears the limit).
    const posNumOrNull = (v: unknown): number | null => {
      if (v === null || v === undefined || v === '') return null;
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? n : null;
    };

    const data = {
      maxBookingHours: posNumOrNull(body.maxBookingHours),
      maxAdvanceDays:
        body.maxAdvanceDays == null || body.maxAdvanceDays === ''
          ? null
          : Math.max(0, Math.round(Number(body.maxAdvanceDays))),
      minBookingNoticeHours: posNumOrNull(body.minBookingNoticeHours),
      blockOnOverdueInspection: body.blockOnOverdueInspection !== false,
      blockOnGroundedSquawk: body.blockOnGroundedSquawk !== false,
      requireCurrencyToBook: body.requireCurrencyToBook === true,
      blockOnUnpaidBalance: body.blockOnUnpaidBalance === true,
    };

    const saved = await prisma.clubPolicy.upsert({
      where: { organizationId: groupId },
      create: { organizationId: groupId, ...data },
      update: data,
    });

    return NextResponse.json(normalizePolicy(saved as Record<string, unknown>));
  } catch (error) {
    console.error('Error saving policy:', error);
    return NextResponse.json({ error: 'Failed to save policy' }, { status: 500 });
  }
}
