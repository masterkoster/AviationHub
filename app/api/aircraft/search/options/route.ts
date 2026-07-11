import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";


const prisma = new PrismaClient();

export const dynamic = 'force-dynamic';

// Common aircraft manufacturers to filter by
const AIRCRAFT_MANUFACTURERS = [
  'AERO COMMANDER',
  'AERONCA',
  'AIR TRACTOR',
  'AMERICAN',
  'BEECH',
  'BELL',
  'BOEING',
  'BRANTLY',
  'CESSNA',
  'CHAMPION',
  'COLUMBIA',
  'CIRRUS',
  'DEHAVILLAND',
  'DIAMOND',
  'DOUGLAS',
  'EMBRAER',
  'ENSTROM',
  'FAIRCHILD',
  'FOKKER',
  'GRUMMAN',
  'GULFSTREAM',
  'HELIO',
  'HUGHES',
  'LEONARDO',
  'LUSCOMBE',
  'MAULE',
  'MBB',
  'MOONEY',
  'PIPER',
  'PITTS',
  'QUEST',
  'RAYTHEON',
  'ROBINSON',
  'ROCKWELL',
  'SCHLEICHER',
  'SCHWEIZER',
  'SIKORSKY',
  'STINSON',
  'TAYLORCRAFT',
  'TEXAS HELICOPTER',
  'VANS',
  'VULCANAIR',
  'WACO',
  'YAKOVLEV',
  'ZLIN'
];

// GET /api/aircraft/search/options
// Returns list of manufacturers and models for dropdowns
export async function GET() {
  try {
    // Get manufacturers from database with count, filter to real aircraft mfrs
    const manufacturers = await prisma.$queryRaw`
      SELECT MFR, COUNT(*) as cnt
      FROM AircraftMaster
      WHERE MFR IS NOT NULL
        AND LEN(MFR) > 0
        AND LEN(MFR) < 50
      GROUP BY MFR
      HAVING COUNT(*) >= 10
      ORDER BY COUNT(*) DESC
    ` as { MFR: string; cnt: number }[];

    // Filter to common aircraft manufacturers
    const filteredMfrs = manufacturers
      .filter(m => {
        const mfrUpper = m.MFR.toUpperCase();
        // Check if it matches any known manufacturer
        return AIRCRAFT_MANUFACTURERS.some(known => mfrUpper.includes(known));
      })
      .sort((a, b) => b.cnt - a.cnt); // Sort by count descending

    const mfrList = filteredMfrs.map(m => m.MFR.trim());

    return NextResponse.json({
      manufacturers: mfrList
    });
  } catch (error) {
    console.error("Options error:", error);
    return NextResponse.json({ error: 'Failed to fetch aircraft options' }, { status: 500 });
  }
}
