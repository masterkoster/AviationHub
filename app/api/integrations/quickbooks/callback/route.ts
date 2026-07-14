import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { QuickBooksClient } from '@/lib/integrations/quickbooks-client'

/**
 * GET /api/integrations/quickbooks/callback
 *
 * OAuth callback from QuickBooks
 * Exchanges authorization code for access/refresh tokens
 * Creates or updates Integration record in database
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const realmId = searchParams.get('realmId')
    const error = searchParams.get('error')

    // Check for OAuth errors
    if (error) {
      return NextResponse.redirect(
        new URL(`/flying-club/manage/add-ons?error=${error}`, request.url)
      )
    }

    if (!code || !state || !realmId) {
      return NextResponse.redirect(
        new URL('/flying-club/manage/add-ons?error=missing_parameters', request.url)
      )
    }

    // Extract groupId from state (format: "groupId:randomState")
    const [groupId] = state.split(':')

    if (!groupId) {
      return NextResponse.redirect(
        new URL('/flying-club/manage/add-ons?error=invalid_state', request.url)
      )
    }

    // The browser still carries the user's session cookie on this redirect
    // back from QuickBooks. Require it, and require the caller to be an
    // admin of the group the connection is being made for — otherwise
    // anyone who can guess/observe a groupId could bind their own
    // QuickBooks tokens to another club's Integration record by crafting
    // this callback URL directly.
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.redirect(
        new URL('/flying-club/manage/add-ons?error=not_authenticated', request.url)
      )
    }

    const membership = await prisma.organizationMember.findFirst({
      where: { organizationId: groupId, userId: session.user.id, role: 'ADMIN' },
    })
    if (!membership) {
      return NextResponse.redirect(
        new URL('/flying-club/manage/add-ons?error=not_authorized', request.url)
      )
    }

    // Exchange code for tokens
    const client = new QuickBooksClient()
    const tokens = await client.exchangeCodeForToken(code)

    // Calculate token expiry
    const tokenExpiry = new Date()
    tokenExpiry.setSeconds(tokenExpiry.getSeconds() + tokens.expiresIn)

    // Create or update integration record
    const integration = await prisma.integration.upsert({
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
        tokenExpiry: tokenExpiry,
        realmId: tokens.realmId || realmId,
        lastSyncStatus: 'success',
      },
      update: {
        status: 'connected',
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiry: tokenExpiry,
        realmId: tokens.realmId || realmId,
        lastSyncStatus: 'success',
        updatedAt: new Date(),
      },
    })

    // Redirect back to add-ons page with success message
    return NextResponse.redirect(
      new URL('/flying-club/manage/add-ons?success=quickbooks_connected', request.url)
    )
  } catch (error) {
    console.error('QuickBooks callback error:', error)
    return NextResponse.redirect(
      new URL('/flying-club/manage/add-ons?error=connection_failed', request.url)
    )
  }
}
