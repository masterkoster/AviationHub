import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { findProfileById, serializeProfile } from '@/lib/cost/repo';
import { reservesPerHour, fixedAnnual, fixedPerHour, allInPerHour } from '@/lib/cost/aircraft-cost';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
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

    const fuelPriceParam = request.nextUrl.searchParams.get('fuelPrice');
    const fuelPricePerGal =
      fuelPriceParam !== null && Number.isFinite(Number(fuelPriceParam)) ? Number(fuelPriceParam) : null;

    const reserves = reservesPerHour(profile);
    const annual = fixedAnnual(profile);
    const perHourFixed = fixedPerHour(profile);
    const allIn = allInPerHour(profile, fuelPricePerGal);

    return NextResponse.json({
      profileId: profile.id,
      nNumber: profile.nNumber,
      engineModelKey: profile.engineModelKey,
      reservesPerHour: reserves,
      fixedAnnual: annual,
      fixedPerHour: perHourFixed,
      allInPerHour: allIn,
      isEstimate: true,
      components: {
        fuelPricePerGal,
        fuelBurnGph: profile.fuelBurnGph,
        expectedAnnualHours: profile.expectedAnnualHours,
        hourlyRateOverride: profile.hourlyRateOverride,
        insuranceAnnual: profile.insuranceAnnual,
        hangarMonthly: profile.hangarMonthly,
        annualInspectionCost: profile.annualInspectionCost,
        financingMonthly: profile.financingMonthly,
        subscriptionsAnnual: profile.subscriptionsAnnual,
        otherFixedAnnual: profile.otherFixedAnnual,
      },
    });
  } catch (error) {
    console.error('Failed to compute aircraft cost summary:', error);
    return NextResponse.json({ error: 'Failed to compute aircraft cost summary' }, { status: 500 });
  }
}
