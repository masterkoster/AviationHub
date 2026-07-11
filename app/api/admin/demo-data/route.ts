import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// POST /api/admin/demo-data - Generate demo data based on config
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const user = await prisma.$queryRaw`
      SELECT role FROM [User] WHERE email = ${session.user.email}
    ` as any[];

    if (!user || user.length === 0 || user[0].role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { seedAll = true, dataTypes = [] } = body;

    const results: Record<string, any> = {};

    // Get demo data config
    const demoConfig = await prisma.$queryRaw`
      SELECT * FROM DemoData WHERE enabled = 1
    ` as any[];

    const enabledTypes = demoConfig.map((d: any) => d.key);

    // Default to all if none specified
    const typesToSeed = dataTypes.length > 0 
      ? dataTypes 
      : (seedAll ? enabledTypes : ['clubs']);

    // Helper to generate UUIDs deterministically
    const generateId = (prefix: string, index: number) => {
      const hex = index.toString(16).padStart(8, '0');
      return `${prefix}${hex}-${prefix.slice(0, 4)}-0000-000000000000`.slice(0, 36);
    };

    // Seed Clubs
    if (typesToSeed.includes('clubs')) {
      const clubs = [
        { name: 'Sky High Flying Club', description: 'A welcoming club for pilots of all experience levels' },
        { name: 'Weekend Warriors', description: 'Casual flying group for weekend adventures' },
      ];

      for (let i = 0; i < clubs.length; i++) {
        const clubId = generateId('club', i);
        const ownerId = generateId('user', i);
        await prisma.$executeRaw`
          IF NOT EXISTS (SELECT 1 FROM FlyingGroup WHERE id = ${clubId})
          INSERT INTO FlyingGroup (id, name, description, ownerId, createdAt)
          VALUES (${clubId}, ${clubs[i].name}, ${clubs[i].description}, ${ownerId}, GETDATE())
        `;
      }
      results.clubs = { created: clubs.length };
    }

    // Seed Aircraft
    if (typesToSeed.includes('aircraft')) {
      const aircraft = [
        { clubIndex: 0, nNumber: 'N172SP', nickname: 'Skyhawk', make: 'Cessna', model: '172S', year: 2020, rate: 165 },
        { clubIndex: 0, nNumber: 'N9876P', nickname: 'Warrior', make: 'Piper', model: 'PA-28-161', year: 2019, rate: 145 },
        { clubIndex: 0, nNumber: 'N345AB', nickname: 'Archer', make: 'Piper', model: 'PA-28-181', year: 2021, rate: 175 },
        { clubIndex: 1, nNumber: 'N5678C', nickname: 'Cherokee', make: 'Piper', model: 'PA-32-300', year: 2018, rate: 135 },
        { clubIndex: 1, nNumber: 'N9999X', nickname: 'Skylane', make: 'Cessna', model: '182S', year: 2022, rate: 195 },
      ];

      for (let i = 0; i < aircraft.length; i++) {
        const a = aircraft[i];
        const aircraftId = generateId('airc', i);
        const clubId = generateId('club', a.clubIndex);
        const totalHobbsHours = 1000 + i * 200;

        await prisma.$executeRaw`
          IF NOT EXISTS (SELECT 1 FROM ClubAircraft WHERE id = ${aircraftId})
          INSERT INTO ClubAircraft (id, groupId, nNumber, nickname, make, model, year, hourlyRate, totalHobbsHours, status, bookingWindowDays, createdAt)
          VALUES (${aircraftId}, ${clubId}, ${a.nNumber}, ${a.nickname}, ${a.make}, ${a.model}, ${a.year}, ${a.rate}, ${totalHobbsHours}, 'Available', 30, GETDATE())
        `;
      }
      results.aircraft = { created: aircraft.length };
    }

    // Seed Users
    if (typesToSeed.includes('users')) {
      const users = [
        { email: 'admin@skyhigh.com', name: 'John Smith' },
        { email: 'pilot@skyhigh.com', name: 'Jane Doe' },
        { email: 'cfi@skyhigh.com', name: 'Mike Wilson' },
        { email: 'pilot2@skyhigh.com', name: 'Sarah Johnson' },
        { email: 'admin@weekend.com', name: 'Alice Cooper' },
        { email: 'pilot@weekend.com', name: 'Bob Miller' },
      ];

      for (let i = 0; i < users.length; i++) {
        const u = users[i];
        const userId = generateId('user', i);
        const username = u.email.split('@')[0];

        await prisma.$executeRaw`
          IF NOT EXISTS (SELECT 1 FROM [User] WHERE email = ${u.email})
          INSERT INTO [User] (id, email, name, username, createdAt)
          VALUES (${userId}, ${u.email}, ${u.name}, ${username}, GETDATE())
        `;

        // Set some pilot credentials
        if (i > 0 && i < 5) {
          const bfrDate = new Date();
          bfrDate.setMonth(bfrDate.getMonth() + 6);
          const medicalDate = new Date();
          medicalDate.setMonth(medicalDate.getMonth() + 18);

          await prisma.$executeRaw`
            UPDATE [User] SET bfrExpiry = ${bfrDate.toISOString()}, medicalExpiry = ${medicalDate.toISOString()}, medicalClass = '2'
            WHERE email = ${u.email}
          `;
        }
      }
      results.users = { created: users.length };
    }

    // Seed Memberships
    if (typesToSeed.includes('memberships')) {
      const memberships = [
        { userIndex: 0, clubIndex: 0, role: 'ADMIN' },
        { userIndex: 1, clubIndex: 0, role: 'MEMBER' },
        { userIndex: 2, clubIndex: 0, role: 'CFI' },
        { userIndex: 3, clubIndex: 0, role: 'MEMBER' },
        { userIndex: 4, clubIndex: 1, role: 'ADMIN' },
        { userIndex: 5, clubIndex: 1, role: 'MEMBER' },
      ];

      for (let i = 0; i < memberships.length; i++) {
        const m = memberships[i];
        const userId = generateId('user', m.userIndex);
        const clubId = generateId('club', m.clubIndex);

        await prisma.$executeRaw`
          IF NOT EXISTS (SELECT 1 FROM GroupMember WHERE userId = ${userId} AND groupId = ${clubId})
          INSERT INTO GroupMember (id, userId, groupId, role, joinedAt)
          VALUES (NEWID(), ${userId}, ${clubId}, ${m.role}, GETDATE())
        `;
      }
      results.memberships = { created: memberships.length };
    }

    // Seed Bookings
    if (typesToSeed.includes('bookings')) {
      const now = new Date();
      const bookings: { clubIndex: number; userIndex: number; aircraftIndex: number; daysOffset: number; purpose: string }[] = [];

      // Past bookings (last 30 days)
      for (let i = 0; i < 10; i++) {
        bookings.push({
          clubIndex: i % 2,
          userIndex: i % 4,
          aircraftIndex: i % 3,
          daysOffset: -Math.floor(Math.random() * 30),
          purpose: ['Training', 'Cross Country', 'Local Practice', 'Night Flight'][i % 4],
        });
      }

      // Future bookings (next 14 days)
      for (let i = 0; i < 10; i++) {
        bookings.push({
          clubIndex: i % 2,
          userIndex: i % 4,
          aircraftIndex: i % 3,
          daysOffset: Math.floor(Math.random() * 14) + 1,
          purpose: ['Training', 'Cross Country', 'Local Practice', 'Night Flight'][i % 4],
        });
      }

      for (let i = 0; i < bookings.length; i++) {
        const b = bookings[i];
        const date = new Date(now);
        date.setDate(date.getDate() + b.daysOffset);
        date.setHours(9 + (i % 8), 0, 0, 0);
        
        const startTime = date.toISOString();
        const endDate = new Date(date);
        endDate.setHours(endDate.getHours() + 1 + (i % 3));
        const endTime = endDate.toISOString();

        const aircraftId = generateId('airc', b.aircraftIndex);
        const userId = generateId('user', b.userIndex);

        await prisma.$executeRaw`
          INSERT INTO Booking (id, aircraftId, userId, startTime, endTime, purpose, createdAt)
          VALUES (NEWID(), ${aircraftId}, ${userId}, ${startTime}, ${endTime}, ${b.purpose}, GETDATE())
        `;
      }
      results.bookings = { created: bookings.length };
    }

    // Seed Flight Logs
    if (typesToSeed.includes('flights')) {
      const now = new Date();
      
      for (let i = 0; i < 30; i++) {
        const date = new Date(now);
        date.setDate(date.getDate() - Math.floor(Math.random() * 90));
        
        const aircraftIndex = i % 5;
        const userIndex = i % 4;
        
        const aircraftId = generateId('airc', aircraftIndex);
        const userId = generateId('user', userIndex);
        const hobbsTime = 0.5 + Math.random() * 2.5;
        
        const rates = [165, 145, 175, 135, 195];
        const hourlyRate = rates[aircraftIndex];
        const hobbsStart = Number((1000 + i * 0.1).toFixed(1));
        const hobbsEnd = Number((1000 + i * 0.1 + hobbsTime).toFixed(1));
        const calculatedCost = Number((hobbsTime * hourlyRate).toFixed(2));
        const hobbsTimeRounded = Number(hobbsTime.toFixed(2));

        await prisma.$executeRaw`
          INSERT INTO FlightLog (id, aircraftId, userId, date, hobbsTime, hobbsStart, hobbsEnd, calculatedCost, createdAt)
          VALUES (
            NEWID(),
            ${aircraftId},
            ${userId},
            ${date.toISOString()},
            ${hobbsTimeRounded},
            ${hobbsStart},
            ${hobbsEnd},
            ${calculatedCost},
            GETDATE()
          )
        `;
      }
      results.flights = { created: 30 };
    }

    // Seed Logbook Entries
    if (typesToSeed.includes('logbook')) {
      const now = new Date();
      
      for (let userIndex = 0; userIndex < 4; userIndex++) {
        for (let i = 0; i < 5; i++) {
          const date = new Date(now);
          date.setDate(date.getDate() - Math.floor(Math.random() * 80));
          
          const userId = generateId('user', userIndex);
          const totalTime = Number((1 + Math.random() * 2).toFixed(1));
          const dayLandings = Math.floor(Math.random() * 3) + 1;
          const nightLandings = Math.random() > 0.5 ? Math.floor(Math.random() * 2) : 0;

          await prisma.$executeRaw`
            INSERT INTO LogbookEntry (id, userId, date, aircraft, routeFrom, routeTo, totalTime, dayLandings, nightLandings, createdAt)
            VALUES (
              NEWID(),
              ${userId},
              ${date.toISOString()},
              'Cessna 172',
              'KABC',
              'KXYZ',
              ${totalTime},
              ${dayLandings},
              ${nightLandings},
              GETDATE()
            )
          `;
        }
      }
      results.logbook = { created: 20 };
    }

    return NextResponse.json({
      success: true,
      message: 'Demo data generated successfully',
      results,
    });
  } catch (error) {
    console.error('Error generating demo data:', error);
    return NextResponse.json({ error: 'Failed to generate demo data' }, { status: 500 });
  }
}

// GET /api/admin/demo-data - Get demo data config
export async function GET() {
  try {
    const demoConfig = await prisma.$queryRaw`
      SELECT * FROM DemoData ORDER BY [key]
    ` as any[];

    return NextResponse.json(demoConfig);
  } catch (error) {
    // Table might not exist yet
    return NextResponse.json([
      { key: 'clubs', enabled: true },
      { key: 'aircraft', enabled: true },
      { key: 'users', enabled: true },
      { key: 'memberships', enabled: true },
      { key: 'bookings', enabled: true },
      { key: 'flights', enabled: true },
      { key: 'logbook', enabled: true },
    ]);
  }
}
