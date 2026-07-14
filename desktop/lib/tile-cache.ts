'use client'

import Database from '@tauri-apps/plugin-sql'

let dbPromise: Promise<Database> | null = null

function getDb(): Promise<Database> | null {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window || '__TAURI__' in window)) return null
  if (!dbPromise) dbPromise = Database.load('sqlite:aviationhub.db')
  return dbPromise
}

export type TileProvider = 'osm' | 'satellite' | 'terrain' | 'dark' | 'aero'

export interface CacheMeta {
  provider: TileProvider
  downloadedAt: string | null // ISO timestamp
  tileCount: number
}

/**
 * Look up a cached tile in SQLite. Returns the blob as a Uint8Array if found,
 * or null if missing / not in Tauri.
 */
export async function getCachedTile(
  provider: TileProvider,
  z: number,
  x: number,
  y: number
): Promise<Uint8Array | null> {
  const db = await getDb()
  if (!db) return null

  const rows = await db.select<Array<{ data: Uint8Array }>>(
    `SELECT data FROM tile_cache WHERE provider = $1 AND z = $2 AND x = $3 AND y = $4`,
    [provider, z, x, y]
  )
  if (rows.length === 0) return null
  // The plugin may return data as number[] or Uint8Array depending on version.
  const raw = rows[0].data as unknown as ArrayBuffer | Uint8Array | number[]
  if (raw instanceof Uint8Array) return raw
  if (Array.isArray(raw)) return new Uint8Array(raw)
  return new Uint8Array(raw as ArrayBuffer)
}

/**
 * Fetch a tile from upstream, persist it to SQLite, and return the bytes.
 * Records download_at in tile_cache_meta if this is the first tile for the
 * provider.
 */
export async function fetchAndCacheTile(
  provider: TileProvider,
  url: string,
  z: number,
  x: number,
  y: number
): Promise<Uint8Array | null> {
  const db = await getDb()
  if (!db) return null

  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buffer = await res.arrayBuffer()
    const bytes = new Uint8Array(buffer)

    // Store blob. tauri-plugin-sql accepts Uint8Array as bind param.
    await db.execute(
      `INSERT OR REPLACE INTO tile_cache (provider, z, x, y, data, cached_at)
       VALUES ($1, $2, $3, $4, $5, datetime('now'))`,
      [provider, z, x, y, bytes as unknown as Uint8Array]
    )

    // Mark provider as downloaded at "now" on first tile, otherwise increment count.
    await db.execute(
      `INSERT INTO tile_cache_meta (provider, downloaded_at, tile_count)
       VALUES ($1, datetime('now'), 1)
       ON CONFLICT(provider) DO UPDATE
         SET tile_count = tile_count + 1,
             updated_at = datetime('now')`,
      [provider]
    )

    return bytes
  } catch (err) {
    console.error('[tile-cache] fetch failed', err)
    return null
  }
}

/** Get metadata for a provider's cache (last download time + total tiles). */
export async function getCacheMeta(provider: TileProvider): Promise<CacheMeta> {
  const db = await getDb()
  if (!db) return { provider, downloadedAt: null, tileCount: 0 }

  const rows = await db.select<
    Array<{ downloaded_at: string | null; tile_count: number | null }>
  >(`SELECT downloaded_at, tile_count FROM tile_cache_meta WHERE provider = $1`, [
    provider,
  ])

  return {
    provider,
    downloadedAt: rows[0]?.downloaded_at ?? null,
    tileCount: rows[0]?.tile_count ?? 0,
  }
}

/** Clear all cached tiles (used by "Clear cache" / "Re-update"). */
export async function clearCache(provider?: TileProvider): Promise<number> {
  const db = await getDb()
  if (!db) return 0
  if (provider) {
    const res = await db.execute(
      `DELETE FROM tile_cache WHERE provider = $1`,
      [provider]
    )
    await db.execute(`DELETE FROM tile_cache_meta WHERE provider = $1`, [provider])
    return res.rowsAffected ?? 0
  }
  const res = await db.execute(`DELETE FROM tile_cache`)
  await db.execute(`DELETE FROM tile_cache_meta`)
  return res.rowsAffected ?? 0
}

/** Count how many tiles are currently cached (across all providers). */
export async function countCachedTiles(): Promise<number> {
  const db = await getDb()
  if (!db) return 0
  const rows = await db.select<Array<{ total: number }>>(
    `SELECT COUNT(*) AS total FROM tile_cache`
  )
  return rows[0]?.total ?? 0
}

/**
 * Convenience: get a tile's bytes, using cache first, then upstream.
 * Returns a Blob URL ready to be used as an <img> src.
 */
export async function resolveTile(
  provider: TileProvider,
  url: string,
  z: number,
  x: number,
  y: number
): Promise<string | null> {
  const cached = await getCachedTile(provider, z, x, y)
  if (cached && cached.byteLength > 0) {
    const buf = cached.buffer.slice(cached.byteOffset, cached.byteOffset + cached.byteLength) as ArrayBuffer
    return URL.createObjectURL(new Blob([buf as unknown as BlobPart], { type: 'image/png' }))
  }
  const fresh = await fetchAndCacheTile(provider, url, z, x, y)
  if (fresh) {
    const buf = fresh.buffer.slice(fresh.byteOffset, fresh.byteOffset + fresh.byteLength) as ArrayBuffer
    return URL.createObjectURL(new Blob([buf as unknown as BlobPart], { type: 'image/png' }))
  }
  return null
}