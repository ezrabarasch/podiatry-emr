'use client'

import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import Nav from '@/app/components/Nav'

const TABS = [
  { href: '/admin/users', label: 'Users' },
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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Nav
        left={
          <>
            <button
              onClick={() => router.push('/dashboard')}
              className="text-sm text-slate-500 hover:text-slate-800 transition-colors"
            >
              ← Dashboard
            </button>
            <span className="text-slate-300">|</span>
            <h1 className="text-lg font-semibold text-slate-800">Admin</h1>
          </>
        }
      />
      <div className="bg-white border-b border-slate-200 px-6">
        <div className="max-w-6xl mx-auto flex gap-6">
          {TABS.map(tab => (
            <button
              key={tab.href}
              onClick={() => router.push(tab.href)}
              className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                pathname.startsWith(tab.href)
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
    </div>
  )
}
