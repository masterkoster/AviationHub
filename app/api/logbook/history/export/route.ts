import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getOrCreatePilotProfile } from '@/lib/pilot-profile'
import PDFDocument from 'pdfkit'

function toCsv(rows: Array<Record<string, string | number | null>>) {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const escape = (val: any) => `"${String(val ?? '').replace(/"/g, '""')}"`
  const lines = [headers.join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))]
  return lines.join('\n')
}

function buildPdf(rows: Array<Record<string, string | number | null>>, title: string) {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40 })
    const chunks: Buffer[] = []

    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    doc.fontSize(16).text(title)
    doc.moveDown()
    doc.fontSize(10)

    if (rows.length === 0) {
      doc.text('No audit history found for the selected range.')
    } else {
      rows.forEach((r, i) => {
        doc.text(`${i + 1}. ${r.action} | ${r.changedAt} | ${r.fieldName || ''}`)
        if (r.oldValue || r.newValue) {
          doc.text(`   Old: ${r.oldValue || ''}`)
          doc.text(`   New: ${r.newValue || ''}`)
        }
        if (r.reason) {
          doc.text(`   Reason: ${r.reason}`)
        }
        doc.text(`   Entry: ${r.entryDate} | ${r.aircraft} | ${r.route}`)
        doc.moveDown(0.5)
      })
    }

    doc.end()
  })
}

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const profile = await getOrCreatePilotProfile(session.user.id)
  const { searchParams } = new URL(request.url)

  const entryId = searchParams.get('entryId') || undefined
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const format = (searchParams.get('format') || 'csv').toLowerCase()

  let fromDate: Date | undefined
  let toDate: Date | undefined
  if (from) fromDate = new Date(from)
  if (to) toDate = new Date(to)

  // get all user entries
  const entryIds = await prisma.logbookEntry.findMany({
    where: { pilotProfileId: profile.id },
    select: { id: true, date: true, aircraft: true, routeFrom: true, routeTo: true },
  })

  const entryMap = new Map(entryIds.map(e => [e.id, e]))

  const where: any = {
    entryId: { in: entryIds.map(e => e.id) },
  }
  if (entryId) where.entryId = entryId
  if (fromDate || toDate) {
    where.changedAt = {
      ...(fromDate ? { gte: fromDate } : {}),
      ...(toDate ? { lte: toDate } : {}),
    }
  }

  const history = await prisma.logbookEntryHistory.findMany({
    where,
    orderBy: { changedAt: 'desc' },
    take: 2000,
  })

  const rows = history.map(h => {
    const entry = entryMap.get(h.entryId)
    return {
      action: h.action,
      fieldName: h.fieldName || '',
      oldValue: h.oldValue || '',
      newValue: h.newValue || '',
      reason: h.reason || '',
      changedAt: h.changedAt.toISOString(),
      entryDate: entry?.date ? entry.date.toISOString().split('T')[0] : '',
      aircraft: entry?.aircraft || '',
      route: entry ? `${entry.routeFrom || ''}→${entry.routeTo || ''}` : '',
    }
  })

  if (format === 'pdf') {
    try {
      const title = `Logbook Audit Report${entryId ? ` (${entryId})` : ''}`
      const pdf = await buildPdf(rows, title)
      return new NextResponse(new Uint8Array(pdf), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="logbook_audit_${Date.now()}.pdf"`,
        }
      })
    } catch (error) {
      console.error('Failed to build audit PDF', error)
      return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 })
    }
  }

  const csv = toCsv(rows)
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="logbook_audit_${Date.now()}.csv"`,
    }
  })
}
