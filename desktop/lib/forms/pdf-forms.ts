/**
 * PDF worksheet builders — Documents area.
 *
 * These generate WORKSHEETS that help a pilot organize the numbers/records
 * they need to fill out real FAA paperwork (e.g. IACRA Form 8710-1). They
 * are NOT the official FAA form: no official form numbers as a title, no
 * FAA letterhead/seal, no official layout. Every generated PDF carries a
 * plain-language disclaimer footer to keep that distinction obvious.
 *
 * Reuses the jsPDF + jspdf-autotable pattern from
 * app/fuel-saver/lib/exportUtils.ts (createNavLogPdfDoc).
 */

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { LocalTotals } from '@/apps/desktop/src/lib/local-logbook'
import type { EndorsementRecord } from '@/apps/desktop/src/lib/cloud-api'

export const WORKSHEET_DISCLAIMER =
  'Worksheet to help complete your FAA paperwork — not an official FAA form or submission.'

// ── Shared helpers ────────────────────────────────────────────────

function round1(n: number | undefined | null): string {
  return (n ?? 0).toFixed(1)
}

function fmtDate(dateISO: string): string {
  try {
    return new Date(dateISO).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return dateISO
  }
}

function experienceRows(totals: LocalTotals): string[][] {
  return [
    ['Total time', `${round1(totals.totalTime)} hrs`],
    ['PIC', `${round1(totals.picTime)} hrs`],
    ['SIC', `${round1(totals.sicTime)} hrs`],
    ['Night', `${round1(totals.nightTime)} hrs`],
    ['Instrument', `${round1(totals.instrumentTime)} hrs`],
    ['Cross-country', `${round1(totals.crossCountryTime)} hrs`],
    ['Day landings', `${totals.landingsDay ?? 0}`],
    ['Night landings', `${totals.landingsNight ?? 0}`],
  ]
}

function drawDisclaimerFooter(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages()
  const margin = 14
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8)
    doc.setTextColor(140)
    doc.text(WORKSHEET_DISCLAIMER, margin, doc.internal.pageSize.getHeight() - margin / 2)
  }
}

// ── 8710 aeronautical experience summary ────────────────────────

export interface Build8710SummaryInput {
  pilotName: string
  dateISO: string
  totals: LocalTotals
}

export function build8710SummaryPdf(input: Build8710SummaryInput): jsPDF {
  const { pilotName, dateISO, totals } = input
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })
  const margin = 14
  let y = margin + 4

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text('Aeronautical experience summary', margin, y)

  y += 8
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(`Pilot: ${pilotName || 'Unnamed Pilot'}`, margin, y)
  y += 5
  doc.text(`Generated: ${fmtDate(dateISO)}`, margin, y)

  y += 6
  autoTable(doc, {
    head: [['Category', 'Value']],
    body: experienceRows(totals),
    startY: y,
    styles: { fontSize: 10, cellPadding: 4 },
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { halign: 'left' },
      1: { halign: 'right' },
    },
  })

  const tableY = (doc as any).lastAutoTable?.finalY || y
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(120)
  doc.text(
    'Use these totals to help fill out the experience fields on your official FAA application (e.g. IACRA Form 8710-1).',
    margin,
    tableY + 8,
    { maxWidth: doc.internal.pageSize.getWidth() - margin * 2 }
  )

  drawDisclaimerFooter(doc)
  return doc
}

export function download8710(input: Build8710SummaryInput): void {
  const doc = build8710SummaryPdf(input)
  doc.save('experience-summary.pdf')
}

// ── Training folder (hours + endorsements) ──────────────────────

export interface BuildTrainingFolderInput {
  pilotName: string
  dateISO: string
  totals: LocalTotals
  endorsements: EndorsementRecord[]
}

export function buildTrainingFolderPdf(input: BuildTrainingFolderInput): jsPDF {
  const { pilotName, dateISO, totals, endorsements } = input
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })
  const margin = 14
  let y = margin + 4

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text('Training record', margin, y)

  y += 8
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(`Pilot: ${pilotName || 'Unnamed Pilot'}`, margin, y)
  y += 5
  doc.text(`Generated: ${fmtDate(dateISO)}`, margin, y)

  y += 6
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('Hours summary', margin, y)
  y += 2

  autoTable(doc, {
    head: [['Category', 'Value']],
    body: experienceRows(totals),
    startY: y + 2,
    styles: { fontSize: 10, cellPadding: 4 },
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { halign: 'left' },
      1: { halign: 'right' },
    },
  })

  let tableY = (doc as any).lastAutoTable?.finalY || y

  const studentEndorsements = endorsements.filter((e) => e.myRole === 'student')
  const endorsementRows: string[][] =
    studentEndorsements.length > 0
      ? studentEndorsements.map((e) => [
          fmtDate(e.signedAt),
          e.template ? `${e.template.title} (${e.template.code})` : 'Unknown endorsement',
          e.instructorName || 'Unknown instructor',
          e.notes || '',
        ])
      : [['—', 'No endorsements recorded yet', '—', '—']]

  tableY += 10
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('Endorsements', margin, tableY)

  autoTable(doc, {
    head: [['Date signed', 'Endorsement', 'Instructor', 'Notes']],
    body: endorsementRows,
    startY: tableY + 2,
    styles: { fontSize: 9, cellPadding: 3.5 },
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 28 },
      2: { cellWidth: 35 },
    },
  })

  drawDisclaimerFooter(doc)
  return doc
}

export function downloadTrainingFolder(input: BuildTrainingFolderInput): void {
  const doc = buildTrainingFolderPdf(input)
  doc.save('training-record.pdf')
}
