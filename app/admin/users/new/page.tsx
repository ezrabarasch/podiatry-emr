'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import AdminShell from '@/app/admin/AdminShell'

const inputCls = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
const labelCls = 'block text-sm font-medium text-slate-700 mb-1'

export default function NewUserPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    username: '', email: '', firstName: '', lastName: '', credentials: '', role: 'PROVIDER', password: '',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const canSave = form.username && form.firstName && form.lastName && form.password && !saving

  const save = async () => {
    setError('')
    setSaving(true)
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      router.push('/admin/users')
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Failed to create user')
      setSaving(false)
    }
  }

  return (
    <AdminShell>
      <div className="mb-6">
        <button onClick={() => router.push('/admin/users')} className="text-sm text-slate-500 hover:text-slate-800">← Back to users</button>
        <h2 className="text-2xl font-semibold text-slate-800 mt-2">New User</h2>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 max-w-lg space-y-4">
        <div>
          <label className={labelCls}>Username <span className="text-red-500">*</span></label>
          <input className={inputCls} value={form.username} onChange={set('username')} placeholder="jsmith" autoComplete="off" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>First name <span className="text-red-500">*</span></label>
            <input className={inputCls} value={form.firstName} onChange={set('firstName')} />
          </div>
          <div>
            <label className={labelCls}>Last name <span className="text-red-500">*</span></label>
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
          <label className={labelCls}>Password <span className="text-red-500">*</span></label>
          <input className={inputCls} type="text" value={form.password} onChange={set('password')} placeholder="Set an initial password" autoComplete="new-password" />
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <button onClick={() => router.push('/admin/users')} className="text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 px-4 py-2.5 rounded-lg">Cancel</button>
          <button onClick={save} disabled={!canSave} className="text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed px-5 py-2.5 rounded-lg">
            {saving ? 'Creating...' : 'Create User'}
          </button>
        </div>
      </div>
    </AdminShell>
  )
}
