import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

const ANALYTICS_DIR = path.join(process.cwd(), 'data', 'analytics')

interface AnalyticsEvent {
  event: string
  page?: string
  feature?: string
  timestamp: string
  /** Anonymous session ID (rotated daily, no user linkage) */
  sessionId: string
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      events: AnalyticsEvent[]
      consent: boolean
    }

    if (!body.consent) {
      return NextResponse.json({ ok: true, skipped: true })
    }

    if (!Array.isArray(body.events) || body.events.length === 0) {
      return NextResponse.json({ error: 'No events' }, { status: 400 })
    }

    // Validate each event is anonymous (no PII allowed)
    for (const event of body.events) {
      if (!event.event || typeof event.event !== 'string') {
        return NextResponse.json({ error: 'Invalid event' }, { status: 400 })
      }
      // Ensure no PII fields
      if (
        Object.keys(event).some(
          (k) =>
            ['email', 'name', 'userId', 'password', 'token', 'phone', 'address'].includes(k.toLowerCase())
        )
      ) {
        return NextResponse.json({ error: 'PII detected in event' }, { status: 400 })
      }
    }

    // Store events in daily files
    const today = new Date().toISOString().slice(0, 10)
    const filePath = path.join(ANALYTICS_DIR, `${today}.jsonl`)

    await fs.mkdir(ANALYTICS_DIR, { recursive: true })
    const lines = body.events.map((e) => JSON.stringify(e) + '\n').join('')
    await fs.appendFile(filePath, lines, 'utf-8')

    return NextResponse.json({ ok: true, count: body.events.length })
  } catch (error) {
    console.error('[analytics] error:', error)
    return NextResponse.json({ error: 'Failed to record' }, { status: 500 })
  }
}
