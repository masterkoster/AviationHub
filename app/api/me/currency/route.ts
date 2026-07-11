import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/me/currency - Get detailed currency status
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user with credentials
    const user = await prisma.$queryRaw`
      SELECT id, name, bfrExpiry, medicalExpiry, medicalClass
      FROM [User] WHERE email = ${session.user.email}
    ` as any[];

    if (!user || user.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userData = user[0];
    const userId = userData.id;

    // Calculate date ranges
    const today = new Date();
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    
    const calendarMonthsAgo = new Date();
    calendarMonthsAgo.setMonth(calendarMonthsAgo.getMonth() - 24);

    // Get landings in last 90 days
    const landings90Days = await prisma.$queryRaw`
      SELECT
        SUM(dayLandings) as dayLandings,
        SUM(nightLandings) as nightLandings
      FROM LogbookEntry
      WHERE userId = ${userId}
      AND date >= ${ninetyDaysAgo.toISOString()}
    ` as any[];

    const dayLandings = landings90Days && landings90Days.length > 0 
      ? parseInt(landings90Days[0].dayLandings || 0) 
      : 0;
    const nightLandings = landings90Days && landings90Days.length > 0 
      ? parseInt(landings90Days[0].nightLandings || 0) 
      : 0;

    // Get BFR status
    const bfrEntries = await prisma.$queryRaw`
      SELECT TOP 1 date FROM LogbookEntry
      WHERE userId = ${userId} AND dualGiven > 0
      ORDER BY date DESC
    ` as any[];

    const lastBFRDate = bfrEntries && bfrEntries.length > 0 ? new Date(bfrEntries[0].date) : null;
    const bfrExpiry = userData.bfrExpiry ? new Date(userData.bfrExpiry) : null;
    
    // Calculate BFR due date (24 calendar months from last BFR)
    let bfrDueDate: Date | null = null;
    if (lastBFRDate) {
      bfrDueDate = new Date(lastBFRDate);
      bfrDueDate.setMonth(bfrDueDate.getMonth() + 24);
    } else if (bfrExpiry) {
      bfrDueDate = bfrExpiry;
    }

    const bfrDays = bfrDueDate 
      ? Math.ceil((bfrDueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    // Get medical status
    const medicalExpiry = userData.medicalExpiry ? new Date(userData.medicalExpiry) : null;
    const medicalDays = medicalExpiry 
      ? Math.ceil((medicalExpiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    // Build response
    const response: any = {
      vfrDay: {
        current: dayLandings >= 3,
        landings: dayLandings,
        required: 3,
        window: 90,
        description: '3 takeoffs/landings in last 90 days',
      },
      vfrNight: {
        current: nightLandings >= 3,
        landings: nightLandings,
        required: 3,
        window: 90,
        description: '3 night takeoffs/landings in last 90 days',
      },
    };

    // BFR
    if (bfrDueDate) {
      response.bfr = {
        current: bfrDays !== null && bfrDays > 0,
        daysRemaining: bfrDays,
        dueDate: bfrDueDate,
        lastBFRDate: lastBFRDate,
        description: 'Biennial Flight Review (24 calendar months)',
        alerts: bfrDays !== null && bfrDays <= 60 ? [
          { days: 60, label: 'Due in 60 days', active: bfrDays <= 60 && bfrDays > 30 },
          { days: 30, label: 'Due in 30 days', active: bfrDays <= 30 && bfrDays > 14 },
          { days: 14, label: 'Due in 14 days - URGENT', active: bfrDays <= 14 },
        ] : [],
      };
    } else {
      response.bfr = {
        current: false,
        notCompleted: true,
        description: 'Biennial Flight Review - No BFR on record',
      };
    }

    // Medical
    if (medicalExpiry) {
      response.medical = {
        current: medicalDays !== null && medicalDays > 0,
        daysRemaining: medicalDays,
        expiresAt: medicalExpiry,
        class: userData.medicalClass || 'Unknown',
        description: `Class ${userData.medicalClass || '?'} Medical`,
        alerts: medicalDays !== null && medicalDays <= 30 ? [
          { days: 30, label: 'Expires in 30 days', active: medicalDays <= 30 && medicalDays > 14 },
          { days: 14, label: 'Expires in 14 days', active: medicalDays <= 14 && medicalDays > 7 },
          { days: 7, label: 'Expires in 7 days - URGENT', active: medicalDays <= 7 },
        ] : [],
      };
    } else {
      response.medical = {
        current: false,
        notOnFile: true,
        description: 'No medical on file',
      };
    }

    // Summary status
    response.summary = {
      allCurrent: (
        dayLandings >= 3 &&
        nightLandings >= 3 &&
        (bfrDays === null || bfrDays > 0) &&
        (medicalDays === null || medicalDays > 0)
      ),
      needsAttention: [] as string[],
    };

    if (dayLandings < 3) response.summary.needsAttention.push('VFR Day currency');
    if (nightLandings < 3) response.summary.needsAttention.push('VFR Night currency');
    if (bfrDays !== null && bfrDays <= 60) response.summary.needsAttention.push('BFR due');
    if (medicalDays !== null && medicalDays <= 30) response.summary.needsAttention.push('Medical expiring');

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching currency:', error);
    return NextResponse.json({ error: 'Failed to fetch currency' }, { status: 500 });
  }
}

// PATCH /api/me/currency - Update pilot credentials
export async function PATCH(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { bfrExpiry, medicalExpiry, medicalClass } = body;

    const MEDICAL_CLASSES = ['1', '2', '3'];
    if (medicalClass && !MEDICAL_CLASSES.includes(String(medicalClass))) {
      return NextResponse.json({ error: 'Invalid medicalClass' }, { status: 400 });
    }

    if (!bfrExpiry && !medicalExpiry && !medicalClass) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const bfrExpiryValue = bfrExpiry ? new Date(bfrExpiry).toISOString() : null;
    const medicalExpiryValue = medicalExpiry ? new Date(medicalExpiry).toISOString() : null;

    await prisma.$executeRaw`
      UPDATE [User]
      SET
        bfrExpiry = COALESCE(${bfrExpiryValue}, bfrExpiry),
        medicalExpiry = COALESCE(${medicalExpiryValue}, medicalExpiry),
        medicalClass = COALESCE(${medicalClass ? String(medicalClass) : null}, medicalClass)
      WHERE email = ${session.user.email}
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating currency:', error);
    return NextResponse.json({ error: 'Failed to update currency' }, { status: 500 });
  }
}
