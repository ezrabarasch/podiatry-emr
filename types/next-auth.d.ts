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
      tenantId: string
      activePracticeId: string | null // provider's chosen practice; always null for office/admin
      allowedPracticeIds: string[] // ProviderPractice (providers) or StaffPractice (office/admin) membership
      isTenantAdmin: boolean // tenant-level administrator vs. a practice-scoped ADMIN
    }
  }

  interface User {
    id: string
    username: string
    name: string
    credentials: string
    role: Role
    sessionToken: string
    tenantId: string
    activePracticeId: string | null
    allowedPracticeIds: string[]
    isTenantAdmin: boolean
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    username: string
    credentials: string
    role: Role
    sessionToken: string
    tenantId: string
    activePracticeId: string | null
    allowedPracticeIds: string[]
    isTenantAdmin: boolean
  }
}
