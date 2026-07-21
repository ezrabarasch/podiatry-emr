'use client'

import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import PageShell from '@/app/components/PageShell'

const TABS = [
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/facilities', label: 'Facilities' },
  { href: '/admin/sessions', label: 'Session Log' },
]

// Client-side guard for admin pages. The API routes are the authoritative
// check; this is UX so non-admins never see the chrome.
export default function AdminShell({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (status === 'loading') return
    if (!session) router.replace('/login')
    else if (session.user.role !== 'ADMIN') router.replace('/dashboard')
  }, [session, status, router])

  if (status === 'loading' || !session || session.user.role !== 'ADMIN') {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <p className="text-text-muted text-sm">Loading...</p>
      </div>
    )
  }

  return (
    <PageShell>
      <h1 className="text-2xl font-semibold text-text mb-4">Admin</h1>
      <div className="border-b border-border mb-6 flex gap-6">
        {TABS.map(tab => (
          <button
            key={tab.href}
            onClick={() => router.push(tab.href)}
            className={`py-3 text-sm font-medium border-b-2 transition-colors ${
              pathname.startsWith(tab.href)
                ? 'border-primary text-primary'
                : 'border-transparent text-text-muted hover:text-text'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {children}
    </PageShell>
  )
}
