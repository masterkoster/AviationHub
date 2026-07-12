import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/admin/stats - Overview statistics
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = (session.user as any)?.role;
    if (role !== 'admin' && role !== 'owner') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const now = new Date();

    // Independent count/aggregate queries run concurrently rather than as
    // sequential round-trips.
    const [
      totalUsers,
      tierCounts,
      newUsersThisWeek,
      newUsers30Days,
      openErrorReports,
      totalFlightPlans,
      totalGroups,
      totalAircraft,
      bookingsLast30Days,
      listingCounts,
      totalListings,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.groupBy({ by: ['tier'], _count: { _all: true }, orderBy: { tier: 'asc' } }),
      prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      prisma.errorReport.count({ where: { status: 'open' } }),
      prisma.flightPlan.count(),
      prisma.organization.count(),
      prisma.clubAircraft.count(),
      prisma.booking.count({ where: { startTime: { gte: thirtyDaysAgo, lte: now } } }),
      prisma.marketplaceListing.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.marketplaceListing.count(),
    ]);

    const freeUsers = Number(tierCounts.find((t) => t.tier === 'free')?._count?._all || 0);
    const proUsers = Number(tierCounts.find((t) => t.tier === 'pro')?._count?._all || 0);

    const listingCountMap = new Map(listingCounts.map((l) => [l.status, l._count._all]));

    // Estimate revenue (assuming $39.99/year for pro users)
    const estimatedAnnualRevenue = proUsers * 39.99;
    const estimatedMRR = (proUsers * 39.99) / 12;

    return NextResponse.json({
      totalUsers,
      freeUsers,
      proUsers,
      newUsersThisWeek,
      newUsers30Days,
      openErrorReports,
      totalFlightPlans,
      totalGroups,
      totalAircraft,
      bookingsLast30Days,
      totalListings,
      listingActive: Number(listingCountMap.get('active') || 0),
      listingPending: Number(listingCountMap.get('pending') || 0),
      listingFlagged: Number(listingCountMap.get('flagged') || 0),
      listingSold: Number(listingCountMap.get('sold') || 0),
      estimatedAnnualRevenue: Math.round(estimatedAnnualRevenue * 100) / 100,
      estimatedMRR: Math.round(estimatedMRR * 100) / 100,
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
