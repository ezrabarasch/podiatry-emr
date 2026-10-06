'use client'

import { useCallback, useEffect, useState } from 'react'
import Card from '@/app/components/Card'
import Button from '@/app/components/Button'
import type { BenefitGroup, BenefitRow, EligibilityDetail, NetworkKey } from '@/lib/stedi-detail'

type Status = 'pending' | 'processing' | 'done' | 'error' | 'needs_review'

interface HistoryRow {
  id: string
  status: Status
  outcome: string | null
  message: string | null
  requestedAt: string
  completedAt: string | null
  applicationMode: string | null
}
interface Check extends HistoryRow { detail: EligibilityDetail | null }

const NETWORK_LABEL: Record<NetworkKey, string> = {
  in: 'In-network',
  out: 'Out-of-network',
  other: 'Network not specified',
}

const fmtTime = (s: string | null) => (s ? new Date(s).toLocaleString() : '—')
const dash = (v: string | null | undefined) => v || '—'

function banner(c: Check | null): { text: string; cls: string } {
  if (!c) return { text: 'Not checked yet', cls: 'bg-slate-100 text-slate-600' }
  if (c.status === 'pending' || c.status === 'processing') return { text: 'Checking eligibility…', cls: 'bg-blue-50 text-blue-700' }
  if (c.status === 'error') return { text: 'Eligibility check failed', cls: 'bg-red-50 text-red-700' }
  if (c.status === 'needs_review') return { text: 'Needs manual review', cls: 'bg-amber-50 text-amber-800' }
  return c.outcome === 'active'
    ? { text: 'Coverage ACTIVE', cls: 'bg-green-50 text-green-700' }
    : { text: 'Coverage INACTIVE', cls: 'bg-red-50 text-red-700' }
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="text-sm text-text break-words">{value || '—'}</dd>
    </div>
  )
}

function ModeBadge({ mode }: { mode: string | null }) {
  if (!mode) return null
  const test = mode !== 'production'
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${test ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-700'}`}>
      {test ? `${mode.toUpperCase()} DATA` : 'PRODUCTION'}
    </span>
  )
}

function BenefitTable({ rows }: { rows: BenefitRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-text-muted border-b border-border">
            {['Benefit', 'Amount', 'Coinsurance', 'Level', 'Period', 'Service types', 'Auth / referral'].map(h => (
              <th key={h} className="py-1.5 pr-4 font-medium whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/50 align-top">
              <td className="py-1.5 pr-4">
                <div className="text-text">{r.name} <span className="text-text-muted">({r.code})</span></div>
                {r.plan && <div className="text-xs text-text-muted">{r.plan}</div>}
                {r.notes.map((n, j) => <div key={j} className="text-xs text-text-muted">{n}</div>)}
              </td>
              <td className="py-1.5 pr-4 whitespace-nowrap">{r.amount ? `$${r.amount}` : '—'}</td>
              <td className="py-1.5 pr-4 whitespace-nowrap">{dash(r.percent)}</td>
              <td className="py-1.5 pr-4">{dash(r.level)}</td>
              <td className="py-1.5 pr-4">{dash(r.period)}</td>
              <td className="py-1.5 pr-4">{r.serviceTypes.length ? r.serviceTypes.join(', ') : '—'}</td>
              <td className="py-1.5">{dash(r.authRequired)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Group({ g }: { g: BenefitGroup }) {
  const count = g.rows.in.length + g.rows.out.length + g.rows.other.length
  return (
    <details open={g.key !== 'other'} className="border border-border rounded-lg">
      <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-text">
        {g.label} <span className="text-text-muted font-normal">({count})</span>
      </summary>
      <div className="px-3 pb-3 space-y-3">
        {(['in', 'out', 'other'] as NetworkKey[]).filter(k => g.rows[k].length > 0).map(k => (
          <div key={k}>
            <div className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">{NETWORK_LABEL[k]}</div>
            <BenefitTable rows={g.rows[k]} />
          </div>
        ))}
      </div>
    </details>
  )
}

export default function EligibilityTab({ patientId }: { patientId: string }) {
  const [check, setCheck] = useState<Check | null>(null)
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)

  const apply = (d: { check: Check | null; history: HistoryRow[] }) => {
    setCheck(d.check)
    setHistory(d.history)
  }

  const load = useCallback(() => {
    fetch(`/api/patients/${patientId}/eligibility`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (d) { setCheck(d.check); setHistory(d.history) }
        setLoaded(true)
      })
  }, [patientId])

  useEffect(() => { load() }, [load])

  const inFlight = check?.status === 'pending' || check?.status === 'processing'
  useEffect(() => {
    if (!inFlight) return
    const t = setInterval(load, 3000)
    return () => clearInterval(t)
  }, [inFlight, load])

  const recheck = async () => {
    setBusy(true)
    try {
      const r = await fetch(`/api/patients/${patientId}/eligibility`, { method: 'POST' })
      if (r.ok) apply(await r.json())
    } finally {
      setBusy(false)
    }
  }

  if (!loaded) return <Card><p className="text-sm text-text-muted py-4 text-center">Loading eligibility…</p></Card>

  const b = banner(check)
  const d = check?.detail ?? null

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-text">Eligibility (Stedi)</h3>
          <Button size="sm" variant="secondary" onClick={recheck} loading={busy} disabled={inFlight}>Re-check</Button>
        </div>
        <div className={`rounded-lg px-3 py-2 text-sm font-medium ${b.cls}`}>{b.text}</div>
        {check?.message && check.status !== 'done' && <p className="text-sm text-text-muted mt-2">{check.message}</p>}
        {check?.completedAt && <p className="text-xs text-text-muted mt-2">Last checked {fmtTime(check.completedAt)}</p>}
        {d && (
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            <Field label="Payer" value={d.header.payerName} />
            <Field label="Trading partner ID" value={d.header.tradingPartnerServiceId} />
            <Field label="Control number" value={d.header.controlNumber} />
            <Field label="Mode" value={<ModeBadge mode={d.header.applicationMode} />} />
          </dl>
        )}
      </Card>

      {d && d.errors.length > 0 && (
        <Card>
          <h3 className="text-sm font-semibold text-red-700 mb-3">Payer errors ({d.errors.length})</h3>
          <ul className="space-y-3">
            {d.errors.map((e, i) => (
              <li key={i} className="text-sm border-l-4 border-red-300 pl-3">
                <div className="text-text"><span className="font-semibold">{e.code ?? '—'}</span> · {e.description ?? 'No description'}
                  <span className="text-xs text-text-muted"> ({e.source})</span></div>
                {e.followup && <div className="text-xs text-text-muted">Follow-up: {e.followup}</div>}
                {e.resolution && <div className="text-xs text-text-muted">Possible resolution: {e.resolution}</div>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {d && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <h3 className="text-sm font-semibold text-text mb-3">Plan</h3>
              <dl className="grid grid-cols-2 gap-4">
                <Field label="Group number" value={d.plan.groupNumber} />
                <Field label="Group name" value={d.plan.groupName} />
                <Field label="Plan number" value={d.plan.planNumber} />
                <Field label="Plan description" value={d.plan.planDescription} />
                <Field label="Effective date" value={d.plan.effective} />
                <Field label="Term date" value={d.plan.term ?? (d.plan.effective ? 'Open / none reported' : null)} />
                <div className="col-span-2">
                  <Field label="Service type codes" value={d.plan.serviceTypeCodes.join(', ')} />
                </div>
                {d.plan.otherDates.map(o => <Field key={o.label} label={o.label} value={o.date} />)}
              </dl>
            </Card>
            <Card>
              <h3 className="text-sm font-semibold text-text mb-3">Subscriber</h3>
              <dl className="grid grid-cols-2 gap-4">
                <Field label="Member ID" value={d.subscriber.memberId} />
                <Field label="Gender" value={d.subscriber.gender} />
                <Field label="First name" value={d.subscriber.firstName} />
                <Field label="Last name" value={d.subscriber.lastName} />
                <Field label="Date of birth" value={d.subscriber.dob} />
              </dl>
            </Card>
          </div>

          <Card>
            <h3 className="text-sm font-semibold text-text mb-3">Benefits</h3>
            {d.groups.length === 0
              ? <p className="text-sm text-text-muted">The payer returned no benefit details.</p>
              : <div className="space-y-3">{d.groups.map(g => <Group key={g.key} g={g} />)}</div>}
          </Card>
        </>
      )}

      <Card>
        <h3 className="text-sm font-semibold text-text mb-3">History</h3>
        {history.length === 0 ? (
          <p className="text-sm text-text-muted">No checks yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-text-muted border-b border-border">
                  {['Requested', 'Completed', 'Status', 'Result', 'Mode', 'Message'].map(h => (
                    <th key={h} className="py-1.5 pr-4 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map(h => (
                  <tr key={h.id} className="border-b border-border/50">
                    <td className="py-1.5 pr-4 whitespace-nowrap">{fmtTime(h.requestedAt)}</td>
                    <td className="py-1.5 pr-4 whitespace-nowrap">{fmtTime(h.completedAt)}</td>
                    <td className="py-1.5 pr-4">{h.status.replace('_', ' ')}</td>
                    <td className="py-1.5 pr-4">{dash(h.outcome)}</td>
                    <td className="py-1.5 pr-4">{h.applicationMode ? <ModeBadge mode={h.applicationMode} /> : '—'}</td>
                    <td className="py-1.5 text-text-muted">{dash(h.message)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
