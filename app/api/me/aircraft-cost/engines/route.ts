import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * List the curated engine maintenance reference families, for the aircraft
 * cost-profile engine picker. Session-gated (any authenticated pilot).
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rows = await prisma.$queryRaw<
      Array<{
        engineModelKey: string;
        engineMfr: string | null;
        engineModel: string | null;
        aircraftClass: string | null;
        tboHours: number | null;
        overhaulCost: unknown;
        propOverhaulHours: number | null;
        propOverhaulCost: unknown;
        annualInspectionCost: unknown;
        costYear: number;
        isEstimate: boolean;
      }>
    >`
      SELECT
        [engineModelKey], [engineMfr], [engineModel], [aircraftClass], [tboHours],
        CAST([overhaulCost] AS FLOAT) as overhaulCost,
        [propOverhaulHours],
        CAST([propOverhaulCost] AS FLOAT) as propOverhaulCost,
        CAST([annualInspectionCost] AS FLOAT) as annualInspectionCost,
        [costYear], [isEstimate]
      FROM [EngineMaintenanceProfile]
      WHERE [costYear] = 2026
      ORDER BY [engineMfr], [overhaulCost]
    `;

    const engines = rows.map((r) => ({
      engineModelKey: r.engineModelKey,
      engineMfr: r.engineMfr,
      engineModel: r.engineModel,
      aircraftClass: r.aircraftClass,
      tboHours: r.tboHours,
      overhaulCost: r.overhaulCost != null ? Number(r.overhaulCost) : null,
      propOverhaulHours: r.propOverhaulHours,
      propOverhaulCost: r.propOverhaulCost != null ? Number(r.propOverhaulCost) : null,
      annualInspectionCost: r.annualInspectionCost != null ? Number(r.annualInspectionCost) : null,
      costYear: r.costYear,
      isEstimate: Boolean(r.isEstimate),
    }));

    return NextResponse.json({ engines });
  } catch (error) {
    console.error('Failed to fetch engine reference list:', error);
    return NextResponse.json({ error: 'Failed to fetch engine reference list' }, { status: 500 });
  }
}
