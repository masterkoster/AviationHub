import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { findPersonalIntegration, getCompanyInfo } from '@/lib/quickbooks'

/**
 * GET /api/me/quickbooks/status
 *
 * Report the signed-in user's personal QuickBooks integration status:
 * connected flag, company name (best-effort CompanyInfo fetch), last sync,
 * and how many personal expenses have been pushed so far. No org/finance
 * gate - this is the user's own connection.
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Raw SQL: personal Integration rows are userId-scoped, which the
    // generated Prisma client predates - see lib/quickbooks.ts.
    const integration = await findPersonalIntegration(session.user.id, 'quickbooks')

    if (!integration) {
      return NextResponse.json({
        connected: false,
        status: 'disconnected',
      })
    }

    // Best-effort company name; tolerate QBO/API failure (e.g. token expired).
    let companyName: string | null = null
    if (integration.status === 'connected') {
      try {
        const info = await getCompanyInfo(integration)
        companyName = info.CompanyName || null
      } catch (err) {
        console.error('Personal QuickBooks CompanyInfo fetch failed:', err)
      }
    }

    // QuickBooksMapping/SyncLog are unchanged tables (keyed by integrationId,
    // not by scope) - the typed client works fine here.
    const [mappings, recentSyncs, syncedCount] = await Promise.all([
      prisma.quickBooksMapping.findMany({
        where: { integrationId: integration.id },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.syncLog.findMany({
        where: { integrationId: integration.id },
        orderBy: { startedAt: 'desc' },
        take: 5,
      }),
      prisma.quickBooksMapping.count({ where: { integrationId: integration.id } }),
    ])

    return NextResponse.json({
      connected: integration.status === 'connected',
      status: integration.status,
      companyName,
      companyId: integration.realmId,
      lastSync: integration.lastSyncAt,
      lastSyncStatus: integration.lastSyncStatus,
      lastSyncError: integration.lastSyncError,
      syncedCount,
      mappings,
      recentSyncs,
    })
  } catch (error) {
    console.error('Personal QuickBooks status error:', error)
    return NextResponse.json(
      { error: 'Failed to get integration status' },
      { status: 500 }
    )
  }
}
