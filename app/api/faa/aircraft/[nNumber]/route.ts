import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// FAA API endpoint for aircraft registration lookup
const FAA_REGISTRY_URL = 'https://registry.faa.gov/aircraftinquiry/api/v1/nnumber';

// Cache TTL: 30 days (aircraft registration data changes rarely)
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Fetch aircraft registration data from FAA
 * N-number should be provided without the 'N' prefix (e.g., "123AB" for N123AB)
 */
async function fetchFAAData(nNumber: string): Promise<FAAAircraftData | null> {
  try {
    const normalized = nNumber.toUpperCase().replace(/^N/i, '').trim();
    
    const response = await fetch(`${FAA_REGISTRY_URL}/${normalized}`, {
      headers: {
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.error('FAA API error:', response.status, response.statusText);
      return null;
    }

    const data = await response.json();
    
    if (!data || !data.results || data.results.length === 0) {
      return null;
    }

    const r = data.results[0] as any;
    
    return {
      nNumber: `N${r.nNumber || normalized}`,
      serialNumber: r.serialNumber || null,
      manufacturer: r.mfrModelCode ? getManufacturerFromCode(r.mfrModelCode) : null,
      model: r.mfrModelCode ? getModelFromCode(r.mfrModelCode) : null,
      year: r.yearMfr ? parseInt(r.yearMfr) : null,
      category: r.aircraftType || null,
      engineType: r.engineType || null,
      registrationStatus: r.statusCode || null,
      ownerName: r.name || null,
      ownerCity: r.city || null,
      ownerState: r.state || null,
      expirationDate: r.expirationDate || null,
    };
  } catch (error) {
    console.error('FAA fetch error:', error);
    return null;
  }
}

function getManufacturerFromCode(code: string): string | null {
  const codes: Record<string, string> = {
    'CESSNA': 'Cessna',
    'PIPER': 'Piper',
    'BEECH': 'Beechcraft',
    'BOEING': 'Boeing',
    'AIRBUS': 'Airbus',
    'LOCKHEED': 'Lockheed',
    'BELL': 'Bell',
    'ROBINSON': 'Robinson',
    'MOONEY': 'Mooney',
    'GRUMMAN': 'Grumman',
    'AERO': 'Aero',
    'CHAMPION': 'Champion',
    'MAULE': 'Maule',
    'AYRES': 'Ayres',
  };
  
  for (const [key, value] of Object.entries(codes)) {
    if (code.toUpperCase().startsWith(key)) {
      return value;
    }
  }
  
  return null;
}

function getModelFromCode(code: string): string | null {
  return null;
}

interface FAAAircraftData {
  nNumber: string;
  serialNumber: string | null;
  manufacturer: string | null;
  model: string | null;
  year: number | null;
  category: string | null;
  engineType: string | null;
  registrationStatus: string | null;
  ownerName: string | null;
  ownerCity: string | null;
  ownerState: string | null;
  expirationDate: string | null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ nNumber: string }> }
) {
  try {
    const { nNumber } = await params;
    
    if (!nNumber || nNumber.length < 1 || nNumber.length > 5) {
      return NextResponse.json(
        { error: 'Invalid N-number. Must be 1-5 characters.' },
        { status: 400 }
      );
    }

    const normalizedN = `N${nNumber.toUpperCase().replace(/^N/i, '').trim()}`;

    // Check Azure SQL cache first
    const cached = await prisma.faaAircraftCache.findUnique({
      where: { n_number: normalizedN }
    });

    if (cached) {
      const age = Date.now() - new Date(cached.scraped_at).getTime();
      if (age < CACHE_TTL_MS) {
        return NextResponse.json({
          success: true,
          data: {
            nNumber: cached.n_number,
            serialNumber: cached.serial_number,
            manufacturer: cached.manufacturer,
            model: cached.model,
            year: cached.year,
            category: cached.category,
            engineType: cached.engine_type,
            registrationStatus: cached.registration_status,
            ownerName: cached.owner_name,
            ownerCity: cached.owner_city,
            ownerState: cached.owner_state,
            expirationDate: cached.expiration_date,
          },
          source: 'cache',
        });
      }
    }

    // Cache miss or expired — fetch from FAA
    const faaData = await fetchFAAData(nNumber);
    
    if (!faaData) {
      return NextResponse.json(
        { error: 'Aircraft not found in FAA registry' },
        { status: 404 }
      );
    }

    // Cache in Azure SQL for 30 days
    await prisma.faaAircraftCache.upsert({
      where: { n_number: faaData.nNumber },
      create: {
        n_number: faaData.nNumber,
        serial_number: faaData.serialNumber,
        manufacturer: faaData.manufacturer,
        model: faaData.model,
        year: faaData.year,
        category: faaData.category,
        engine_type: faaData.engineType,
        registration_status: faaData.registrationStatus,
        owner_name: faaData.ownerName,
        owner_city: faaData.ownerCity,
        owner_state: faaData.ownerState,
        expiration_date: faaData.expirationDate,
      },
      update: {
        serial_number: faaData.serialNumber,
        manufacturer: faaData.manufacturer,
        model: faaData.model,
        year: faaData.year,
        category: faaData.category,
        engine_type: faaData.engineType,
        registration_status: faaData.registrationStatus,
        owner_name: faaData.ownerName,
        owner_city: faaData.ownerCity,
        owner_state: faaData.ownerState,
        expiration_date: faaData.expirationDate,
        scraped_at: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      data: faaData,
      source: 'live',
    });
  } catch (error) {
    console.error('FAA lookup error:', error);
    return NextResponse.json(
      { error: 'Failed to lookup aircraft' },
      { status: 500 }
    );
  }
}