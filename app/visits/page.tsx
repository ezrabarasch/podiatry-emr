'use client'

import { useEffect, useState, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import PageShell from '@/app/components/PageShell'
import Table, { type Column } from '@/app/components/Table'
import Badge from '@/app/components/Badge'
import Button from '@/app/components/Button'

interface Visit {
  id: string
  visitDate: string
  visitType: string
  status: string
  patient: { id: string; firstName: string; lastName: string; dob: string; facility: { name: string } }
  provider: { id: string; firstName: string; lastName: string; credentials: string | null }
}

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

const VISIT_TYPE_LABELS: Record<string, string> = { new_patient: 'New patient', established: 'Established' }

const inputCls = 'px-3 py-2 rounded-lg border border-border text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent'

export default function VisitsPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [visits, setVisits] = useState<Visit[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [providerId, setProviderId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const canExport = session?.user?.role === 'ADMIN' || session?.user?.role === 'PROVIDER'

  useEffect(() => {
    fetch('/api/visits')
      .then(r => r.json())
      .then(data => {
        setVisits(Array.isArray(data) ? data : [])
        setLoading(false)
      })
  }, [])

  const providers = useMemo(() => {
    const map = new Map<string, Visit['provider']>()
    visits.forEach(v => map.set(v.provider.id, v.provider))
    return [...map.values()].sort((a, b) => a.lastName.localeCompare(b.lastName))
  }, [visits])

  const filtered = useMemo(() => visits.filter(v => {
    if (status && v.status !== status) return false
    if (providerId && v.provider.id !== providerId) return false
    const d = v.visitDate.slice(0, 10)
    if (from && d < from) return false
    if (to && d > to) return false
    return true
  }), [visits, status, providerId, from, to])

  const columns: Column<Visit>[] = [
    { key: 'patient', label: 'Patient', render: v => (
      <span className="font-medium text-text">{v.patient.lastName}, {v.patient.firstName}</span>
    ) },
    { key: 'facility', label: 'Facility', render: v => <span className="text-text-muted">{v.patient.facility.name}</span> },
    { key: 'visitDate', label: 'Visit Date', render: v => <span className="text-text-muted">{fmtDate(v.visitDate)}</span> },
    { key: 'visitType', label: 'Type', render: v => <span className="text-text-muted">{VISIT_TYPE_LABELS[v.visitType] ?? v.visitType}</span> },
    { key: 'provider', label: 'Provider', render: v => (
      <span className="text-text-muted">{v.provider.firstName} {v.provider.lastName}{v.provider.credentials ? `, ${v.provider.credentials}` : ''}</span>
    ) },
    { key: 'status', label: 'Status', render: v => (
      <Badge variant={v.status === 'signed' ? 'signed' : 'draft'} label={v.status === 'signed' ? 'Signed' : 'Draft'} />
    ) },
  ]

  const exportCsv = () => {
    const params = new URLSearchParams()
    if (status) params.set('status', status)
    if (providerId) params.set('providerId', providerId)
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    window.location.assign(`/api/visits/export?${params.toString()}`)
  }

  return (
    <PageShell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-text">Visits</h2>
          <p className="text-sm text-text-muted mt-0.5">All visits across patients</p>
        </div>
        {canExport && <Button size="lg" variant="ghost" onClick={exportCsv}>Export CSV</Button>}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select value={status} onChange={e => setStatus(e.target.value)} className={inputCls}>
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="signed">Signed</option>
        </select>
        <select value={providerId} onChange={e => setProviderId(e.target.value)} className={inputCls}>
          <option value="">All providers</option>
          {providers.map(p => (
            <option key={p.id} value={p.id}>{p.firstName} {p.lastName}{p.credentials ? `, ${p.credentials}` : ''}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-text-muted">
          From <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inputCls} />
        </label>
        <label className="flex items-center gap-2 text-sm text-text-muted">
          To <input type="date" value={to} onChange={e => setTo(e.target.value)} className={inputCls} />
        </label>
      </div>

      {loading ? (
        <div className="p-8 text-center text-text-muted text-sm">Loading visits...</div>
      ) : (
        <Table columns={columns} rows={filtered} onRowClick={v => router.push(`/visits/${v.id}`)} empty="No visits found." />
      )}
    </PageShell>
  )
}
