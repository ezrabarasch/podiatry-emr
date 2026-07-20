'use client'

import type { ReactNode } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export default function Nav({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  const { data: session } = useSession()
  const router = useRouter()
  const user = session?.user

  return (
    <nav className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
      <div className="flex items-center gap-3">
        {left ?? <h1 className="text-lg font-semibold text-slate-800">QWC Podiatry</h1>}
      </div>
      <div className="flex items-center gap-4">
        {right}
        {user?.role === 'ADMIN' && (
          <button
            onClick={() => router.push('/admin/users')}
            className="text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
          >
            Admin
          </button>
        )}
        {user && (
          <span className="text-sm text-slate-600">
            {user.name}{user.credentials && `, ${user.credentials}`}
            <span className="text-slate-400"> · {user.role[0] + user.role.slice(1).toLowerCase()}</span>
          </span>
        )}
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="text-sm text-slate-500 hover:text-slate-800 transition-colors"
        >
          Sign out
        </button>
      </div>
    </nav>
  )
}
