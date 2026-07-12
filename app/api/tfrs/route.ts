import { NextResponse } from 'next/server'

export const revalidate = 300

interface TfrEntry {
  title: string
  description: string
  link: string
  pubDate: string
  notamId: string
}

function extractTag(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`))
  return m?.[1]?.trim() ?? ''
}

export async function GET() {
  try {
    const res = await fetch('https://tfr.faa.gov/tfr2/rss.xml', {
      headers: { 'User-Agent': 'AviationHub/1.0' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`FAA TFR RSS: ${res.status}`)
    const xml = await res.text()

    const items: TfrEntry[] = []
    for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
      const block = match[1]
      const title = extractTag(block, 'title')
      const description = extractTag(block, 'description')
      const link = extractTag(block, 'link')
      const pubDate = extractTag(block, 'pubDate')
      const notamId = link.match(/notamNumber=([^&\s]+)/)?.[1] ?? ''
      if (title) items.push({ title, description, link, pubDate, notamId })
    }

    return NextResponse.json(
      { tfrs: items.slice(0, 50) },
      { headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' } },
    )
  } catch (err) {
    return NextResponse.json({ tfrs: [], error: String(err) })
  }
}
