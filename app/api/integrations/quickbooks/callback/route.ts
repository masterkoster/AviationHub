import { NextRequest, NextResponse } from 'next/server'
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

    // TODO: Verify state matches what we stored (CSRF protection)
    // In production, check session storage for the state token

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
