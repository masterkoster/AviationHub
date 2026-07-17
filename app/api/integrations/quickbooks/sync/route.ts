import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isUuid } from '@/lib/validate'
import { isFinanceRole } from '@/lib/club/roles'
import {
  ensureCustomer,
  pushInvoice,
  recordPayment,
  getCompanyInfo,
  type InvoiceLine,
} from '@/lib/quickbooks'

/** Max invoices pushed per run to keep a single request bounded. */
const SYNC_CAP = 50

/**
 * POST /api/integrations/quickbooks/sync  { groupId }
 *
 * One-way push (app -> QBO): for each club Invoice not yet mapped in
 * QuickBooksMapping, find-or-create the member's QBO Customer, create the QBO
 * Invoice, and (if our invoice is 'paid') record a linked QBO Payment.
 * Idempotent via the QuickBooksMapping row keyed by our invoice id.
 * Finance-gated (ADMIN or TREASURER).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { groupId } = await request.json()

    if (!groupId) {
      return NextResponse.json({ error: 'groupId required' }, { status: 400 })
    }

    if (!isUuid(groupId)) {
      return NextResponse.json({ error: 'Invalid groupId' }, { status: 400 })
    }

    const membership = await prisma.organizationMember.findFirst({
      where: { organizationId: groupId, userId: session.user.id },
    })
    if (!membership || !isFinanceRole(membership.role)) {
      return NextResponse.json(
        { error: 'Only group admins or the treasurer can manage the QuickBooks integration' },
        { status: 403 }
      )
    }

    const integration = await prisma.integration.findUnique({
      where: {
        organizationId_provider: {
          organizationId: groupId,
          provider: 'quickbooks',
        },
      },
    })

    if (!integration || integration.status !== 'connected') {
      return NextResponse.json({ error: 'QuickBooks not connected' }, { status: 400 })
    }

    const syncLog = await prisma.syncLog.create({
      data: {
        integrationId: integration.id,
        syncType: 'invoice',
        direction: 'to_qb',
        status: 'pending',
      },
    })

    const startTime = Date.now()
    let pushed = 0
    let paymentsRecorded = 0
    let skipped = 0
    const errors: string[] = []

    try {
      // Verify the connection up front (also refreshes tokens if needed).
      const company = await getCompanyInfo(integration)

      // Already-mapped invoices are done - fetch their ids to skip cheaply.
      const mapped = await prisma.quickBooksMapping.findMany({
        where: { integrationId: integration.id, entityType: 'invoice' },
        select: { entityId: true },
      })
      const mappedIds = new Set(mapped.map((m) => m.entityId))

      // Club invoices with a billable member and at least one line item.
      const invoices = await prisma.invoice.findMany({
        where: {
          organizationId: groupId,
          pilotProfileId: { not: null },
          id: { notIn: mappedIds.size ? Array.from(mappedIds) : undefined },
        },
        include: {
          items: { include: { clubAircraft: true } },
          pilotProfile: { include: { user: true } },
        },
        orderBy: { createdAt: 'asc' },
        take: SYNC_CAP,
      })

      for (const invoice of invoices) {
        if (mappedIds.has(invoice.id)) {
          skipped++
          continue
        }

        const user = invoice.pilotProfile?.user
        if (!user) {
          skipped++
          errors.push(`Invoice ${invoice.id}: no member/user on record`)
          continue
        }
        if (invoice.items.length === 0) {
          skipped++
          continue
        }

        try {
          const customerId = await ensureCustomer(integration, {
            userId: user.id,
            name: user.name || user.email || '',
            email: user.email,
          })

          const lines: InvoiceLine[] = invoice.items.map((item) => {
            const tail = item.clubAircraft?.nNumber || item.clubAircraft?.nickname || 'Flight'
            const hrs = Number(item.hobbsHours)
            const rate = Number(item.hourlyRate)
            const amount = Number(item.amount)
            return {
              description: `Flight ${tail} — ${hrs} hrs @ $${rate}/hr`,
              amount,
            }
          })

          const qboInvoiceId = await pushInvoice(integration, {
            customerId,
            lines,
            docNumber: invoice.id.slice(0, 21),
          })

          await prisma.quickBooksMapping.create({
            data: {
              integrationId: integration.id,
              entityType: 'invoice',
              entityId: invoice.id,
              entityName: `Invoice ${invoice.id.slice(0, 8)} — ${user.name || user.email}`,
              qbType: 'Invoice',
              qbId: qboInvoiceId,
              qbName: `QBO Invoice ${qboInvoiceId}`,
            },
          })
          mappedIds.add(invoice.id)
          pushed++

          // Mirror payment state for paid invoices.
          if (invoice.status === 'paid') {
            try {
              await recordPayment(integration, {
                customerId,
                qboInvoiceId,
                amount: Number(invoice.totalAmount),
              })
              paymentsRecorded++
            } catch (payErr: any) {
              errors.push(`Invoice ${invoice.id} payment: ${payErr?.message || 'failed'}`)
            }
          }
        } catch (err: any) {
          errors.push(`Invoice ${invoice.id}: ${err?.message || 'push failed'}`)
        }
      }

      const durationMs = Date.now() - startTime
      const status = errors.length > 0 ? (pushed > 0 ? 'partial' : 'error') : 'success'

      await prisma.syncLog.update({
        where: { id: syncLog.id },
        data: {
          status,
          recordsTotal: pushed + skipped,
          recordsSuccess: pushed,
          recordsFailed: errors.length,
          completedAt: new Date(),
          durationMs,
          errorMessage: errors.length ? errors.slice(0, 20).join('; ').slice(0, 3000) : null,
          details: JSON.stringify({
            companyName: company.CompanyName,
            pushed,
            paymentsRecorded,
            skipped,
          }),
        },
      })

      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          lastSyncAt: new Date(),
          lastSyncStatus: status,
          lastSyncError: errors.length ? errors[0].slice(0, 1000) : null,
        },
      })

      return NextResponse.json({
        success: true,
        pushed,
        paymentsRecorded,
        skipped,
        errors,
        syncLog: {
          id: syncLog.id,
          status,
          recordsTotal: pushed + skipped,
          recordsSuccess: pushed,
          recordsFailed: errors.length,
          durationMs,
        },
      })
    } catch (error: any) {
      const durationMs = Date.now() - startTime
      const message = error?.message || 'Sync failed'

      await prisma.syncLog.update({
        where: { id: syncLog.id },
        data: {
          status: 'error',
          recordsSuccess: pushed,
          recordsFailed: errors.length,
          errorMessage: message.slice(0, 3000),
          completedAt: new Date(),
          durationMs,
        },
      })

      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          lastSyncAt: new Date(),
          lastSyncStatus: 'error',
          lastSyncError: message.slice(0, 1000),
        },
      })

      throw error
    }
  } catch (error: any) {
    console.error('QuickBooks sync error:', error)
    return NextResponse.json(
      { error: error?.message || 'Sync failed' },
      { status: 500 }
    )
  }
}
