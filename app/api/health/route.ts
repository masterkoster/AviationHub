import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isRedisHealthy } from '@/lib/redis'
import { MIN_SUPPORTED_DESKTOP_VERSION } from '@/lib/version'

export async function GET() {
  const checks: Record<string, { status: 'healthy' | 'degraded' | 'down'; latencyMs?: number }> = {}

  // Check Azure SQL
  try {
    const start = Date.now()
    await prisma.$queryRaw`SELECT 1`
    checks.database = { status: 'healthy', latencyMs: Date.now() - start }
  } catch {
    checks.database = { status: 'down' }
  }

  // Check Redis
  try {
    const start = Date.now()
    const redisOk = await isRedisHealthy()
    checks.redis = {
      status: redisOk ? 'healthy' : 'degraded',
      latencyMs: redisOk ? Date.now() - start : undefined,
    }
  } catch {
    checks.redis = { status: 'degraded' }
  }

  const allHealthy = Object.values(checks).every((c) => c.status === 'healthy')
  const status = allHealthy ? 200 : 503

  return NextResponse.json({
    status: allHealthy ? 'healthy' : 'degraded',
    checks,
    timestamp: new Date().toISOString(),
    minDesktopVersion: MIN_SUPPORTED_DESKTOP_VERSION,
  }, { status })
}