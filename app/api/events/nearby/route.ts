import { NextResponse } from 'next/server';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { prisma } from '@/lib/prisma';

let airportDb: any = null;

async function getAirportDb() {
  if (!airportDb) {
    airportDb = await open({
      filename: path.join(process.cwd(), 'data', 'aviation_hub.db'),
      driver: sqlite3.Database,
    });
  }
  return airportDb;
}

const NM_PER_DEG_LAT = 60;

function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3440.065; // earth radius in nautical miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * GET /api/events/nearby?icao=KPTK&radiusNm=100&from=ISO&to=ISO
 * Public aviation events within radius of the reference airport,
 * soonest first. Defaults: 100nm, from=now, to=now+90 days.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const icao = (searchParams.get('icao') || '').trim().toUpperCase().slice(0, 10);
    if (!/^[A-Z0-9]{3,7}$/.test(icao)) {
      return NextResponse.json({ error: 'Valid icao parameter required' }, { status: 400 });
    }
    const radiusNm = Math.min(Math.max(Number(searchParams.get('radiusNm')) || 100, 1), 500);
    const from = searchParams.get('from') ? new Date(searchParams.get('from')!) : new Date();
    const to = searchParams.get('to')
      ? new Date(searchParams.get('to')!)
      : new Date(Date.now() + 90 * 24 * 3600 * 1000);
    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      return NextResponse.json({ error: 'Invalid from/to date' }, { status: 400 });
    }

    const db = await getAirportDb();
    const ref = await db.get(
      'SELECT icao, latitude, longitude FROM airports WHERE icao = ?',
      icao
    );
    if (!ref || ref.latitude == null || ref.longitude == null) {
      return NextResponse.json({ error: `Unknown airport ${icao}` }, { status: 404 });
    }

    const events = (await prisma.$queryRaw`
      SELECT id, title, description, airportIcao, startTime, endTime, website, category, organizationId
      FROM AviationEvent
      WHERE isPublic = 1 AND startTime >= ${from} AND startTime <= ${to}
      ORDER BY startTime ASC
    `) as any[];

    if (events.length === 0) return NextResponse.json([]);

    // Batch-resolve event airport coordinates from the local airport db
    const icaos = [...new Set(events.map((e) => e.airportIcao))];
    const placeholders = icaos.map(() => '?').join(',');
    type AirportRow = {
      icao: string;
      name: string | null;
      city: string | null;
      latitude: number | null;
      longitude: number | null;
    };
    const rows: AirportRow[] = await db.all(
      `SELECT icao, name, city, latitude, longitude FROM airports WHERE icao IN (${placeholders})`,
      ...icaos
    );
    const byIcao = new Map<string, AirportRow>(rows.map((r) => [r.icao, r]));

    const nearby = events
      .map((e) => {
        const apt = byIcao.get(e.airportIcao);
        if (!apt || apt.latitude == null || apt.longitude == null) return null;
        const distanceNm = haversineNm(ref.latitude, ref.longitude, apt.latitude, apt.longitude);
        if (distanceNm > radiusNm) return null;
        return {
          id: e.id,
          title: e.title,
          description: e.description,
          category: e.category,
          website: e.website,
          startTime: e.startTime,
          endTime: e.endTime,
          airportIcao: e.airportIcao,
          airportName: apt.name,
          city: apt.city,
          distanceNm: Math.round(distanceNm),
          organizationId: e.organizationId,
        };
      })
      .filter(Boolean);

    return NextResponse.json(nearby);
  } catch (error) {
    console.error('Error fetching nearby events:', error);
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
  }
}
