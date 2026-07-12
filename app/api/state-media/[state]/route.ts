import { NextResponse } from 'next/server'
import { stateData } from '@/lib/stateData'
import { prisma } from '@/lib/prisma'

type MediaItem = {
  title: string
  imageUrl: string
  sourceUrl: string
  author: string
  license: string
  licenseUrl: string
}

type WikimediaPage = {
  title?: string
  imageinfo?: Array<{
    thumburl?: string
    url?: string
    extmetadata?: Record<string, { value?: string }>
  }>
}

function cleanHtml(value: string): string {
  return value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
}

function normalizeState(input: string): string {
  return input.toUpperCase().replace(/^US-/, '').replace(/[^A-Z]/g, '').slice(0, 2)
}

function isAllowedLicense(license: string): boolean {
  const l = license.toLowerCase()
  return (
    l.includes('public domain') ||
    l.includes('cc by') ||
    l.includes('cc-by') ||
    l.includes('cc0') ||
    l.includes('creative commons attribution')
  )
}

async function fetchWikimediaByQuery(query: string): Promise<MediaItem[]> {
  const url = new URL('https://commons.wikimedia.org/w/api.php')
  url.searchParams.set('action', 'query')
  url.searchParams.set('generator', 'search')
  url.searchParams.set('gsrsearch', query)
  url.searchParams.set('gsrnamespace', '6')
  url.searchParams.set('gsrlimit', '20')
  url.searchParams.set('prop', 'imageinfo')
  url.searchParams.set('iiprop', 'url|extmetadata')
  url.searchParams.set('iiurlwidth', '1200')
  url.searchParams.set('format', 'json')
  url.searchParams.set('origin', '*')

  const res = await fetch(url.toString(), { next: { revalidate: 60 * 60 * 24 } })
  if (!res.ok) throw new Error('Wikimedia fetch failed')
  const json = await res.json()
  const pages = Object.values((json?.query?.pages || {}) as Record<string, WikimediaPage>)

  const items: MediaItem[] = []
  for (const page of pages) {
    const ii = page?.imageinfo?.[0]
    if (!ii) continue
    const meta = ii.extmetadata || {}
    const license = cleanHtml(meta?.LicenseShortName?.value || meta?.UsageTerms?.value || '')
    if (!isAllowedLicense(license)) continue

    const author = cleanHtml(meta?.Artist?.value || 'Unknown author')
    const licenseUrl = cleanHtml(meta?.LicenseUrl?.value || '')
    const imageUrl = ii.thumburl || ii.url
    if (!imageUrl) continue

    const sourceUrl = `https://commons.wikimedia.org/wiki/${encodeURIComponent(String(page.title || '').replace(/\s+/g, '_'))}`
    items.push({
      title: cleanHtml(String(page.title || '').replace(/^File:/, '').replace(/_/g, ' ')),
      imageUrl,
      sourceUrl,
      author,
      license: license || 'Unknown license',
      licenseUrl,
    })
  }

  return items
}

async function fetchWikimediaImages(stateCode: string): Promise<MediaItem[]> {
  const info = stateData[stateCode]
  const stateName = info?.stateName || stateCode
  const attractionTerms = (info?.attractions || []).slice(0, 3)

  const queryList = [
    ...attractionTerms.map((a) => `${a} ${stateName} skyline OR landmark`),
    `${stateName} state skyline OR cityscape`,
    `${stateName} beach OR coastline OR great lake`,
    `${stateName} state landmark panorama`,
  ]

  const dedup = new Map<string, MediaItem>()
  for (const q of queryList) {
    const found = await fetchWikimediaByQuery(q)
    for (const item of found) {
      if (!dedup.has(item.imageUrl)) {
        dedup.set(item.imageUrl, item)
      }
      if (dedup.size >= 12) break
    }
    if (dedup.size >= 12) break
  }

  const ranked = Array.from(dedup.values()).sort((a, b) => {
    const ban = ['flag', 'map of', 'locator', 'seal', 'coat of arms']
    const score = (item: MediaItem) => {
      const t = item.title.toLowerCase()
      let s = 0
      if (t.includes(stateName.toLowerCase())) s += 3
      for (const term of attractionTerms) {
        const token = term.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)[0]
        if (token && t.includes(token)) s += 4
      }
      if (t.includes('skyline') || t.includes('beach') || t.includes('lake') || t.includes('downtown')) s += 2
      if (ban.some((w) => t.includes(w))) s -= 10
      return s
    }
    const aScore = score(a)
    const bScore = score(b)
    return bScore - aScore
  })

  return ranked.slice(0, 5)
}

export async function GET(_req: Request, { params }: { params: Promise<{ state: string }> }) {
  try {
    const { state } = await params
    const stateCode = normalizeState(state)
    if (!stateCode || stateCode.length !== 2) {
      return NextResponse.json({ error: 'Invalid state code' }, { status: 400 })
    }

    // Check Prisma cache (Azure SQL)
    const cached = await prisma.stateMediaCache.findUnique({
      where: { state_code: stateCode }
    })

    const now = Date.now()
    const ttlMs = 7 * 24 * 60 * 60 * 1000
    if (cached) {
      const age = now - new Date(cached.fetched_at).getTime()
      if (age < ttlMs) {
        return NextResponse.json({
          state: stateCode,
          images: JSON.parse(cached.images_json) as MediaItem[],
          fetchedAt: cached.fetched_at,
          fromCache: true,
        })
      }
    }

    const images = await fetchWikimediaImages(stateCode)
    const fetchedAt = new Date()

    // Cache in Azure SQL (only if we got results)
    if (images.length > 0) {
      await prisma.stateMediaCache.upsert({
        where: { state_code: stateCode },
        create: {
          state_code: stateCode,
          images_json: JSON.stringify(images),
          fetched_at: fetchedAt,
        },
        update: {
          images_json: JSON.stringify(images),
          fetched_at: fetchedAt,
        },
      })
    }

    // Stale fallback: if fresh fetch returned 0 images but we have stale cache
    if (images.length === 0 && cached) {
      return NextResponse.json({
        state: stateCode,
        images: JSON.parse(cached.images_json) as MediaItem[],
        fetchedAt: cached.fetched_at,
        fromCache: true,
      })
    }

    return NextResponse.json({ state: stateCode, images, fetchedAt, fromCache: false })
  } catch (error) {
    console.error('GET /api/state-media/[state] error:', error)
    return NextResponse.json({ error: 'Failed to load state media' }, { status: 500 })
  }
}