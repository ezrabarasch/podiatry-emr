'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Table, { type Column } from '@/app/components/Table'

// ── formatting ───────────────────────────────────────────────────────────────

export const usd = (n: number | null | undefined) =>
  n == null ? '-' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
export const fmtDate = (s: string | Date | null | undefined) =>
  s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'
export const fmtDateTime = (s: string | Date | null | undefined) =>
  s ? new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '-'

// ── status badge ─────────────────────────────────────────────────────────────

const STATUS: Record<string, { label: string; cls: string }> = {
  Draft: { label: 'Draft', cls: 'bg-[#F1F5F9] text-[#64748B]' },
  Ready: { label: 'Ready', cls: 'bg-[#DBEAFE] text-[#1D4ED8]' },
  Submitted: { label: 'Submitted', cls: 'bg-[#E0F2FE] text-[#0369A1]' },
  Accepted: { label: 'Accepted', cls: 'bg-[#CCFBF1] text-[#0F766E]' },
  Rejected: { label: 'Rejected', cls: 'bg-red-100 text-red-700' },
  AwaitingPayment: { label: 'Awaiting Payment', cls: 'bg-[#FEF9C3] text-[#854D0E]' },
  Denied: { label: 'Denied', cls: 'bg-red-100 text-red-700' },
  Appealed: { label: 'Appealed', cls: 'bg-[#FFEDD5] text-[#C2410C]' },
  PartialPaidPending: { label: 'Partial Paid', cls: 'bg-[#FFEDD5] text-[#C2410C]' },
  FullPaidClosed: { label: 'Paid', cls: 'bg-[#DCFCE7] text-[#15803D]' },
  PartialPaidClosed: { label: 'Closed (Partial)', cls: 'bg-[#DCFCE7] text-[#15803D]' },
  Void: { label: 'Void', cls: 'bg-[#F1F5F9] text-[#64748B] line-through' },
}
export const STATUS_OPTIONS = Object.keys(STATUS).map(k => ({ value: k, label: STATUS[k].label }))

export function ClaimStatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, cls: 'bg-[#F1F5F9] text-[#64748B]' }
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${s.cls}`}>{s.label}</span>
}

// ── data hook ────────────────────────────────────────────────────────────────

export function useApi<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null) // key of the last finished request; loading = it is not the current one
  const [tick, setTick] = useState(0)
  const key = url ? `${url}#${tick}` : null
  useEffect(() => {
    if (!url) return
    let live = true
    fetch(url)
      .then(async r => {
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`)
        return j as T
      })
      .then(j => { if (live) { setData(j); setError(null) } })
      .catch(e => { if (live) setError(e instanceof Error ? e.message : 'Failed to load') })
      .finally(() => { if (live) setDone(`${url}#${tick}`) })
    return () => { live = false }
  }, [url, tick])
  const reload = useCallback(() => setTick(t => t + 1), [])
  return { data, error, loading: key !== null && done !== key, reload }
}

export async function post<T = Record<string, unknown>>(url: string, body: unknown = {}): Promise<{ ok: boolean; data: T & { error?: string } }> {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return { ok: r.ok, data: await r.json().catch(() => ({})) }
}

// ── sub-navigation ───────────────────────────────────────────────────────────

const VIEWS = [
  { href: '/admin/billing/claims', label: 'Claims' },
  { href: '/admin/billing/claims/aging', label: 'AR Aging' },
  { href: '/admin/billing/claims/denials', label: 'Denial Queue' },
  { href: '/admin/billing/claims/queue', label: 'Submission Queue' },
]

export function ClaimsNav() {
  const router = useRouter()
  const pathname = usePathname()
  // Claim detail pages (/claims/<id>) live under "Claims".
  const active = VIEWS.slice(1).find(v => pathname.startsWith(v.href))?.href ?? VIEWS[0].href
  return (
    <div className="flex gap-2 mb-5">
      {VIEWS.map(v => (
        <button
          key={v.href}
          onClick={() => router.push(v.href)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${active === v.href ? 'bg-primary text-white border-transparent' : 'bg-surface text-text-muted border-border hover:text-text'}`}
        >
          {v.label}
        </button>
      ))}
    </div>
  )
}

export function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'danger' | 'warning' }) {
  return (
    <div className="bg-surface rounded-xl border border-border px-5 py-4">
      <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : 'text-text'}`}>{value}</p>
      {sub && <p className="text-xs text-text-muted mt-0.5">{sub}</p>}
    </div>
  )
}

// ── shared claim row + table ─────────────────────────────────────────────────

export interface ClaimRow {
  id: string; claimId: string; status: string
  patient: { id: string; name: string }; dos: string
  facility: { id: string; name: string }; provider: { id: string; name: string }
  payerName: string | null; cptCount: number
  totalCharges: number; totalPaid: number | null; outstanding: number
  daysInAR: number | null; scrubPass: boolean; scrubErrors: string[]
}

export const agingTone = (d: number | null) => (d == null ? '' : d > 90 ? 'text-danger font-semibold' : d > 60 ? 'text-warning font-semibold' : 'text-text')

export function ClaimsTable({ rows, extra = [], select, empty }: {
  rows: ClaimRow[]
  extra?: Column<ClaimRow>[]
  select?: { ids: Set<string>; toggle: (id: string) => void }
  empty?: string
}) {
  const router = useRouter()
  const cols: Column<ClaimRow>[] = [
    ...(select ? [{
      key: 'sel', label: '', width: '32px',
      render: (r: ClaimRow) => (
        <input type="checkbox" checked={select.ids.has(r.id)} onClick={e => e.stopPropagation()} onChange={() => select.toggle(r.id)} />
      ),
    }] : []),
    { key: 'claimId', label: 'Claim ID', render: r => <span className="font-medium text-primary">{r.claimId}</span> },
    { key: 'patient', label: 'Patient', render: r => r.patient.name },
    { key: 'dos', label: 'DOS', render: r => fmtDate(r.dos + 'T12:00:00') },
    { key: 'facility', label: 'Facility', render: r => r.facility.name },
    { key: 'payer', label: 'Payer', render: r => r.payerName ?? <span className="text-text-muted">-</span> },
    { key: 'charges', label: 'Charges', render: r => usd(r.totalCharges) },
    { key: 'status', label: 'Status', render: r => <ClaimStatusBadge status={r.status} /> },
    ...extra,
  ]
  return <Table columns={cols} rows={rows} onRowClick={r => router.push(`/admin/billing/claims/${r.id}`)} empty={empty ?? 'No claims found.'} />
}
