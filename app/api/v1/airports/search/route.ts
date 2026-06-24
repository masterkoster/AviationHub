import { NextResponse } from 'next/server'
import sqlite3 from 'sqlite3'
import { open } from 'sqlite'
import path from 'path'

export const dynamic = 'force-dynamic'

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

    const airports = await db.all(
      `      SELECT icao, name, city, state, country, latitude, longitude, elevation_ft as elevation
       FROM airports
       WHERE icao LIKE ? OR name LIKE ?
       ORDER BY CASE WHEN icao LIKE ? THEN 0 ELSE 1 END, icao
       LIMIT 10`,
      [`%${q}%`, `%${q}%`, `${q}%`]
    )

    await db.close()

    return NextResponse.json(airports)
  } catch (error) {
    console.error('GET /api/v1/airports/search error:', error)
    return NextResponse.json({ error: 'Failed to search airports' }, { status: 500 })
  }
}
