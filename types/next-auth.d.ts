import { Role } from '@prisma/client'
import 'next-auth'
import 'next-auth/jwt'

declare module 'next-auth' {
  interface Session {
    valid?: boolean // false when this session has been invalidated (single-device)
    user: {
      id: string
      username: string
      email?: string | null
      name: string
      credentials: string
      role: Role
    }
  }

  interface User {
    id: string
    username: string
    name: string
    credentials: string
    role: Role
    sessionToken: string
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    username: string
    credentials: string
    role: Role
    sessionToken: string
  }
}
