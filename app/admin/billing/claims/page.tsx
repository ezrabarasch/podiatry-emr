'use client'

import { useMemo, useState } from 'react'
import AdminShell from '@/app/admin/AdminShell'
import Button from '@/app/components/Button'
import Pagination from '@/app/components/Pagination'
import { ClaimsNav, ClaimsTable, Stat, STATUS_OPTIONS, agingTone, post, useApi, usd, type ClaimRow } from './ClaimsKit'

interface Summary {
  totalOutstanding: number; openClaims: number; avgDaysInAR: number | null
  cleanClaimRate: number | null; firstPassResolutionRate: number | null
  queue: { draft: number; ready: number }
}
interface Facility { id: string; name: string }

export default function ClaimsListPage() {
  const [f, setF] = useState({ search: '', status: '', facilityId: '', dateFrom: '', dateTo: '' })
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(25)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const qs = useMemo(() => {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries(f)) if (v) p.set(k, v)
    return p.toString()
  }, [f])
  const list = useApi<{ claims: ClaimRow[]; total: number }>(`/api/admin/billing/claims?${qs}${qs ? '&' : ''}page=${page}&limit=${limit}`)
  const summary = useApi<Summary>(`/api/admin/billing/claims/summary?${qs}`)
  const facilities = useApi<Facility[]>('/api/admin/facilities')

  const set = (k: keyof typeof f, v: string) => { setF(s => ({ ...s, [k]: v })); setPage(1) }
  const reloadAll = () => { list.reload(); summary.reload() }

  const generate = async () => {
    setBusy(true); setMsg(null)
    const r = await post<{ generated: number; ready: number; failed: number }>('/api/admin/billing/claims/generate')
    setMsg(r.ok ? `Generated ${r.data.generated} claim(s): ${r.data.ready} ready, ${r.data.failed} need attention.` : r.data.error ?? 'Generate failed')
    setBusy(false); reloadAll()
  }

  const s = summary.data
  const input = 'px-2.5 py-1.5 rounded-lg border border-border bg-surface text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent'

  return (
    <AdminShell>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-2xl font-semibold text-text">Claims</h2>
          <p className="text-sm text-text-muted mt-0.5">Professional claims (837P) - Stedi test mode, manual submission</p>
        </div>
        <Button onClick={generate} loading={busy}>Generate claims from signed visits</Button>
      </div>
      <ClaimsNav />
      {msg && <div className="mb-4 text-sm bg-[#DBEAFE] text-[#1D4ED8] rounded-lg px-4 py-2">{msg}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <Stat label="Total Outstanding" value={usd(s?.totalOutstanding)} sub={s ? `${s.openClaims} open claims` : undefined} />
        <Stat label="Avg Days in AR" value={s?.avgDaysInAR == null ? '-' : String(s.avgDaysInAR)} />
        <Stat label="Clean Claim Rate" value={s?.cleanClaimRate == null ? '-' : `${s.cleanClaimRate}%`} sub="Passed scrub first time, last 30 days" />
        <Stat label="First-Pass Resolution" value={s?.firstPassResolutionRate == null ? '-' : `${s.firstPassResolutionRate}%`} sub="Paid on first adjudication, last 30 days" />
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input className={`${input} w-64`} placeholder="Search patient or claim ID" value={f.search} onChange={e => set('search', e.target.value)} />
        <select className={input} value={f.status} onChange={e => set('status', e.target.value)}>
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select className={input} value={f.facilityId} onChange={e => set('facilityId', e.target.value)}>
          <option value="">All facilities</option>
          {(Array.isArray(facilities.data) ? facilities.data : []).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-text-muted">DOS from
          <input type="date" className={input} value={f.dateFrom} onChange={e => set('dateFrom', e.target.value)} />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-text-muted">to
          <input type="date" className={input} value={f.dateTo} onChange={e => set('dateTo', e.target.value)} />
        </label>
      </div>

      {list.error && <p className="text-sm text-danger mb-3">{list.error}</p>}
      <ClaimsTable
        rows={list.data?.claims ?? []}
        empty={list.loading ? 'Loading...' : 'No claims yet. Sign a visit, then generate claims.'}
        extra={[
          { key: 'outstanding', label: 'Outstanding', render: r => usd(r.outstanding) },
          { key: 'days', label: 'Days in AR', render: r => <span className={agingTone(r.daysInAR)}>{r.daysInAR ?? '-'}</span> },
        ]}
      />
      <Pagination total={list.data?.total ?? 0} page={page} limit={limit} onPageChange={setPage} onLimitChange={l => { setLimit(l); setPage(1) }} unit="claims" />
    </AdminShell>
  )
}
