import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/me/dashboard - Get pilot dashboard data
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user
    const user = await prisma.$queryRaw`
      SELECT id, name, email, bfrExpiry, medicalExpiry, medicalClass, credits
      FROM [User] WHERE email = ${session.user.email}
    ` as any[];

    if (!user || user.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userData = user[0];
    const userId = userData.id;

    // Get recent flights (last 10)
    const recentFlights = await prisma.$queryRaw`
      SELECT TOP 10
        fl.id, fl.date, fl.routeFrom, fl.routeTo, fl.totalTime, fl.hobbsTime,
        a.nNumber, a.customName
      FROM FlightLog fl
      JOIN ClubAircraft a ON fl.aircraftId = a.id
      WHERE fl.userId = ${userId}
      ORDER BY fl.date DESC
    ` as any[];

    // Get time totals
    const totals = await prisma.$queryRaw`
      SELECT
        SUM(fl.totalTime) as totalTime,
        SUM(fl.soloTime) as soloTime,
        SUM(fl.nightTime) as nightTime,
        SUM(fl.instrumentTime) as instrumentTime,
        SUM(fl.crossCountryTime) as crossCountryTime
      FROM LogbookEntry fl
      WHERE fl.userId = ${userId}
    ` as any[];

    // Get member clubs
    const clubs = await prisma.$queryRaw`
      SELECT fg.id, fg.name, gm.role
      FROM GroupMember gm
      JOIN FlyingGroup fg ON gm.groupId = fg.id
      WHERE gm.userId = ${userId}
    ` as any[];

    // Get active flights (checked out)
    const activeFlights = await prisma.$queryRaw`
      SELECT fl.id, fl.hobbsStart, fl.checkedOutAt, a.nNumber, a.customName
      FROM FlightLog fl
      JOIN ClubAircraft a ON fl.aircraftId = a.id
      WHERE fl.userId = ${userId} AND fl.hobbsEnd IS NULL
    ` as any[];

    // Calculate currency status
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const recentLandings = await prisma.$queryRaw`
      SELECT
        SUM(dayLandings) as dayLandings,
        SUM(nightLandings) as nightLandings
      FROM LogbookEntry
      WHERE userId = ${userId} AND date >= ${ninetyDaysAgo}
    ` as any[];

    const dayLandings = recentLandings && recentLandings.length > 0
      ? (recentLandings[0].dayLandings || 0)
      : 0;
    const nightLandings = recentLandings && recentLandings.length > 0
      ? (recentLandings[0].nightLandings || 0)
      : 0;

    // Currency calculations
    const today = new Date();
    const bfrExpiry = userData.bfrExpiry ? new Date(userData.bfrExpiry) : null;
    const medicalExpiry = userData.medicalExpiry ? new Date(userData.medicalExpiry) : null;

    const bfrDays = bfrExpiry ? Math.ceil((bfrExpiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null;
    const medicalDays = medicalExpiry ? Math.ceil((medicalExpiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null;

    return NextResponse.json({
      user: {
        id: userData.id,
        name: userData.name,
        email: userData.email,
        credits: userData.credits,
      },
      recentFlights: recentFlights.map(f => ({
        id: f.id,
        date: f.date,
        route: `${f.routeFrom} → ${f.routeTo}`,
        totalTime: f.totalTime,
        hobbsTime: f.hobbsTime,
        aircraft: f.nNumber || f.customName,
      })),
      totals: {
        totalTime: totals && totals.length > 0 ? parseFloat(totals[0].totalTime || 0) : 0,
        soloTime: totals && totals.length > 0 ? parseFloat(totals[0].soloTime || 0) : 0,
        nightTime: totals && totals.length > 0 ? parseFloat(totals[0].nightTime || 0) : 0,
        instrumentTime: totals && totals.length > 0 ? parseFloat(totals[0].instrumentTime || 0) : 0,
        crossCountryTime: totals && totals.length > 0 ? parseFloat(totals[0].crossCountryTime || 0) : 0,
      },
      currency: {
        vfrDay: {
          current: dayLandings >= 3,
          landings: dayLandings,
          required: 3,
          window: 90,
        },
        vfrNight: {
          current: nightLandings >= 3,
          landings: nightLandings,
          required: 3,
          window: 90,
        },
        bfr: bfrDays !== null ? {
          daysRemaining: bfrDays,
          expiresAt: bfrExpiry,
          alert: bfrDays <= 60,
        } : null,
        medical: medicalDays !== null ? {
          daysRemaining: medicalDays,
          expiresAt: medicalExpiry,
          class: userData.medicalClass,
          alert: medicalDays <= 30,
        } : null,
      },
      clubs: clubs.map(c => ({
        id: c.id,
        name: c.name,
        role: c.role,
      })),
      activeFlight: activeFlights && activeFlights.length > 0 ? {
        id: activeFlights[0].id,
        aircraft: activeFlights[0].nNumber || activeFlights[0].customName,
        hobbsStart: activeFlights[0].hobbsStart,
        checkedOutAt: activeFlights[0].checkedOutAt,
      } : null,
    });
  } catch (error) {
    console.error('Error fetching dashboard:', error);
    return NextResponse.json({ error: 'Failed to fetch dashboard' }, { status: 500 });
  }
}
