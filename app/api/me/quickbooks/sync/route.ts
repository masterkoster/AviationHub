import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { findPersonalIntegration, getCompanyInfo, pushExpense, recordPersonalSyncResult } from '@/lib/quickbooks'

/** Max expenses pushed per run to keep a single request bounded. */
const SYNC_CAP = 50

/**
 * POST /api/me/quickbooks/sync
 *
 * One-way push (app -> QBO) of the signed-in user's own out-of-pocket
 * aviation expenses, for tax purposes. No org/finance gate.
 *
 * What actually gets synced today (see docs/QUICKBOOKS.md "Personal sync
 * sources" for the full recon):
 * - `Maintenance` rows the user reported (`reportedByUserId`) that are NOT
 *   club-covered (`organizationId IS NULL`) and have a recorded `cost` > 0
 *   -> pushed as category "Aircraft Maintenance". NOTE: no UI in this
 *   codebase currently lets a user set `cost` on an org-less Maintenance
 *   row (the only cost-entry routes are admin routes gated on the row
 *   having an organizationId) - this path exists for whenever that gap is
 *   closed, and for any such rows created directly (e.g. via SQL/import).
 * - `FuelExpense` rows linked to the user's `PilotProfile` that are NOT
 *   club-covered (`organizationId IS NULL`) and have `totalCost` > 0 ->
 *   pushed as category "Aircraft Fuel". NOTE: there is no creation route
 *   for FuelExpense anywhere in this codebase today (only admin
 *   read/approve routes for club-submitted claims) - forward-compatible,
 *   not currently exercised by real data.
 * - `LogbookEntry` and `UserAircraft` were checked and carry no cost field.
 *
 * Idempotent via `QuickBooksMapping` rows keyed by entityType
 * ('personal-maintenance' / 'personal-fuel') + entityId (our row's id).
 */
export async function POST(_request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = session.user.id

    const integration = await findPersonalIntegration(userId, 'quickbooks')

    if (!integration || integration.status !== 'connected') {
      return NextResponse.json({ error: 'QuickBooks not connected' }, { status: 400 })
    }

    const syncLog = await prisma.syncLog.create({
      data: {
        integrationId: integration.id,
        syncType: 'expense',
        direction: 'to_qb',
        status: 'pending',
      },
    })

    const startTime = Date.now()
    let pushed = 0
    let skipped = 0
    const errors: string[] = []

    try {
      // Verify the connection up front (also refreshes tokens if needed).
      const company = await getCompanyInfo(integration)

      const mapped = await prisma.quickBooksMapping.findMany({
        where: { integrationId: integration.id, entityType: { in: ['personal-maintenance', 'personal-fuel'] } },
        select: { entityType: true, entityId: true },
      })
      const mappedSet = new Set(mapped.map((m) => `${m.entityType}:${m.entityId}`))

      // ── Personal maintenance costs (not club-covered) ──
      const maintenance = await prisma.maintenance.findMany({
        where: { reportedByUserId: userId, organizationId: null, cost: { gt: 0 } },
        orderBy: { reportedDate: 'asc' },
        take: SYNC_CAP,
      })

      for (const item of maintenance) {
        const key = `personal-maintenance:${item.id}`
        if (mappedSet.has(key)) {
          skipped++
          continue
        }
        try {
          const qboId = await pushExpense(integration, {
            date: item.reportedDate || item.createdAt || new Date(),
            amount: Number(item.cost),
            category: 'Aircraft Maintenance',
            memo: item.description,
          })
          await prisma.quickBooksMapping.create({
            data: {
              integrationId: integration.id,
              entityType: 'personal-maintenance',
              entityId: item.id,
              entityName: item.description.slice(0, 255),
              qbType: 'Purchase',
              qbId: qboId,
              qbName: `QBO Purchase ${qboId}`,
            },
          })
          mappedSet.add(key)
          pushed++
        } catch (err: any) {
          errors.push(`Maintenance ${item.id}: ${err?.message || 'push failed'}`)
        }
      }

      // ── Personal fuel expenses (not club-covered) ──
      const fuel = await prisma.fuelExpense.findMany({
        where: { organizationId: null, totalCost: { gt: 0 }, pilotProfile: { userId } },
        orderBy: { createdAt: 'asc' },
        take: SYNC_CAP,
      })

      for (const item of fuel) {
        const key = `personal-fuel:${item.id}`
        if (mappedSet.has(key)) {
          skipped++
          continue
        }
        try {
          const memo = `${item.gallons} gal @ $${item.pricePerGallon}/gal${item.notes ? ` — ${item.notes}` : ''}`
          const qboId = await pushExpense(integration, {
            date: item.createdAt || new Date(),
            amount: Number(item.totalCost),
            category: 'Aircraft Fuel',
            memo,
          })
          await prisma.quickBooksMapping.create({
            data: {
              integrationId: integration.id,
              entityType: 'personal-fuel',
              entityId: item.id,
              entityName: `Fuel — ${item.gallons} gal`,
              qbType: 'Purchase',
              qbId: qboId,
              qbName: `QBO Purchase ${qboId}`,
            },
          })
          mappedSet.add(key)
          pushed++
        } catch (err: any) {
          errors.push(`Fuel expense ${item.id}: ${err?.message || 'push failed'}`)
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
          details: JSON.stringify({ companyName: company.CompanyName, pushed, skipped }),
        },
      })

      // Raw SQL: personal Integration rows are userId-scoped - see lib/quickbooks.ts.
      await recordPersonalSyncResult(integration.id, status, errors.length ? errors[0].slice(0, 1000) : null)

      return NextResponse.json({
        success: true,
        pushed,
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

      await recordPersonalSyncResult(integration.id, 'error', message.slice(0, 1000))

      throw error
    }
  } catch (error: any) {
    console.error('Personal QuickBooks sync error:', error)
    return NextResponse.json(
      { error: error?.message || 'Sync failed' },
      { status: 500 }
    )
  }
}
