import { RateLimiterRedis, RateLimiterMemory } from 'rate-limiter-flexible'
import { getRedis } from './redis'

type RateLimitResult = {
  ok: boolean;
  remaining: number;
  resetAt: number; // epoch ms
};

type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
};

// In-memory fallback (per-instance, best-effort for serverless)
const memoryLimiters = new Map<string, RateLimiterMemory>()

// Redis-backed limiter (shared across all instances)
let redisLimiter: RateLimiterRedis | null = null
let redisLimiterAttempted = false

function getRedisLimiter(): RateLimiterRedis | null {
  if (redisLimiterAttempted) return redisLimiter
  redisLimiterAttempted = true

  const client = getRedis()
  if (!client) return null

  try {
    redisLimiter = new RateLimiterRedis({
      storeClient: client,
      keyPrefix: 'rl:',
      points: 100, // Default — overridden per-call via consume() opts
      duration: 60, // Default 60s — overridden per-call
      useRedisPackage: true,
    })
  } catch (err) {
    console.error('[RateLimit] Failed to create Redis limiter:', err)
    redisLimiter = null
  }

  return redisLimiter
}

function getMemoryLimiter(key: string, limit: number, windowSec: number): RateLimiterMemory {
  const limiterKey = `${key}:${limit}:${windowSec}`
  if (!memoryLimiters.has(limiterKey)) {
    memoryLimiters.set(limiterKey, new RateLimiterMemory({
      points: limit,
      duration: windowSec,
    }))
  }
  return memoryLimiters.get(limiterKey)!
}

/**
 * Distributed rate limiter — uses Redis (Azure Cache) when available,
 * falls back to in-memory when Redis is not configured.
 * Works correctly across serverless instances.
 */
export async function rateLimitDistributed({ key, limit, windowMs }: RateLimitOptions): Promise<RateLimitResult> {
  const windowSec = Math.ceil(windowMs / 1000)

  // Try Redis first
  const redisLimiter = getRedisLimiter()
  if (redisLimiter) {
    try {
      // Create a custom limiter with the specific limit/duration
      const customLimiter = new RateLimiterRedis({
        storeClient: getRedis()!,
        keyPrefix: `rl:${key}:`,
        points: limit,
        duration: windowSec,
        useRedisPackage: true,
      })

      const res = await customLimiter.consume('1', 1)
      return {
        ok: true,
        remaining: res.remainingPoints,
        resetAt: Date.now() + (windowMs - (res.consumedPoints * (windowMs / limit))),
      }
    } catch (rejRes: any) {
      if (rejRes?.remainingPoints !== undefined) {
        return {
          ok: false,
          remaining: rejRes.remainingPoints,
          resetAt: Date.now() + (rejRes.msBeforeNext || windowMs),
        }
      }
      // Redis error — fall through to in-memory
    }
  }

  // Fallback: in-memory (per-instance only)
  const memoryLimiter = getMemoryLimiter(key, limit, windowSec)
  try {
    const res = await memoryLimiter.consume('1', 1)
    return {
      ok: true,
      remaining: res.remainingPoints,
      resetAt: Date.now() + windowMs,
    }
  } catch (rejRes: any) {
    return {
      ok: false,
      remaining: rejRes?.remainingPoints ?? 0,
      resetAt: Date.now() + (rejRes?.msBeforeNext || windowMs),
    }
  }
}

/**
 * Original in-memory rate limiter (kept for backward compatibility).
 * Use `rateLimitDistributed` for new code.
 */
const buckets = new Map<string, number[]>();

export function rateLimit({ key, limit, windowMs }: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const start = now - windowMs;

  const existing = buckets.get(key) || [];
  const recent = existing.filter((ts) => ts > start);

  const ok = recent.length < limit;
  if (ok) recent.push(now);
  buckets.set(key, recent);

  const oldest = recent.length ? Math.min(...recent) : now;
  const resetAt = oldest + windowMs;

  return {
    ok,
    remaining: Math.max(0, limit - recent.length),
    resetAt,
  };
}