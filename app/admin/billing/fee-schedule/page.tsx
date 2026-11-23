'use client'

import { useState } from 'react'
import AdminShell from '@/app/admin/AdminShell'
import Button from '@/app/components/Button'
import Pagination from '@/app/components/Pagination'
import Table, { type Column } from '@/app/components/Table'
import { fmtDate, post, useApi, usd } from '../claims/ClaimsKit'

interface Fee { id: string; cptCode: string; description: string | null; amount: number; updatedAt: string }
interface ListResponse { items: Omit<Fee, 'id'>[]; total: number }

const input = 'px-2.5 py-1.5 rounded-lg border border-border bg-surface text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent'
const api = '/api/admin/billing/fee-schedule'

export default function FeeSchedulePage() {
  const [q, setQ] = useState('')
  const [applied, setApplied] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(25)
  const list = useApi<ListResponse>(`${api}?q=${encodeURIComponent(applied)}&page=${page}&pageSize=${limit}`)

  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState({ description: '', amount: '' })
  const [adding, setAdding] = useState(false)
  const [add, setAdd] = useState({ cptCode: '', description: '', amount: '' })
  const [importing, setImporting] = useState(false)
  const [csv, setCsv] = useState('')
  const [busy, setBusy] = useState(false)

  const say = (ok: boolean, text: string) => setMsg({ ok, text })
  const done = (text: string) => { say(true, text); list.reload() }

  const addRow = async () => {
    setBusy(true)
    const r = await post(api, add)
    setBusy(false)
    if (!r.ok) return say(false, r.data.error ?? 'Add failed')
    setAdd({ cptCode: '', description: '', amount: '' }); setAdding(false); done(`Added ${add.cptCode.toUpperCase()}`)
  }

  const saveRow = async (cpt: string) => {
    setBusy(true)
    const r = await fetch(`${api}/${cpt}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) })
    setBusy(false)
    if (!r.ok) return say(false, (await r.json().catch(() => ({}))).error ?? 'Save failed')
    setEditing(null); done(`Saved ${cpt}`)
  }

  const remove = async (cpt: string) => {
    if (!window.confirm(`Delete ${cpt} from the fee schedule?`)) return
    let r = await fetch(`${api}/${cpt}`, { method: 'DELETE' })
    if (r.status === 409) {
      const j = await r.json().catch(() => ({}))
      if (!window.confirm(`${j.error}. Existing claims keep their charges, but new claims with ${cpt} will fail until it is re-added. Delete anyway?`)) return
      r = await fetch(`${api}/${cpt}?force=1`, { method: 'DELETE' })
    }
    if (!r.ok) return say(false, (await r.json().catch(() => ({}))).error ?? 'Delete failed')
    done(`Deleted ${cpt}`)
  }

  const runImport = async () => {
    setBusy(true)
    const r = await post<{ saved: number; errors?: string[] }>(`${api}/import`, { csv })
    setBusy(false)
    if (!r.ok) return say(false, [r.data.error, ...(r.data.errors ?? [])].filter(Boolean).join(' | '))
    setCsv(''); setImporting(false); done(`Imported ${r.data.saved} fee${r.data.saved === 1 ? '' : 's'}`)
  }

  const rows: Fee[] = (list.data?.items ?? []).map(i => ({ ...i, id: i.cptCode }))
  const columns: Column<Fee>[] = [
    { key: 'cptCode', label: 'CPT Code', width: '110px', render: r => <span className="font-mono text-sm text-text">{r.cptCode}</span> },
    {
      key: 'description', label: 'Description',
      render: r => editing === r.cptCode
        ? <input className={`${input} w-full`} value={draft.description} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} />
        : <span className="text-sm text-text-muted">{r.description ?? '-'}</span>,
    },
    {
      key: 'amount', label: 'Charge', width: '140px',
      render: r => editing === r.cptCode
        ? <input className={`${input} w-28`} inputMode="decimal" value={draft.amount} onChange={e => setDraft(d => ({ ...d, amount: e.target.value }))} />
        : <span className="text-sm text-text">{usd(r.amount)}</span>,
    },
    { key: 'updatedAt', label: 'Last Updated', width: '130px', render: r => <span className="text-sm text-text-muted">{fmtDate(r.updatedAt)}</span> },
    {
      key: 'actions', label: '', width: '170px',
      render: r => editing === r.cptCode
        ? (
          <div className="flex gap-2">
            <Button size="sm" loading={busy} onClick={() => saveRow(r.cptCode)}>Save</Button>
            <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => { setEditing(r.cptCode); setDraft({ description: r.description ?? '', amount: String(r.amount) }) }}>Edit</Button>
            <Button size="sm" variant="ghost" onClick={() => remove(r.cptCode)}>Delete</Button>
          </div>
        ),
    },
  ]

  return (
    <AdminShell>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-2xl font-semibold text-text">Fee Schedule</h2>
          <p className="text-sm text-text-muted mt-0.5">The charge billed per CPT/HCPCS code. A claim cannot be built until every code on the visit has a fee here.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => { setImporting(v => !v); setAdding(false) }}>Bulk Import</Button>
          <Button onClick={() => { setAdding(v => !v); setImporting(false) }}>Add CPT</Button>
        </div>
      </div>

      {msg && <div className={`mb-4 text-sm rounded-lg px-4 py-2 ${msg.ok ? 'bg-[#DCFCE7] text-[#15803D]' : 'bg-red-50 text-red-700 border border-red-200'}`}>{msg.text}</div>}

      {adding && (
        <div className="bg-surface border border-border rounded-lg p-4 mb-4 flex flex-wrap items-end gap-3">
          <label className="text-xs text-text-muted">CPT code<input className={`${input} block mt-1 w-28 font-mono uppercase`} maxLength={5} value={add.cptCode} onChange={e => setAdd(a => ({ ...a, cptCode: e.target.value }))} /></label>
          <label className="text-xs text-text-muted flex-1 min-w-[200px]">Description (optional)<input className={`${input} block mt-1 w-full`} value={add.description} onChange={e => setAdd(a => ({ ...a, description: e.target.value }))} /></label>
          <label className="text-xs text-text-muted">Charge ($)<input className={`${input} block mt-1 w-28`} inputMode="decimal" value={add.amount} onChange={e => setAdd(a => ({ ...a, amount: e.target.value }))} /></label>
          <Button loading={busy} disabled={!add.cptCode || !add.amount} onClick={addRow}>Add</Button>
        </div>
      )}

      {importing && (
        <div className="bg-surface border border-border rounded-lg p-4 mb-4">
          <p className="text-sm text-text-muted mb-2">
            Paste rows or choose a CSV file. Columns: <code>cpt_code,description,amount</code> (header optional), or just <code>CPT,amount</code> pairs.
            Existing codes get the new charge; new codes are added. Any bad line cancels the whole import.
          </p>
          <textarea className={`${input} w-full h-36 font-mono`} placeholder={'11721,Debridement of nails 6+,85.00\n99308,Subsequent NF care,125'} value={csv} onChange={e => setCsv(e.target.value)} />
          <div className="flex items-center gap-3 mt-2">
            <input type="file" accept=".csv,.tsv,.txt,text/csv" className="text-sm" onChange={async e => { const f = e.target.files?.[0]; if (f) setCsv(await f.text()) }} />
            <Button loading={busy} disabled={!csv.trim()} onClick={runImport}>Import</Button>
          </div>
        </div>
      )}

      <form className="flex gap-2 mb-4" onSubmit={e => { e.preventDefault(); setApplied(q.trim()); setPage(1) }}>
        <input className={`${input} w-72`} placeholder="Search CPT code or description" value={q} onChange={e => setQ(e.target.value)} />
        <Button type="submit" variant="secondary">Search</Button>
        {applied && <Button type="button" variant="ghost" onClick={() => { setQ(''); setApplied(''); setPage(1) }}>Clear</Button>}
      </form>

      {list.error ? <p className="text-sm text-red-600">{list.error}</p> : (
        <Table<Fee> columns={columns} rows={rows} empty={list.loading ? 'Loading...' : applied ? 'No matching codes.' : 'No fees yet. Add a CPT or bulk import.'} />
      )}
      <Pagination total={list.data?.total ?? 0} page={page} limit={limit} onPageChange={setPage} onLimitChange={l => { setLimit(l); setPage(1) }} unit="codes" />
    </AdminShell>
  )
}
