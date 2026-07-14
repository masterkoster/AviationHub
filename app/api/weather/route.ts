/**
 * Weather API - Cached weather data from aviationweather.gov
 * Now uses Azure SQL (Prisma) instead of local SQLite for serverless compatibility.
 */

import { NextRequest, NextResponse } from 'next/server';
import https from 'https';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// Weather region mapping
const REGION_MAP: Record<string, { states: string[]; name: string }> = {
  chi: { states: ['IL', 'IN', 'MI', 'OH', 'WI', 'IA', 'KS', 'MN', 'MO', 'ND', 'NE', 'SD'], name: 'Great Lakes/North Central' },
  bos: { states: ['CT', 'ME', 'MA', 'NH', 'NJ', 'NY', 'PA', 'RI', 'VT'], name: 'Northeast' },
  mia: { states: ['DE', 'FL', 'GA', 'MD', 'NC', 'SC', 'VA', 'WV', 'DC'], name: 'Southeast' },
  dfw: { states: ['AL', 'AR', 'KY', 'LA', 'MS', 'OK', 'TN', 'TX'], name: 'South Central' },
  sfo: { states: ['CA', 'OR', 'WA', 'AZ', 'NV', 'UT'], name: 'Pacific/Southwest' },
  slc: { states: ['CO', 'MT', 'NM', 'WY'], name: 'Central/Rockies' },
  alaska: { states: ['AK'], name: 'Alaska' },
  hawaii: { states: ['HI'], name: 'Hawaii' }
};

// Cache durations (in hours)
const CACHE_DURATION = {
  regional: 24,
  metar: 6,
  taf: 6
};

function httpGet(url: string): Promise<{ status: number; data: string }> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { 
      headers: { 'User-Agent': 'AviationHub/1.0' },
      timeout: 15000 
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode || 500, data }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const icao = searchParams.get('icao');
  const region = searchParams.get('region');
  const forceRefresh = searchParams.get('forceRefresh') === 'true';

  // If icao provided, get airport weather
  if (icao) {
    const icaoUpper = icao.toUpperCase();
    
    // Check cache first for METAR
    if (!forceRefresh) {
      const metarCached = await prisma.weatherCache.findFirst({
        where: {
          icao: icaoUpper,
          data_type: 'metar',
          expires_at: { gt: new Date() }
        }
      });

      if (metarCached) {
        const tafCached = await prisma.weatherCache.findFirst({
          where: { icao: icaoUpper, data_type: 'taf' }
        });

        return NextResponse.json({
          source: 'cache',
          icao: icaoUpper,
          data: JSON.parse(metarCached.data),
          taf: tafCached ? JSON.parse(tafCached.data) : null,
          fetchedAt: metarCached.fetched_at,
          expiresAt: metarCached.expires_at
        });
      }
    }

    // Fetch fresh METAR
    try {
      const url = `https://aviationweather.gov/api/data/metar?ids=${icaoUpper}&format=json`;
      const response = await httpGet(url);

      let metarData: any = null;
      let tafData: any = null;

      if (response.status === 200) {
        metarData = JSON.parse(response.data);
        
        const expiresAt = new Date(Date.now() + CACHE_DURATION.metar * 60 * 60 * 1000);
        await prisma.weatherCache.upsert({
          where: { id: `metar-${icaoUpper}` },
          create: {
            id: `metar-${icaoUpper}`,
            icao: icaoUpper,
            data_type: 'metar',
            data: JSON.stringify(metarData),
            expires_at: expiresAt,
          },
          update: {
            data: JSON.stringify(metarData),
            fetched_at: new Date(),
            expires_at: expiresAt,
          },
        });
      }

      // Fetch TAF
      try {
        const tafUrl = `https://aviationweather.gov/api/data/taf?ids=${icaoUpper}&format=json`;
        const tafResponse = await httpGet(tafUrl);
        
        if (tafResponse.status === 200) {
          tafData = JSON.parse(tafResponse.data);
          
          const tafExpiresAt = new Date(Date.now() + CACHE_DURATION.taf * 60 * 60 * 1000);
          await prisma.weatherCache.upsert({
            where: { id: `taf-${icaoUpper}` },
            create: {
              id: `taf-${icaoUpper}`,
              icao: icaoUpper,
              data_type: 'taf',
              data: JSON.stringify(tafData),
              expires_at: tafExpiresAt,
            },
            update: {
              data: JSON.stringify(tafData),
              fetched_at: new Date(),
              expires_at: tafExpiresAt,
            },
          });
        }
      } catch (tafError) {
        console.log('TAF fetch error:', tafError);
      }

      return NextResponse.json({
        source: 'live',
        icao: icaoUpper,
        data: metarData,
        taf: tafData,
        fetchedAt: new Date().toISOString()
      });
    } catch (error: any) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // If region provided, get regional winds/temps
  if (region) {
    const regionLower = region.toLowerCase();
    
    if (!forceRefresh) {
      const cached = await prisma.weatherCache.findFirst({
        where: {
          region: regionLower,
          data_type: 'windtemp',
          expires_at: { gt: new Date() }
        }
      });

      if (cached) {
        return NextResponse.json({
          source: 'cache',
          region: regionLower,
          data: JSON.parse(cached.data),
          fetchedAt: cached.fetched_at,
          expiresAt: cached.expires_at
        });
      }
    }

    try {
      const url = `https://aviationweather.gov/api/data/windtemp?region=${regionLower}&format=json`;
      const response = await httpGet(url);

      if (response.status === 200) {
        const windData = JSON.parse(response.data);
        
        const expiresAt = new Date(Date.now() + CACHE_DURATION.regional * 60 * 60 * 1000);
        await prisma.weatherCache.upsert({
          where: { id: `windtemp-${regionLower}` },
          create: {
            id: `windtemp-${regionLower}`,
            region: regionLower,
            data_type: 'windtemp',
            data: JSON.stringify(windData),
            expires_at: expiresAt,
          },
          update: {
            data: JSON.stringify(windData),
            fetched_at: new Date(),
            expires_at: expiresAt,
          },
        });

        return NextResponse.json({
          source: 'live',
          region: regionLower,
          data: windData,
          fetchedAt: new Date().toISOString(),
          expiresAt: expiresAt.toISOString()
        });
      } else {
        return NextResponse.json({ error: 'Failed to fetch wind data' }, { status: response.status });
      }
    } catch (error: any) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // Return available regions
  return NextResponse.json({
    regions: Object.entries(REGION_MAP).map(([code, info]) => ({
      code,
      name: info.name,
      states: info.states
    }))
  });
}

// Clears cached weather entries so the next GET re-fetches from upstream.
// Session-gated to prevent anonymous cache-busting abuse.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { icao, region } = await request.json();

  if (icao) {
    await prisma.weatherCache.deleteMany({
      where: { icao: icao.toUpperCase() }
    });
  }
  if (region) {
    await prisma.weatherCache.deleteMany({
      where: { region: region.toLowerCase() }
    });
  }

  return NextResponse.json({ message: 'Cache cleared', icao, region });
}