import { NextResponse } from "next/server"
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import bcrypt from "bcrypt"

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST() {
  try {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const session = await auth();
    const role = (session?.user as any)?.role;
    if (!session?.user?.id || (role !== 'owner' && role !== 'admin')) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const users = await prisma.user.findMany({
      where: {
        password: {
          not: ""
        }
      }
    })
    
    let fixed = 0
    let alreadyHashed = 0
    
    for (const user of users) {
      const pwd = user.password!
      
      // Check if already a bcrypt hash (starts with $2)
      if (pwd.startsWith('$2')) {
        alreadyHashed++
        continue
      }
      
      // Hash the plain text password
      const hashed = await bcrypt.hash(pwd, 10)
      
      await prisma.user.update({
        where: { id: user.id },
        data: { password: hashed }
      })
      
      fixed++
      console.log(`Fixed password for ${user.email}`)
    }
    
    return NextResponse.json({
      success: true,
      fixed,
      alreadyHashed,
      total: users.length
    })
  } catch (error) {
    console.error("Fix error:", error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
