import { Prisma, type PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

// ContributionEvent is a raw-SQL-only table (not present in the generated
// Prisma Client — see prisma/migrations/contribution_event.sql). All access
// goes through $queryRaw/$executeRaw tagged templates.

export type AwardContributionInput = {
  userId: string;
  type: string;
  points: number;
  refType?: string | null;
  refId?: string | null;
};

// Award a contribution event to a user's ledger. Idempotent when refId is
// provided: relies on the filtered unique index UX_ContribEvent_action
// (userId, type, refId) WHERE refId IS NOT NULL, guarded here with a
// NOT EXISTS check so repeat calls for the same action never double-award.
// Best-effort: awards must NEVER throw into the caller, so all failures are
// swallowed and logged.
export async function awardContribution(
  prisma: PrismaClient,
  { userId, type, points, refType, refId }: AwardContributionInput
): Promise<void> {
  try {
    const id = randomUUID();
    const refTypeValue = refType ?? null;
    const refIdValue = refId ?? null;

    if (refIdValue != null) {
      await prisma.$executeRaw`
        INSERT INTO [ContributionEvent] ([id], [userId], [type], [points], [refType], [refId], [createdAt])
        SELECT ${id}, ${userId}, ${type}, ${points}, ${refTypeValue}, ${refIdValue}, GETDATE()
        WHERE NOT EXISTS (
          SELECT 1 FROM [ContributionEvent]
          WHERE [userId] = ${userId} AND [type] = ${type} AND [refId] = ${refIdValue}
        )
      `;
    } else {
      await prisma.$executeRaw`
        INSERT INTO [ContributionEvent] ([id], [userId], [type], [points], [refType], [refId], [createdAt])
        VALUES (${id}, ${userId}, ${type}, ${points}, ${refTypeValue}, NULL, GETDATE())
      `;
    }
  } catch (error) {
    console.error('Failed to award contribution', error);
  }
}

export async function getUserPoints(prisma: PrismaClient, userId: string): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ pts: number | bigint | null }>>`
    SELECT ISNULL(SUM([points]), 0) AS pts
    FROM [ContributionEvent]
    WHERE [userId] = ${userId}
  `;
  return Number(rows[0]?.pts ?? 0);
}

export async function getPointsForUsers(
  prisma: PrismaClient,
  userIds: string[]
): Promise<Map<string, number>> {
  const ids = Array.from(new Set(userIds));
  if (ids.length === 0) return new Map();

  const rows = await prisma.$queryRaw<Array<{ userId: string; pts: number | bigint | null }>>`
    SELECT [userId], SUM([points]) AS pts
    FROM [ContributionEvent]
    WHERE [userId] IN (${Prisma.join(ids)})
    GROUP BY [userId]
  `;

  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.userId, Number(row.pts ?? 0));
  }
  return map;
}
