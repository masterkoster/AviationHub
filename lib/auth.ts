import NextAuth from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import bcrypt from "bcrypt"
import { prisma } from "@/lib/prisma"

// Auth secret
const authSecretEnv = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
const authSecret = authSecretEnv || (process.env.NODE_ENV === 'production' ? undefined : 'dev-insecure-secret');
if (!authSecret) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Missing AUTH_SECRET (or NEXTAUTH_SECRET) in production');
  }
  console.warn('AUTH_SECRET is not set. Sessions will be unstable across restarts.');
}
const siteUrl = process.env.NEXTAUTH_URL || process.env.AUTH_URL || "https://koster.im"

// Cookie names based on environment
const isSecure = process.env.NODE_ENV === 'production'
const cookiePrefix = isSecure ? '__Secure-' : ''

export const authOptions: any = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        username: { label: "Username or Email", type: "text" },
        password: { label: "Password", type: "password" },
        rememberMe: { label: "Remember Me", type: "boolean" }
      },
      async authorize(credentials: any) {
        if (!credentials?.username || !credentials?.password) {
          return null
        }
        
        try {
          const input = (credentials.username as string).trim().toLowerCase()
          const rememberMe = credentials.rememberMe === 'true' || credentials.rememberMe === true
          
          // Try to find user by username first, then by email (raw SQL to bypass Prisma schema drift)
          let rows = await prisma.$queryRaw<any[]>`
            SELECT TOP 1 id, username, email, name, image, password, emailVerified, role, tier
            FROM [User] WHERE username = ${input}
          `
          if (rows.length === 0) {
            rows = await prisma.$queryRaw<any[]>`
              SELECT TOP 1 id, username, email, name, image, password, emailVerified, role, tier
              FROM [User] WHERE email = ${input}
            `
          }
          const user = rows[0] ?? null
          
          if (!user || !user.password) {
            return null
          }
          
          let isValid = false
          
          // Check if password is bcrypt hash (starts with $2) or plain text
          if (user.password.startsWith('$2')) {
            isValid = await bcrypt.compare(credentials.password as string, user.password)
          } else {
            isValid = user.password === credentials.password
            if (isValid) {
              const hashed = await bcrypt.hash(credentials.password as string, 10)
              await prisma.$executeRaw`UPDATE [User] SET password = ${hashed} WHERE id = ${user.id}`
            }
          }
          
          if (!isValid) return null
          
          return { 
            id: user.id, 
            email: user.email, 
            name: user.name,
            username: user.username,
            image: user.image,
            emailVerified: user.emailVerified,
            role: user.role,
            tier: user.tier,
            rememberMe: rememberMe // Pass to JWT
          }
        } catch (error) {
          console.error('Authorize error:', error)
          return null
        }
      }
    })
  ],
  secret: authSecret,
  session: {
    strategy: "jwt" as const,
    // Default: 30 days for remembered sessions
    maxAge: 30 * 24 * 60 * 60, 
    // Update session age on every request (sliding window)
    updateAge: 24 * 60 * 60, // 24 hours
  },
  jwt: {
    // JWT max age should match session maxAge
    maxAge: 30 * 24 * 60 * 60,
  },
  pages: { signIn: "/login" },
  cookies: {
    sessionToken: {
      name: `${cookiePrefix}next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        secure: isSecure,
        maxAge: 30 * 24 * 60 * 60, // 30 days
        path: '/',
      },
    },
    callbackUrl: {
      name: `${cookiePrefix}next-auth.callback-url`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        secure: isSecure,
        path: '/',
      },
    },
    csrfToken: {
      name: `${cookiePrefix}next-auth.csrf-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        secure: isSecure,
        path: '/',
      },
    },
  },
  callbacks: {
    async jwt({ token, user, trigger, session }: { token: any; user?: any; trigger?: string; session?: any }) {
      // Initial sign in
      if (user) {
        token.id = user.id
        token.username = user.username
        token.image = user.image
        token.emailVerified = user.emailVerified
        token.role = user.role
        token.tier = user.tier
        token.rememberMe = user.rememberMe
        
        // Set expiration based on rememberMe
        if (!user.rememberMe) {
          // Browser session only - expires when browser closes
          token.exp = Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
        }
      }
      
      // Handle session updates
      if (trigger === "update" && session) {
        token.name = session.name
      }
      
      return token
    },
    async session({ session, token }: { session: any; token: any }) {
      if (session.user) {
        session.user.id = token.id
        session.user.username = token.username
        session.user.image = token.image
        session.user.emailVerified = token.emailVerified
        session.user.role = token.role
        session.user.tier = token.tier
        session.expires = token.exp ? new Date(token.exp * 1000).toISOString() : session.expires
      }
      return session
    }
  },
  events: {
    async signIn({ user, account, profile, isNewUser }: any) {
      console.log("User signed in:", user?.email)
    },
    async signOut({ token }: any) {
      console.log("User signed out:", token?.email)
    },
  },
  debug: process.env.NODE_ENV === 'development',
}

export const { handlers, auth, signIn, signOut } = NextAuth(authOptions)
export { prisma }
