'use client'

import { useState } from 'react'
import AdminShell from '@/app/admin/AdminShell'
import Button from '@/app/components/Button'
import { ClaimsNav, ClaimsTable, Stat, post, useApi, usd, type ClaimRow } from '../ClaimsKit'

interface BatchResult { ok: boolean; claimId: string; message?: string; error?: string; errors?: string[] }

// Draft + Ready claims. Ready ones can be submitted (individually or in a batch); Draft ones failed the scrub.
export default function SubmissionQueuePage() {
  const q = useApi<{ claims: ClaimRow[]; total: number }>('/api/admin/billing/claims?status=Draft,Ready&limit=200')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<BatchResult[] | null>(null)

  const rows = q.data?.claims ?? []
  const ready = rows.filter(r => r.status === 'Ready')
  const toggle = (id: string) => setPicked(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const chosen = ready.filter(r => picked.has(r.id))

  const submit = async (ids: string[]) => {
    if (!ids.length || !confirm(`Submit ${ids.length} claim(s) to Stedi (test mode)?`)) return
    setBusy(true)
    const r = await post<{ results: BatchResult[] }>('/api/admin/billing/claims/submit-batch', { claimIds: ids })
    setResults(r.ok ? r.data.results : [{ ok: false, claimId: '', error: r.data.error ?? 'Batch failed' }])
    setPicked(new Set()); setBusy(false); q.reload()
  }

  return (
    <AdminShell>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-2xl font-semibold text-text">Submission Queue</h2>
          <p className="text-sm text-text-muted mt-0.5">Draft claims failed the scrub and need a fix. Ready claims are waiting for you to submit. Nothing is sent automatically.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setPicked(new Set(picked.size === ready.length ? [] : ready.map(r => r.id)))} disabled={!ready.length}>
            {picked.size === ready.length && ready.length ? 'Clear selection' : 'Select all ready'}
          </Button>
          <Button loading={busy} disabled={!chosen.length} onClick={() => submit(chosen.map(r => r.id))}>Submit {chosen.length || ''} selected</Button>
        </div>
      </div>
      <ClaimsNav />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
        <Stat label="Ready" value={String(ready.length)} />
        <Stat label="Draft (needs fix)" value={String(rows.length - ready.length)} tone={rows.length > ready.length ? 'warning' : undefined} />
        <Stat label="Queued Charges" value={usd(rows.reduce((a, r) => a + r.totalCharges, 0))} />
      </div>

      {results && (
        <div className="mb-4 bg-surface border border-border rounded-xl px-4 py-3 text-sm space-y-1">
          <p className="font-medium text-text">{results.filter(r => r.ok).length} submitted, {results.filter(r => !r.ok).length} not submitted</p>
          {results.filter(r => !r.ok).map((r, i) => <p key={i} className="text-danger">{r.error}{r.errors?.length ? `: ${r.errors.join('; ')}` : ''}</p>)}
        </div>
      )}

      {q.error && <p className="text-sm text-danger mb-3">{q.error}</p>}
      <ClaimsTable
        rows={rows}
        select={{ ids: picked, toggle: id => { if (ready.some(r => r.id === id)) toggle(id) } }}
        empty={q.loading ? 'Loading...' : 'Nothing in the queue.'}
        extra={[
          { key: 'scrub', label: 'Scrub', render: r => r.scrubPass ? <span className="text-success">Passed</span> : <span className="text-danger" title={r.scrubErrors.join('\n')}>{r.scrubErrors.length} issue{r.scrubErrors.length === 1 ? '' : 's'}</span> },
        ]}
      />
    </AdminShell>
  )
}
