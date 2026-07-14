import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

// GET /api/aircraft/search/models?manufacturer=CESSNA
// Returns list of models for a specific manufacturer
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const manufacturer = searchParams.get("manufacturer") || "";

  if (!manufacturer) {
    return NextResponse.json({ models: [] });
  }

  try {
    // Get distinct models for this manufacturer - exact match
    const results = await prisma.aircraftMaster.findMany({
      select: { model: true },
      distinct: ['model'],
      where: { 
        mfr: manufacturer,
        model: { not: null }
      },
      orderBy: { model: 'asc' }
    });

    // Filter out bad data (records with commas in model field)
    const models = results
      .map(r => r.model)
      .filter(Boolean)
      .filter(m => m && !m.includes(',')) // Filter out garbage data
      .sort();

    return NextResponse.json({ models });
  } catch (error) {
    console.error("Models error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
