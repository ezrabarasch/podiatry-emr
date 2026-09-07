'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import AdminShell from '@/app/admin/AdminShell'
import Badge from '@/app/components/Badge'
import Button from '@/app/components/Button'

interface Practice {
  id: string
  name: string
  tin: string | null
  serviceTypes: string[]
  facilityCount: number
  providerCount: number
  active: boolean
}

export default function AdminPracticesPage() {
  const router = useRouter()
  const [practices, setPractices] = useState<Practice[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    fetch('/api/admin/practices')
      .then(r => r.json())
      .then(data => {
        setPractices(Array.isArray(data) ? data : [])
        setLoading(false)
      })
  }, [])

  useEffect(() => { load() }, [load])

  const toggleActive = async (p: Practice) => {
    await fetch(`/api/admin/practices/${p.id}`, {
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
          <h2 className="text-2xl font-semibold text-slate-800">Practices</h2>
          <p className="text-sm text-slate-500 mt-0.5">Manage practices and their service lines</p>
        </div>
        <Button size="lg" onClick={() => router.push('/admin/practices/new')}>+ New Practice</Button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading practices...</div>
        ) : practices.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">No practices found.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                {['Name', 'TIN', 'Service Types', 'Facilities', 'Providers', 'Status', ''].map((h, i) => (
                  <th key={i} className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {practices.map(p => (
                <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-4 text-sm font-medium text-slate-800">{p.name}</td>
                  <td className="px-5 py-4 text-sm text-slate-600">{p.tin ?? '—'}</td>
                  <td className="px-5 py-4 text-sm text-slate-600">{p.serviceTypes.join(', ') || '—'}</td>
                  <td className="px-5 py-4 text-sm text-slate-600">{p.facilityCount}</td>
                  <td className="px-5 py-4 text-sm text-slate-600">{p.providerCount}</td>
                  <td className="px-5 py-4"><Badge variant={p.active ? 'active' : 'inactive'} label={p.active ? 'Active' : 'Inactive'} /></td>
                  <td className="px-5 py-4 text-right whitespace-nowrap">
                    <button
                      onClick={() => router.push(`/admin/practices/${p.id}`)}
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
