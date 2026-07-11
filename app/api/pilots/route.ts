import { NextResponse } from 'next/server';
import { prisma } from '@/lib/auth';

const PUBLIC_PROFILE_SELECT = {
  id: true,
  userId: true,
  homeAirport: true,
  ratings: true,
  availability: true,
  aircraft: true,
  hours: true,
  bio: true,
  createdAt: true,
  user: {
    select: {
      id: true,
      name: true,
      username: true,
      tier: true,
    },
  },
} as const;

export async function GET(request: Request) {
  try {
    await ensurePilotProfileTable();
    const url = new URL(request.url);
    const rating = url.searchParams.get('rating');
    const airport = url.searchParams.get('airport');
    const availability = url.searchParams.get('availability');
    const query = url.searchParams.get('q');

    const where: any = {};
    if (airport) {
      where.homeAirport = airport.toUpperCase();
    }
    if (availability) {
      where.availability = availability;
    }
    if (rating) {
      where.ratings = { contains: rating };
    }
    if (query) {
      const term = query.trim();
      where.OR = [
        { bio: { contains: term } },
        { aircraft: { contains: term } },
        {
          user: {
            OR: [
              { name: { contains: term } },
              { username: { contains: term } },
            ],
          },
        },
      ];
    }

    const profiles = await prisma.pilotProfile.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 200,
      select: PUBLIC_PROFILE_SELECT,
    });

    return NextResponse.json({
      profiles: profiles.map(serializeProfile),
    });
  } catch (error) {
    console.error('Pilot directory GET failed', error);
    return NextResponse.json({ error: 'Failed to load pilot profiles' }, { status: 500 });
  }
}

async function ensurePilotProfileTable() {
  try {
    await prisma.$executeRaw`
      IF OBJECT_ID('PilotProfile', 'U') IS NULL
      BEGIN
        CREATE TABLE PilotProfile (
          id NVARCHAR(36) NOT NULL PRIMARY KEY,
          userId NVARCHAR(36) NOT NULL UNIQUE,
          homeAirport NVARCHAR(10) NULL,
          ratings NVARCHAR(MAX) NULL,
          availability NVARCHAR(50) NULL,
          aircraft NVARCHAR(MAX) NULL,
          hours INT NULL,
          bio NVARCHAR(MAX) NULL,
          createdAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          updatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
        );
        CREATE INDEX idx_pilotprofile_homeAirport ON PilotProfile(homeAirport);
      END
    `;
  } catch (error) {
    console.error('Failed to ensure PilotProfile table:', error);
  }
}

function serializeProfile(profile: any) {
  return {
    ...profile,
    ratings: profile.ratings ? safeParseJSON(profile.ratings) : [],
    user: profile.user
      ? {
          id: profile.user.id,
          name: profile.user.name,
          username: profile.user.username,
          tier: profile.user.tier,
        }
      : null,
  };
}

function safeParseJSON(value: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Failed to parse profile ratings', error);
    return [];
  }
}
