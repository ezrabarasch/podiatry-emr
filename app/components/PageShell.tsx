'use client'

import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import SideNav from './SideNav'

export default function PageShell({
  children,
  title,
}: {
  children: ReactNode
  title?: string
}) {
  const { status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login')
  }, [status, router])

  return (
    <div className="min-h-screen bg-bg flex">
      <SideNav />
      <main className="flex-1 min-w-0">
        <div className="max-w-6xl mx-auto px-6 py-8">
          {title && <h1 className="text-2xl font-semibold text-text mb-6">{title}</h1>}
          {children}
        </div>
      </main>
    </div>
  )
}
