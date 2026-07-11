import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

// GET all active partnership profiles
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const airport = url.searchParams.get('airport');
    const state = url.searchParams.get('state');
    const experience = url.searchParams.get('experience');

    // Get user by email using parameterized SQL
    const users = await prisma.$queryRaw`
      SELECT id FROM [User] WHERE email = ${session.user.email}
    ` as any[];

    if (!users || users.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userId = users[0].id;

    // Try to get partnership profile with parameterized SQL
    let profiles: any[] = [];
    try {
      const conditions: Prisma.Sql[] = [Prisma.sql`pp.isActive = 1`];

      if (airport) {
        conditions.push(Prisma.sql`pp.homeAirport LIKE ${'%' + airport.toUpperCase() + '%'}`);
      }
      if (state) {
        conditions.push(Prisma.sql`pp.state LIKE ${'%' + state.toUpperCase() + '%'}`);
      }
      if (experience) {
        conditions.push(Prisma.sql`pp.experienceLevel LIKE ${'%' + experience + '%'}`);
      }

      // Exclude current user's profile
      conditions.push(Prisma.sql`pp.userId != ${userId}`);

      const whereClause = Prisma.join(conditions, ' AND ');

      profiles = await prisma.$queryRaw`
        SELECT pp.*, u.name as userName, u.email as userEmail
        FROM PartnershipProfile pp
        JOIN [User] u ON pp.userId = u.id
        WHERE ${whereClause}
        ORDER BY pp.createdAt DESC
      ` as any[];
    } catch (e) {
      // Partnership table might not exist yet
      console.error('Partnership table error:', e);
      return NextResponse.json([]);
    }

    return NextResponse.json(profiles);
  } catch (error) {
    console.error('Error fetching partnerships:', error);
    return NextResponse.json({ error: 'Failed to fetch partnerships' }, { status: 500 });
  }
}

// POST create or update user's partnership profile
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user by email using parameterized SQL
    const users = await prisma.$queryRaw`
      SELECT id FROM [User] WHERE email = ${session.user.email}
    ` as any[];

    if (!users || users.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userId = users[0].id;

    const body = await request.json();
    const {
      availability,
      flightInterests,
      homeAirport,
      experienceLevel,
      bio,
      lookingFor,
      isActive,
      city,
      state
    } = body;

    // Geocode city/state to lat/long (free Nominatim API)
    let latitude: number | null = null;
    let longitude: number | null = null;

    if (city && state) {
      try {
        const geoUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(city)},${encodeURIComponent(state)},USA&limit=1`;
        const geoRes = await fetch(geoUrl, {
          headers: { 'User-Agent': 'AviationDashboard/1.0' }
        });
        const geoData = await geoRes.json();
        if (geoData && geoData.length > 0) {
          latitude = parseFloat(geoData[0].lat);
          longitude = parseFloat(geoData[0].lon);
        }
      } catch (geoError) {
        console.error('Geocoding error:', geoError);
        // Continue without coordinates
      }
    }

    // Check if profile exists using parameterized SQL
    const existing = await prisma.$queryRaw`
      SELECT id FROM PartnershipProfile WHERE userId = ${userId}
    ` as any[];

    const profileId = existing.length > 0 ? existing[0].id : crypto.randomUUID();

    const availabilityJson = availability === null || availability === undefined ? null : JSON.stringify(availability);
    const flightInterestsJson = flightInterests === null || flightInterests === undefined ? null : JSON.stringify(flightInterests);
    const lookingForJson = lookingFor === null || lookingFor === undefined ? null : JSON.stringify(lookingFor);
    const homeAirportVal = homeAirport ? String(homeAirport).toUpperCase() : null;
    const stateVal = state ? String(state).toUpperCase() : null;
    const isActiveVal = isActive !== false ? 1 : 0;

    if (existing.length > 0) {
      // Update existing profile
      await prisma.$executeRaw`
        UPDATE PartnershipProfile SET
          availability = ${availabilityJson},
          flightInterests = ${flightInterestsJson},
          homeAirport = ${homeAirportVal},
          experienceLevel = ${experienceLevel ?? null},
          bio = ${bio ?? null},
          lookingFor = ${lookingForJson},
          isActive = ${isActiveVal},
          city = ${city ?? null},
          state = ${stateVal},
          latitude = ${latitude},
          longitude = ${longitude},
          updatedAt = GETDATE()
        WHERE userId = ${userId}
      `;
    } else {
      // Insert new profile
      await prisma.$executeRaw`
        INSERT INTO PartnershipProfile (id, userId, availability, flightInterests, homeAirport, experienceLevel, bio, lookingFor, isActive, city, state, latitude, longitude, createdAt, updatedAt)
        VALUES (
          ${profileId},
          ${userId},
          ${availabilityJson},
          ${flightInterestsJson},
          ${homeAirportVal},
          ${experienceLevel ?? null},
          ${bio ?? null},
          ${lookingForJson},
          ${isActiveVal},
          ${city ?? null},
          ${stateVal},
          ${latitude},
          ${longitude},
          GETDATE(),
          GETDATE()
        )
      `;
    }

    // Fetch and return the updated profile
    const profiles = await prisma.$queryRaw`
      SELECT pp.*, u.name as userName, u.email as userEmail
      FROM PartnershipProfile pp
      JOIN [User] u ON pp.userId = u.id
      WHERE pp.userId = ${userId}
    ` as any[];

    return NextResponse.json(profiles[0] || {});
  } catch (error) {
    console.error('Error saving partnership profile:', error);
    return NextResponse.json({
      error: 'Failed to save profile',
      hint: 'Make sure PartnershipProfile table exists in the database'
    }, { status: 500 });
  }
}
