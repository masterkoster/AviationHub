import { Prisma, type PrismaClient } from '@prisma/client';

// FuelPriceVote is a raw-SQL-only table (not present in the generated Prisma
// Client — see prisma/migrations/fuel_price_vote.sql). All access goes
// through $queryRaw/$executeRaw tagged templates.

export type VoteAggregate = { up: number; down: number; myVote: number };

type VoteAggregateRow = {
  fuelPriceId: string;
  up: number | bigint | null;
  down: number | bigint | null;
  myVote: number | bigint | null;
};

// Fetch up/down vote counts + the current user's own vote for a set of
// CommunityFuelPrice ids, in a single grouped query.
export async function getVoteAggregates(
  prisma: PrismaClient,
  fuelPriceIds: string[],
  meId: string | null | undefined
): Promise<Map<string, VoteAggregate>> {
  const ids = Array.from(new Set(fuelPriceIds));
  if (ids.length === 0) return new Map();

  const me = meId ?? '';

  const rows = await prisma.$queryRaw<VoteAggregateRow[]>`
    SELECT
      [fuelPriceId],
      SUM(CASE WHEN [value] = 1 THEN 1 ELSE 0 END) AS up,
      SUM(CASE WHEN [value] = -1 THEN 1 ELSE 0 END) AS down,
      SUM(CASE WHEN [userId] = ${me} THEN [value] ELSE 0 END) AS myVote
    FROM [FuelPriceVote]
    WHERE [fuelPriceId] IN (${Prisma.join(ids)})
    GROUP BY [fuelPriceId]
  `;

  const map = new Map<string, VoteAggregate>();
  for (const row of rows) {
    map.set(row.fuelPriceId, {
      up: Number(row.up ?? 0),
      down: Number(row.down ?? 0),
      myVote: Number(row.myVote ?? 0),
    });
  }
  return map;
}

export function emptyAggregate(): VoteAggregate {
  return { up: 0, down: 0, myVote: 0 };
}
