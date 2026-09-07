'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import AdminShell from '@/app/admin/AdminShell'
import Badge from '@/app/components/Badge'
import Button from '@/app/components/Button'

interface Provider {
  id: string
  firstName: string
  lastName: string
  credentials: string | null
  npi: string | null
  specialty: string | null
  active: boolean
  practiceCount: number
}

export default function AdminProvidersPage() {
  const router = useRouter()
  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    fetch('/api/admin/providers')
      .then(r => r.json())
      .then(data => {
        setProviders(Array.isArray(data) ? data : [])
        setLoading(false)
      })
  }, [])

  useEffect(() => { load() }, [load])

  const toggleActive = async (p: Provider) => {
    await fetch(`/api/admin/providers/${p.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !p.active }),
    })
    load()
  }

  return (
    <AdminShell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-slate-800">Providers</h2>
          <p className="text-sm text-slate-500 mt-0.5">Manage providers and their practice assignments</p>
        </div>
        <Button size="lg" onClick={() => router.push('/admin/providers/new')}>+ New Provider</Button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading providers...</div>
        ) : providers.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">No providers found.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                {['Name', 'Credentials', 'NPI', 'Specialty', 'Practices', 'Status', ''].map((h, i) => (
                  <th key={i} className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {providers.map(p => (
                <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-4 text-sm font-medium text-slate-800">{p.lastName}, {p.firstName}</td>
                  <td className="px-5 py-4 text-sm text-slate-600">{p.credentials ?? '—'}</td>
                  <td className="px-5 py-4 text-sm text-slate-600">{p.npi ?? '—'}</td>
                  <td className="px-5 py-4 text-sm text-slate-600">{p.specialty ?? '—'}</td>
                  <td className="px-5 py-4 text-sm text-slate-600">{p.practiceCount}</td>
                  <td className="px-5 py-4"><Badge variant={p.active ? 'active' : 'inactive'} label={p.active ? 'Active' : 'Inactive'} /></td>
                  <td className="px-5 py-4 text-right whitespace-nowrap">
                    <button
                      onClick={() => router.push(`/admin/providers/${p.id}`)}
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium mr-4"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => toggleActive(p)}
                      className={`text-sm font-medium ${p.active ? 'text-red-600 hover:text-red-800' : 'text-green-600 hover:text-green-800'}`}
                    >
                      {p.active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AdminShell>
  )
}
