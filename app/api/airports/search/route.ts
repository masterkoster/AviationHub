import { NextResponse } from 'next/server';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

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

// Escape SQLite LIKE wildcards so user input can't inject its own % / _ matching.
function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, ch => `\\${ch}`);
}

// GET /api/airports/search?q=kpt - Autocomplete airport lookup by identifier prefix or name substring
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const raw = (searchParams.get('q') || '').trim().slice(0, 100);

    if (raw.length < 2) {
      return NextResponse.json([]);
    }

    const escaped = escapeLike(raw);
    const prefixPattern = `${escaped}%`;
    const substringPattern = `%${escaped}%`;

    const db = await getDb();

    const airports = await db.all(`
      SELECT icao AS ident, name, city AS municipality, state AS region
      FROM airports
      WHERE (icao LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\')
        AND (is_closed IS NULL OR is_closed = 0)
      ORDER BY
        CASE WHEN icao LIKE ? ESCAPE '\\' THEN 0 ELSE 1 END,
        icao ASC
      LIMIT 8
    `, prefixPattern, substringPattern, prefixPattern);

    return NextResponse.json(airports);
  } catch (error) {
    console.error('Error searching airports:', error);
    return NextResponse.json({ error: 'Failed to search airports' }, { status: 500 });
  }
}
