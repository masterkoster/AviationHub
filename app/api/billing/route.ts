import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { isUuid } from '@/lib/validate';

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user by email using raw SQL
    const users = await prisma.$queryRaw`
      SELECT id FROM [User] WHERE email = ${session.user.email}
    ` as any[];

    if (!users || users.length === 0) {
      return NextResponse.json({ error: '[User] not found' }, { status: 404 });
    }

    const userId = users[0].id;

    // Check admin role using raw SQL
    const adminMemberships = await prisma.$queryRaw`
      SELECT * FROM GroupMember WHERE userId = ${userId} AND role = 'ADMIN'
    ` as any[];

    if (!adminMemberships || adminMemberships.length === 0) {
      return NextResponse.json({ error: 'Only admins can view billing' }, { status: 403 });
    }

    const url = new URL(request.url);
    const month = parseInt(url.searchParams.get('month') || new Date().getMonth().toString());
    const year = parseInt(url.searchParams.get('year') || new Date().getFullYear().toString());
    const groupId = url.searchParams.get('groupId') || null;
    if (groupId && !isUuid(groupId)) {
      return NextResponse.json({ error: 'Invalid groupId' }, { status: 400 });
    }

    // Get start and end of month
    const startDate = new Date(year, month, 1).toISOString();
    const endDate = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

    // Get admin group IDs
    const adminGroupIds = adminMemberships.map((m: any) => m.groupId);

    // Filter by specific group if provided
    const targetGroupIds = groupId && adminGroupIds.includes(groupId) ? [groupId] : adminGroupIds;

    if (targetGroupIds.length === 0) {
      return NextResponse.json({ error: 'No group selected' }, { status: 400 });
    }

    // Get flight logs for the month using raw SQL
    const flightLogs = await prisma.$queryRaw`
      SELECT
        fl.*,
        a.nNumber, a.customName, a.nickname, a.hourlyRate,
        u.name as userName, u.email as userEmail
      FROM FlightLog fl
      JOIN ClubAircraft a ON fl.aircraftId = a.id
      JOIN [User] u ON fl.userId = u.id
      WHERE fl.date >= ${startDate} AND fl.date <= ${endDate}
      AND a.groupId IN (${Prisma.join(targetGroupIds)})
    ` as any[];

    // Calculate billing per member
    const billingByMember: Record<string, any> = {};

    for (const log of flightLogs) {
      const userId = log.userId;
      const userName = log.userName || 'Unknown';
      const userEmail = log.userEmail || '';
      
      const hobbsUsed = log.hobbsTime ? Number(log.hobbsTime) : 0;
      const tachUsed = log.tachTime ? Number(log.tachTime) : 0;
      const hourlyRate = log.hourlyRate ? Number(log.hourlyRate) : 0;
      const cost = hobbsUsed * hourlyRate;

      if (!billingByMember[userId]) {
        billingByMember[userId] = {
          userId,
          name: userName,
          email: userEmail,
          flights: 0,
          totalHobbs: 0,
          totalTach: 0,
          totalCost: 0,
          details: [],
        };
      }

      billingByMember[userId].flights++;
      billingByMember[userId].totalHobbs += hobbsUsed;
      billingByMember[userId].totalTach += tachUsed;
      billingByMember[userId].totalCost += cost;
      billingByMember[userId].details.push({
        date: log.date,
        aircraft: log.nNumber || log.customName || 'Unknown',
        hobbs: hobbsUsed,
        tach: tachUsed,
        cost,
      });
    }

    const result = Object.values(billingByMember).map((m: any) => ({
      ...m,
      totalCost: Math.round(m.totalCost * 100) / 100,
    }));

    // Sort by total cost descending
    result.sort((a: any, b: any) => b.totalCost - a.totalCost);

    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    return NextResponse.json({
      month: MONTHS[month],
      year,
      totalMembers: result.length,
      totalFlights: result.reduce((sum: number, m: any) => sum + m.flights, 0),
      totalHobbs: result.reduce((sum: number, m: any) => sum + m.totalHobbs, 0),
      totalCost: result.reduce((sum: number, m: any) => sum + m.totalCost, 0),
      members: result,
    });
  } catch (error) {
    console.error('Error fetching billing:', error);
    return NextResponse.json({ error: 'Failed to fetch billing' }, { status: 500 });
  }
}
