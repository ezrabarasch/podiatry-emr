'use client'

import { useCallback, useEffect, useState } from 'react'
import Card from '@/app/components/Card'
import Button from '@/app/components/Button'

interface Summary {
  outcome: string
  payer_name: string | null
  plan_name: string | null
  group_number: string | null
  plan_begin: string | null
  plan_end: string | null
  copay: number | null
  coinsurance_pct: number | null
  deductible: number | null
}

interface Check {
  id: string
  status: 'pending' | 'processing' | 'done' | 'error' | 'needs_review'
  outcome: string | null
  message: string | null
  summary: Summary | null
  completedAt: string | null
  applicationMode: string | null
}

const money = (n: number | null) => (n == null ? '—' : `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`)

function banner(c: Check | null): { text: string; cls: string } {
  if (!c) return { text: 'Not checked yet', cls: 'bg-slate-100 text-slate-600' }
  if (c.status === 'pending' || c.status === 'processing') return { text: 'Checking eligibility…', cls: 'bg-blue-50 text-blue-700' }
  if (c.status === 'error') return { text: 'Eligibility check failed', cls: 'bg-red-50 text-red-700' }
  if (c.status === 'needs_review') return { text: 'Needs manual review', cls: 'bg-amber-50 text-amber-800' }
  return c.outcome === 'active'
    ? { text: 'Coverage active', cls: 'bg-green-50 text-green-700' }
    : { text: 'Coverage inactive', cls: 'bg-red-50 text-red-700' }
}

export default function EligibilityCard({ patientId }: { patientId: string }) {
  const [check, setCheck] = useState<Check | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    fetch(`/api/patients/${patientId}/eligibility`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (d) setCheck(d.check)
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
      if (r.ok) setCheck((await r.json()).check)
    } finally {
      setBusy(false)
    }
  }

  if (!loaded) return null
  const b = banner(check)
  const s = check?.status === 'done' ? check.summary : null

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text">Eligibility (Stedi)</h3>
        <Button size="sm" variant="secondary" onClick={recheck} loading={busy} disabled={inFlight}>Re-check</Button>
      </div>
      <div className={`rounded-lg px-3 py-2 text-sm font-medium ${b.cls}`}>{b.text}</div>
      {check?.message && check.status !== 'done' && <p className="text-sm text-text-muted mt-2">{check.message}</p>}
      {s && (
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-sm">
          <div><dt className="text-text-muted text-xs">Payer</dt><dd>{s.payer_name ?? '—'}</dd></div>
          <div><dt className="text-text-muted text-xs">Plan</dt><dd>{s.plan_name ?? '—'}</dd></div>
          <div><dt className="text-text-muted text-xs">Group #</dt><dd>{s.group_number ?? '—'}</dd></div>
          <div><dt className="text-text-muted text-xs">Plan dates</dt><dd>{s.plan_begin ?? '—'} → {s.plan_end ?? 'open'}</dd></div>
          <div><dt className="text-text-muted text-xs">Copay</dt><dd>{money(s.copay)}</dd></div>
          <div><dt className="text-text-muted text-xs">Coinsurance</dt><dd>{s.coinsurance_pct == null ? '—' : `${s.coinsurance_pct}%`}</dd></div>
          <div><dt className="text-text-muted text-xs">Deductible</dt><dd>{money(s.deductible)}</dd></div>
        </dl>
      )}
      {check?.completedAt && (
        <p className="text-xs text-text-muted mt-3">
          Last checked {new Date(check.completedAt).toLocaleString()}
          {check.applicationMode === 'test' && ' · Stedi TEST data'}
        </p>
      )}
    </Card>
  )
}
