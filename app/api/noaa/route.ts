import { NextRequest, NextResponse } from 'next/server'
import { rateLimitDistributed } from '@/lib/rate-limit'
import { redisGet, redisSet } from '@/lib/redis'

const ALLOWED_HOSTS = ['aviationweather.gov', 'connect.aviationweather.gov']

function getClientIP(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
         request.headers.get('x-real-ip') ||
         'unknown'
}

export async function GET(request: NextRequest) {
  // Rate limit: 60 requests/min per IP
  const ip = getClientIP(request)
  const rateLimitResult = await rateLimitDistributed({
    key: `noaa:${ip}`,
    limit: 60,
    windowMs: 60 * 1000,
  })
  if (!rateLimitResult.ok) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Try again in a minute.' },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000)) },
      }
    )
  }

  const url = request.nextUrl.searchParams.get('url')
  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 })
  }

  try {
    const parsed = new URL(url)
    if (!ALLOWED_HOSTS.some((h) => parsed.hostname.endsWith(h))) {
      return NextResponse.json({ error: 'Disallowed host' }, { status: 403 })
    }
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
  }

  // Check Redis hot cache (60s TTL)
  const cacheKey = `noaa:${url}`
  const cached = await redisGet<string>(cacheKey)
  if (cached) {
    return new NextResponse(cached, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60',
        'X-Cache': 'HIT',
      },
    })
  }

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'AviationHub/1.0' },
      signal: AbortSignal.timeout(15000),
    })
    const data = await res.text()

    // Cache in Redis for 60s
    await redisSet(cacheKey, data, 60)

    return new NextResponse(data, {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('Content-Type') || 'application/json',
        'Cache-Control': 'public, max-age=60',
        'X-Cache': 'MISS',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Proxy fetch failed' }, { status: 502 })
  }
}