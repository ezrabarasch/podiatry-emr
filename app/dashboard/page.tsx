'use client'

import { useEffect, useState, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import PageShell from '@/app/components/PageShell'
import Table, { type Column } from '@/app/components/Table'
import Badge from '@/app/components/Badge'
import Button from '@/app/components/Button'

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
  _count: { visits: number }
}

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

const calcAge = (dob: string) =>
  Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25))

export default function DashboardPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [patients, setPatients] = useState<Patient[]>([])
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [facilityId, setFacilityId] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  const isAdmin = session?.user?.role === 'ADMIN'

  useEffect(() => {
    Promise.all([
      fetch('/api/patients').then(r => r.json()),
      fetch('/api/facilities').then(r => r.json()),
    ]).then(([pats, facs]) => {
      setPatients(Array.isArray(pats) ? pats : [])
      setFacilities(Array.isArray(facs) ? facs : [])
      setLoading(false)
    })
  }, [])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return patients.filter(p => {
      if (!showInactive && !p.active) return false
      if (facilityId && p.facility.id !== facilityId) return false
      if (!q) return true
      return (
        `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) ||
        `${p.lastName} ${p.firstName}`.toLowerCase().includes(q) ||
        (p.pccPatientId ?? '').toLowerCase().includes(q)
      )
    })
  }, [patients, search, facilityId, showInactive])

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
    { key: 'type', label: 'Type', render: p => <Badge variant={p.facilityType === 'SNF' ? 'snf' : 'alf'} label={p.facilityType} /> },
  ]

  return (
    <PageShell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-text">Patients</h2>
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
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[220px] max-w-sm px-3 py-2 rounded-lg border border-border text-sm text-text placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        />
        <select
          value={facilityId}
          onChange={e => setFacilityId(e.target.value)}
          className="px-3 py-2 rounded-lg border border-border text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        >
          <option value="">All facilities</option>
          {facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer">
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="h-4 w-4 rounded border-border accent-primary" />
          Show inactive
        </label>
      </div>

      {loading ? (
        <div className="p-8 text-center text-text-muted text-sm">Loading patients...</div>
      ) : (
        <Table columns={columns} rows={filtered} onRowClick={p => router.push(`/patients/${p.id}`)} empty="No patients found." />
      )}
    </PageShell>
  )
}
