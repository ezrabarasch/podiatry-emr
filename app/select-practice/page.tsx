'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

interface Practice { id: string; name: string }

// Deliberately NOT wrapped in PageShell — PageShell's own redirect gate is
// what sends providers here in the first place; rendering inside it would
// bounce right back to this same page.
export default function SelectPracticePage() {
  const { data: session, status, update } = useSession()
  const router = useRouter()
  const [practices, setPractices] = useState<Practice[]>([])
  const [selecting, setSelecting] = useState(false)

  const user = session?.user
  const needsSelection =
    user?.role === 'PROVIDER' && user.activePracticeId == null && (user.allowedPracticeIds?.length ?? 0) > 1

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login')
    else if (status === 'authenticated' && !needsSelection) router.replace('/dashboard')
  }, [status, needsSelection, router])

  useEffect(() => {
    if (needsSelection) {
      fetch('/api/me/practices').then(r => r.json()).then(data => setPractices(Array.isArray(data) ? data : []))
    }
  }, [needsSelection])

  const choose = async (practiceId: string) => {
    setSelecting(true)
    await update({ activePracticeId: practiceId })
    router.push('/dashboard')
  }

  if (!needsSelection) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-sm text-slate-400">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 w-full max-w-sm p-8">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold text-slate-800 tracking-tight">Select a Practice</h1>
          <p className="text-sm text-slate-500 mt-1">Choose which practice you're working as today</p>
        </div>

        <div className="space-y-2">
          {practices.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">Loading practices...</p>
          ) : (
            practices.map(p => (
              <button
                key={p.id}
                onClick={() => choose(p.id)}
                disabled={selecting}
                className="w-full text-left px-4 py-3 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:border-blue-400 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {p.name}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
