import { NextResponse } from 'next/server'
import bcrypt from 'bcrypt'
import { hkdfSync } from 'crypto'
import { EncryptJWT } from 'jose'
import { prisma } from '@/lib/prisma'

// Dev-only login endpoint for automated testing — never available in production
export async function POST(request: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { username, password } = await request.json()

  const rows = await prisma.$queryRaw<any[]>`
    SELECT TOP 1 id, username, email, name, image, password, role, tier
    FROM [User] WHERE username = ${username} OR email = ${username}
  `
  const user = rows[0]
  if (!user?.password) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  const isValid = await bcrypt.compare(password, user.password)
  if (!isValid) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || 'dev-insecure-secret'
  const salt = 'next-auth.session-token'

  // Derive the 64-byte encryption key the same way @auth/core/jwt does
  const key = new Uint8Array(hkdfSync(
    'sha256',
    Buffer.from(secret),
    salt,
    `Next.js Generated Encryption Key (${salt})`,
    64
  ))

  const now = Math.floor(Date.now() / 1000)
  const exp = now + 30 * 24 * 60 * 60

  const jwt = await new EncryptJWT({
    sub: user.id,
    id: user.id,
    email: user.email,
    name: user.name,
    username: user.username,
    image: user.image ?? null,
    role: user.role,
    tier: user.tier,
    iat: now,
    exp,
    jti: crypto.randomUUID(),
  })
    .setProtectedHeader({ alg: 'dir', enc: 'A256CBC-HS512' })
    .encrypt(key)

  const res = NextResponse.json({ ok: true, userId: user.id })
  res.cookies.set('next-auth.session-token', jwt, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 30 * 24 * 60 * 60,
    path: '/',
  })
  return res
}
