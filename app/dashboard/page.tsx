'use client'

import { useSession, signOut } from 'next-auth/react'

export default function DashboardPage() {
  const { data: session } = useSession()

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-800">QWC Podiatry</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-600">
            {session?.user?.name} {session?.user?.credentials && `— ${session.user.credentials}`}
          </span>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="text-sm text-slate-500 hover:text-slate-800 transition-colors"
          >
            Sign out
          </button>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-12">
        <h2 className="text-2xl font-semibold text-slate-800 mb-2">Dashboard</h2>
        <p className="text-slate-500 text-sm">Select a patient to begin a visit.</p>

        {/* Placeholder — patient list coming next */}
        <div className="mt-8 bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm">
          Patient list coming soon.
        </div>
      </main>
    </div>
  )
}
