import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isUuid } from '@/lib/validate'
import { isFinanceRole } from '@/lib/club/roles'
import { revokeToken } from '@/lib/quickbooks'

/**
 * POST /api/integrations/quickbooks/disconnect  { groupId }
 *
 * Revokes OAuth tokens at Intuit (best-effort) and clears the stored tokens.
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

    if (!integration) {
      return NextResponse.json({ error: 'Integration not found' }, { status: 404 })
    }

    // Revoke at Intuit (best-effort - proceed to clear our record regardless).
    if (integration.refreshToken) {
      try {
        await revokeToken(integration.refreshToken)
      } catch (error) {
        console.error('Failed to revoke QuickBooks token:', error)
      }
    }

    await prisma.integration.update({
      where: { id: integration.id },
      data: {
        status: 'disconnected',
        accessToken: null,
        refreshToken: null,
        tokenExpiry: null,
        lastSyncStatus: null,
        lastSyncError: null,
      },
    })

    return NextResponse.json({
      success: true,
      message: 'QuickBooks disconnected successfully',
    })
  } catch (error) {
    console.error('QuickBooks disconnect error:', error)
    return NextResponse.json(
      { error: 'Failed to disconnect QuickBooks' },
      { status: 500 }
    )
  }
}
