import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { MIN_SUPPORTED_DESKTOP_VERSION } from '@/lib/version'

export const dynamic = 'force-dynamic'

/**
 * GET - Current user's entitlements (tier + purchased modules).
 *
 * Consumed by the desktop app, which caches the payload locally so paid
 * features keep working offline for a grace period (see
 * apps/desktop/src/lib/entitlements.ts). `fetchedAt` anchors that grace
 * window on the client.
 */
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        tier: true,
        purchasedModules: true,
        subscriptionEnd: true,
        credits: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    let modules: string[] = []
    try {
      const parsed = JSON.parse(user.purchasedModules || '[]')
      if (Array.isArray(parsed)) modules = parsed.filter((m) => typeof m === 'string')
    } catch {
      // malformed JSON in DB — treat as no modules rather than failing
    }

    return NextResponse.json({
      tier: user.tier,
      modules,
      subscriptionEnd: user.subscriptionEnd,
      credits: user.credits,
      fetchedAt: new Date().toISOString(),
      minDesktopVersion: MIN_SUPPORTED_DESKTOP_VERSION,
    })
  } catch (error) {
    console.error('GET /api/v1/entitlements error:', error)
    return NextResponse.json({ error: 'Failed to fetch entitlements' }, { status: 500 })
  }
}
