'use client'

import { useEffect, useState } from 'react'

const inputCls = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
const labelCls = 'block text-sm font-medium text-slate-700 mb-1'

interface PracticeOption { id: string; name: string }

export interface ProviderFormValues {
  firstName: string
  lastName: string
  credentials: string
  email: string
  username: string
  npi: string
  licenseNumber: string
  specialty: string
  address: string
  phone: string
  active: boolean
  password: string
  practiceIds: string[]
}

export const emptyProvider: ProviderFormValues = {
  firstName: '', lastName: '', credentials: '', email: '', username: '',
  npi: '', licenseNumber: '', specialty: '', address: '', phone: '',
  active: true, password: '', practiceIds: [],
}

export default function ProviderForm({
  initial,
  onSubmit,
  onCancel,
  saving,
  error,
  submitLabel,
  showActive = false,
  isNew = false,
}: {
  initial: ProviderFormValues
  onSubmit: (values: ProviderFormValues) => void
  onCancel: () => void
  saving: boolean
  error: string
  submitLabel: string
  showActive?: boolean
  isNew?: boolean
}) {
  const [form, setForm] = useState<ProviderFormValues>(initial)
  const [practices, setPractices] = useState<PracticeOption[]>([])

  useEffect(() => {
    fetch('/api/admin/practices')
      .then(r => r.json())
      .then(data => setPractices(Array.isArray(data) ? data : []))
  }, [])

  const set = (k: keyof Omit<ProviderFormValues, 'active' | 'practiceIds'>) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const togglePractice = (id: string) =>
    setForm(f => ({
      ...f,
      practiceIds: f.practiceIds.includes(id) ? f.practiceIds.filter(x => x !== id) : [...f.practiceIds, id],
    }))

  const canSubmit = !!form.firstName.trim() && !!form.lastName.trim() && !!form.username.trim() && (!isNew || !!form.password) && !saving

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 max-w-2xl space-y-4">
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
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Username <span className="text-red-500">*</span></label>
          <input
            className={`${inputCls} ${!isNew ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : ''}`}
            value={form.username}
            onChange={set('username')}
            disabled={!isNew}
            autoComplete="off"
          />
        </div>
        <div>
          <label className={labelCls}>Credentials <span className="text-slate-400">(optional)</span></label>
          <input className={inputCls} value={form.credentials} onChange={set('credentials')} placeholder="DPM" />
        </div>
      </div>
      <div>
        <label className={labelCls}>Email <span className="text-red-500">*</span></label>
        <input className={inputCls} type="email" value={form.email} onChange={set('email')} />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={labelCls}>NPI <span className="text-slate-400">(optional)</span></label>
          <input className={inputCls} value={form.npi} onChange={set('npi')} />
        </div>
        <div>
          <label className={labelCls}>License # <span className="text-slate-400">(optional)</span></label>
          <input className={inputCls} value={form.licenseNumber} onChange={set('licenseNumber')} />
        </div>
        <div>
          <label className={labelCls}>Specialty <span className="text-slate-400">(optional)</span></label>
          <input className={inputCls} value={form.specialty} onChange={set('specialty')} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Address <span className="text-slate-400">(optional)</span></label>
          <input className={inputCls} value={form.address} onChange={set('address')} />
        </div>
        <div>
          <label className={labelCls}>Phone <span className="text-slate-400">(optional)</span></label>
          <input className={inputCls} value={form.phone} onChange={set('phone')} />
        </div>
      </div>

      <div>
        <label className={labelCls}>
          {isNew ? <>Password <span className="text-red-500">*</span></> : <>Reset password <span className="text-slate-400">(leave blank to keep current)</span></>}
        </label>
        <input
          className={inputCls}
          type="text"
          value={form.password}
          onChange={set('password')}
          placeholder={isNew ? 'Set an initial password' : 'New password'}
          autoComplete="new-password"
        />
      </div>

      <div className="pt-2 border-t border-slate-100">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Practice Assignment <span className="text-slate-400">(optional)</span></p>
        {practices.length === 0 ? (
          <p className="text-sm text-slate-400">No practices available.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {practices.map(p => (
              <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.practiceIds.includes(p.id)}
                  onChange={() => togglePractice(p.id)}
                  className="h-4 w-4 rounded border-slate-300 accent-blue-600"
                />
                <span className="text-sm text-slate-700">{p.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {showActive && (
        <label className="flex items-center gap-2 cursor-pointer pt-2 border-t border-slate-100">
          <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} className="h-4 w-4 rounded border-slate-300 accent-blue-600" />
          <span className="text-sm text-slate-700">Active</span>
        </label>
      )}

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex justify-end gap-3 pt-2">
        <button onClick={onCancel} className="text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 px-4 py-2.5 rounded-lg">Cancel</button>
        <button
          onClick={() => onSubmit(form)}
          disabled={!canSubmit}
          className="text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed px-5 py-2.5 rounded-lg"
        >
          {saving ? 'Saving...' : submitLabel}
        </button>
      </div>
    </div>
  )
}
