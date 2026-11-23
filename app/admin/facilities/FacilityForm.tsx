'use client'

import { useEffect, useState } from 'react'

const inputCls = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
const labelCls = 'block text-sm font-medium text-slate-700 mb-1'

interface PracticeOption { id: string; name: string }

export interface FacilityFormValues {
  name: string
  facilityType: string
  practiceId: string
  address: string // legacy single-string address; shown as a hint only
  addressLine1: string
  addressLine2: string
  city: string
  state: string
  zipCode: string
  phone: string
  fax: string
  tin: string
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
  name: '', facilityType: 'SNF', practiceId: '', address: '', addressLine1: '', addressLine2: '', city: '', state: '', zipCode: '',
  phone: '', fax: '', tin: '', npi: '', posCode: '', pccFacilityId: '',
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
  const [practices, setPractices] = useState<PracticeOption[]>([])

  useEffect(() => {
    fetch('/api/admin/practices')
      .then(r => r.json())
      .then(data => setPractices(Array.isArray(data) ? data : []))
  }, [])

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
        <label className={labelCls}>Practice <span className="text-red-500">*</span></label>
        <select className={inputCls} value={form.practiceId} onChange={set('practiceId')}>
          <option value="" disabled>Select a practice...</option>
          {practices.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div className="pt-2 border-t border-slate-100">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Address (CMS-1500 box 32, service facility)</p>
        {form.address && !form.addressLine1 && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
            Legacy address on file: {form.address}. Fill in the fields below to replace it.
          </p>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Address line 1</label>
            <input className={inputCls} value={form.addressLine1} onChange={set('addressLine1')} />
          </div>
          <div>
            <label className={labelCls}>Address line 2</label>
            <input className={inputCls} value={form.addressLine2} onChange={set('addressLine2')} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 mt-4">
          <div>
            <label className={labelCls}>City</label>
            <input className={inputCls} value={form.city} onChange={set('city')} />
          </div>
          <div>
            <label className={labelCls}>State</label>
            <input className={inputCls} value={form.state} onChange={set('state')} maxLength={2} placeholder="FL" />
          </div>
          <div>
            <label className={labelCls}>Zip code</label>
            <input className={inputCls} value={form.zipCode} onChange={set('zipCode')} placeholder="33101" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div>
            <label className={labelCls}>Phone</label>
            <input className={inputCls} value={form.phone} onChange={set('phone')} />
          </div>
          <div>
            <label className={labelCls}>Fax</label>
            <input className={inputCls} value={form.fax} onChange={set('fax')} />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>NPI <span className="text-slate-400">(facility NPI, if any)</span></label>
          <input className={inputCls} value={form.npi} onChange={set('npi')} />
        </div>
        <div>
          <label className={labelCls}>Tax ID / EIN <span className="text-slate-400">(9 digits)</span></label>
          <input className={inputCls} value={form.tin} onChange={set('tin')} placeholder="12-3456789" />
        </div>
        <div>
          <label className={labelCls}>POS Code</label>
          <input className={inputCls} value={form.posCode} onChange={set('posCode')} placeholder="31" />
        </div>
        <div>
          <label className={labelCls}>PCC Facility ID {showActive && <span className="text-slate-400">(read-only)</span>}</label>
          <input className={`${inputCls} disabled:bg-slate-50 disabled:text-slate-500`} value={form.pccFacilityId} onChange={set('pccFacilityId')} disabled={showActive} />
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
          disabled={!form.name.trim() || !form.practiceId || saving}
          className="text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed px-5 py-2.5 rounded-lg"
        >
          {saving ? 'Saving...' : submitLabel}
        </button>
      </div>
    </div>
  )
}
