'use client'

import { useState } from 'react'
import AdminShell from '@/app/admin/AdminShell'
import Button from '@/app/components/Button'
import { ClaimsNav, ClaimsTable, Stat, post, useApi, usd, type ClaimRow } from '../ClaimsKit'

interface DenialRow extends ClaimRow { denialCode: string; denialDescription: string; daysSinceDenial: number; actionTaken: string }
interface Group { code: string; description: string; count: number; dollars: number; claims: DenialRow[] }
interface Queue { totalDeniedRejected: number; dollarsAtRisk: number; avgDaysSinceDenial: number | null; groups: Group[] }

export default function DenialQueuePage() {
  const q = useApi<Queue>('/api/admin/billing/claims/denials')
  const [open, setOpen] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const act = async (r: DenialRow, kind: 'resubmit' | 'appeal') => {
    const res = await post<{ claimNumber: string; status: string }>(`/api/admin/billing/claims/${r.id}/resubmit`, { kind })
    setMsg(res.ok ? `${kind === 'appeal' ? 'Appeal' : 'Resubmission'} ${res.data.claimNumber} created (${res.data.status}).` : res.data.error ?? 'Failed')
    q.reload()
  }

  const d = q.data
  return (
    <AdminShell>
      <div className="mb-4">
        <h2 className="text-2xl font-semibold text-text">Denial Queue</h2>
        <p className="text-sm text-text-muted mt-0.5">Rejected (277CA, fix and resubmit) and Denied (835, appeal or write off) claims, grouped by reason.</p>
      </div>
      <ClaimsNav />
      {msg && <div className="mb-4 text-sm bg-[#DBEAFE] text-[#1D4ED8] rounded-lg px-4 py-2">{msg}</div>}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
        <Stat label="Rejected + Denied" value={d ? String(d.totalDeniedRejected) : '-'} tone="danger" />
        <Stat label="Dollars at Risk" value={usd(d?.dollarsAtRisk)} tone="danger" />
        <Stat label="Avg Days Since" value={d?.avgDaysSinceDenial == null ? '-' : String(d.avgDaysSinceDenial)} />
      </div>

      {q.error && <p className="text-sm text-danger mb-3">{q.error}</p>}
      {d && d.groups.length === 0 && <p className="text-sm text-text-muted">No rejected or denied claims.</p>}
      <div className="space-y-3">
        {(d?.groups ?? []).map(g => (
          <div key={g.code} className="bg-surface rounded-xl border border-border">
            <button onClick={() => setOpen(open === g.code ? null : g.code)} className="w-full flex items-center justify-between px-5 py-3 text-left">
              <span>
                <span className="font-semibold text-text">{g.code}</span>
                <span className="text-sm text-text-muted ml-3">{g.description}</span>
              </span>
              <span className="text-sm text-text-muted">{g.count} claim{g.count === 1 ? '' : 's'} - {usd(g.dollars)}</span>
            </button>
            {open === g.code && (
              <div className="px-3 pb-3">
                <ClaimsTable
                  rows={g.claims}
                  extra={[
                    { key: 'since', label: 'Days Since', render: r => (r as DenialRow).daysSinceDenial },
                    { key: 'action', label: 'Action Taken', render: r => (r as DenialRow).actionTaken },
                    {
                      key: 'do', label: '',
                      render: r => {
                        const x = r as DenialRow
                        if (x.actionTaken !== 'None') return null
                        return (
                          <span onClick={e => e.stopPropagation()}>
                            {x.status === 'Rejected'
                              ? <Button size="sm" variant="secondary" onClick={() => act(x, 'resubmit')}>Resubmit</Button>
                              : <Button size="sm" variant="secondary" onClick={() => act(x, 'appeal')}>Appeal</Button>}
                          </span>
                        )
                      },
                    },
                  ]}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </AdminShell>
  )
}
