'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import Badge from './Badge'

// Minimal inline icons (no icon dependency).
const icons: Record<string, React.ReactNode> = {
  users: <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 7a4 4 0 110 8 4 4 0 010-8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />,
  clipboard: <><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></>,
  logout: <><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></>,
}

function Icon({ name }: { name: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
      {icons[name]}
    </svg>
  )
}

const roleVariant = (r: string) =>
  r === 'ADMIN' ? 'admin' : r === 'OFFICE' ? 'office' : 'provider'

export default function SideNav() {
  const { data: session } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const user = session?.user

  const items = [
    { label: 'Patients', icon: 'users', href: '/dashboard', match: (p: string) => p === '/dashboard' || p.startsWith('/patients') },
    { label: 'Visits', icon: 'clipboard', href: '/visits', match: (p: string) => p.startsWith('/visits') },
    ...(user?.role === 'ADMIN' ? [{ label: 'Admin', icon: 'settings', href: '/admin/users', match: (p: string) => p.startsWith('/admin') }] : []),
  ]

  return (
    <aside className="w-16 md:w-56 flex-shrink-0 bg-surface border-r border-border flex flex-col min-h-screen sticky top-0">
      {/* Brand */}
      <div className="flex items-center gap-2 px-4 py-5 border-b border-border">
        <div className="h-8 w-8 rounded-lg flex items-center justify-center font-bold text-white flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, var(--primary), var(--secondary))' }}>
          Q
        </div>
        <span className="hidden md:inline font-semibold text-text">Q-Med</span>
      </div>

      {/* Menu */}
      <nav className="flex-1 px-2 py-4 space-y-1">
        {items.map(item => {
          const active = item.match(pathname)
          return (
            <button
              key={item.label}
              onClick={() => router.push(item.href)}
              title={item.label}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active ? 'bg-blue-50 text-primary' : 'text-text-muted hover:bg-slate-100 hover:text-text'
              }`}
            >
              <Icon name={item.icon} />
              <span className="hidden md:inline">{item.label}</span>
            </button>
          )
        })}
      </nav>

      {/* User + sign out */}
      <div className="border-t border-border p-3 space-y-2">
        {user && (
          <div className="hidden md:block px-1">
            <p className="text-sm font-medium text-text truncate">
              {user.name}{user.credentials ? `, ${user.credentials}` : ''}
            </p>
            <div className="mt-1">
              <Badge variant={roleVariant(user.role)} label={user.role[0] + user.role.slice(1).toLowerCase()} />
            </div>
          </div>
        )}
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          title="Sign out"
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-text-muted hover:bg-slate-100 hover:text-danger transition-colors"
        >
          <Icon name="logout" />
          <span className="hidden md:inline">Sign out</span>
        </button>
      </div>
    </aside>
  )
}
