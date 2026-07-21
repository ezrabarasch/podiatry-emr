'use client'

import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import SideNav from './SideNav'

export type Crumb = { label: string; href?: string }

export default function PageShell({
  children,
  breadcrumb,
}: {
  children: ReactNode
  breadcrumb?: Crumb[]
}) {
  const { status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login')
  }, [status, router])

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg)' }}>
      <SideNav />
      <main className="flex-1 min-w-0 flex flex-col">
        {breadcrumb && breadcrumb.length > 0 && (
          <header className="sticky top-0 z-10 bg-surface border-b border-border px-6 py-3">
            <nav className="flex items-center gap-2 text-sm">
              {breadcrumb.map((c, i) => {
                const last = i === breadcrumb.length - 1
                return (
                  <span key={i} className="flex items-center gap-2">
                    {i > 0 && <span className="text-text-muted">/</span>}
                    {c.href && !last ? (
                      <button onClick={() => router.push(c.href!)} className="text-text-muted hover:text-text transition-colors">{c.label}</button>
                    ) : (
                      <span className={last ? 'text-text font-medium' : 'text-text-muted'}>{c.label}</span>
                    )}
                  </span>
                )
              })}
            </nav>
          </header>
        )}
        <div className="flex-1" style={{ padding: '20px 24px' }}>
          {children}
        </div>
      </main>
    </div>
  )
}
