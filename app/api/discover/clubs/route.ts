import { NextResponse } from 'next/server'
import sqlite3 from 'sqlite3'
import { open } from 'sqlite'
import path from 'path'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

// Organizations live in the SQL Server database (via Prisma); airport
// lat/lon lives in the separate sqlite aviation_hub.db. We join the two
// in application code since they're different databases.

let db: any = null

async function getDb() {
  if (!db) {
    const dbPath = path.join(process.cwd(), 'data', 'aviation_hub.db')
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
  }
  return db
}

interface AirportRow {
  icao: string
  iata: string | null
  name: string
  latitude: number
  longitude: number
}

// GET /api/discover/clubs - Public club discovery map data.
// Returns clubs that have opted in to the map, joined to their home
// airport's coordinates. No auth required; only publicly-safe fields
// are returned.
export async function GET() {
  try {
    const clubs = await prisma.organization.findMany({
      where: {
        type: 'club',
        showOnMap: true,
        homeAirport: { not: null },
      },
      select: {
        id: true,
        name: true,
        description: true,
        website: true,
        sizeBracket: true,
        homeAirport: true,
      },
    })

    if (clubs.length === 0) {
      return NextResponse.json([], {
        headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' },
      })
    }

    // `contactEmail` predates the generated Prisma Client (added directly to the
    // DB while `npx prisma generate` was blocked by a running dev server holding
    // the query-engine binary locked). Fetch it via raw SQL and merge by id until
    // the client can be regenerated.
    const contactEmailRows = await prisma.$queryRaw<{ id: string; contactEmail: string | null }[]>`
      SELECT id, contactEmail FROM Organization WHERE id IN (${Prisma.join(clubs.map((c) => c.id))})
    `
    const contactEmailById = new Map(contactEmailRows.map((r) => [r.id, r.contactEmail]))

    const idents = [...new Set(
      clubs
        .map((c) => c.homeAirport?.trim().toUpperCase())
        .filter((v): v is string => !!v)
    )]

    const database = await getDb()
    const placeholders = idents.map(() => '?').join(',')
    const airports: AirportRow[] = await database.all(
      `SELECT icao, iata, name, latitude, longitude
       FROM airports
       WHERE icao IN (${placeholders}) OR iata IN (${placeholders})`,
      [...idents, ...idents]
    )

    // Index by both icao and iata (uppercased) so a club's homeAirport
    // resolves whichever identifier form was entered.
    const airportByIdent = new Map<string, AirportRow>()
    for (const a of airports) {
      if (a.icao) airportByIdent.set(a.icao.toUpperCase(), a)
      if (a.iata) airportByIdent.set(a.iata.toUpperCase(), a)
    }

    const result = clubs
      .map((club) => {
        const ident = club.homeAirport?.trim().toUpperCase()
        const airport = ident ? airportByIdent.get(ident) : undefined
        if (!ident || !airport) return null
        return {
          id: club.id,
          name: club.name,
          description: club.description,
          website: club.website,
          contactEmail: contactEmailById.get(club.id) ?? null,
          sizeBracket: club.sizeBracket,
          homeAirport: airport.icao,
          airportName: airport.name,
          lat: airport.latitude,
          lon: airport.longitude,
        }
      })
      .filter((c): c is NonNullable<typeof c> => c !== null)

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' },
    })
  } catch (error) {
    console.error('Error fetching discoverable clubs:', error)
    return NextResponse.json({ error: 'Failed to fetch clubs' }, { status: 500 })
  }
}
