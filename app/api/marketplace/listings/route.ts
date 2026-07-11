import { NextResponse } from 'next/server';
import { auth, prisma } from '@/lib/auth';

const LISTING_TYPES = ['FOR_SALE', 'SHARE_SELL', 'SHARE_WANTED', 'AIRCRAFT_SALE'] as const;

type ListingType = (typeof LISTING_TYPES)[number];

const PUBLIC_LISTING_SELECT = {
  id: true,
  userId: true,
  type: true,
  title: true,
  description: true,
  aircraftType: true,
  airportIcao: true,
  airportName: true,
  airportCity: true,
  latitude: true,
  longitude: true,
  price: true,
  sharePercent: true,
  hours: true,
  contactMethod: true,
  contactValue: true,
  status: true,
  createdAt: true,
  images: true,
  // Aircraft-specific fields
  nNumber: true,
  make: true,
  model: true,
  year: true,
  totalTime: true,
  engineTime: true,
  propTime: true,
  annualDue: true,
  registrationType: true,
  airworthiness: true,
  fuelType: true,
  avionics: true,
  features: true,
  upgrades: true,
  sellerType: true,
  isVerified: true,
  verifiedAt: true,
  videoUrl: true,
  user: {
    select: {
      id: true,
      name: true,
      username: true,
      tier: true,
    },
  },
} as const;

function sanitizeListing(listing: any) {
  if (!listing) return listing;
  return {
    ...listing,
    images: listing.images ? safeParseJSON(listing.images) : [],
    avionics: listing.avionics ? safeParseJSON(listing.avionics) : [],
    features: listing.features ? safeParseJSON(listing.features) : [],
    upgrades: listing.upgrades ? safeParseJSON(listing.upgrades) : [],
  };
}

function safeParseJSON(value: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Failed to parse listing images', error);
    return [];
  }
}

async function ensureMarketplaceTable() {
  try {
    // Create table if missing (Azure SQL / SQL Server)
    await prisma.$executeRaw`
      IF OBJECT_ID('MarketplaceListing', 'U') IS NULL
      BEGIN
        CREATE TABLE MarketplaceListing (
          id NVARCHAR(36) NOT NULL PRIMARY KEY,
          userId NVARCHAR(36) NOT NULL,
          type NVARCHAR(20) NOT NULL,
          title NVARCHAR(200) NOT NULL,
          description NVARCHAR(MAX) NULL,
          aircraftType NVARCHAR(100) NOT NULL,
          airportIcao NVARCHAR(10) NOT NULL,
          airportName NVARCHAR(200) NULL,
          airportCity NVARCHAR(200) NULL,
          latitude FLOAT NULL,
          longitude FLOAT NULL,
          price INT NULL,
          sharePercent INT NULL,
          hours INT NULL,
          contactMethod NVARCHAR(50) NULL,
          contactValue NVARCHAR(200) NULL,
          images NVARCHAR(MAX) NULL,
          status NVARCHAR(20) NOT NULL DEFAULT('active'),
          createdAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          updatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
        );

        CREATE INDEX idx_marketplace_airport ON MarketplaceListing(airportIcao);
        CREATE INDEX idx_marketplace_status ON MarketplaceListing(status);
      END
    `;
  } catch (error) {
    // If permissions disallow DDL, queries below will return 500; log for visibility.
    console.error('Failed to ensure MarketplaceListing table:', error);
  }
}

export async function GET(request: Request) {
  try {
    await ensureMarketplaceTable();
    const url = new URL(request.url);
    const type = url.searchParams.get('type');
    const airport = url.searchParams.get('airport');
    const query = url.searchParams.get('q');
    const take = Math.min(Number(url.searchParams.get('take')) || 60, 200);

    // Check if this is a preview request (no filters = preview)
    const isPreview = !type && !airport && !query;

    // Aircraft-specific filters
    const make = url.searchParams.get('make');
    const model = url.searchParams.get('model');
    const minYear = url.searchParams.get('minYear');
    const maxYear = url.searchParams.get('maxYear');
    const minPrice = url.searchParams.get('minPrice');
    const maxPrice = url.searchParams.get('maxPrice');
    const minTime = url.searchParams.get('minTime');
    const maxTime = url.searchParams.get('maxTime');
    const engineType = url.searchParams.get('engineType');

    const where: any = { status: 'active' };
    if (type && LISTING_TYPES.includes(type as ListingType)) {
      where.type = type;
    }
    if (airport) {
      where.airportIcao = airport.toUpperCase();
    }
    if (query) {
      const search = query.trim();
      where.OR = [
        { title: { contains: search } },
        { description: { contains: search } },
        { aircraftType: { contains: search } },
        { airportCity: { contains: search } },
        // Aircraft-specific search
        { nNumber: { contains: search } },
        { make: { contains: search } },
        { model: { contains: search } },
      ];
    }

    // Aircraft-specific filters
    if (make) {
      where.make = { contains: make };
    }
    if (model) {
      where.model = { contains: model };
    }
    if (minYear || maxYear) {
      where.year = {};
      if (minYear) where.year.gte = parseInt(minYear);
      if (maxYear) where.year.lte = parseInt(maxYear);
    }
    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) where.price.gte = parseInt(minPrice);
      if (maxPrice) where.price.lte = parseInt(maxPrice);
    }
    if (minTime || maxTime) {
      where.totalTime = {};
      if (minTime) where.totalTime.gte = parseInt(minTime);
      if (maxTime) where.totalTime.lte = parseInt(maxTime);
    }
    if (engineType) {
      where.engineType = engineType;
    }

    const listings = await prisma.marketplaceListing.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      select: PUBLIC_LISTING_SELECT,
    });

    return NextResponse.json({
      listings: listings.map(sanitizeListing),
    }, {
      headers: {
        // Cache for 1 hour (3600 seconds), stale-while-revalidate allows serving old content while fetching new
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    console.error('Marketplace GET failed', error);
    return NextResponse.json({ error: 'Failed to load listings' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureMarketplaceTable();
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    if (!session.user.emailVerified) {
      return NextResponse.json({ error: 'Please verify your email before posting listings' }, { status: 403 });
    }

    const body = await request.json();
    const validation = validateListingPayload(body);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const data = validation.data;
    const listing = await prisma.marketplaceListing.create({
      data: {
        userId: session.user.id,
        type: data.type,
        title: data.title,
        description: data.description,
        aircraftType: data.aircraftType,
        airportIcao: data.airportIcao,
        airportName: data.airportName,
        airportCity: data.airportCity,
        latitude: data.latitude,
        longitude: data.longitude,
        price: data.price,
        sharePercent: data.sharePercent,
        hours: data.hours,
        contactMethod: data.contactMethod,
        contactValue: data.contactValue,
        images: data.images ? JSON.stringify(data.images) : null,
        // Aircraft-specific fields
        nNumber: data.nNumber,
        make: data.make,
        model: data.model,
        year: data.year,
        totalTime: data.totalTime,
        engineTime: data.engineTime,
        propTime: data.propTime,
        airframeTime: data.airframeTime,
        annualDue: data.annualDue,
        registrationType: data.registrationType,
        airworthiness: data.airworthiness,
        fuelType: data.fuelType,
        avionics: data.avionics ? JSON.stringify(data.avionics) : null,
        features: data.features ? JSON.stringify(data.features) : null,
        upgrades: data.upgrades ? JSON.stringify(data.upgrades) : null,
        sellerType: data.sellerType,
        videoUrl: data.videoUrl,
      },
      select: PUBLIC_LISTING_SELECT,
    });

    return NextResponse.json({ listing: sanitizeListing(listing) });
  } catch (error) {
    console.error('Marketplace POST failed', error);
    return NextResponse.json({ error: 'Failed to create listing' }, { status: 500 });
  }
}

function validateListingPayload(payload: any): { valid: true; data: any } | { valid: false; error: string } {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, error: 'Invalid payload' };
  }

  const type = typeof payload.type === 'string' ? payload.type.toUpperCase() : '';
  if (!LISTING_TYPES.includes(type as ListingType)) {
    return { valid: false, error: 'Invalid listing type' };
  }

  const title = (payload.title || '').toString().trim();
  if (title.length < 4) {
    return { valid: false, error: 'Title must be at least 4 characters' };
  }

  const aircraftType = (payload.aircraftType || '').toString().trim();
  if (!aircraftType) {
    return { valid: false, error: 'Aircraft type is required' };
  }

  const airportIcao = (payload.airportIcao || '').toString().trim().toUpperCase();
  if (!/^[A-Z0-9]{3,4}$/.test(airportIcao)) {
    return { valid: false, error: 'Airport ICAO must be 3-4 characters' };
  }

  const data = {
    type,
    title,
    description: (payload.description || '').toString().trim().slice(0, 2000),
    aircraftType,
    airportIcao,
    airportName: payload.airportName ? payload.airportName.toString().slice(0, 200) : null,
    airportCity: payload.airportCity ? payload.airportCity.toString().slice(0, 200) : null,
    latitude: typeof payload.latitude === 'number' ? payload.latitude : null,
    longitude: typeof payload.longitude === 'number' ? payload.longitude : null,
    price: normalizeInt(payload.price),
    sharePercent: normalizeInt(payload.sharePercent),
    hours: normalizeInt(payload.hours),
    contactMethod: payload.contactMethod ? payload.contactMethod.toString().slice(0, 50) : 'email',
    contactValue: payload.contactValue ? payload.contactValue.toString().slice(0, 200) : null,
    images: Array.isArray(payload.images) ? payload.images.slice(0, type === 'AIRCRAFT_SALE' ? 20 : 6) : undefined,
    // Aircraft-specific fields
    nNumber: payload.nNumber ? payload.nNumber.toString().trim().toUpperCase().slice(0, 10) : null,
    make: payload.make ? payload.make.toString().trim().slice(0, 100) : null,
    model: payload.model ? payload.model.toString().trim().slice(0, 100) : null,
    year: normalizeInt(payload.year),
    totalTime: normalizeInt(payload.totalTime),
    engineTime: normalizeInt(payload.engineTime),
    propTime: normalizeInt(payload.propTime),
    airframeTime: normalizeInt(payload.airframeTime),
    annualDue: payload.annualDue ? new Date(payload.annualDue) : null,
    registrationType: payload.registrationType ? payload.registrationType.toString().slice(0, 50) : null,
    airworthiness: payload.airworthiness ? payload.airworthiness.toString().slice(0, 50) : null,
    fuelType: payload.fuelType ? payload.fuelType.toString().slice(0, 20) : null,
    avionics: Array.isArray(payload.avionics) ? payload.avionics.slice(0, 50) : undefined,
    features: Array.isArray(payload.features) ? payload.features.slice(0, 50) : undefined,
    upgrades: Array.isArray(payload.upgrades) ? payload.upgrades.slice(0, 50) : undefined,
    sellerType: payload.sellerType ? payload.sellerType.toString().slice(0, 20) : null,
    videoUrl: payload.videoUrl ? payload.videoUrl.toString().slice(0, 500) : null,
  };

  return { valid: true, data };
}

function normalizeInt(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  if (Number.isNaN(num)) return null;
  return Math.round(num);
}
