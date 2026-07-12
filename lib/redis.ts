/**
 * Redis client singleton — connects to Azure Cache for Redis.
 * Gracefully degrades to null if Redis is not configured (rate limiter falls back to in-memory).
 *
 * Required env vars:
 *   REDIS_HOST  — Azure Cache endpoint (e.g., "aviationhub.redis.cache.windows.net")
 *   REDIS_PORT  — typically 6380 for Azure (TLS)
 *   REDIS_PASSWORD — Azure Cache access key
 *   REDIS_TLS  — "true" for Azure (required), omit for local
 */

import Redis from 'ioredis'

let redisClient: Redis | null = null
let connectionAttempted = false

export function getRedis(): Redis | null {
  if (connectionAttempted) return redisClient
  connectionAttempted = true

  const host = process.env.REDIS_HOST
  const port = parseInt(process.env.REDIS_PORT || '6380')
  const password = process.env.REDIS_PASSWORD
  const tls = process.env.REDIS_TLS === 'true'

  if (!host || !password) {
    // Redis not configured — graceful degradation
    console.log('[Redis] Not configured — using in-memory fallback')
    return null
  }

  try {
    redisClient = new Redis({
      host,
      port,
      password,
      tls: tls ? {} : undefined,
      connectTimeout: 5000,
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      retryStrategy: (times) => {
        if (times > 3) return null // Stop retrying after 3 attempts
        return Math.min(times * 500, 2000)
      },
    })

    redisClient.on('error', (err) => {
      console.error('[Redis] Connection error:', err.message)
    })

    redisClient.on('connect', () => {
      console.log('[Redis] Connected to', host)
    })

    redisClient.on('close', () => {
      console.log('[Redis] Connection closed')
    })
  } catch (err) {
    console.error('[Redis] Failed to create client:', err)
    redisClient = null
  }

  return redisClient
}

/** Check if Redis is available and responding */
export async function isRedisHealthy(): Promise<boolean> {
  const client = getRedis()
  if (!client) return false
  try {
    const pong = await client.ping()
    return pong === 'PONG'
  } catch {
    return false
  }
}

/** Get a cached value from Redis, returns null on miss or error */
export async function redisGet<T>(key: string): Promise<T | null> {
  const client = getRedis()
  if (!client) return null
  try {
    const raw = await client.get(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/** Set a cached value in Redis with TTL (seconds) */
export async function redisSet<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  const client = getRedis()
  if (!client) return
  try {
    await client.set(key, JSON.stringify(value), 'EX', ttlSeconds)
  } catch {
    // Silent fail — Redis is optional
  }
}

/** Delete a key from Redis */
export async function redisDel(key: string): Promise<void> {
  const client = getRedis()
  if (!client) return
  try {
    await client.del(key)
  } catch {
    // Silent fail
  }
}