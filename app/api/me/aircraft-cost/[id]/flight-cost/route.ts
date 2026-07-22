import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { findProfileById, serializeProfile } from '@/lib/cost/repo';
import { flightCost } from '@/lib/cost/aircraft-cost';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const row = await findProfileById(prisma, id);
    if (!row || row.userId !== session.user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const profile = serializeProfile(row);
    const body = await request.json().catch(() => ({}));

    const hours = Number(body?.hours);
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
      return NextResponse.json({ error: 'hours must be a number greater than 0 and at most 24' }, { status: 400 });
    }

    const actualFuelCost =
      body?.actualFuelCost === undefined || body?.actualFuelCost === null
        ? null
        : Number(body.actualFuelCost);
    if (actualFuelCost !== null && (!Number.isFinite(actualFuelCost) || actualFuelCost < 0)) {
      return NextResponse.json({ error: 'actualFuelCost must be a non-negative number' }, { status: 400 });
    }

    const fuelPricePerGal =
      body?.fuelPricePerGal === undefined || body?.fuelPricePerGal === null
        ? null
        : Number(body.fuelPricePerGal);
    if (fuelPricePerGal !== null && (!Number.isFinite(fuelPricePerGal) || fuelPricePerGal < 0)) {
      return NextResponse.json({ error: 'fuelPricePerGal must be a non-negative number' }, { status: 400 });
    }

    let customItems: { label: string; amount: number }[] = [];
    if (Array.isArray(body?.customItems)) {
      for (const item of body.customItems) {
        const label = typeof item?.label === 'string' ? item.label : '';
        const amount = Number(item?.amount);
        if (!Number.isFinite(amount)) {
          return NextResponse.json({ error: 'customItems[].amount must be a number' }, { status: 400 });
        }
        customItems.push({ label, amount });
      }
    }

    const result = flightCost({ hours, actualFuelCost, fuelPricePerGal, customItems }, profile);

    return NextResponse.json({ profileId: profile.id, ...result });
  } catch (error) {
    console.error('Failed to compute flight cost:', error);
    return NextResponse.json({ error: 'Failed to compute flight cost' }, { status: 500 });
  }
}
