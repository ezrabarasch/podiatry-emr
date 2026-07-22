'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import PageShell from '@/app/components/PageShell'
import Table, { type Column } from '@/app/components/Table'
import Button from '@/app/components/Button'

const PAGE_SIZE = 25

interface Facility {
  id: string
  name: string
  facilityType: string
}

interface Patient {
  id: string
  firstName: string
  lastName: string
  dob: string
  facilityType: string
  facility: Facility
  pccPatientId: string | null
  roomNumber: string | null
  admissionDate: string | null
  active: boolean
  coverages: { payerType: string }[]
  _count: { visits: number }
}

const PAYER_LABELS: Record<string, string> = {
  MEDICARE: 'Medicare', MEDICAID: 'Medicaid', COMMERCIAL: 'Commercial', OTHER: 'Other',
}

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

const calcAge = (dob: string) =>
  Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25))

export default function DashboardPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [patients, setPatients] = useState<Patient[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [facilityId, setFacilityId] = useState('')
  const [payerType, setPayerType] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  const isAdmin = session?.user?.role === 'ADMIN'

  useEffect(() => {
    fetch('/api/facilities').then(r => r.json()).then(facs => setFacilities(Array.isArray(facs) ? facs : []))
  }, [])

  // Fetch the current page whenever filters or the page change (debounced for typing).
  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) })
    if (search.trim()) params.set('q', search.trim())
    if (facilityId) params.set('facilityId', facilityId)
    if (payerType) params.set('payerType', payerType)
    if (showInactive) params.set('includeInactive', 'true')

    const t = setTimeout(() => {
      setLoading(true)
      fetch(`/api/patients?${params}`).then(r => r.json()).then(data => {
        setPatients(Array.isArray(data.patients) ? data.patients : [])
        setTotal(data.total ?? 0)
        setLoading(false)
      })
    }, 250)
    return () => clearTimeout(t)
  }, [page, search, facilityId, payerType, showInactive])

  // Changing any filter resets to page 1.
  const onFilter = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setPage(1) }

  // Payer options are a fixed set; coverage data may not be synced yet.
  const payerOptions = Object.keys(PAYER_LABELS)

  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const to = Math.min(page * PAGE_SIZE, total)
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const columns: Column<Patient>[] = [
    { key: 'name', label: 'Patient', render: p => (
      <span className="font-medium text-text">{p.lastName}, {p.firstName}{!p.active && <span className="ml-2 text-xs text-text-muted">(inactive)</span>}</span>
    ) },
    { key: 'dob', label: 'DOB / Age', render: p => (
      <span className="text-text-muted">{fmtDate(p.dob)} ({calcAge(p.dob)}y)</span>
    ) },
    { key: 'facility', label: 'Facility', render: p => <span className="text-text-muted">{p.facility.name}</span> },
    { key: 'room', label: 'Room', render: p => <span className="text-text-muted">{p.roomNumber ?? '—'}</span> },
    { key: 'admission', label: 'Admitted', render: p => <span className="text-text-muted">{fmtDate(p.admissionDate)}</span> },
    { key: 'visits', label: 'Visits', render: p => <span className="text-text-muted">{p._count.visits}</span> },
  ]

  return (
    <PageShell breadcrumb={[{ label: 'Patients' }]}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-text">Patients</h2>
          <p className="text-sm text-text-muted mt-0.5">Select a patient to begin or continue a visit</p>
        </div>
        {isAdmin && (
          <Button size="lg" onClick={() => router.push('/patients/new')}>+ Add Patient</Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          type="text"
          placeholder="Search by name or MRN..."
          value={search}
          onChange={e => onFilter(setSearch)(e.target.value)}
          className="flex-1 min-w-[220px] max-w-[320px] px-3 py-2 rounded-lg border border-border text-sm text-text placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        />
        <select
          value={facilityId}
          onChange={e => onFilter(setFacilityId)(e.target.value)}
          className="px-3 py-2 rounded-lg border border-border text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        >
          <option value="">All facilities</option>
          {facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <select
          value={payerType}
          onChange={e => onFilter(setPayerType)(e.target.value)}
          className="px-3 py-2 rounded-lg border border-border text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        >
          <option value="">All payers</option>
          {payerOptions.map(pt => <option key={pt} value={pt}>{PAYER_LABELS[pt] ?? pt}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer">
          <input type="checkbox" checked={showInactive} onChange={e => onFilter(setShowInactive)(e.target.checked)} className="h-4 w-4 rounded border-border accent-primary" />
          Show inactive
        </label>
      </div>

      {loading ? (
        <div className="p-8 text-center text-text-muted text-sm">Loading patients...</div>
      ) : (
        <>
          <Table columns={columns} rows={patients} onRowClick={p => router.push(`/patients/${p.id}`)} empty="No patients found." />
          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-text-muted">Showing {from}-{to} of {total} patients</p>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
              <span className="text-sm text-text-muted">Page {page} of {totalPages}</span>
              <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        </>
      )}
    </PageShell>
  )
}
