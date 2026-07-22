'use client'

import { useEffect, useState, useRef } from 'react'
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
  effectiveDate: string | null
  terminationDate: string | null
  isPrimary: boolean
  active: boolean
}

interface Diagnosis {
  id: string
  icd10: string
  description: string
  syncedAt: string
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
  dischargeDate: string | null
  medicareNumber: string | null
  medicaidNumber: string | null
  primaryLanguage: string | null
  gender: string | null
  maritalStatus: string | null
  medicalRecordNumber: string | null
  active: boolean
  coverages: Coverage[]
  diagnoses: Diagnosis[]
}

interface Visit {
  id: string
  visitDate: string
  visitType: string
  status: string
  provider: { firstName: string; lastName: string; credentials: string | null }
  note: { cptCodes: Array<{ code: string }> } | null
}

interface Upload {
  id: string
  fileName: string
  fileLabel: string | null
  mimeType: string
  fileSizeBytes: number
  createdAt: string
  uploadedBy: { firstName: string; lastName: string }
}

const fmt = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
const calcAge = (dob: string) =>
  Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25))
const VISIT_TYPE: Record<string, string> = { new_patient: 'New patient', established: 'Established' }
const initials = (p: Patient) => `${p.firstName[0] ?? ''}${p.lastName[0] ?? ''}`.toUpperCase()
const fmtSize = (b: number) => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`)

const TABS = ['Visits', 'Diagnoses', 'Demos', 'Insurance', 'Medications', 'Uploads', 'Notes'] as const
type Tab = typeof TABS[number]

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-text-muted uppercase tracking-wide">{label}</dt>
      <dd className="text-sm text-text mt-0.5">{value || '—'}</dd>
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
  const [uploads, setUploads] = useState<Upload[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [tab, setTab] = useState<Tab>('Visits')
  const fileInput = useRef<HTMLInputElement>(null)

  const loadUploads = () =>
    fetch(`/api/patients/${patientId}/uploads`).then(r => r.json()).then(u => setUploads(Array.isArray(u) ? u : []))

  useEffect(() => {
    Promise.all([
      fetch(`/api/patients/${patientId}`).then(r => r.json()),
      fetch(`/api/patients/${patientId}/visits`).then(r => r.json()),
      fetch(`/api/patients/${patientId}/uploads`).then(r => r.json()),
    ]).then(([p, v, u]) => {
      setPatient(p)
      setVisits(Array.isArray(v) ? v : [])
      setUploads(Array.isArray(u) ? u : [])
      setLoading(false)
    })
  }, [patientId])

  const role = session?.user?.role
  const canEdit = role === 'PROVIDER' || role === 'ADMIN'

  const handleNewVisit = async () => {
    setCreating(true)
    const res = await fetch(`/api/patients/${patientId}/visits`, { method: 'POST' })
    const visit = await res.json()
    router.push(`/visits/${visit.id}`)
  }

  const handleUpload = async (file: File) => {
    const label = window.prompt('Document name (optional):', file.name.replace(/\.[^.]+$/, '')) ?? undefined
    const body = new FormData()
    body.append('file', file)
    if (label) body.append('label', label)
    await fetch(`/api/patients/${patientId}/uploads`, { method: 'POST', body })
    await loadUploads()
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this document?')) return
    await fetch(`/api/patients/${patientId}/uploads/${id}`, { method: 'DELETE' })
    await loadUploads()
  }

  if (loading) return <PageShell><p className="text-text-muted text-sm">Loading...</p></PageShell>
  if (!patient) return <PageShell><p className="text-text-muted text-sm">Patient not found.</p></PageShell>

  const signed = visits.filter(v => v.status === 'signed').length
  const lastVisit = visits[0]
  const syncedDate = patient.diagnoses[0] ? fmt(patient.diagnoses[0].syncedAt) : '—'

  const visitColumns: Column<Visit>[] = [
    { key: 'date', label: 'Date of Service', render: v => <span className="font-medium text-text">{fmt(v.visitDate)}</span> },
    { key: 'practice', label: 'Practice', render: () => <span className="text-text-muted">Q-Med Podiatry</span> },
    { key: 'service', label: 'Service', render: () => <span className="text-text-muted">Podiatry</span> },
    { key: 'type', label: 'Visit Type', render: v => <span className="text-text-muted">{VISIT_TYPE[v.visitType] ?? v.visitType}</span> },
    { key: 'provider', label: 'Provider', render: v => (
      <span className="text-text-muted">{v.provider.firstName} {v.provider.lastName}{v.provider.credentials ? `, ${v.provider.credentials}` : ''}</span>
    ) },
    { key: 'cpt', label: 'CPT Codes', render: v => (
      <span className="text-text-muted font-mono text-xs">{v.status === 'signed' && v.note?.cptCodes?.length ? v.note.cptCodes.map(c => c.code).join(', ') : '—'}</span>
    ) },
    { key: 'status', label: 'Status', render: v => <Badge variant={v.status === 'signed' ? 'signed' : 'draft'} label={v.status === 'signed' ? 'Signed' : 'Draft'} /> },
    { key: 'action', label: '', render: v => <span className="text-primary font-medium">{v.status === 'signed' ? 'View →' : 'Continue →'}</span> },
  ]

  return (
    <PageShell breadcrumb={[{ label: 'Patients', href: '/dashboard' }, { label: `${patient.lastName}, ${patient.firstName}` }]}>
      {/* Header card */}
      <Card className="mb-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="h-14 w-14 rounded-full flex items-center justify-center text-lg font-bold text-white flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, var(--primary), var(--secondary))' }}>
              {initials(patient)}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-text">{patient.lastName}, {patient.firstName}</h1>
              <div className="flex flex-wrap items-center gap-2 mt-1.5 text-sm text-text-muted">
                <span>DOB {fmt(patient.dob)} ({calcAge(patient.dob)}y)</span>
                <span>·</span>
                <span>{patient.facility.name}</span>
                <Badge variant={patient.facilityType === 'SNF' ? 'snf' : 'alf'} label={patient.facilityType} />
                <Badge variant={patient.active ? 'active' : 'inactive'} label={patient.active ? 'Active' : 'Inactive'} />
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-text-muted">
                <span>Room {patient.roomNumber ?? '—'}</span>
                <span>·</span>
                <span>Admitted {fmt(patient.admissionDate)}</span>
                <span>·</span>
                <span>MRN {patient.pccPatientId ?? '—'}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button variant="secondary" onClick={() => window.print()}>Export PDF</Button>
            {canEdit && <Button onClick={handleNewVisit} loading={creating}>+ New Visit</Button>}
          </div>
        </div>
      </Card>

      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        <Card padding="p-0">
          <div className="flex divide-x divide-border">
            <div className="flex-1 p-4">
              <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Total Visits</p>
              <p className="text-2xl font-bold text-text mt-1">{visits.length}</p>
              <p className="text-xs text-text-muted mt-0.5">{signed} signed · {visits.length - signed} draft</p>
            </div>
            <div className="flex-1 p-4">
              <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Last Visit</p>
              <p className="text-lg font-semibold text-text mt-1">{lastVisit ? fmt(lastVisit.visitDate) : '—'}</p>
              <p className="text-xs text-text-muted mt-0.5">{lastVisit ? `${VISIT_TYPE[lastVisit.visitType] ?? lastVisit.visitType} · ${lastVisit.status === 'signed' ? 'Signed' : 'Draft'}` : 'No visits yet'}</p>
            </div>
          </div>
        </Card>

        <Card padding="p-4">
          <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Allergies</p>
          {/* ponytail: allergy data not in schema yet; red-tag rendering ready for ETL, no fabricated allergens shown */}
          <p className="text-sm text-text-muted mt-2">None on file</p>
        </Card>

        <Card padding="p-4">
          <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Active Diagnoses</p>
          <p className="text-2xl font-bold text-text mt-1">{patient.diagnoses.length}</p>
          <p className="text-xs text-text-muted mt-0.5">From PCC · synced {syncedDate}</p>
        </Card>
      </div>

      {/* Tabs */}
      <div className="border-b border-border mb-5 flex gap-6 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              tab === t ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'Visits' && (
        <Table columns={visitColumns} rows={visits} onRowClick={v => router.push(`/visits/${v.id}`)} empty="No visits yet." />
      )}

      {tab === 'Diagnoses' && (
        <Card padding="p-0">
          {patient.diagnoses.length === 0 ? (
            <div className="p-8 text-center text-text-muted text-sm">No diagnoses on file</div>
          ) : (
            <ul>
              {patient.diagnoses.map(d => (
                <li key={d.id} className="flex items-center gap-4 px-5 py-3 border-b border-[#F1F5F9] last:border-0">
                  <span className="font-mono text-xs font-semibold px-2 py-1 rounded bg-[#DBEAFE] text-[#1D4ED8]">{d.icd10}</span>
                  <span className="flex-1 text-sm text-text">{d.description}</span>
                  <span className="text-xs text-text-muted">PCC · Active</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === 'Demos' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <h3 className="text-sm font-semibold text-text mb-4">Personal Information</h3>
            <dl className="grid grid-cols-2 gap-4">
              <Detail label="Full Name" value={`${patient.firstName} ${patient.lastName}`} />
              <Detail label="Date of Birth" value={fmt(patient.dob)} />
              <Detail label="Gender" value={patient.gender} />
              <Detail label="Marital Status" value={patient.maritalStatus} />
              <Detail label="Language" value={patient.primaryLanguage} />
              <Detail label="MRN" value={patient.medicalRecordNumber ?? patient.pccPatientId} />
            </dl>
          </Card>
          <Card>
            <h3 className="text-sm font-semibold text-text mb-4">Contact & Address</h3>
            <dl className="grid grid-cols-2 gap-4">
              <Detail label="Address" value="—" />
              <Detail label="City / State" value="—" />
              <Detail label="Phone" value="—" />
              <Detail label="Email" value="—" />
              <Detail label="Emergency Contact" value="—" />
              <Detail label="EC Phone" value="—" />
            </dl>
          </Card>
          <Card>
            <h3 className="text-sm font-semibold text-text mb-4">Facility & Admission</h3>
            <dl className="grid grid-cols-2 gap-4">
              <Detail label="Facility" value={patient.facility.name} />
              <Detail label="Type" value={<Badge variant={patient.facilityType === 'SNF' ? 'snf' : 'alf'} label={patient.facilityType} />} />
              <Detail label="Room" value={patient.roomNumber} />
              <Detail label="Admission Date" value={fmt(patient.admissionDate)} />
              <Detail label="Discharge Date" value={fmt(patient.dischargeDate)} />
              <Detail label="Status" value={<Badge variant={patient.active ? 'active' : 'inactive'} label={patient.active ? 'Active' : 'Inactive'} />} />
            </dl>
          </Card>
          <Card>
            <h3 className="text-sm font-semibold text-text mb-4">Insurance Numbers</h3>
            <dl className="grid grid-cols-2 gap-4">
              <Detail label="Medicare #" value={patient.medicareNumber} />
              <Detail label="Medicaid #" value={patient.medicaidNumber} />
            </dl>
          </Card>
        </div>
      )}

      {tab === 'Insurance' && (
        patient.coverages.length === 0 ? (
          <Card><p className="text-center text-text-muted text-sm py-6">No insurance records on file</p></Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {patient.coverages.map(c => (
              <div
                key={c.id}
                className="bg-surface rounded-xl border border-border border-l-4 p-5"
                style={{ borderLeftColor: c.isPrimary ? 'var(--primary)' : 'var(--secondary)' }}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-text">{c.payerName}</span>
                  <Badge variant={c.isPrimary ? 'medicare' : 'inactive'} label={c.isPrimary ? 'Primary' : 'Secondary'} />
                </div>
                <dl className="grid grid-cols-2 gap-3">
                  <Detail label="Member ID" value={c.memberId} />
                  <Detail label="Status" value={<Badge variant={c.active ? 'active' : 'inactive'} label={c.active ? 'Active' : 'Inactive'} />} />
                  <Detail label="Effective" value={fmt(c.effectiveDate)} />
                  <Detail label="Termination" value={fmt(c.terminationDate)} />
                </dl>
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'Medications' && (
        <Card>
          <div className="py-16 text-center">
            <div className="text-4xl mb-3">💊</div>
            <h3 className="text-lg font-semibold text-text">Medications coming soon</h3>
            <p className="text-sm text-text-muted mt-1 max-w-md mx-auto">Medication data will appear here once the PCC ETL pipeline is expanded to include medication records.</p>
          </div>
        </Card>
      )}

      {tab === 'Uploads' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-text">Patient Documents</h3>
            {canEdit && (
              <>
                <input ref={fileInput} type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = '' }} />
                <Button onClick={() => fileInput.current?.click()}>⬆ Upload File</Button>
              </>
            )}
          </div>
          <Card padding="p-0">
            {uploads.length === 0 ? (
              <div className="p-8 text-center text-text-muted text-sm">No documents uploaded yet</div>
            ) : (
              <ul>
                {uploads.map(u => (
                  <li key={u.id} className="flex items-center gap-3 px-5 py-3 border-b border-[#F1F5F9] last:border-0">
                    <span className="text-xl">📄</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text truncate">{u.fileLabel || u.fileName}</p>
                      <p className="text-xs text-text-muted">{u.mimeType} · {fmtSize(u.fileSizeBytes)} · {u.uploadedBy.firstName} {u.uploadedBy.lastName} · {fmt(u.createdAt)}</p>
                    </div>
                    <a href={`/api/patients/${patientId}/uploads/${u.id}`} className="text-sm text-primary font-medium">Download</a>
                    {canEdit && <button onClick={() => handleDelete(u.id)} className="text-sm text-danger font-medium">Delete</button>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {tab === 'Notes' && (
        <Card>
          <div className="py-16 text-center">
            <div className="text-4xl mb-3">📝</div>
            <h3 className="text-lg font-semibold text-text">Clinical notes coming soon</h3>
            <p className="text-sm text-text-muted mt-1 max-w-md mx-auto">Free-text clinical notes will be available in a future update.</p>
          </div>
        </Card>
      )}
    </PageShell>
  )
}
