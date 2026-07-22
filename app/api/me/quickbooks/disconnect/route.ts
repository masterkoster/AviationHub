import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { findPersonalIntegration, clearPersonalIntegrationTokens, revokeToken } from '@/lib/quickbooks'

/**
 * POST /api/me/quickbooks/disconnect
 *
 * Revokes OAuth tokens at Intuit (best-effort) and clears the stored tokens
 * on the caller's personal Integration row. No org/finance gate.
 */
export async function POST(_request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const integration = await findPersonalIntegration(session.user.id, 'quickbooks')

    if (!integration) {
      return NextResponse.json({ error: 'Integration not found' }, { status: 404 })
    }

    // Revoke at Intuit (best-effort - proceed to clear our record regardless).
    if (integration.refreshToken) {
      try {
        await revokeToken(integration.refreshToken)
      } catch (error) {
        console.error('Failed to revoke personal QuickBooks token:', error)
      }
    }

    await clearPersonalIntegrationTokens(integration.id)

    return NextResponse.json({
      success: true,
      message: 'QuickBooks disconnected successfully',
    })
  } catch (error) {
    console.error('Personal QuickBooks disconnect error:', error)
    return NextResponse.json(
      { error: 'Failed to disconnect QuickBooks' },
      { status: 500 }
    )
  }
}
