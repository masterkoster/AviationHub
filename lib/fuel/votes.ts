import { Prisma, type PrismaClient } from '@prisma/client';
import { reputationWeight } from '@/lib/reputation/config';

// FuelPriceVote is a raw-SQL-only table (not present in the generated Prisma
// Client — see prisma/migrations/fuel_price_vote.sql). All access goes
// through $queryRaw/$executeRaw tagged templates.

export type VoteAggregate = {
  up: number;
  down: number;
  weightedUp: number;
  weightedDown: number;
  myVote: number;
};

type VoteRow = {
  fuelPriceId: string;
  userId: string;
  value: number | bigint | null;
  pts: number | bigint | null;
};

// Fetch up/down vote counts (raw + reputation-weighted) plus the current
// user's own vote for a set of CommunityFuelPrice ids. Weighting makes votes
// from higher-reputation contributors count more toward the disputed
// decision, which makes brigading/manipulation harder without hiding the
// raw counts shown to users.
export async function getVoteAggregates(
  prisma: PrismaClient,
  fuelPriceIds: string[],
  meId: string | null | undefined
): Promise<Map<string, VoteAggregate>> {
  const ids = Array.from(new Set(fuelPriceIds));
  if (ids.length === 0) return new Map();

  const me = meId ?? '';

  const rows = await prisma.$queryRaw<VoteRow[]>`
    SELECT v.[fuelPriceId], v.[userId], v.[value], ISNULL(r.pts, 0) AS pts
    FROM [FuelPriceVote] v
    LEFT JOIN (SELECT [userId], SUM([points]) AS pts FROM [ContributionEvent] GROUP BY [userId]) r ON r.[userId] = v.[userId]
    WHERE v.[fuelPriceId] IN (${Prisma.join(ids)})
  `;

  const map = new Map<string, VoteAggregate>();
  for (const row of rows) {
    const agg = map.get(row.fuelPriceId) ?? {
      up: 0,
      down: 0,
      weightedUp: 0,
      weightedDown: 0,
      myVote: 0,
    };

    const value = Number(row.value ?? 0);
    const pts = Number(row.pts ?? 0);
    const weight = reputationWeight(pts);

    if (value === 1) {
      agg.up += 1;
      agg.weightedUp += weight;
    } else if (value === -1) {
      agg.down += 1;
      agg.weightedDown += weight;
    }

    if (row.userId === me) {
      agg.myVote = value;
    }

    map.set(row.fuelPriceId, agg);
  }

  for (const agg of map.values()) {
    agg.weightedUp = Math.round(agg.weightedUp * 100) / 100;
    agg.weightedDown = Math.round(agg.weightedDown * 100) / 100;
  }

  return map;
}

export function emptyAggregate(): VoteAggregate {
  return { up: 0, down: 0, weightedUp: 0, weightedDown: 0, myVote: 0 };
}
