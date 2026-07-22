import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { exchangeCode, tokenExpiryDate, upsertPersonalIntegration, getRedirectUri, PERSONAL_CALLBACK_PATH } from '@/lib/quickbooks'

/** Where the desktop settings QuickBooks card lives - see app/desktop/settings/accounting/page.tsx. */
const RETURN_PATH = '/desktop/settings/accounting'

/**
 * GET /api/me/quickbooks/callback
 *
 * OAuth callback for the personal QuickBooks connection. Exchanges the
 * authorization code for tokens and persists them to the caller's personal
 * Integration row (userId-scoped, via raw SQL - see
 * lib/quickbooks.ts#upsertPersonalIntegration).
 *
 * The browser still carries the user's session cookie on this redirect back
 * from Intuit. We require it, AND require the state's embedded userId to
 * match the signed-in session - otherwise anyone who could get this URL to
 * load in an authenticated browser could bind OAuth tokens to a different
 * account's Integration row.
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const realmId = searchParams.get('realmId')
    const error = searchParams.get('error')

    if (error) {
      return NextResponse.redirect(new URL(`${RETURN_PATH}?error=${encodeURIComponent(error)}`, request.url))
    }

    if (!code || !state || !realmId) {
      return NextResponse.redirect(new URL(`${RETURN_PATH}?error=missing_parameters`, request.url))
    }

    // state format: "u:{userId}:{randomState}" (the personal-flow marker set
    // by the connect route - distinguishes this from the club callback's
    // "groupId:randomState").
    const [marker, stateUserId] = state.split(':')
    if (marker !== 'u' || !stateUserId) {
      return NextResponse.redirect(new URL(`${RETURN_PATH}?error=invalid_state`, request.url))
    }

    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.redirect(new URL(`${RETURN_PATH}?error=not_authenticated`, request.url))
    }

    if (session.user.id !== stateUserId) {
      return NextResponse.redirect(new URL(`${RETURN_PATH}?error=not_authorized`, request.url))
    }

    // Exchange the code for tokens (throws QuickBooksApiError on failure).
    const tokens = await exchangeCode(code, getRedirectUri(PERSONAL_CALLBACK_PATH))
    const tokenExpiry = tokenExpiryDate(tokens.expiresIn)

    await upsertPersonalIntegration(session.user.id, 'quickbooks', {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiry,
      realmId,
    })

    return NextResponse.redirect(new URL(`${RETURN_PATH}?success=quickbooks_connected`, request.url))
  } catch (error) {
    console.error('Personal QuickBooks callback error:', error)
    return NextResponse.redirect(new URL(`${RETURN_PATH}?error=connection_failed`, request.url))
  }
}
