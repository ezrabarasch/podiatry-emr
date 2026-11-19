'use client'

import { useState } from 'react'
import AdminShell from '@/app/admin/AdminShell'
import Table from '@/app/components/Table'
import { ClaimsNav, ClaimsTable, Stat, agingTone, useApi, usd, type ClaimRow } from '../ClaimsKit'

interface Bucket { key: string; label: string; color: string; count: number; billed: number; paid: number; outstanding: number }
interface Summary { totalOutstanding: number; openClaims: number; avgDaysInAR: number | null; buckets: Bucket[] }

const DOT: Record<string, string> = { green: '#16A34A', yellow: '#CA8A04', orange: '#EA580C', red: '#DC2626', darkred: '#7F1D1D' }

export default function ArAgingPage() {
  const [bucket, setBucket] = useState<string | null>(null)
  const summary = useApi<Summary>('/api/admin/billing/claims/summary')
  const list = useApi<{ claims: ClaimRow[]; total: number }>(bucket ? `/api/admin/billing/claims?aging=${encodeURIComponent(bucket)}&limit=200` : null)
  const s = summary.data

  return (
    <AdminShell>
      <div className="mb-4">
        <h2 className="text-2xl font-semibold text-text">AR Aging</h2>
        <p className="text-sm text-text-muted mt-0.5">Open claims by days since submission. Click a bucket to see its claims.</p>
      </div>
      <ClaimsNav />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
        <Stat label="Total Outstanding" value={usd(s?.totalOutstanding)} />
        <Stat label="Open Claims" value={s ? String(s.openClaims) : '-'} />
        <Stat label="Avg Days in AR" value={s?.avgDaysInAR == null ? '-' : String(s.avgDaysInAR)} />
      </div>

      <Table
        columns={[
          { key: 'label', label: 'Bucket', render: b => <span className="inline-flex items-center gap-2 font-medium"><span className="w-2.5 h-2.5 rounded-full" style={{ background: DOT[b.color] }} />{b.label}</span> },
          { key: 'count', label: 'Claims', render: b => b.count },
          { key: 'billed', label: 'Billed', render: b => usd(b.billed) },
          { key: 'paid', label: 'Paid', render: b => usd(b.paid) },
          { key: 'outstanding', label: 'Outstanding', render: b => <span className="font-semibold">{usd(b.outstanding)}</span> },
        ]}
        rows={(s?.buckets ?? []).map(b => ({ ...b, id: b.key }))}
        onRowClick={b => setBucket(b.key === bucket ? null : b.key)}
        empty={summary.loading ? 'Loading...' : 'No open claims.'}
      />

      {bucket && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-text mb-2">Claims aged {bucket} days</h3>
          <ClaimsTable
            rows={list.data?.claims ?? []}
            empty={list.loading ? 'Loading...' : 'No claims in this bucket.'}
            extra={[
              { key: 'outstanding', label: 'Outstanding', render: r => usd(r.outstanding) },
              { key: 'days', label: 'Days in AR', render: r => <span className={agingTone(r.daysInAR)}>{r.daysInAR ?? '-'}</span> },
            ]}
          />
        </div>
      )}
    </AdminShell>
  )
}
