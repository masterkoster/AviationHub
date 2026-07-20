import { Prisma, type PrismaClient } from '@prisma/client';

// Shared raw-SQL access for AircraftCostProfile. This table is not present in
// the generated Prisma Client, so every access here goes through
// $queryRaw/$executeRaw tagged templates (never $queryRawUnsafe with named
// params — this connector doesn't bind those).

export type CostProfileRow = {
  id: string;
  scope: string;
  userId: string | null;
  userAircraftId: string | null;
  clubAircraftId: string | null;
  organizationId: string | null;
  nNumber: string | null;
  engineModelKey: string | null;
  tboHours: number | null;
  overhaulCost: unknown;
  propOverhaulHours: number | null;
  propOverhaulCost: unknown;
  costYear: number | null;
  fuelBurnGph: unknown;
  oilReservePerHour: unknown;
  maintReservePerHour: unknown;
  insuranceAnnual: unknown;
  hangarMonthly: unknown;
  annualInspectionCost: unknown;
  financingMonthly: unknown;
  subscriptionsAnnual: unknown;
  otherFixedAnnual: unknown;
  expectedAnnualHours: unknown;
  hourlyRateOverride: unknown;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export const COST_PROFILE_SELECT = Prisma.sql`
  SELECT
    [id], [scope], [userId], [userAircraftId], [clubAircraftId], [organizationId], [nNumber], [engineModelKey],
    [tboHours], CAST([overhaulCost] AS FLOAT) as overhaulCost,
    [propOverhaulHours], CAST([propOverhaulCost] AS FLOAT) as propOverhaulCost,
    [costYear],
    CAST([fuelBurnGph] AS FLOAT) as fuelBurnGph,
    CAST([oilReservePerHour] AS FLOAT) as oilReservePerHour,
    CAST([maintReservePerHour] AS FLOAT) as maintReservePerHour,
    CAST([insuranceAnnual] AS FLOAT) as insuranceAnnual,
    CAST([hangarMonthly] AS FLOAT) as hangarMonthly,
    CAST([annualInspectionCost] AS FLOAT) as annualInspectionCost,
    CAST([financingMonthly] AS FLOAT) as financingMonthly,
    CAST([subscriptionsAnnual] AS FLOAT) as subscriptionsAnnual,
    CAST([otherFixedAnnual] AS FLOAT) as otherFixedAnnual,
    CAST([expectedAnnualHours] AS FLOAT) as expectedAnnualHours,
    CAST([hourlyRateOverride] AS FLOAT) as hourlyRateOverride,
    [notes], [createdAt], [updatedAt]
  FROM [AircraftCostProfile]
`;

function toNumOrNull(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v);
}

export function serializeProfile(row: CostProfileRow) {
  return {
    id: row.id,
    scope: row.scope,
    userId: row.userId,
    userAircraftId: row.userAircraftId,
    clubAircraftId: row.clubAircraftId,
    organizationId: row.organizationId,
    nNumber: row.nNumber,
    engineModelKey: row.engineModelKey,
    tboHours: row.tboHours,
    overhaulCost: toNumOrNull(row.overhaulCost),
    propOverhaulHours: row.propOverhaulHours,
    propOverhaulCost: toNumOrNull(row.propOverhaulCost),
    costYear: row.costYear,
    fuelBurnGph: toNumOrNull(row.fuelBurnGph),
    oilReservePerHour: toNumOrNull(row.oilReservePerHour),
    maintReservePerHour: toNumOrNull(row.maintReservePerHour),
    insuranceAnnual: toNumOrNull(row.insuranceAnnual),
    hangarMonthly: toNumOrNull(row.hangarMonthly),
    annualInspectionCost: toNumOrNull(row.annualInspectionCost),
    financingMonthly: toNumOrNull(row.financingMonthly),
    subscriptionsAnnual: toNumOrNull(row.subscriptionsAnnual),
    otherFixedAnnual: toNumOrNull(row.otherFixedAnnual),
    expectedAnnualHours: toNumOrNull(row.expectedAnnualHours),
    hourlyRateOverride: toNumOrNull(row.hourlyRateOverride),
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function findProfileById(prisma: PrismaClient, id: string): Promise<CostProfileRow | null> {
  const rows = await prisma.$queryRaw<CostProfileRow[]>(
    Prisma.sql`${COST_PROFILE_SELECT} WHERE [id] = ${id}`
  );
  return rows[0] ?? null;
}

export async function findProfilesByUser(prisma: PrismaClient, userId: string): Promise<CostProfileRow[]> {
  return prisma.$queryRaw<CostProfileRow[]>(
    Prisma.sql`${COST_PROFILE_SELECT} WHERE [scope] = 'PERSONAL' AND [userId] = ${userId} ORDER BY [createdAt] DESC`
  );
}
