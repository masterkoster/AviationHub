import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

const WAITLIST_FILE = path.join(process.cwd(), 'data', 'waitlist.json')

async function readWaitlist(): Promise<string[]> {
  try {
    const data = await fs.readFile(WAITLIST_FILE, 'utf-8')
    return JSON.parse(data) as string[]
  } catch {
    return []
  }
}

async function writeWaitlist(emails: string[]): Promise<void> {
  await fs.mkdir(path.dirname(WAITLIST_FILE), { recursive: true })
  await fs.writeFile(WAITLIST_FILE, JSON.stringify(emails, null, 2), 'utf-8')
}

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
    }

    const normalizedEmail = email.trim().toLowerCase()
    const emails = await readWaitlist()

    if (emails.includes(normalizedEmail)) {
      return NextResponse.json({ ok: true, message: 'Already on waitlist' })
    }

    emails.push(normalizedEmail)
    await writeWaitlist(emails)

    console.log(`[waitlist] new signup: ${normalizedEmail} (total: ${emails.length})`)

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[waitlist] error:', error)
    return NextResponse.json({ error: 'Failed to join waitlist' }, { status: 500 })
  }
}
