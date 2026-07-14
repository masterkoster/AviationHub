import { NextResponse } from 'next/server';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { prisma } from '@/lib/auth';

let db: any = null;

async function getDb() {
  if (!db) {
    const dbPath = path.join(process.cwd(), 'data', 'aviation_hub.db');
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });
  }
  return db;
}

const detailCache = new Map<string, { data: any; ts: number }>()
const CACHE_TTL_MS = 60_000 // 60 seconds

// Demo fuel prices for airports without cached data
const DEMO_FUEL_PRICES: Record<string, number> = {
  'KORD': 9.58, 'KLAX': 10.65, 'KVNY': 8.32, 'KPDK': 8.67,
  'KJFK': 12.50, 'KATL': 9.45, 'KDEN': 8.99, 'KSFO': 11.25,
  'KLAS': 9.50, 'KSEA': 10.80, 'KMIA': 10.25, 'KDFW': 8.75,
  'KPHX': 9.15, 'KIAH': 9.30, 'KBOS': 11.50, 'KMSP': 9.20,
  'KCLT': 8.85, 'KSTL': 8.45, 'KPDX': 10.50, 'KRDU': 9.10,
  'KSMF': 9.95, 'KMCO': 9.80, 'KTPA': 10.10,
  'KMDW': 8.55, 'KDAL': 7.95, 'KSAT': 8.25, 'KOAK': 10.40,
  'KSNA': 9.75, 'KBUR': 8.95, 'KFLL': 10.30, 'KPSP': 9.40,
  'KDTW': 9.25, 'KCLE': 8.95, 'KMKE': 8.75, 'KIND': 8.50,
  'KSDF': 8.45, 'KTUL': 8.15, 'KABQ': 8.85, 'KOMA': 8.30,
};

// Demo landing fees
const DEMO_FEES: Record<string, number> = {
  'KJFK': 45, 'KLAX': 40, 'KSFO': 35, 'KORD': 30,
  'KMIA': 38, 'KATL': 28, 'KDEN': 25, 'KLAS': 22,
  'KDTW': 28, 'KCLE': 25, 'KMKE': 22, 'KIND': 24,
};

// GET /api/airports/[icao] - Get full airport details
export async function GET(request: Request, { params }: { params: Promise<{ icao: string }> }) {
  try {
    const { icao } = await params;
    let icaoUpper = icao.toUpperCase();
    
    const db = await getDb();
    
    // Get basic airport info
    let airport = await db.get(`
      SELECT icao, iata, name, type, latitude, longitude, elevation_ft, city, state, country
      FROM airports 
      WHERE icao = ?
    `, icaoUpper);

    // If user passed IATA (e.g. DTW), resolve to ICAO (e.g. KDTW)
    if (!airport && /^[A-Z0-9]{3}$/.test(icaoUpper)) {
      airport = await db.get(`
        SELECT icao, iata, name, type, latitude, longitude, elevation_ft, city, state, country
        FROM airports
        WHERE iata = ?
      `, icaoUpper);

      if (airport?.icao) {
        icaoUpper = airport.icao.toUpperCase();
      }
    }
    
    if (!airport) {
      return NextResponse.json({ error: 'Airport not found' }, { status: 404 });
    }
    
    // Check in-memory cache
    const cached = detailCache.get(icaoUpper);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return NextResponse.json(cached.data, {
        headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' }
      });
    }
    
    // Get all independent data in parallel
    const [runways, frequencies, fuelPrices, fuelCache, communityPrices] = await Promise.all([
      // Get runways
      db.all(`
        SELECT length_ft, width_ft, surface, he_ident, le_ident
        FROM runways 
        WHERE icao = ?
        ORDER BY length_ft DESC
        LIMIT 5
      `, icaoUpper),
      
      // Get frequencies
      db.all(`
        SELECT frequency_mhz, description, type
        FROM frequencies 
        WHERE icao = ?
        ORDER BY 
          CASE type 
            WHEN 'APP' THEN 1 
            WHEN 'TWR' THEN 2 
            WHEN 'GND' THEN 3 
            WHEN 'DEP' THEN 4 
            WHEN 'ATIS' THEN 5 
            WHEN 'CTAF' THEN 6 
            ELSE 7 
          END
        LIMIT 10
      `, icaoUpper),
      
      // Get cached fuel prices from new table (AirNav data)
      db.all(`
        SELECT fuel_type, service_type, price, last_reported, source_url, scraped_at, has_tower, attendance, phone, landing_fee, manager
        FROM airport_fuel 
        WHERE icao = ?
      `, icaoUpper),
      
      // Also check old cache table
      db.all(`
        SELECT data_type, price, source_site, last_updated
        FROM airport_cache 
        WHERE icao = ?
      `, icaoUpper),
      
      // Get community-reported fuel prices
      prisma.communityFuelPrice.findMany({
        where: { icao: icaoUpper },
        orderBy: { purchaseDate: 'desc' },
        take: 10,
      }).catch(() => []),
    ]);
    
    const fuelData = fuelCache.find((f: any) => f.data_type === 'fuel');
    const feeData = fuelCache.find((f: any) => f.data_type === 'fee');
    
    // Use new AirNav table first, then fallback to old cache
    let fuelPrice = null;
    let fuelSource = 'demo';
    let fuelSourceUrl = '';
    let fuelLastReported = '';
    
    if (fuelPrices && fuelPrices.length > 0) {
      // Get 100LL price (average if multiple)
      const llPrices = fuelPrices.filter((f: any) => f.fuel_type === '100LL');
      if (llPrices.length > 0) {
        fuelPrice = llPrices.reduce((sum: number, f: any) => sum + f.price, 0) / llPrices.length;
        fuelSource = 'airnav';
        fuelSourceUrl = llPrices[0].source_url || '';
        fuelLastReported = llPrices[0].last_reported || '';
      }
    } else if (fuelData) {
      // Fallback to old cache
      fuelPrice = fuelData.price;
      fuelSource = fuelData.source_site || 'demo';
    } else {
      // Fallback to demo prices
      fuelPrice = DEMO_FUEL_PRICES[icaoUpper] || null;
    }
    
    const landingFeeAmount = feeData ? feeData.price : (DEMO_FEES[icaoUpper] || null);
    
    // Get latest community price for each fuel type
    const latestCommunityByType: Record<string, any> = {};
    for (const p of communityPrices) {
      if (!latestCommunityByType[p.fuelType]) {
        latestCommunityByType[p.fuelType] = p;
      }
    }
    
    // Calculate price divergence (flag if > 15% difference)
    const community100ll = latestCommunityByType['100LL'];
    const communityJetA = latestCommunityByType['JetA'];
    let priceDivergence: any = null;
    
    if (fuelPrice && community100ll) {
      const diff = Math.abs(fuelPrice - Number(community100ll.price)) / fuelPrice;
      if (diff > 0.15) {
        priceDivergence = {
          type: '100LL',
          airnavPrice: fuelPrice,
          communityPrice: Number(community100ll.price),
          difference: `${(diff * 100).toFixed(0)}% ${community100ll.price > fuelPrice ? 'higher' : 'lower'}`
        };
      }
    }
    
    // If using demo prices, cache them for future use (fire-and-forget)
    if (!fuelData && fuelPrice) {
      db.run(`
        INSERT OR REPLACE INTO airport_cache (icao, data_type, price, source_site, last_updated)
        VALUES (?, 'fuel', ?, 'demo', datetime('now'))
      `, icaoUpper, fuelPrice).catch(() => {});
    }
    
    if (!feeData && landingFeeAmount) {
      db.run(`
        INSERT OR REPLACE INTO airport_cache (icao, data_type, price, source_site, last_updated)
        VALUES (?, 'fee', ?, 'demo', datetime('now'))
      `, icaoUpper, landingFeeAmount).catch(() => {});
    }
    
    const responseData = {
      ...airport,
      runways,
      frequencies,
      // Manager/owner info from airport_fuel table
      manager: fuelPrices[0]?.manager || null,
      phone: fuelPrices[0]?.phone || null,
      hasTower: fuelPrices[0]?.has_tower ?? null,
      attendance: fuelPrices[0]?.attendance || null,
      fuel: fuelPrice ? {
        price100ll: fuelPrice,
        source: fuelSource,
        sourceUrl: fuelSourceUrl,
        lastReported: fuelLastReported,
        lastUpdated: fuelData ? fuelData.last_updated : new Date().toISOString(),
        // Fuel provider info
        providerName: fuelPrices[0]?.fbo_name || null,
        providerPhone: fuelPrices[0]?.phone || null,
        // Community-reported prices
        community100ll: community100ll ? {
          price: Number(community100ll.price),
          fbo: community100ll.fbo,
          date: community100ll.purchaseDate,
          reportedAt: community100ll.createdAt,
          daysAgo: Math.floor((Date.now() - new Date(community100ll.purchaseDate).getTime()) / (1000 * 60 * 60 * 24))
        } : null,
        communityJetA: communityJetA ? {
          price: Number(communityJetA.price),
          fbo: communityJetA.fbo,
          date: communityJetA.purchaseDate,
          reportedAt: communityJetA.createdAt,
          daysAgo: Math.floor((Date.now() - new Date(communityJetA.purchaseDate).getTime()) / (1000 * 60 * 60 * 24))
        } : null,
        // Price divergence warning
        priceDivergence
      } : null,
      landingFee: landingFeeAmount ? {
        amount: landingFeeAmount,
        source: feeData ? feeData.source_site : 'demo',
        lastUpdated: feeData ? feeData.last_updated : new Date().toISOString()
      } : null
    };
    
    // Store in in-memory cache
    detailCache.set(icaoUpper, { data: responseData, ts: Date.now() });
    
    return NextResponse.json(responseData, {
      headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' }
    });
  } catch (error) {
    console.error('Error fetching airport details:', error);
    return NextResponse.json({ error: 'Failed to fetch airport details' }, { status: 500 });
  }
}
