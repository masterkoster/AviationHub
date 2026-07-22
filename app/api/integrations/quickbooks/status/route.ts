import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isUuid } from '@/lib/validate'
import { isFinanceRole } from '@/lib/club/roles'
import { getCompanyInfo } from '@/lib/quickbooks'

/**
 * GET /api/integrations/quickbooks/status?groupId=xxx
 *
 * Report the QuickBooks integration status for a group: connected flag,
 * company name (best-effort CompanyInfo fetch), last sync, and recent history.
 * Finance-gated (ADMIN or TREASURER).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const groupId = searchParams.get('groupId')

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
      include: {
        mappings: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        syncLogs: {
          orderBy: { startedAt: 'desc' },
          take: 5,
        },
      },
    })

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
        console.error('QuickBooks CompanyInfo fetch failed:', err)
      }
    }

    return NextResponse.json({
      connected: integration.status === 'connected',
      status: integration.status,
      companyName,
      companyId: integration.realmId,
      lastSync: integration.lastSyncAt,
      lastSyncStatus: integration.lastSyncStatus,
      lastSyncError: integration.lastSyncError,
      syncFrequency: integration.syncFrequency,
      mappings: integration.mappings,
      recentSyncs: integration.syncLogs,
    })
  } catch (error) {
    console.error('QuickBooks status error:', error)
    return NextResponse.json(
      { error: 'Failed to get integration status' },
      { status: 500 }
    )
  }
}
