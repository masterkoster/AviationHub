import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isUuid } from '@/lib/validate'
import { QuickBooksClient } from '@/lib/integrations/quickbooks-client'

/**
 * POST /api/integrations/quickbooks/disconnect
 * 
 * Disconnects QuickBooks integration
 * Revokes OAuth tokens and updates database
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

    // Verify user has admin access to this group
    const membership = await prisma.organizationMember.findFirst({
      where: { organizationId: groupId, userId: session.user.id, role: 'ADMIN' },
    })
    if (!membership) {
      return NextResponse.json(
        { error: 'Only group admins can manage the QuickBooks integration' },
        { status: 403 }
      )
    }

    // Find integration
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

    // Revoke tokens with QuickBooks
    if (integration.refreshToken) {
      try {
        const client = new QuickBooksClient()
        await client.revokeToken(integration.refreshToken)
      } catch (error) {
        console.error('Failed to revoke QuickBooks token:', error)
        // Continue anyway - we'll update our database
      }
    }

    // Update integration status
    await prisma.integration.update({
      where: { id: integration.id },
      data: {
        status: 'disconnected',
        accessToken: null,
        refreshToken: null,
        tokenExpiry: null,
        lastSyncStatus: null,
        updatedAt: new Date(),
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
