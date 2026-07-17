import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isFinanceRole } from '@/lib/club/roles'
import { exchangeCode, tokenExpiryDate } from '@/lib/quickbooks'

/**
 * GET /api/integrations/quickbooks/callback
 *
 * OAuth callback from QuickBooks. Exchanges the authorization code for
 * access/refresh tokens and persists them to the Integration record.
 *
 * The browser still carries the user's session cookie on this redirect back
 * from Intuit. We require it, and require the caller to be a finance role
 * (ADMIN or TREASURER) of the group the connection is being made for --
 * otherwise anyone who could get this URL to load in an authenticated browser
 * could bind OAuth tokens to another club's Integration record.
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const realmId = searchParams.get('realmId')
    const error = searchParams.get('error')

    if (error) {
      return NextResponse.redirect(
        new URL(`/desktop/flying-club?error=${encodeURIComponent(error)}`, request.url)
      )
    }

    if (!code || !state || !realmId) {
      return NextResponse.redirect(
        new URL('/desktop/flying-club?error=missing_parameters', request.url)
      )
    }

    // Extract groupId from state (format: "groupId:randomState")
    const [groupId] = state.split(':')

    if (!groupId) {
      return NextResponse.redirect(
        new URL('/desktop/flying-club?error=invalid_state', request.url)
      )
    }

    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.redirect(
        new URL('/desktop/flying-club?error=not_authenticated', request.url)
      )
    }

    const membership = await prisma.organizationMember.findFirst({
      where: { organizationId: groupId, userId: session.user.id },
    })
    if (!membership || !isFinanceRole(membership.role)) {
      return NextResponse.redirect(
        new URL('/desktop/flying-club?error=not_authorized', request.url)
      )
    }

    // Exchange the code for tokens (throws QuickBooksApiError on failure).
    const tokens = await exchangeCode(code)
    const tokenExpiry = tokenExpiryDate(tokens.expiresIn)

    await prisma.integration.upsert({
      where: {
        organizationId_provider: {
          organizationId: groupId,
          provider: 'quickbooks',
        },
      },
      create: {
        organizationId: groupId,
        provider: 'quickbooks',
        status: 'connected',
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiry,
        realmId,
      },
      update: {
        status: 'connected',
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiry,
        realmId,
        lastSyncError: null,
      },
    })

    return NextResponse.redirect(
      new URL('/desktop/flying-club?success=quickbooks_connected', request.url)
    )
  } catch (error) {
    console.error('QuickBooks callback error:', error)
    return NextResponse.redirect(
      new URL('/desktop/flying-club?error=connection_failed', request.url)
    )
  }
}
