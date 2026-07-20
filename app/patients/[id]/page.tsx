'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import PageShell from '@/app/components/PageShell'
import Card from '@/app/components/Card'
import Badge from '@/app/components/Badge'
import Button from '@/app/components/Button'
import Table, { type Column } from '@/app/components/Table'

interface Coverage {
  id: string
  payerName: string
  payerType: string
  memberId: string | null
  isPrimary: boolean
}

interface Patient {
  id: string
  firstName: string
  lastName: string
  dob: string
  facilityType: string
  facility: { name: string }
  pccPatientId: string | null
  roomNumber: string | null
  admissionDate: string | null
  medicareNumber: string | null
  medicaidNumber: string | null
  coverages: Coverage[]
}

interface Visit {
  id: string
  visitDate: string
  visitType: string
  status: string
  provider: { firstName: string; lastName: string; credentials: string | null }
  note: { cptCodes: Array<{ code: string }> } | null
}

const fmt = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
const calcAge = (dob: string) =>
  Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25))

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-text-muted uppercase tracking-wide">{label}</dt>
      <dd className="text-sm text-text mt-0.5">{value}</dd>
    </div>
  )
}

export default function PatientPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const params = useParams()
  const patientId = params.id as string

  const [patient, setPatient] = useState<Patient | null>(null)
  const [visits, setVisits] = useState<Visit[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch(`/api/patients/${patientId}`).then(r => r.json()),
      fetch(`/api/patients/${patientId}/visits`).then(r => r.json()),
    ]).then(([p, v]) => {
      setPatient(p)
      setVisits(Array.isArray(v) ? v : [])
      setLoading(false)
    })
  }, [patientId])

  const canEdit = session?.user?.role === 'PROVIDER' || session?.user?.role === 'ADMIN'

  const handleNewVisit = async () => {
    setCreating(true)
    const res = await fetch(`/api/patients/${patientId}/visits`, { method: 'POST' })
    const visit = await res.json()
    router.push(`/visits/${visit.id}`)
  }

  const columns: Column<Visit>[] = [
    { key: 'date', label: 'Date of Service', render: v => <span className="font-medium text-text">{fmt(v.visitDate)}</span> },
    { key: 'type', label: 'Type', render: v => <span className="text-text-muted capitalize">{v.visitType.replace('_', ' ')}</span> },
    { key: 'provider', label: 'Provider', render: v => (
      <span className="text-text-muted">{v.provider.firstName} {v.provider.lastName}{v.provider.credentials ? `, ${v.provider.credentials}` : ''}</span>
    ) },
    { key: 'cpt', label: 'CPT Codes', render: v => (
      <span className="text-text-muted font-mono text-xs">{v.note?.cptCodes?.length ? v.note.cptCodes.map(c => c.code).join(', ') : '—'}</span>
    ) },
    { key: 'status', label: 'Note', render: v => <Badge variant={v.status === 'signed' ? 'signed' : 'draft'} label={v.status === 'signed' ? 'Signed' : 'Draft'} /> },
  ]

  if (loading) return <PageShell><p className="text-text-muted text-sm">Loading...</p></PageShell>
  if (!patient) return <PageShell><p className="text-text-muted text-sm">Patient not found.</p></PageShell>

  return (
    <PageShell>
      <button onClick={() => router.push('/dashboard')} className="text-sm text-text-muted hover:text-text mb-4">← Patient List</button>

      {/* Patient header */}
      <Card className="mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-text">{patient.lastName}, {patient.firstName}</h2>
            <div className="flex items-center gap-3 mt-2 text-sm text-text-muted">
              <span>DOB: {fmt(patient.dob)} ({calcAge(patient.dob)}y)</span>
              <span>·</span>
              <span>{patient.facility.name}</span>
              <span>·</span>
              <Badge variant={patient.facilityType === 'SNF' ? 'snf' : 'alf'} label={patient.facilityType} />
            </div>
          </div>
          {canEdit && <Button size="lg" onClick={handleNewVisit} loading={creating}>+ New Visit</Button>}
        </div>

        <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-border">
          <Detail label="Room" value={patient.roomNumber ?? '—'} />
          <Detail label="Admitted" value={fmt(patient.admissionDate)} />
          <Detail label="Medicare #" value={patient.medicareNumber ?? '—'} />
          <Detail label="Medicaid #" value={patient.medicaidNumber ?? '—'} />
        </dl>
      </Card>

      {/* Coverage */}
      {patient.coverages.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-text-muted uppercase tracking-wide mb-3">Coverage</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {patient.coverages.map(c => (
              <Card key={c.id} padding="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-text">{c.payerName}</span>
                  {c.isPrimary && <Badge variant="active" label="Primary" />}
                </div>
                <div className="text-xs text-text-muted mt-1">
                  {c.payerType}{c.memberId ? ` · Member ${c.memberId}` : ''}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Visit history */}
      <h3 className="text-sm font-medium text-text-muted uppercase tracking-wide mb-3">Visit History</h3>
      <Table columns={columns} rows={visits} onRowClick={v => router.push(`/visits/${v.id}`)} empty="No visits yet. Click + New Visit to begin." />
    </PageShell>
  )
}
