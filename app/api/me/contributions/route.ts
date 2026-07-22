import { NextResponse } from 'next/server';
import { auth, prisma } from '@/lib/auth';
import { getUserPoints } from '@/lib/reputation/ledger';
import { reputationTier } from '@/lib/reputation/config';

type CountRow = { type: string; cnt: number | bigint | null };

type RecentEventRow = {
  type: string;
  points: number | bigint | null;
  refType: string | null;
  createdAt: Date;
};

// GET - current user's contribution ledger summary: total points, tier,
// per-type counts, and the most recent events.
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const points = await getUserPoints(prisma, userId);
    const tier = reputationTier(points);

    const countRows = await prisma.$queryRaw<CountRow[]>`
      SELECT [type], COUNT(*) AS cnt
      FROM [ContributionEvent]
      WHERE [userId] = ${userId}
      GROUP BY [type]
    `;

    let fuelLogs = 0;
    let priceReports = 0;
    for (const row of countRows) {
      const count = Number(row.cnt ?? 0);
      if (row.type === 'FUEL_LOG') fuelLogs = count;
      else if (row.type === 'PRICE_REPORT') priceReports = count;
    }

    const recentRows = await prisma.$queryRaw<RecentEventRow[]>`
      SELECT TOP 20 [type], [points], [refType], [createdAt]
      FROM [ContributionEvent]
      WHERE [userId] = ${userId}
      ORDER BY [createdAt] DESC
    `;

    const recentEvents = recentRows.map((row) => ({
      type: row.type,
      points: Number(row.points ?? 0),
      refType: row.refType,
      createdAt: row.createdAt,
    }));

    return NextResponse.json({
      points,
      tier,
      counts: { fuelLogs, priceReports },
      recentEvents,
    });
  } catch (error) {
    console.error('Failed to fetch contribution summary', error);
    return NextResponse.json({ error: 'Failed to fetch contribution summary' }, { status: 500 });
  }
}
