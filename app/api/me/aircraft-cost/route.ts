import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { reservesPerHour } from '@/lib/cost/aircraft-cost';
import { resolveEngineReference, getEngineReferenceByKey } from '@/lib/cost/engine-lookup';
import { findProfileById, findProfilesByUser, serializeProfile } from '@/lib/cost/repo';

const NNUMBER_RE = /^[A-Za-z0-9]{2,10}$/;

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rows = await findProfilesByUser(prisma, session.user.id);
    return NextResponse.json({ profiles: rows.map(serializeProfile) });
  } catch (error) {
    console.error('Failed to fetch aircraft cost profiles:', error);
    return NextResponse.json({ error: 'Failed to fetch aircraft cost profiles' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const nNumberRaw = typeof body?.nNumber === 'string' ? body.nNumber.trim() : '';
    const userAircraftId = typeof body?.userAircraftId === 'string' ? body.userAircraftId : null;
    const nickname = typeof body?.nickname === 'string' ? body.nickname.trim() : null;

    if (!nNumberRaw || !NNUMBER_RE.test(nNumberRaw)) {
      return NextResponse.json(
        { error: 'nNumber is required and must be 2-10 alphanumeric characters' },
        { status: 400 }
      );
    }
    const nNumber = nNumberRaw.toUpperCase();

    // If a userAircraftId was supplied, verify it belongs to this user before
    // linking it (and optionally refresh its nickname — AircraftCostProfile
    // itself has no nickname column, so this is the only place it can live).
    if (userAircraftId) {
      const owned = await prisma.userAircraft.findFirst({
        where: { id: userAircraftId, userId: session.user.id },
        select: { id: true },
      });
      if (!owned) {
        return NextResponse.json({ error: 'userAircraftId not found' }, { status: 404 });
      }
      if (nickname) {
        await prisma.userAircraft.update({
          where: { id: userAircraftId },
          data: { nickname },
        });
      }
    }

    // An explicit engineModelKey (the pilot's own pick from the engine list)
    // wins; otherwise resolve from the tail number (engine string → airframe guess).
    const engineKeyOverride = typeof body?.engineModelKey === 'string' ? body.engineModelKey.trim() : '';
    const reference = await (engineKeyOverride
      ? getEngineReferenceByKey(prisma, engineKeyOverride, 2026)
      : resolveEngineReference(prisma, nNumber, 2026)
    ).catch((err) => {
      console.error('Engine reference lookup failed:', err);
      return null;
    });

    const id = randomUUID();
    const engineModelKey = reference?.engineModelKey ?? null;
    const tboHours = reference?.tboHours ?? null;
    const overhaulCost = reference?.overhaulCost ?? null;
    const propOverhaulHours = reference?.propOverhaulHours ?? null;
    const propOverhaulCost = reference?.propOverhaulCost ?? null;
    const costYear = reference?.costYear ?? null;
    const annualInspectionCost = reference?.annualInspectionCost ?? null;

    await prisma.$executeRaw`
      INSERT INTO [AircraftCostProfile] (
        [id], [scope], [userId], [userAircraftId], [clubAircraftId], [organizationId], [nNumber], [engineModelKey],
        [tboHours], [overhaulCost], [propOverhaulHours], [propOverhaulCost], [costYear],
        [fuelBurnGph], [oilReservePerHour], [maintReservePerHour],
        [insuranceAnnual], [hangarMonthly], [annualInspectionCost], [financingMonthly],
        [subscriptionsAnnual], [otherFixedAnnual], [expectedAnnualHours], [hourlyRateOverride],
        [notes], [createdAt], [updatedAt]
      ) VALUES (
        ${id}, 'PERSONAL', ${session.user.id}, ${userAircraftId}, NULL, NULL, ${nNumber}, ${engineModelKey},
        ${tboHours}, ${overhaulCost}, ${propOverhaulHours}, ${propOverhaulCost}, ${costYear},
        NULL, NULL, NULL,
        NULL, NULL, ${annualInspectionCost}, NULL,
        NULL, NULL, NULL, NULL,
        NULL, GETDATE(), GETDATE()
      )
    `;

    const createdRow = await findProfileById(prisma, id);
    if (!createdRow) {
      return NextResponse.json({ error: 'Failed to create aircraft cost profile' }, { status: 500 });
    }

    const profile = serializeProfile(createdRow);
    const preview = reservesPerHour({
      tboHours: profile.tboHours,
      overhaulCost: profile.overhaulCost,
      propOverhaulHours: profile.propOverhaulHours,
      propOverhaulCost: profile.propOverhaulCost,
    });

    return NextResponse.json(
      {
        profile,
        reservesPerHourPreview: preview,
        engineMatched: !!reference,
        matchedBy: reference?.matchedBy ?? null,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Failed to create aircraft cost profile:', error);
    return NextResponse.json({ error: 'Failed to create aircraft cost profile' }, { status: 500 });
  }
}
