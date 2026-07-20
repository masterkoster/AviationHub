import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { auth, prisma } from '@/lib/auth';
import { isDisputed, voteScore } from '@/lib/fuel/dispute';
import { getVoteAggregates } from '@/lib/fuel/votes';

const VALID_VALUES = [-1, 0, 1];

// POST - cast/change/remove a vote on a community fuel price submission.
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const meId = session.user.id;

    const body = await request.json().catch(() => ({}));
    const fuelPriceId = typeof body?.fuelPriceId === 'string' ? body.fuelPriceId : '';
    const value = Number(body?.value);

    if (!fuelPriceId) {
      return NextResponse.json({ error: 'fuelPriceId is required' }, { status: 400 });
    }
    if (!VALID_VALUES.includes(value)) {
      return NextResponse.json({ error: 'value must be one of -1, 0, 1' }, { status: 400 });
    }

    const price = await prisma.communityFuelPrice.findUnique({
      where: { id: fuelPriceId },
      select: { id: true, userId: true },
    });
    if (!price) {
      return NextResponse.json({ error: 'Fuel price submission not found' }, { status: 404 });
    }
    if (price.userId && price.userId === meId) {
      return NextResponse.json(
        { error: "You can't vote on your own submission." },
        { status: 403 }
      );
    }

    const existing = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT [id] FROM [FuelPriceVote]
      WHERE [fuelPriceId] = ${fuelPriceId} AND [userId] = ${meId}
    `;

    if (value === 0) {
      if (existing.length > 0) {
        await prisma.$executeRaw`
          DELETE FROM [FuelPriceVote]
          WHERE [fuelPriceId] = ${fuelPriceId} AND [userId] = ${meId}
        `;
      }
    } else if (existing.length > 0) {
      await prisma.$executeRaw`
        UPDATE [FuelPriceVote]
        SET [value] = ${value}, [updatedAt] = GETDATE()
        WHERE [fuelPriceId] = ${fuelPriceId} AND [userId] = ${meId}
      `;
    } else {
      const id = randomUUID();
      await prisma.$executeRaw`
        INSERT INTO [FuelPriceVote] ([id], [fuelPriceId], [userId], [value], [createdAt], [updatedAt])
        VALUES (${id}, ${fuelPriceId}, ${meId}, ${value}, GETDATE(), GETDATE())
      `;
    }

    const aggregates = await getVoteAggregates(prisma, [fuelPriceId], meId);
    const agg = aggregates.get(fuelPriceId) ?? { up: 0, down: 0, myVote: 0 };

    return NextResponse.json({
      fuelPriceId,
      upvotes: agg.up,
      downvotes: agg.down,
      score: voteScore(agg.up, agg.down),
      myVote: agg.myVote,
      disputed: isDisputed(agg.up, agg.down),
    });
  } catch (error) {
    console.error('Failed to vote on fuel price', error);
    return NextResponse.json({ error: 'Failed to vote on fuel price' }, { status: 500 });
  }
}
