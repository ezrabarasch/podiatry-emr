'use client'

import { useState } from 'react'
import { CAREFLOW_SECTIONS } from '@/lib/careflow/sections'

const CAREFLOW_TYPES = Object.keys(CAREFLOW_SECTIONS)

const inputCls = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
const labelCls = 'block text-sm font-medium text-slate-700 mb-1'

export interface PracticeFormValues {
  name: string
  tin: string
  groupNpi: string
  address: string
  phone: string
  email: string
  active: boolean
  serviceTypes: string[]
}

export const emptyPractice: PracticeFormValues = {
  name: '', tin: '', groupNpi: '', address: '', phone: '', email: '', active: true, serviceTypes: [],
}

export default function PracticeForm({
  initial,
  onSubmit,
  onCancel,
  saving,
  error,
  submitLabel,
  showActive = false,
}: {
  initial: PracticeFormValues
  onSubmit: (values: PracticeFormValues) => void
  onCancel: () => void
  saving: boolean
  error: string
  submitLabel: string
  showActive?: boolean
}) {
  const [form, setForm] = useState<PracticeFormValues>(initial)

  const set = (k: keyof Omit<PracticeFormValues, 'active' | 'serviceTypes'>) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const toggleServiceType = (t: string) =>
    setForm(f => ({
      ...f,
      serviceTypes: f.serviceTypes.includes(t) ? f.serviceTypes.filter(x => x !== t) : [...f.serviceTypes, t],
    }))

  const canSubmit = !!form.name.trim() && form.serviceTypes.length > 0 && !saving

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 max-w-2xl space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={labelCls}>Name <span className="text-red-500">*</span></label>
          <input className={inputCls} value={form.name} onChange={set('name')} />
        </div>
        <div>
          <label className={labelCls}>TIN <span className="text-slate-400">(optional)</span></label>
          <input className={inputCls} value={form.tin} onChange={set('tin')} />
        </div>
        <div>
          <label className={labelCls}>Group NPI <span className="text-slate-400">(optional)</span></label>
          <input className={inputCls} value={form.groupNpi} onChange={set('groupNpi')} />
        </div>
        <div>
          <label className={labelCls}>Phone <span className="text-slate-400">(optional)</span></label>
          <input className={inputCls} value={form.phone} onChange={set('phone')} />
        </div>
        <div>
          <label className={labelCls}>Email <span className="text-slate-400">(optional)</span></label>
          <input className={inputCls} type="email" value={form.email} onChange={set('email')} />
        </div>
      </div>
      <div>
        <label className={labelCls}>Address <span className="text-slate-400">(optional)</span></label>
        <input className={inputCls} value={form.address} onChange={set('address')} />
      </div>

      <div className="pt-2 border-t border-slate-100">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Service Types <span className="text-red-500">*</span></p>
        <div className="grid grid-cols-2 gap-2">
          {CAREFLOW_TYPES.map(t => (
            <label key={t} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.serviceTypes.includes(t)}
                onChange={() => toggleServiceType(t)}
                className="h-4 w-4 rounded border-slate-300 accent-blue-600"
              />
              <span className="text-sm text-slate-700">{t}</span>
            </label>
          ))}
        </div>
        {form.serviceTypes.length === 0 && (
          <p className="text-xs text-red-600 mt-2">Select at least one service type.</p>
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
