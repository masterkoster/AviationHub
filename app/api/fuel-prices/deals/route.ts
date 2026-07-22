import { NextRequest, NextResponse } from 'next/server';
import { auth, prisma } from '@/lib/auth';

const VALID_TYPES = ['AVGAS', 'CAR_GAS', 'OTHER'];

type DealRow = {
  id: string;
  title: string;
  brand: string | null;
  dealType: string;
  icao: string | null;
  region: string | null;
  description: string | null;
  discountText: string | null;
  url: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  isSample: boolean;
};

// GET - active fuel/gas deals. Optional icao (returns that airport's deals plus
// general/brand-wide ones) and dealType filter. Manually/admin-seeded for now;
// FuelDeal is a raw-SQL-only table (not in the generated client).
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const icaoRaw = url.searchParams.get('icao')?.trim().toUpperCase() || '';
    const icao = icaoRaw ? icaoRaw : null;
    const typeRaw = url.searchParams.get('type') || '';
    const type = VALID_TYPES.includes(typeRaw) ? typeRaw : null;
    let limit = Number(url.searchParams.get('limit')) || 20;
    limit = Math.min(50, Math.max(1, limit));

    const rows = await prisma.$queryRaw<DealRow[]>`
      SELECT TOP (${limit})
        [id], [title], [brand], [dealType], [icao], [region],
        [description], [discountText], [url], [startsAt], [endsAt], [isSample]
      FROM [FuelDeal]
      WHERE [isActive] = 1
        AND ([startsAt] IS NULL OR [startsAt] <= GETDATE())
        AND ([endsAt] IS NULL OR [endsAt] >= GETDATE())
        AND (${icao} IS NULL OR [icao] = ${icao} OR [icao] IS NULL)
        AND (${type} IS NULL OR [dealType] = ${type})
      ORDER BY
        CASE WHEN [icao] IS NOT NULL THEN 0 ELSE 1 END,
        CASE WHEN [endsAt] IS NULL THEN 1 ELSE 0 END,
        [endsAt] ASC,
        [createdAt] DESC
    `;

    const deals = rows.map((r) => ({
      id: r.id,
      title: r.title,
      brand: r.brand,
      dealType: r.dealType,
      icao: r.icao,
      region: r.region,
      description: r.description,
      discountText: r.discountText,
      url: r.url,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      isSample: Boolean(r.isSample),
    }));

    return NextResponse.json({ deals });
  } catch (error) {
    console.error('Failed to fetch fuel deals', error);
    return NextResponse.json({ error: 'Failed to fetch fuel deals' }, { status: 500 });
  }
}
