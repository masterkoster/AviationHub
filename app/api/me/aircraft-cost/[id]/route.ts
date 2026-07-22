import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { findProfileById, serializeProfile } from '@/lib/cost/repo';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Numeric fields editable via PUT, and whether they're integer-typed.
const NUMERIC_FIELDS: { key: string; integer?: boolean }[] = [
  { key: 'fuelBurnGph' },
  { key: 'oilReservePerHour' },
  { key: 'maintReservePerHour' },
  { key: 'insuranceAnnual' },
  { key: 'hangarMonthly' },
  { key: 'annualInspectionCost' },
  { key: 'financingMonthly' },
  { key: 'subscriptionsAnnual' },
  { key: 'otherFixedAnnual' },
  { key: 'expectedAnnualHours' },
  { key: 'hourlyRateOverride' },
  { key: 'tboHours', integer: true },
  { key: 'overhaulCost' },
  { key: 'propOverhaulHours', integer: true },
  { key: 'propOverhaulCost' },
];

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const existing = await findProfileById(prisma, id);
    if (!existing || existing.userId !== session.user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));

    // Validate + coerce numeric fields (reject negatives / non-numbers).
    const numericUpdates: Record<string, number | null> = {};
    for (const { key, integer } of NUMERIC_FIELDS) {
      if (body[key] === undefined) continue;
      if (body[key] === null) {
        numericUpdates[key] = null;
        continue;
      }
      const n = Number(body[key]);
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json({ error: `${key} must be a non-negative number` }, { status: 400 });
      }
      numericUpdates[key] = integer ? Math.round(n) : n;
    }

    const notes =
      body.notes === undefined ? undefined : body.notes === null ? null : String(body.notes);
    const nickname = typeof body.nickname === 'string' ? body.nickname.trim() : null;

    // AircraftCostProfile has no nickname column — if this profile is linked
    // to a UserAircraft, a supplied nickname updates that record instead.
    if (nickname && existing.userAircraftId) {
      await prisma.userAircraft.update({
        where: { id: existing.userAircraftId },
        data: { nickname },
      }).catch((err) => {
        console.error('Failed to update linked aircraft nickname:', err);
      });
    }

    // Merge: provided fields override existing values; everything else keeps
    // its current value (existing rows already have numbers/strings coerced
    // from Decimal by findProfileById -> raw CAST ... AS FLOAT).
    const merged = {
      fuelBurnGph: 'fuelBurnGph' in numericUpdates ? numericUpdates.fuelBurnGph : numOrNull(existing.fuelBurnGph),
      oilReservePerHour:
        'oilReservePerHour' in numericUpdates ? numericUpdates.oilReservePerHour : numOrNull(existing.oilReservePerHour),
      maintReservePerHour:
        'maintReservePerHour' in numericUpdates
          ? numericUpdates.maintReservePerHour
          : numOrNull(existing.maintReservePerHour),
      insuranceAnnual:
        'insuranceAnnual' in numericUpdates ? numericUpdates.insuranceAnnual : numOrNull(existing.insuranceAnnual),
      hangarMonthly:
        'hangarMonthly' in numericUpdates ? numericUpdates.hangarMonthly : numOrNull(existing.hangarMonthly),
      annualInspectionCost:
        'annualInspectionCost' in numericUpdates
          ? numericUpdates.annualInspectionCost
          : numOrNull(existing.annualInspectionCost),
      financingMonthly:
        'financingMonthly' in numericUpdates ? numericUpdates.financingMonthly : numOrNull(existing.financingMonthly),
      subscriptionsAnnual:
        'subscriptionsAnnual' in numericUpdates
          ? numericUpdates.subscriptionsAnnual
          : numOrNull(existing.subscriptionsAnnual),
      otherFixedAnnual:
        'otherFixedAnnual' in numericUpdates ? numericUpdates.otherFixedAnnual : numOrNull(existing.otherFixedAnnual),
      expectedAnnualHours:
        'expectedAnnualHours' in numericUpdates
          ? numericUpdates.expectedAnnualHours
          : numOrNull(existing.expectedAnnualHours),
      hourlyRateOverride:
        'hourlyRateOverride' in numericUpdates
          ? numericUpdates.hourlyRateOverride
          : numOrNull(existing.hourlyRateOverride),
      tboHours: 'tboHours' in numericUpdates ? numericUpdates.tboHours : existing.tboHours,
      overhaulCost: 'overhaulCost' in numericUpdates ? numericUpdates.overhaulCost : numOrNull(existing.overhaulCost),
      propOverhaulHours:
        'propOverhaulHours' in numericUpdates ? numericUpdates.propOverhaulHours : existing.propOverhaulHours,
      propOverhaulCost:
        'propOverhaulCost' in numericUpdates ? numericUpdates.propOverhaulCost : numOrNull(existing.propOverhaulCost),
      notes: notes === undefined ? existing.notes : notes,
    };

    await prisma.$executeRaw`
      UPDATE [AircraftCostProfile]
      SET
        [fuelBurnGph] = ${merged.fuelBurnGph},
        [oilReservePerHour] = ${merged.oilReservePerHour},
        [maintReservePerHour] = ${merged.maintReservePerHour},
        [insuranceAnnual] = ${merged.insuranceAnnual},
        [hangarMonthly] = ${merged.hangarMonthly},
        [annualInspectionCost] = ${merged.annualInspectionCost},
        [financingMonthly] = ${merged.financingMonthly},
        [subscriptionsAnnual] = ${merged.subscriptionsAnnual},
        [otherFixedAnnual] = ${merged.otherFixedAnnual},
        [expectedAnnualHours] = ${merged.expectedAnnualHours},
        [hourlyRateOverride] = ${merged.hourlyRateOverride},
        [tboHours] = ${merged.tboHours},
        [overhaulCost] = ${merged.overhaulCost},
        [propOverhaulHours] = ${merged.propOverhaulHours},
        [propOverhaulCost] = ${merged.propOverhaulCost},
        [notes] = ${merged.notes},
        [updatedAt] = GETDATE()
      WHERE [id] = ${id}
    `;

    const updatedRow = await findProfileById(prisma, id);
    if (!updatedRow) {
      return NextResponse.json({ error: 'Failed to load updated profile' }, { status: 500 });
    }

    return NextResponse.json({ profile: serializeProfile(updatedRow) });
  } catch (error) {
    console.error('Failed to update aircraft cost profile:', error);
    return NextResponse.json({ error: 'Failed to update aircraft cost profile' }, { status: 500 });
  }
}

function numOrNull(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v);
}
