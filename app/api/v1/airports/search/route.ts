import { NextResponse } from 'next/server'
import sqlite3 from 'sqlite3'
import { open } from 'sqlite'
import path from 'path'

export const dynamic = 'force-dynamic'

// Escape SQLite LIKE wildcards so user input can't act as its own % / _ pattern.
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q')?.trim() || ''

    if (q.length < 2) {
      return NextResponse.json([])
    }

    const db = await open({
      filename: path.join(process.cwd(), 'data', 'aviation_hub.db'),
      driver: sqlite3.Database,
    })

    const esc = escapeLike(q)
    const like = `%${esc}%`
    const prefix = `${esc}%`
    const exact = q.toUpperCase()

    // Matches identifier / IATA / name / city, skips closed fields, and ranks so
    // the biggest airports surface first (an exact code match still wins outright).
    // This is why typing "la" leads with LAX/LAS and "new york" leads with
    // JFK/LGA/EWR rather than tiny grass strips.
    const airports = await db.all(
      `SELECT icao, iata, name, city, state, country, latitude, longitude, elevation_ft as elevation, type
       FROM airports
       WHERE (is_closed = 0 OR is_closed IS NULL)
         AND (icao LIKE ? ESCAPE '\\' OR iata LIKE ? ESCAPE '\\'
              OR name LIKE ? ESCAPE '\\' OR city LIKE ? ESCAPE '\\')
       ORDER BY
         CASE WHEN icao = ? OR iata = ? THEN 0 ELSE 1 END,
         CASE type
           WHEN 'large_airport'  THEN 0
           WHEN 'medium_airport' THEN 1
           WHEN 'small_airport'  THEN 2
           WHEN 'seaplane_base'  THEN 3
           ELSE 4
         END,
         CASE WHEN icao LIKE ? ESCAPE '\\' OR iata LIKE ? ESCAPE '\\' THEN 0 ELSE 1 END,
         name
       LIMIT 10`,
      [like, like, like, like, exact, exact, prefix, prefix]
    )

    await db.close()

    return NextResponse.json(airports)
  } catch (error) {
    console.error('GET /api/v1/airports/search error:', error)
    return NextResponse.json({ error: 'Failed to search airports' }, { status: 500 })
  }
}
