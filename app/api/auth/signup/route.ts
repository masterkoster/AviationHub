import { NextResponse } from "next/server"
import bcrypt from "bcrypt"
import crypto from "crypto"
import { sendVerificationEmail } from "@/lib/email"
import { createUserEncryptionKey } from "@/lib/server-encryption"
import { prisma } from "@/lib/prisma"

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const username = searchParams.get('checkUsername')

  if (!username) {
    return NextResponse.json({ error: 'Username parameter required' }, { status: 400 })
  }

  const normalized = username.trim().toLowerCase()

  // Validate format
  if (!/^[a-z0-9_]{3,20}$/.test(normalized)) {
    return NextResponse.json({ available: false })
  }

  try {
    const rows = await prisma.$queryRaw<{ cnt: bigint }[]>`
      SELECT COUNT(1) AS cnt FROM [User] WHERE username = ${normalized}
    `
    const taken = Number(rows[0]?.cnt ?? 0) > 0
    return NextResponse.json({ available: !taken })
  } catch (err) {
    console.error('[username-check] Database error:', err)
    return NextResponse.json({ available: null, error: 'Could not verify username availability' }, { status: 503 })
  }
}

export async function POST(request: Request) {
  try {
    let body
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      )
    }
    
    const { name, email, password, username, role } = body
    
    if (!email || !password || !username) {
      return NextResponse.json(
        { error: "Username, email, and password are required" },
        { status: 400 }
      )
    }
    
    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      )
    }
    
    const normalizedEmail = email.trim().toLowerCase()
    const normalizedUsername = username.trim().toLowerCase()

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    if (!emailOk) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
    }

    const usernameOk = /^[a-z0-9_]{3,20}$/.test(normalizedUsername)
    if (!usernameOk) {
      return NextResponse.json(
        { error: 'Username must be 3-20 characters (a-z, 0-9, underscore)' },
        { status: 400 }
      )
    }
    
    // Check if email exists
    try {
      const emailRows = await prisma.$queryRaw<{ id: string }[]>`
        SELECT TOP 1 id FROM [User] WHERE email = ${normalizedEmail}
      `
      if (emailRows.length > 0) {
        return NextResponse.json({ error: "Email already in use" }, { status: 400 })
      }
    } catch (dbError) {
      console.error("Database error checking email:", dbError)
      return NextResponse.json({ error: "Unable to process request. Please try again." }, { status: 500 })
    }

    // Check if username exists
    try {
      const usernameRows = await prisma.$queryRaw<{ id: string }[]>`
        SELECT TOP 1 id FROM [User] WHERE username = ${normalizedUsername}
      `
      if (usernameRows.length > 0) {
        return NextResponse.json({ error: "Username already taken — please choose another" }, { status: 400 })
      }
    } catch (dbError) {
      console.error("Database error checking username:", dbError)
      return NextResponse.json({ error: "Unable to process request. Please try again." }, { status: 500 })
    }
    
    const hashedPassword = await bcrypt.hash(password, 10)
    
    // Generate verification token
    const verifyToken = crypto.randomBytes(32).toString("hex")
    const verifyTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
    
    const allowedRole = role === 'mechanic' ? 'mechanic' : 'user'

    const user = await prisma.user.create({
      data: {
        username: normalizedUsername,
        name: name || normalizedUsername,
        email: normalizedEmail,
        password: hashedPassword,
        purchasedModules: "[]",
        credits: 10,
        role: allowedRole,
        verifyToken,
        verifyTokenExpiry,
        // emailVerified is null by default (not verified)
      }
    })
    
    // Generate encryption key — non-fatal if UserKey table not yet migrated
    try { await createUserEncryptionKey(user.id) } catch (keyErr) { console.error('createUserEncryptionKey failed (non-fatal):', keyErr) }

    // Send verification email
    const emailResult = await sendVerificationEmail(
      normalizedEmail,
      verifyToken,
      user.name || normalizedUsername
    )
    
    if (!emailResult.success) {
      console.error('Failed to send verification email:', emailResult.error)
      // Don't fail signup if email fails - user can resend later
    }
    
    return NextResponse.json({ 
      success: true, 
      user: { 
        id: user.id, 
        email: user.email,
        username: user.username,
        emailVerified: user.emailVerified
      },
      message: "Account created! Please check your email to verify your account."
    })
  } catch (error) {
    console.error("Signup error:", error)
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 })
  }
}
