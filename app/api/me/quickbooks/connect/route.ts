import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getAuthorizeUrl, getRedirectUri, isQuickBooksConfigured, PERSONAL_CALLBACK_PATH } from '@/lib/quickbooks'
import { randomBytes } from 'crypto'

/**
 * GET /api/me/quickbooks/connect
 *
 * Initiates the QuickBooks OAuth flow for the signed-in user's own personal
 * books (aviation expense sync for taxes). No org/finance gate - a member
 * connects their own QuickBooks company regardless of club role. Returns
 * { authUrl } for the client to redirect to Intuit.
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!isQuickBooksConfigured()) {
      return NextResponse.json(
        { error: 'QuickBooks is not configured on this server. Set QUICKBOOKS_CLIENT_ID and QUICKBOOKS_CLIENT_SECRET.' },
        { status: 503 }
      )
    }

    // state carries "u:{userId}:{random}" - the leading "u:" disambiguates
    // this from the club callback's "groupId:random" state (a groupId never
    // starts with "u:"); the random half is CSRF entropy.
    const state = `u:${session.user.id}:${randomBytes(24).toString('hex')}`
    const authUrl = getAuthorizeUrl(state, getRedirectUri(PERSONAL_CALLBACK_PATH))

    return NextResponse.json({
      success: true,
      authUrl,
      message: 'Redirect user to authUrl to complete authorization',
    })
  } catch (error) {
    console.error('Personal QuickBooks connect error:', error)
    return NextResponse.json(
      { error: 'Failed to initiate QuickBooks connection' },
      { status: 500 }
    )
  }
}
