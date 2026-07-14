import { NextResponse } from "next/server"
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  try {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const session = await auth();
    const role = (session?.user as any)?.role;
    if (!session?.user?.id || (role !== 'owner' && role !== 'admin')) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    console.log("Testing database connection...")
    
    // Try to count users
    const userCount = await prisma.user.count()
    console.log("User count:", userCount)
    
    // Get all users (limited)
    const users = await prisma.user.findMany({
      select: { id: true, email: true, name: true, password: true },
      take: 5
    })
    console.log("Users found:", users.length)
    
    return NextResponse.json({
      success: true,
      userCount,
      users: users.map(u => ({
        id: u.id,
        email: u.email,
        name: u.name,
        hasPassword: !!u.password
      }))
    })
  } catch (error) {
    console.error("Debug error:", error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}
