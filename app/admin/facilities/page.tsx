'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import AdminShell from '@/app/admin/AdminShell'
import Badge from '@/app/components/Badge'
import Button from '@/app/components/Button'

interface Facility {
  id: string
  name: string
  facilityType: string
  address: string | null
  adminContactName: string | null
  adminContactPhone: string | null
  donContactName: string | null
  donContactPhone: string | null
  active: boolean
}

const contact = (name: string | null, phone: string | null) =>
  name ? `${name}${phone ? ` · ${phone}` : ''}` : '—'

export default function AdminFacilitiesPage() {
  const router = useRouter()
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    fetch('/api/admin/facilities')
      .then(r => r.json())
      .then(data => {
        setFacilities(Array.isArray(data) ? data : [])
        setLoading(false)
      })
  }, [])

  useEffect(() => { load() }, [load])

  const toggleActive = async (f: Facility) => {
    await fetch(`/api/admin/facilities/${f.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !f.active }),
    })
    load()
  }

  return (
    <AdminShell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-slate-800">Facilities</h2>
          <p className="text-sm text-slate-500 mt-0.5">Manage SNF and ALF facilities</p>
        </div>
        <Button size="lg" onClick={() => router.push('/admin/facilities/new')}>+ New Facility</Button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading facilities...</div>
        ) : facilities.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">No facilities found.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                {['Name', 'Type', 'Address', 'Admin Contact', 'DON Contact', 'Status', ''].map((h, i) => (
                  <th key={i} className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {facilities.map(f => (
                <tr key={f.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-4 text-sm font-medium text-slate-800">{f.name}</td>
                  <td className="px-5 py-4"><Badge variant={f.facilityType === 'SNF' ? 'snf' : 'alf'} label={f.facilityType} /></td>
                  <td className="px-5 py-4 text-sm text-slate-600">{f.address ?? '—'}</td>
                  <td className="px-5 py-4 text-sm text-slate-600">{contact(f.adminContactName, f.adminContactPhone)}</td>
                  <td className="px-5 py-4 text-sm text-slate-600">{contact(f.donContactName, f.donContactPhone)}</td>
                  <td className="px-5 py-4"><Badge variant={f.active ? 'active' : 'inactive'} label={f.active ? 'Active' : 'Inactive'} /></td>
                  <td className="px-5 py-4 text-right whitespace-nowrap">
                    <button
                      onClick={() => router.push(`/admin/facilities/${f.id}`)}
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium mr-4"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => toggleActive(f)}
                      className={`text-sm font-medium ${f.active ? 'text-red-600 hover:text-red-800' : 'text-green-600 hover:text-green-800'}`}
                    >
                      {f.active ? 'Deactivate' : 'Activate'}
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
