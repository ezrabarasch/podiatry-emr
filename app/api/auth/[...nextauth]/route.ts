import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const handler = NextAuth({
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        // Find provider by email
        const provider = await prisma.provider.findUnique({
          where: { email: credentials.email },
          include: { accounts: true },
        })

        if (!provider || !provider.active) return null

        // Get hashed password from accounts table
        const account = provider.accounts.find(a => a.type === 'credentials')
        if (!account?.access_token) return null

        // Verify password
        const passwordMatch = await bcrypt.compare(
          credentials.password,
          account.access_token
        )

        if (!passwordMatch) return null

        return {
          id: provider.id,
          email: provider.email,
          name: `${provider.firstName} ${provider.lastName}`,
          credentials: provider.credentials ?? '',
        }
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.credentials = (user as any).credentials
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
        session.user.credentials = token.credentials as string
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
})

export { handler as GET, handler as POST }
