import { NextRequest, NextResponse } from 'next/server';
import { auth, prisma } from '@/lib/auth';
import { isDisputed } from '@/lib/fuel/dispute';
import { getVoteAggregates } from '@/lib/fuel/votes';

const VALID_FUEL_TYPES = ['100LL', 'JetA', 'MOGAS', 'UL94'];
const WEEKS_WINDOW = 16;

type PriceRow = {
  id: string;
  icao: string;
  fuelType: string;
  price: unknown;
  purchaseDate: Date;
  userId: string | null;
};

// Monday (UTC) of the ISO week containing `date`.
function weekStart(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diffToMonday);
  return d;
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const icaoParam = url.searchParams.get('icao')?.trim().toUpperCase() || '';
    const fuelTypeParam = url.searchParams.get('fuelType') || '100LL';
    const chosenType =
      fuelTypeParam && fuelTypeParam !== 'all' && VALID_FUEL_TYPES.includes(fuelTypeParam)
        ? fuelTypeParam
        : '100LL';

    const where: Record<string, unknown> = { fuelType: chosenType };
    if (icaoParam) {
      where.icao = { startsWith: icaoParam };
    }

    const fetched = (await prisma.communityFuelPrice.findMany({
      where,
      orderBy: { purchaseDate: 'asc' },
      take: 1000,
      select: { id: true, icao: true, fuelType: true, price: true, purchaseDate: true, userId: true },
    })) as unknown as PriceRow[];

    // Exclude disputed submissions so a manipulated/incorrect outlier can't
    // skew the trend chart or stats (average, cheapest, history).
    const voteById = await getVoteAggregates(
      prisma,
      fetched.map((r) => r.id),
      session.user.id
    );
    const rows = fetched.filter((row) => {
      const vote = voteById.get(row.id) ?? {
        up: 0,
        down: 0,
        weightedUp: 0,
        weightedDown: 0,
        myVote: 0,
      };
      return !isDisputed(vote.weightedUp, vote.weightedDown);
    });

    const distinctIcaos = Array.from(new Set(rows.map((r) => r.icao)));
    const scope: 'airport' | 'overall' = distinctIcaos.length === 1 ? 'airport' : 'overall';

    let points: Array<{ date: string; price: number; count?: number; icao?: string }>;

    if (scope === 'airport') {
      points = rows.map((r) => ({
        date: r.purchaseDate.toISOString(),
        price: Number(r.price),
        icao: r.icao,
      }));
    } else {
      // Bucket by ISO week (Monday start), average price per week.
      const buckets = new Map<string, { sum: number; count: number }>();
      for (const r of rows) {
        const key = weekStart(r.purchaseDate).toISOString();
        const bucket = buckets.get(key) || { sum: 0, count: 0 };
        bucket.sum += Number(r.price);
        bucket.count += 1;
        buckets.set(key, bucket);
      }
      const allWeeks = Array.from(buckets.keys()).sort();
      const recentWeeks = allWeeks.slice(-WEEKS_WINDOW);
      points = recentWeeks.map((key) => {
        const bucket = buckets.get(key)!;
        return {
          date: key,
          price: Math.round((bucket.sum / bucket.count) * 100) / 100,
          count: bucket.count,
        };
      });
    }

    // Stats over the same fuelType + icao-filtered result set.
    const count = rows.length;
    const contributors = new Set(rows.map((r) => r.userId).filter((id): id is string => Boolean(id))).size;
    const avgPrice =
      count > 0 ? Math.round((rows.reduce((sum, r) => sum + Number(r.price), 0) / count) * 100) / 100 : null;

    let cheapest: { icao: string; price: number } | null = null;
    for (const r of rows) {
      const price = Number(r.price);
      if (!cheapest || price < cheapest.price) {
        cheapest = { icao: r.icao, price };
      }
    }

    return NextResponse.json({
      scope,
      fuelType: chosenType,
      points,
      stats: {
        count,
        contributors,
        avgPrice,
        cheapest,
        fuelType: chosenType,
      },
    });
  } catch (error) {
    console.error('Failed to fetch fuel price trend', error);
    return NextResponse.json({ error: 'Failed to fetch fuel price trend' }, { status: 500 });
  }
}
