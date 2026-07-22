import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { awardContribution } from '@/lib/reputation/ledger';
import { CONTRIBUTION_POINTS } from '@/lib/reputation/config';

// Valid fuel types
const VALID_FUEL_TYPES = ['100LL', 'JetA', 'MOGAS', 'UL94'];

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      airportIcao,
      gallons,
      pricePerGallon,
      fuelType = '100LL',
      purchaseDate = new Date(),
      notes,
      contributeToCommunity,
    } = body;

    // Validation: airportIcao
    if (!airportIcao) {
      return NextResponse.json(
        { error: 'airportIcao is required' },
        { status: 400 }
      );
    }
    if (!/^[A-Za-z0-9]{3,7}$/.test(airportIcao)) {
      return NextResponse.json(
        { error: 'airportIcao must be 3-7 alphanumeric characters' },
        { status: 400 }
      );
    }

    // Validation: gallons
    const gallonsNum = Number(gallons);
    if (isNaN(gallonsNum) || gallonsNum <= 0 || gallonsNum > 500) {
      return NextResponse.json(
        { error: 'gallons must be a number between 0 and 500' },
        { status: 400 }
      );
    }

    // Validation: pricePerGallon
    const pricePerGallonNum = Number(pricePerGallon);
    if (isNaN(pricePerGallonNum) || pricePerGallonNum <= 0 || pricePerGallonNum > 50) {
      return NextResponse.json(
        { error: 'pricePerGallon must be a number between 0 and 50' },
        { status: 400 }
      );
    }

    // Validation: fuelType
    if (!VALID_FUEL_TYPES.includes(fuelType)) {
      return NextResponse.json(
        { error: `fuelType must be one of: ${VALID_FUEL_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    // Validation: purchaseDate
    const purchaseDateObj = new Date(purchaseDate);
    if (isNaN(purchaseDateObj.getTime())) {
      return NextResponse.json(
        { error: 'purchaseDate must be a valid date' },
        { status: 400 }
      );
    }

    // Compute totalCost
    const totalCost = Math.round(gallonsNum * pricePerGallonNum * 100) / 100;

    // Get or create pilot profile
    let pilotProfile = await prisma.pilotProfile.findUnique({
      where: { userId: session.user.id },
    });
    if (!pilotProfile) {
      pilotProfile = await prisma.pilotProfile.create({
        data: { userId: session.user.id },
      });
    }

    // ABUSE GUARD: check if this pilot already logged fuel at this airport today
    const today = new Date(purchaseDateObj.getFullYear(), purchaseDateObj.getMonth(), purchaseDateObj.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const icaoUpper = airportIcao.toUpperCase();
    const existingFuelToday = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT TOP 1 [id]
      FROM [FuelExpense]
      WHERE [pilotProfileId] = ${pilotProfile.id}
        AND [airportIcao] = ${icaoUpper}
        AND [organizationId] IS NULL
        AND CAST([createdAt] AS DATE) = CAST(${today} AS DATE)
    `.then(rows => rows.length > 0);

    let contributed = false;

    // Insert fuel expense via tagged-template raw SQL (parameterized; the generated
    // client predates the airportIcao/fuelType columns so we can't use prisma.create)
    const fuelExpenseId = randomUUID();
    const notesValue = notes ? String(notes) : null;

    await prisma.$executeRaw`
      INSERT INTO [FuelExpense] (
        [id], [organizationId], [clubAircraftId], [pilotProfileId], [flightLogId],
        [gallons], [pricePerGallon], [totalCost], [status], [receiptUrl], [notes],
        [approvedBy], [approvedAt], [airportIcao], [fuelType], [createdAt], [updatedAt]
      ) VALUES (
        ${fuelExpenseId}, NULL, NULL, ${pilotProfile.id}, NULL,
        ${gallonsNum}, ${pricePerGallonNum}, ${totalCost}, 'APPROVED', NULL, ${notesValue},
        NULL, NULL, ${icaoUpper}, ${fuelType}, GETDATE(), GETDATE()
      )
    `;

    await awardContribution(prisma, {
      userId: session.user.id,
      type: 'FUEL_LOG',
      points: CONTRIBUTION_POINTS.FUEL_LOG,
      refType: 'FuelExpense',
      refId: fuelExpenseId,
    });

    // Community contribution (wrapped in try/catch so it never fails the fuel log)
    if (contributeToCommunity === true && !existingFuelToday) {
      try {
        await prisma.communityFuelPrice.create({
          data: {
            icao: airportIcao.toUpperCase(),
            fuelType,
            price: pricePerGallonNum,
            purchaseDate: purchaseDateObj,
            userId: session.user.id,
          },
        });
        contributed = true;
      } catch (err) {
        console.error('Failed to contribute to community fuel prices:', err);
      }
    }

    return NextResponse.json({
      id: fuelExpenseId,
      totalCost,
      contributed,
    });
  } catch (error) {
    console.error('Fuel logging failed:', error);
    return NextResponse.json(
      { error: 'Failed to log fuel' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the pilot profile for this user
    const pilotProfile = await prisma.pilotProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });

    if (!pilotProfile) {
      return NextResponse.json({ fuelLogs: [] });
    }

    // Fetch personal fuel logs (organizationId IS NULL) using raw SQL
    // since the generated client predates airportIcao/fuelType columns
    const fuelLogs = await prisma.$queryRaw<
      Array<{
        id: string;
        airportIcao: string | null;
        gallons: number;
        pricePerGallon: number;
        totalCost: number;
        fuelType: string | null;
        notes: string | null;
        createdAt: string;
      }>
    >`
      SELECT TOP 200
        [id],
        [airportIcao],
        CAST([gallons] AS FLOAT) as gallons,
        CAST([pricePerGallon] AS FLOAT) as pricePerGallon,
        CAST([totalCost] AS FLOAT) as totalCost,
        [fuelType],
        [notes],
        [createdAt]
      FROM [FuelExpense]
      WHERE [pilotProfileId] = ${pilotProfile.id}
        AND [organizationId] IS NULL
      ORDER BY [createdAt] DESC
    `;

    // Convert Decimals to numbers and format dates
    const formatted = fuelLogs.map((log) => ({
      id: log.id,
      airportIcao: log.airportIcao,
      gallons: Number(log.gallons),
      pricePerGallon: Number(log.pricePerGallon),
      totalCost: Number(log.totalCost),
      fuelType: log.fuelType,
      notes: log.notes,
      createdAt: log.createdAt,
    }));

    return NextResponse.json({ fuelLogs: formatted });
  } catch (error) {
    console.error('Fuel log fetch failed:', error);
    return NextResponse.json(
      { error: 'Failed to fetch fuel logs' },
      { status: 500 }
    );
  }
}
