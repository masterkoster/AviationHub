import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  
  const manufacturer = searchParams.get("manufacturer") || "";
  const model = searchParams.get("model") || "";
  const yearFrom = searchParams.get("yearFrom") || "";
  const yearTo = searchParams.get("yearTo") || "";
  const status = searchParams.get("status") || "";
  const typeRegistrant = searchParams.get("typeRegistrant") || "";
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");
  
  const skip = (page - 1) * limit;

  try {
    // Build where clause - use contains for partial matching
    const where: any = {};
    
    if (manufacturer) {
      // Use contains for partial match (case insensitive in SQL Server)
      where.mfr = { contains: manufacturer, mode: 'insensitive' };
    }
    
    if (model) {
      where.model = { contains: model, mode: 'insensitive' };
    }
    
    if (status) {
      where.statusCode = status;
    }
    
    if (typeRegistrant) {
      where.typeRegistrant = typeRegistrant;
    }

    // Get total count
    const total = await prisma.aircraftMaster.count({ where });
    
    // Get paginated results
    const results = await prisma.aircraftMaster.findMany({
      where,
      skip,
      take: limit,
      orderBy: { nNumber: 'asc' }
    });

    return NextResponse.json({
      results: results.map(r => ({
        nNumber: r.nNumber,
        serialNumber: r.serialNumber,
        manufacturer: r.mfr,
        model: r.model,
        status: r.statusCode,
        typeRegistrant: r.typeRegistrant,
        lastActionDate: r.lastActionDate,
        airWorthDate: r.airWorthDate,
        name: r.name,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + results.length < total
      }
    });
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
