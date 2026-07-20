import { NextRequest, NextResponse } from 'next/server';
import { auth, prisma } from '@/lib/auth';

const VALID_FUEL_TYPES = ['100LL', 'JetA', 'MOGAS', 'UL94'];
const VALID_SORTS = ['recent', 'cheapest', 'highest'];
const VALID_MODES = ['all', 'latest'];

type FeedRow = {
  id: string;
  icao: string;
  fbo: string | null;
  fuelType: string;
  price: unknown;
  purchaseDate: Date;
  createdAt: Date;
  userId: string | null;
};

function serialize(row: FeedRow, currentUserId: string, usernameById: Map<string, string>) {
  const username = row.userId ? usernameById.get(row.userId) : undefined;
  return {
    id: row.id,
    icao: row.icao,
    fbo: row.fbo,
    fuelType: row.fuelType,
    price: Number(row.price),
    purchaseDate: row.purchaseDate,
    createdAt: row.createdAt,
    isMine: row.userId != null && row.userId === currentUserId,
    submittedBy: username ? `@${username}` : null,
  };
}

async function buildUsernameMap(rows: FeedRow[]): Promise<Map<string, string>> {
  const ids = Array.from(new Set(rows.map((r) => r.userId).filter((id): id is string => Boolean(id))));
  if (ids.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, username: true },
  });
  return new Map(users.map((u) => [u.id, u.username]));
}

// GET - browse community fuel price submissions (not airport-scoped)
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const q = url.searchParams.get('q')?.trim().toUpperCase() || '';
    const fuelTypeParam = url.searchParams.get('fuelType') || 'all';
    const sortParam = url.searchParams.get('sort') || 'recent';
    const modeParam = url.searchParams.get('mode') || 'all';

    const sort = VALID_SORTS.includes(sortParam) ? sortParam : 'recent';
    const mode = VALID_MODES.includes(modeParam) ? modeParam : 'all';

    let limit = Number(url.searchParams.get('limit')) || 50;
    limit = Math.min(200, Math.max(1, limit));
    let offset = Number(url.searchParams.get('offset')) || 0;
    offset = Math.max(0, offset);

    const where: Record<string, unknown> = {};
    if (q) {
      where.icao = { startsWith: q };
    }
    if (fuelTypeParam && fuelTypeParam !== 'all' && VALID_FUEL_TYPES.includes(fuelTypeParam)) {
      where.fuelType = fuelTypeParam;
    }

    const orderBy =
      sort === 'cheapest'
        ? { price: 'asc' as const }
        : sort === 'highest'
        ? { price: 'desc' as const }
        : { purchaseDate: 'desc' as const };

    if (mode === 'latest') {
      // Fetch a reasonable window of the most-recent matching rows, then
      // dedupe in JS keeping only the most recent submission per icao+fuelType.
      const window = await prisma.communityFuelPrice.findMany({
        where,
        orderBy: { purchaseDate: 'desc' },
        take: 500,
      });

      const seen = new Set<string>();
      const deduped: FeedRow[] = [];
      for (const row of window) {
        const key = `${row.icao}-${row.fuelType}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(row as unknown as FeedRow);
      }

      // Apply requested sort to the deduped set.
      if (sort === 'cheapest') {
        deduped.sort((a, b) => Number(a.price) - Number(b.price));
      } else if (sort === 'highest') {
        deduped.sort((a, b) => Number(b.price) - Number(a.price));
      } else {
        deduped.sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime());
      }

      const page = deduped.slice(offset, offset + limit);
      const hasMore = offset + limit < deduped.length;
      const usernameById = await buildUsernameMap(page);

      return NextResponse.json({
        prices: page.map((row) => serialize(row, session.user!.id!, usernameById)),
        mode,
        hasMore,
      });
    }

    // mode === 'all'
    const rows = await prisma.communityFuelPrice.findMany({
      where,
      orderBy,
      take: limit + 1,
      skip: offset,
    });

    const hasMore = rows.length > limit;
    const page = (hasMore ? rows.slice(0, limit) : rows) as unknown as FeedRow[];
    const usernameById = await buildUsernameMap(page);

    return NextResponse.json({
      prices: page.map((row) => serialize(row, session.user!.id!, usernameById)),
      mode,
      hasMore,
    });
  } catch (error) {
    console.error('Failed to fetch fuel price feed', error);
    return NextResponse.json({ error: 'Failed to fetch fuel price feed' }, { status: 500 });
  }
}

// POST - report a community fuel price
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { icao, fbo, fuelType, price, purchaseDate } = body;

    if (!icao || typeof icao !== 'string' || !/^[A-Za-z0-9]{3,7}$/.test(icao)) {
      return NextResponse.json({ error: 'icao must be 3-7 alphanumeric characters' }, { status: 400 });
    }
    const icaoUpper = icao.toUpperCase();

    if (!fuelType || !VALID_FUEL_TYPES.includes(fuelType)) {
      return NextResponse.json(
        { error: `fuelType must be one of: ${VALID_FUEL_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum <= 0 || priceNum > 50) {
      return NextResponse.json({ error: 'price must be a number between 0 and 50' }, { status: 400 });
    }

    const date = purchaseDate ? new Date(purchaseDate) : new Date();
    if (isNaN(date.getTime())) {
      return NextResponse.json({ error: 'purchaseDate must be a valid date' }, { status: 400 });
    }

    // Dedupe: same user, same icao + fuelType, same calendar day.
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const existing = await prisma.communityFuelPrice.findFirst({
      where: {
        userId: session.user.id,
        icao: icaoUpper,
        fuelType,
        purchaseDate: { gte: dayStart, lt: dayEnd },
      },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'You already reported this airport/fuel today.' },
        { status: 409 }
      );
    }

    const fboTrimmed = typeof fbo === 'string' ? fbo.trim() : '';

    const created = await prisma.communityFuelPrice.create({
      data: {
        icao: icaoUpper,
        fbo: fboTrimmed || null,
        fuelType,
        price: priceNum,
        purchaseDate: date,
        userId: session.user.id,
      },
    });

    return NextResponse.json({ ok: true, id: created.id });
  } catch (error) {
    console.error('Failed to report fuel price', error);
    return NextResponse.json({ error: 'Failed to report fuel price' }, { status: 500 });
  }
}
