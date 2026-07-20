'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import AdminShell from '@/app/admin/AdminShell'

const inputCls = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
const labelCls = 'block text-sm font-medium text-slate-700 mb-1'

interface EditUser {
  id: string
  username: string
  email: string | null
  firstName: string
  lastName: string
  credentials: string | null
  role: string
  active: boolean
  lockedAt: string | null
}

export default function EditUserPage() {
  const router = useRouter()
  const { id } = useParams() as { id: string }

  const [user, setUser] = useState<EditUser | null>(null)
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', credentials: '', role: 'PROVIDER', active: true, password: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    fetch(`/api/admin/users/${id}`)
      .then(r => r.json())
      .then((u: EditUser) => {
        setUser(u)
        setForm({
          firstName: u.firstName, lastName: u.lastName, email: u.email ?? '',
          credentials: u.credentials ?? '', role: u.role, active: u.active, password: '',
        })
        setLoading(false)
      })
  }, [id])

  useEffect(() => { load() }, [load])

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    setError('')
    setSaving(true)
    const body: Record<string, unknown> = {
      firstName: form.firstName, lastName: form.lastName, email: form.email,
      credentials: form.credentials, role: form.role, active: form.active,
    }
    if (form.password) body.password = form.password
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (res.ok) {
      router.push('/admin/users')
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Failed to save')
      setSaving(false)
    }
  }

  const unlock = async () => {
    await fetch(`/api/admin/users/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unlock: true }),
    })
    load()
  }

  if (loading || !user) {
    return <AdminShell><p className="text-slate-400 text-sm">Loading user...</p></AdminShell>
  }

  return (
    <AdminShell>
      <div className="mb-6">
        <button onClick={() => router.push('/admin/users')} className="text-sm text-slate-500 hover:text-slate-800">← Back to users</button>
        <h2 className="text-2xl font-semibold text-slate-800 mt-2">{user.username}</h2>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 max-w-lg space-y-4">
        {user.lockedAt && (
          <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <span className="text-sm text-red-700">Account is locked.</span>
            <button onClick={unlock} className="text-sm font-medium text-red-700 hover:text-red-900 underline">Unlock</button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>First name</label>
            <input className={inputCls} value={form.firstName} onChange={set('firstName')} />
          </div>
          <div>
            <label className={labelCls}>Last name</label>
            <input className={inputCls} value={form.lastName} onChange={set('lastName')} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Email <span className="text-slate-400">(optional)</span></label>
          <input className={inputCls} type="email" value={form.email} onChange={set('email')} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Credentials <span className="text-slate-400">(optional)</span></label>
            <input className={inputCls} value={form.credentials} onChange={set('credentials')} placeholder="DPM" />
          </div>
          <div>
            <label className={labelCls}>Role</label>
            <select className={inputCls} value={form.role} onChange={set('role')}>
              <option value="PROVIDER">Provider</option>
              <option value="OFFICE">Office</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
        </div>
        <div>
          <label className={labelCls}>Reset password <span className="text-slate-400">(leave blank to keep current)</span></label>
          <input className={inputCls} type="text" value={form.password} onChange={set('password')} placeholder="New password" autoComplete="new-password" />
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} className="h-4 w-4 rounded border-slate-300 accent-blue-600" />
          <span className="text-sm text-slate-700">Active</span>
        </label>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <button onClick={() => router.push('/admin/users')} className="text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 px-4 py-2.5 rounded-lg">Cancel</button>
          <button onClick={save} disabled={saving} className="text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed px-5 py-2.5 rounded-lg">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </AdminShell>
  )
}
