'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import AdminShell from '@/app/admin/AdminShell'
import Badge from '@/app/components/Badge'
import Button from '@/app/components/Button'

interface AdminUser {
  id: string
  username: string
  email: string | null
  firstName: string
  lastName: string
  credentials: string | null
  role: string
  active: boolean
  lockedAt: string | null
  lastLoginAt: string | null
}

function statusBadge(u: AdminUser): { variant: 'active' | 'locked' | 'inactive'; label: string } {
  if (!u.active) return { variant: 'inactive', label: 'Inactive' }
  if (u.lockedAt) return { variant: 'locked', label: 'Locked' }
  return { variant: 'active', label: 'Active' }
}

export default function AdminUsersPage() {
  const router = useRouter()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    fetch('/api/admin/users')
      .then(r => r.json())
      .then(data => {
        setUsers(Array.isArray(data) ? data : [])
        setLoading(false)
      })
  }, [])

  useEffect(() => { load() }, [load])

  const toggleActive = async (u: AdminUser) => {
    await fetch(`/api/admin/users/${u.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !u.active }),
    })
    load()
  }

  const fmt = (d: string | null) =>
    d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'

  return (
    <AdminShell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-slate-800">Users</h2>
          <p className="text-sm text-slate-500 mt-0.5">Manage providers, office staff, and admins</p>
        </div>
        <Button size="lg" onClick={() => router.push('/admin/users/new')}>+ New User</Button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading users...</div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">No users found.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                {['Username', 'Name', 'Role', 'Credentials', 'Status', 'Last Login', ''].map((h, i) => (
                  <th key={i} className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const badge = statusBadge(u)
                return (
                  <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-4 text-sm font-medium text-slate-800">{u.username}</td>
                    <td className="px-5 py-4 text-sm text-slate-600">{u.lastName}, {u.firstName}</td>
                    <td className="px-5 py-4 text-sm text-slate-600">{u.role}</td>
                    <td className="px-5 py-4 text-sm text-slate-600">{u.credentials ?? '—'}</td>
                    <td className="px-5 py-4">
                      <Badge variant={badge.variant} label={badge.label} />
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">{fmt(u.lastLoginAt)}</td>
                    <td className="px-5 py-4 text-right whitespace-nowrap">
                      <button
                        onClick={() => router.push(`/admin/users/${u.id}`)}
                        className="text-sm text-blue-600 hover:text-blue-800 font-medium mr-4"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => toggleActive(u)}
                        className={`text-sm font-medium ${u.active ? 'text-red-600 hover:text-red-800' : 'text-green-600 hover:text-green-800'}`}
                      >
                        {u.active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </AdminShell>
  )
}
