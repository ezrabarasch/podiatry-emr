'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import AdminShell from '@/app/admin/AdminShell'
import Button from '@/app/components/Button'
import Card from '@/app/components/Card'
import Table from '@/app/components/Table'
import { ClaimsNav, ClaimStatusBadge, fmtDate, fmtDateTime, post, useApi, usd } from '../ClaimsKit'

interface Reason { group: string; code: string; description: string; amount: number }
interface Line {
  lineNumber: number; cptCode: string; modifiers: string[]; description: string; diagnosisPointers: string[]; units: number
  charge: number; allowed: number | null; paid: number | null; adjustment: number | null; reasons: Reason[]; remarks: Array<{ code: string; description: string }>
}
interface Detail {
  id: string; claimId: string; status: string; stediCorrelationId: string | null
  patient: { id: string; name: string; dob: string; memberId: string | null }
  payer: { id: string | null; name: string | null }
  facility: { name: string; posCode: string | null; type: string }
  provider: { name: string; npi: string | null }
  referringProvider: { name: string; npi: string | null } | null
  dos: string; daysInAR: number | null
  money: { charges: number; allowed: number | null; paid: number | null; patientResponsibility: number | null; adjustment: number | null; writeOff: number | null }
  diagnoses: Array<{ pointer: string; icd10: string; description: string }>
  scrubErrors: string[]
  serviceLines: Line[]
  events: Array<{ id: string; type: string; description: string; createdAt: string; by: string | null }>
  notes: Array<{ id: string; note: string; createdAt: string; by: string }>
  parent: { id: string; patientControlNumber: string; status: string } | null
  children: Array<{ id: string; patientControlNumber: string; status: string }>
  voidReason: string | null; writeOffReason: string | null
}

const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div>
    <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wide">{label}</p>
    <p className="text-sm text-text mt-0.5">{value || '-'}</p>
  </div>
)

export default function ClaimDetailPage() {
  const { claimId } = useParams<{ claimId: string }>()
  const { data: c, error, loading, reload } = useApi<Detail>(`/api/admin/billing/claims/${claimId}`)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  const base = `/api/admin/billing/claims/${claimId}`
  const run = async (path: string, body: unknown, okText: (d: Record<string, unknown>) => string) => {
    setBusy(true); setMsg(null)
    const r = await post<Record<string, unknown>>(`${base}/${path}`, body)
    const errs = Array.isArray(r.data.errors) ? `: ${(r.data.errors as string[]).join('; ')}` : ''
    setMsg({ ok: r.ok, text: r.ok ? okText(r.data) : `${r.data.error ?? 'Failed'}${errs}` })
    setBusy(false); reload()
    return r
  }
  const ask = (q: string) => { const v = window.prompt(q); return v && v.trim() ? v.trim() : null }

  if (!c) {
    return (
      <AdminShell>
        <ClaimsNav />
        <p className="text-sm text-text-muted">{loading ? 'Loading...' : error ?? 'Claim not found'}</p>
      </AdminShell>
    )
  }

  const st = c.status
  const canSubmit = st === 'Ready'
  const canRescrub = st === 'Draft' || st === 'Ready'
  const canVoid = !['FullPaidClosed', 'PartialPaidClosed', 'Void'].includes(st)

  return (
    <AdminShell>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <Link href="/admin/billing/claims" className="text-xs text-text-muted hover:text-text">&larr; All claims</Link>
          <h2 className="text-2xl font-semibold text-text mt-1 flex items-center gap-3">{c.claimId} <ClaimStatusBadge status={st} /></h2>
          <p className="text-sm text-text-muted mt-0.5">
            {c.patient.name} - DOS {fmtDate(c.dos + 'T12:00:00')}
            {c.parent && <> - resubmission of <Link className="text-primary" href={`/admin/billing/claims/${c.parent.id}`}>{c.parent.patientControlNumber}</Link></>}
            {c.children.map(k => <span key={k.id}> - replaced by <Link className="text-primary" href={`/admin/billing/claims/${k.id}`}>{k.patientControlNumber}</Link> ({k.status})</span>)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canRescrub && <Button variant="secondary" loading={busy} onClick={() => run('rescrub', {}, d => (d.pass ? 'Scrub passed.' : 'Scrub still failing.'))}>Re-scrub</Button>}
          {canSubmit && <Button loading={busy} onClick={() => confirm('Submit this claim to Stedi (test mode)?') && run('submit', {}, d => String(d.message ?? 'Submitted'))}>Submit</Button>}
          {st === 'Draft' && (
            <Button variant="secondary" loading={busy} onClick={() => {
              const reason = ask('Force submit over a failed scrub. Reason (required, logged):')
              if (reason) run('submit', { force: true, reason }, d => String(d.message ?? 'Submitted'))
            }}>Force submit</Button>
          )}
          {st === 'Rejected' && <Button loading={busy} onClick={() => run('resubmit', { kind: 'resubmit' }, d => `Resubmission ${d.claimNumber} created (${d.status}).`)}>Resubmit</Button>}
          {st === 'Denied' && <Button loading={busy} onClick={() => run('resubmit', { kind: 'appeal' }, d => `Appeal ${d.claimNumber} created (${d.status}).`)}>Appeal</Button>}
          {st === 'PartialPaidPending' && (
            <Button variant="secondary" loading={busy} onClick={() => { const r = ask('Write off the remaining balance. Reason (required):'); if (r) run('writeoff', { reason: r }, () => 'Balance written off.') }}>Write off</Button>
          )}
          {canVoid && <Button variant="danger" loading={busy} onClick={() => { const r = ask('Void this claim. Reason (required):'); if (r) run('void', { reason: r }, () => 'Claim voided.') }}>Void</Button>}
        </div>
      </div>
      <ClaimsNav />
      {msg && <div className={`mb-4 text-sm rounded-lg px-4 py-2 ${msg.ok ? 'bg-[#DCFCE7] text-[#15803D]' : 'bg-red-100 text-red-700'}`}>{msg.text}</div>}

      {c.scrubErrors.length > 0 && (
        <div className="mb-4 bg-[#FEF9C3] text-[#854D0E] rounded-lg px-4 py-3 text-sm">
          <p className="font-semibold mb-1">Scrub issues - fix these, then re-scrub</p>
          <ul className="list-disc ml-5">{c.scrubErrors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-5">
        {([['Charges', c.money.charges], ['Allowed', c.money.allowed], ['Paid', c.money.paid], ['Adjustment', c.money.adjustment], ['Patient resp.', c.money.patientResponsibility]] as const).map(([l, v]) => (
          <div key={l} className="bg-surface rounded-xl border border-border px-4 py-3">
            <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wide">{l}</p>
            <p className="text-lg font-semibold text-text mt-0.5">{usd(v)}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-5 mb-5">
        <Card className="lg:col-span-2">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Field label="Patient" value={<Link className="text-primary" href={`/patients/${c.patient.id}`}>{c.patient.name}</Link>} />
            <Field label="DOB" value={fmtDate(c.patient.dob + 'T12:00:00')} />
            <Field label="Member ID" value={c.patient.memberId} />
            <Field label="Payer" value={c.payer.name ? `${c.payer.name}${c.payer.id ? ` (${c.payer.id})` : ''}` : null} />
            <Field label="Facility" value={`${c.facility.name} (POS ${c.facility.posCode ?? '?'})`} />
            <Field label="Days in AR" value={c.daysInAR} />
            <Field label="Rendering provider" value={`${c.provider.name}${c.provider.npi ? ` - NPI ${c.provider.npi}` : ''}`} />
            <Field label="Referring provider" value={c.referringProvider ? `${c.referringProvider.name}${c.referringProvider.npi ? ` - NPI ${c.referringProvider.npi}` : ''}` : null} />
            <Field label="Stedi correlation ID" value={c.stediCorrelationId} />
          </div>
          {(c.voidReason || c.writeOffReason) && (
            <p className="text-sm text-text-muted mt-4">{c.voidReason ? `Void reason: ${c.voidReason}` : `Write-off (${usd(c.money.writeOff)}): ${c.writeOffReason}`}</p>
          )}
        </Card>
        <Card>
          <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wide mb-2">Diagnoses</p>
          <ul className="text-sm space-y-1">
            {c.diagnoses.length === 0 && <li className="text-text-muted">None</li>}
            {c.diagnoses.map(d => <li key={d.pointer}><span className="font-medium">{d.pointer}. {d.icd10}</span> <span className="text-text-muted">{d.description}</span></li>)}
          </ul>
        </Card>
      </div>

      <h3 className="text-sm font-semibold text-text mb-2">Service lines</h3>
      <Table
        columns={[
          { key: 'n', label: '#', render: l => l.lineNumber },
          { key: 'cpt', label: 'CPT', render: l => <span className="font-medium">{l.cptCode}{l.modifiers.length ? `-${l.modifiers.join('-')}` : ''}</span> },
          { key: 'desc', label: 'Description', render: l => l.description },
          { key: 'dx', label: 'Dx', render: l => l.diagnosisPointers.join(', ') },
          { key: 'units', label: 'Units', render: l => l.units },
          { key: 'charge', label: 'Charge', render: l => usd(l.charge) },
          { key: 'allowed', label: 'Allowed', render: l => usd(l.allowed) },
          { key: 'paid', label: 'Paid', render: l => usd(l.paid) },
          {
            key: 'adj', label: 'Adjustments',
            render: l => l.reasons.length || l.remarks.length
              ? <span className="text-xs">{l.reasons.map(r => `${r.group}-${r.code} ${usd(r.amount)}`).join(', ')}{l.remarks.length ? ` | RARC ${l.remarks.map(r => r.code).join(', ')}` : ''}</span>
              : '-',
          },
        ]}
        rows={c.serviceLines.map(l => ({ ...l, id: String(l.lineNumber) }))}
      />

      <div className="grid lg:grid-cols-2 gap-5 mt-6">
        <div>
          <h3 className="text-sm font-semibold text-text mb-2">Timeline</h3>
          <Card padding="p-4">
            <ol className="space-y-3">
              {c.events.map(e => (
                <li key={e.id} className="text-sm">
                  <p className="text-text"><span className="font-medium">{e.type}</span> - {e.description}</p>
                  <p className="text-xs text-text-muted">{fmtDateTime(e.createdAt)}{e.by ? ` - ${e.by}` : ''}</p>
                </li>
              ))}
            </ol>
          </Card>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-text mb-2">Notes</h3>
          <Card padding="p-4">
            <div className="flex gap-2 mb-3">
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="Add a note" className="flex-1 px-2.5 py-1.5 rounded-lg border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              <Button size="sm" disabled={!note.trim()} loading={busy} onClick={async () => { await run('note', { note }, () => 'Note added.'); setNote('') }}>Add</Button>
            </div>
            <ul className="space-y-3">
              {c.notes.length === 0 && <li className="text-sm text-text-muted">No notes.</li>}
              {c.notes.map(n => (
                <li key={n.id} className="text-sm">
                  <p className="text-text">{n.note}</p>
                  <p className="text-xs text-text-muted">{fmtDateTime(n.createdAt)} - {n.by}</p>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </AdminShell>
  )
}
