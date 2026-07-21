'use client'

import { useState } from 'react'

const inputCls = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
const labelCls = 'block text-sm font-medium text-slate-700 mb-1'

export interface FacilityFormValues {
  name: string
  facilityType: string
  address: string
  npi: string
  posCode: string
  pccFacilityId: string
  adminContactName: string
  adminContactPhone: string
  adminContactEmail: string
  donContactName: string
  donContactPhone: string
  donContactEmail: string
  active: boolean
}

export const emptyFacility: FacilityFormValues = {
  name: '', facilityType: 'SNF', address: '', npi: '', posCode: '', pccFacilityId: '',
  adminContactName: '', adminContactPhone: '', adminContactEmail: '',
  donContactName: '', donContactPhone: '', donContactEmail: '', active: true,
}

export default function FacilityForm({
  initial,
  onSubmit,
  onCancel,
  saving,
  error,
  submitLabel,
  showActive = false,
}: {
  initial: FacilityFormValues
  onSubmit: (values: FacilityFormValues) => void
  onCancel: () => void
  saving: boolean
  error: string
  submitLabel: string
  showActive?: boolean
}) {
  const [form, setForm] = useState<FacilityFormValues>(initial)

  const set = (k: keyof FacilityFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 max-w-2xl space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Name <span className="text-red-500">*</span></label>
          <input className={inputCls} value={form.name} onChange={set('name')} />
        </div>
        <div>
          <label className={labelCls}>Type</label>
          <select className={inputCls} value={form.facilityType} onChange={set('facilityType')}>
            <option value="SNF">SNF</option>
            <option value="ALF">ALF</option>
          </select>
        </div>
      </div>
      <div>
        <label className={labelCls}>Address <span className="text-slate-400">(optional)</span></label>
        <input className={inputCls} value={form.address} onChange={set('address')} />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={labelCls}>NPI <span className="text-slate-400">(optional)</span></label>
          <input className={inputCls} value={form.npi} onChange={set('npi')} />
        </div>
        <div>
          <label className={labelCls}>POS Code <span className="text-slate-400">(optional)</span></label>
          <input className={inputCls} value={form.posCode} onChange={set('posCode')} placeholder="31" />
        </div>
        <div>
          <label className={labelCls}>PCC Facility ID <span className="text-slate-400">(optional)</span></label>
          <input className={inputCls} value={form.pccFacilityId} onChange={set('pccFacilityId')} />
        </div>
      </div>

      <div className="pt-2 border-t border-slate-100">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Administrator Contact</p>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>Name</label>
            <input className={inputCls} value={form.adminContactName} onChange={set('adminContactName')} />
          </div>
          <div>
            <label className={labelCls}>Phone</label>
            <input className={inputCls} value={form.adminContactPhone} onChange={set('adminContactPhone')} />
          </div>
          <div>
            <label className={labelCls}>Email</label>
            <input className={inputCls} type="email" value={form.adminContactEmail} onChange={set('adminContactEmail')} />
          </div>
        </div>
      </div>

      <div className="pt-2 border-t border-slate-100">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">DON Contact</p>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>Name</label>
            <input className={inputCls} value={form.donContactName} onChange={set('donContactName')} />
          </div>
          <div>
            <label className={labelCls}>Phone</label>
            <input className={inputCls} value={form.donContactPhone} onChange={set('donContactPhone')} />
          </div>
          <div>
            <label className={labelCls}>Email</label>
            <input className={inputCls} type="email" value={form.donContactEmail} onChange={set('donContactEmail')} />
          </div>
        </div>
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
          disabled={!form.name.trim() || saving}
          className="text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed px-5 py-2.5 rounded-lg"
        >
          {saving ? 'Saving...' : submitLabel}
        </button>
      </div>
    </div>
  )
}
