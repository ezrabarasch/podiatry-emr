import { randomUUID } from 'crypto'
import type { AuthOptions } from 'next-auth'
import { getServerSession } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { Role, SessionAction } from '@prisma/client'
import { prisma } from '@/lib/prisma'

const MAX_FAILED_ATTEMPTS = 5

// Write an audit row; never let logging failures block the auth flow.
async function logSession(entry: {
  userId?: string | null
  username: string
  ipAddress?: string | null
  userAgent?: string | null
  action: SessionAction
}) {
  try {
    await prisma.sessionLog.create({ data: entry })
  } catch (err) {
    console.error('Failed to write session log', err)
  }
}

export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, req) {
        const username = credentials?.username?.trim()
        const password = credentials?.password
        const headers = (req?.headers ?? {}) as Record<string, string>
        const ipAddress = (headers['x-forwarded-for']?.split(',')[0].trim()) || null
        const userAgent = headers['user-agent'] || null

        if (!username || !password) return null

        const user = await prisma.user.findUnique({ where: { username } })

        // Unknown username or deactivated account — generic failure.
        if (!user || !user.active) {
          await logSession({ userId: user?.id ?? null, username, ipAddress, userAgent, action: SessionAction.FAILED })
          return null
        }

        // Already locked — stays locked until an admin unlocks.
        if (user.lockedAt) {
          await logSession({ userId: user.id, username, ipAddress, userAgent, action: SessionAction.FAILED })
          throw new Error('Account is locked. Contact an administrator.')
        }

        const passwordMatch = await bcrypt.compare(password, user.password)

        if (!passwordMatch) {
          const attempts = user.failedLoginAttempts + 1
          if (attempts >= MAX_FAILED_ATTEMPTS) {
            await prisma.user.update({
              where: { id: user.id },
              data: { failedLoginAttempts: attempts, lockedAt: new Date() },
            })
            await logSession({ userId: user.id, username, ipAddress, userAgent, action: SessionAction.LOCKED })
            throw new Error('Account is locked. Contact an administrator.')
          }
          await prisma.user.update({
            where: { id: user.id },
            data: { failedLoginAttempts: attempts },
          })
          await logSession({ userId: user.id, username, ipAddress, userAgent, action: SessionAction.FAILED })
          return null
        }

        // Success — reset counters, stamp login, rotate single-device token.
        const sessionToken = randomUUID()
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: 0,
            lockedAt: null,
            lastLoginAt: new Date(),
            currentSessionToken: sessionToken,
          },
        })
        await logSession({ userId: user.id, username, ipAddress, userAgent, action: SessionAction.LOGIN })

        return {
          id: user.id,
          username: user.username,
          name: `${user.firstName} ${user.lastName}`,
          credentials: user.credentials ?? '',
          role: user.role,
          sessionToken,
        }
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 60 * 60, // 1 hour of inactivity
    updateAge: 5 * 60, // refresh rolling expiry at most every 5 min
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.username = user.username
        token.credentials = user.credentials
        token.role = user.role
        token.sessionToken = user.sessionToken
      }
      return token
    },
    async session({ session, token }) {
      session.user.id = token.id
      session.user.username = token.username
      session.user.name = token.name ?? ''
      session.user.credentials = token.credentials
      session.user.role = token.role

      // Single-device enforcement: the session is only valid while its token
      // still matches the user's current token and the account is usable.
      try {
        const user = await prisma.user.findUnique({
          where: { id: token.id },
          select: { currentSessionToken: true, active: true, lockedAt: true },
        })
        session.valid = !!user
          && user.active
          && !user.lockedAt
          && user.currentSessionToken === token.sessionToken
      } catch {
        session.valid = true // don't lock users out on a transient DB error
      }
      return session
    },
  },
  events: {
    async signOut({ token }) {
      if (token?.id) {
        await logSession({
          userId: token.id,
          username: token.username,
          action: SessionAction.LOGOUT,
        })
      }
    },
  },
  pages: {
    signIn: '/login',
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Server-side helpers for API routes
// ─────────────────────────────────────────────────────────────────────────────

export type SessionUser = {
  id: string
  username: string
  name: string
  credentials: string
  role: Role
}

/** Returns the current, still-valid session user, or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id || session.valid === false) return null
  return session.user
}

/**
 * Guard for API routes. Returns `{ user }` when allowed, or `{ error }` with a
 * ready-to-return 401/403 response.
 *
 *   const { user, error } = await requireRole(['PROVIDER', 'ADMIN'])
 *   if (error) return error
 */
export async function requireRole(
  roles: Role[]
): Promise<{ user: SessionUser; error: null } | { user: null; error: NextResponse }> {
  const user = await getSessionUser()
  if (!user) {
    return { user: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  if (!roles.includes(user.role)) {
    return { user: null, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { user, error: null }
}
