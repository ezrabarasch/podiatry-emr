'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import AdminShell from '@/app/admin/AdminShell'
import Badge from '@/app/components/Badge'
import Pagination, { usePaged } from '@/app/components/Pagination'
import { CAREFLOW_SECTIONS } from '@/lib/careflow/sections'

interface CareflowRule {
  id: string
  careflowType: string
  section: string
  fieldKey: string
  fieldValue: string
  noteFragment: string | null
  icd10Codes: string[] | null
  cptCodes: string[] | null
  cptQualifier: string | null
  priority: number
  active: boolean
}

const CAREFLOW_TYPES = Object.keys(CAREFLOW_SECTIONS)

// Section filter options come from the hardcoded form structure, which is the
// populated source of truth for which sections exist (the careflow_sections
// table is created but not yet seeded).
const SECTIONS = CAREFLOW_SECTIONS.at_risk_podiatry.map(s => ({ id: s.id, label: s.label }))

// icd10Codes/cptCodes are Json columns — guard before joining.
const codeList = (codes: string[] | null) =>
  Array.isArray(codes) && codes.length > 0 ? codes.join(', ') : null

export default function AdminCareflowRulesPage() {
  const router = useRouter()
  const [careflowType, setCareflowType] = useState('')
  const [section, setSection] = useState('')
  const [fieldKey, setFieldKey] = useState('')
  const [active, setActive] = useState('')
  const [q, setQ] = useState('')

  const filters = new URLSearchParams()
  if (careflowType) filters.set('careflowType', careflowType)
  if (section) filters.set('section', section)
  if (fieldKey.trim()) filters.set('fieldKey', fieldKey.trim())
  if (active) filters.set('active', active)
  if (q.trim()) filters.set('q', q.trim())

  const paged = usePaged<CareflowRule>(`/api/admin/careflow-rules?${filters}`, 'rules')
  const { rows: rules, loading } = paged

  // Changing any filter resets to page 1.
  const onFilter = (setter: (v: string) => void) => (v: string) => { setter(v); paged.setPage(1) }

  const inputCls = 'px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
  const selectCls = 'px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'

  return (
    <AdminShell>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-slate-800">Careflow Rules</h2>
        <p className="text-sm text-slate-500 mt-0.5">Field-triggered note fragments, diagnosis and procedure codes</p>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={careflowType}
          onChange={e => onFilter(setCareflowType)(e.target.value)}
          className={selectCls}
        >
          <option value="">All careflow types</option>
          {CAREFLOW_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select
          value={section}
          onChange={e => onFilter(setSection)(e.target.value)}
          className={selectCls}
        >
          <option value="">All sections</option>
          {SECTIONS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <input
          type="text"
          placeholder="Filter by field key..."
          value={fieldKey}
          onChange={e => onFilter(setFieldKey)(e.target.value)}
          className={inputCls}
        />
        <select
          value={active}
          onChange={e => onFilter(setActive)(e.target.value)}
          className={selectCls}
        >
          <option value="">All statuses</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
        <input
          type="text"
          placeholder="Search note fragment..."
          value={q}
          onChange={e => onFilter(setQ)(e.target.value)}
          className={`${inputCls} flex-1 min-w-48`}
        />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading rules...</div>
        ) : rules.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">No matching rules.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                {['Section', 'Field Key', 'Value', 'Codes', 'Qualifier', 'Priority', 'Status', ''].map((h, i) => (
                  <th key={i} className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rules.map(rule => {
                const icd10 = codeList(rule.icd10Codes)
                const cpt = codeList(rule.cptCodes)
                return (
                  <tr key={rule.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3 text-sm text-slate-600 whitespace-nowrap">{rule.section}</td>
                    <td className="px-5 py-3 text-sm font-medium text-slate-800 whitespace-nowrap">{rule.fieldKey}</td>
                    <td className="px-5 py-3 text-sm text-slate-600 whitespace-nowrap">{rule.fieldValue}</td>
                    <td className="px-5 py-3 text-sm text-slate-600">
                      {icd10 || cpt ? (
                        <div className="flex flex-col gap-0.5">
                          {icd10 && <span><span className="text-xs text-slate-400">ICD-10</span> {icd10}</span>}
                          {cpt && <span><span className="text-xs text-slate-400">CPT</span> {cpt}</span>}
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-5 py-3 text-sm text-slate-600 whitespace-nowrap">{rule.cptQualifier ?? '—'}</td>
                    <td className="px-5 py-3 text-sm text-slate-600">{rule.priority}</td>
                    <td className="px-5 py-3">
                      <Badge variant={rule.active ? 'active' : 'inactive'} label={rule.active ? 'Active' : 'Inactive'} />
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => router.push(`/admin/careflow-rules/${rule.id}`)}
                        className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {!loading && (
        <Pagination {...paged} onPageChange={paged.setPage} onLimitChange={paged.setLimit} unit="rules" />
      )}
    </AdminShell>
  )
}
