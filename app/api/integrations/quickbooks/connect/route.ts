import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isUuid } from '@/lib/validate'
import { isFinanceRole } from '@/lib/club/roles'
import { getAuthorizeUrl, isQuickBooksConfigured } from '@/lib/quickbooks'
import { randomBytes } from 'crypto'

/**
 * GET /api/integrations/quickbooks/connect?groupId=xxx
 *
 * Initiates the QuickBooks OAuth flow. Returns { authUrl } for the client to
 * redirect the admin/treasurer to Intuit. Finance-gated (ADMIN or TREASURER).
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

    // Verify the caller is a finance role (ADMIN or TREASURER) of this group.
    const membership = await prisma.organizationMember.findFirst({
      where: { organizationId: groupId, userId: session.user.id },
    })
    if (!membership || !isFinanceRole(membership.role)) {
      return NextResponse.json(
        { error: 'Only group admins or the treasurer can manage the QuickBooks integration' },
        { status: 403 }
      )
    }

    if (!isQuickBooksConfigured()) {
      return NextResponse.json(
        { error: 'QuickBooks is not configured on this server. Set QUICKBOOKS_CLIENT_ID and QUICKBOOKS_CLIENT_SECRET.' },
        { status: 503 }
      )
    }

    // state carries the groupId so the callback can bind tokens to the right
    // org (format "groupId:random"); the random half is CSRF entropy.
    const state = `${groupId}:${randomBytes(24).toString('hex')}`
    const authUrl = getAuthorizeUrl(state)

    return NextResponse.json({
      success: true,
      authUrl,
      message: 'Redirect user to authUrl to complete authorization',
    })
  } catch (error) {
    console.error('QuickBooks connect error:', error)
    return NextResponse.json(
      { error: 'Failed to initiate QuickBooks connection' },
      { status: 500 }
    )
  }
}
