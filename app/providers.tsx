'use client'

import { useEffect } from 'react'
import { SessionProvider as NextAuthSessionProvider, useSession, signOut } from 'next-auth/react'

// Single-device enforcement: when the server marks this session invalid
// (a newer login rotated the token), sign out on the next render.
function SessionGuard({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession()
  useEffect(() => {
    if (session && session.valid === false) {
      signOut({ callbackUrl: '/login' })
    }
  }, [session])
  return <>{children}</>
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextAuthSessionProvider>
      <SessionGuard>{children}</SessionGuard>
    </NextAuthSessionProvider>
  )
}
