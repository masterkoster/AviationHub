import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/integrations/quickbooks/status?groupId=xxx
 * 
 * Get QuickBooks integration status for a group
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

    // TODO: Verify user has access to this group

    // Find integration
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

    return NextResponse.json({
      connected: integration.status === 'connected',
      status: integration.status,
      lastSync: integration.lastSyncAt,
      lastSyncStatus: integration.lastSyncStatus,
      lastSyncError: integration.lastSyncError,
      syncFrequency: integration.syncFrequency,
      mappings: integration.mappings,
      recentSyncs: integration.syncLogs,
      companyId: integration.realmId,
    })
  } catch (error) {
    console.error('QuickBooks status error:', error)
    return NextResponse.json(
      { error: 'Failed to get integration status' },
      { status: 500 }
    )
  }
}
