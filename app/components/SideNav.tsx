'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'

type Item = { label: string; href: string; match: (p: string) => boolean }

const CLINICAL: Item[] = [
  { label: 'Patients', href: '/dashboard', match: p => p === '/dashboard' || p.startsWith('/patients') },
  { label: 'Visits', href: '/visits', match: p => p.startsWith('/visits') },
]

const ADMIN: Item[] = [
  { label: 'Users', href: '/admin/users', match: p => p.startsWith('/admin/users') },
  { label: 'Facilities', href: '/admin/facilities', match: p => p.startsWith('/admin/facilities') },
  { label: 'Billing', href: '/admin/billing', match: p => p.startsWith('/admin/billing') },
  { label: 'Sessions', href: '/admin/sessions', match: p => p.startsWith('/admin/sessions') },
]

const initials = (name?: string | null) =>
  (name ?? '').split(' ').map(s => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?'

export default function SideNav() {
  const { data: session } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const user = session?.user

  const renderSection = (label: string, items: Item[]) => (
    <div className="space-y-1">
      <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-white/40">{label}</p>
      {items.map(item => {
        const active = item.match(pathname)
        return (
          <button
            key={item.label}
            onClick={() => router.push(item.href)}
            className={`w-full flex items-center px-3 py-2 rounded-md text-sm font-medium text-left border-l-2 transition-colors ${
              active
                ? 'border-secondary bg-white/10 text-white'
                : 'border-transparent text-white/70 hover:bg-white/5 hover:text-white'
            }`}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )

  return (
    <aside className="w-60 flex-shrink-0 flex flex-col min-h-screen sticky top-0" style={{ background: 'var(--primary-dark)' }}>
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-5">
        <div className="h-9 w-9 rounded-lg flex items-center justify-center font-bold text-white text-lg flex-shrink-0 bg-secondary">Q</div>
        <div className="leading-tight">
          <div className="font-semibold text-white">Q·Med</div>
          <div className="text-[11px] text-white/60">Clinical EMR</div>
        </div>
      </div>

      {/* Menu */}
      <nav className="flex-1 px-2 py-2 space-y-6 overflow-y-auto">
        {renderSection('Clinical', CLINICAL)}
        {user?.role === 'ADMIN' && renderSection('Admin', ADMIN)}
      </nav>

      {/* User + sign out */}
      <div className="border-t border-white/10 p-3">
        {user && (
          <div className="flex items-center gap-3 mb-2 px-1">
            <div className="h-9 w-9 rounded-full flex items-center justify-center text-sm font-semibold text-white flex-shrink-0 bg-secondary">
              {initials(user.name)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{user.name}{user.credentials ? `, ${user.credentials}` : ''}</p>
              <p className="text-xs text-white/60 capitalize">{user.role.toLowerCase()}</p>
            </div>
          </div>
        )}
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="w-full text-left px-3 py-2 rounded-md text-sm font-medium text-white/70 hover:bg-white/5 hover:text-white transition-colors"
        >
          Sign out
        </button>
      </div>
    </aside>
  )
}
