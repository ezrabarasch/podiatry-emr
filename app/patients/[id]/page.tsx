'use client'

import { useEffect, useState, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import PageShell from '@/app/components/PageShell'
import Card from '@/app/components/Card'
import Badge from '@/app/components/Badge'
import Button from '@/app/components/Button'
import Table, { type Column } from '@/app/components/Table'
import Pagination, { usePaged } from '@/app/components/Pagination'

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
  active: boolean
  syncedAt: string
}

interface Patient {
  id: string
  firstName: string
  lastName: string
  dob: string
  facilityType: string
  facility: { name: string; practice?: { name: string } | null }
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
  // Summary only — the tabs page their own data.
  diagnoses: { syncedAt: string }[]
  visits: { visitDate: string; visitType: string | null; status: string }[]
  _count: { visits: number; diagnoses: number }
  signedVisitCount: number
  availableServiceTypes: string[]
}

interface Visit {
  id: string
  visitDate: string
  visitType: string | null
  careflowType: string
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

interface Medication {
  id: string
  description: string
  status: string | null
  strength: string | null
  strengthUOM: string | null
  directions: string | null
  startDate: string | null
  endDate: string | null
}

interface Allergy {
  id: string
  allergen: string
  severity: string | null
}

interface Contact {
  id: string
  firstName: string | null
  lastName: string | null
  relationship: string | null
  contactType: string | null
  homePhone: string | null
  cellPhone: string | null
  officePhone: string | null
}

interface Observation {
  id: string
  type: string
  value: number | null
  diastolicValue: number | null
  systolicValue: number | null
  unit: string | null
  method: string | null
  recordedDate: string
  recordedBy: string | null
}

interface Immunization {
  id: string
  immunization: string | null
  administrationDateTime: string | null
  lotNumber: string | null
  manufacturerName: string | null
  given: boolean
}

interface Practitioner {
  id: string
  firstName: string | null
  lastName: string | null
  providerType: string | null
  relation: string | null
  npi: string | null
}

interface AdtRecord {
  id: string
  actionType: string | null
  effectiveDateTime: string | null
  roomDesc: string | null
  bedDesc: string | null
  unitDesc: string | null
  floorDesc: string | null
  payerName: string | null
  transferReason: string | null
  dischargeStatus: string | null
}

interface EpisodeOfCare {
  id: string
  name: string | null
  type: string | null
  status: string | null
  startDate: string | null
  endDate: string | null
  payerName: string | null
  model: string | null
}

interface DiagnosticReport {
  id: string
  reportName: string | null
  reportType: string | null
  reportStatus: string | null
  category: string | null
  effectiveDateTime: string | null
  orderingPractitioner: string | null
}

interface CarePlan {
  id: string
  status: string | null
  createdDate: string | null
  nextReviewDate: string | null
  closedDate: string | null
  closureReason: string | null
}

interface TherapyTrack {
  id: string
  discipline: string | null
  startOfCareDate: string | null
  certificationStartDate: string | null
  certificationEndDate: string | null
  treatmentFreqPerWeek: string | null
  therapyProvider: string | null
  medicalDiagnosis: string | null
  treatmentDiagnosis: string | null
}

const fmt = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
const calcAge = (dob: string) =>
  Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25))
const VISIT_TYPE: Record<string, string> = { new_patient: 'New patient', established: 'Established' }
const humanizeCareflowType = (t: string) => t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
const initials = (p: Patient) => `${p.firstName[0] ?? ''}${p.lastName[0] ?? ''}`.toUpperCase()
const fmtSize = (b: number) => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`)

// Observation types are stored as codes (O2_SAT, HEART_RATE, …).
const obsType = (t: string) => t.replace(/_/g, ' ')
const obsValue = (o: Observation) =>
  o.type === 'BP'
    ? [o.systolicValue, o.diastolicValue].every(v => v !== null)
      ? `${o.systolicValue}/${o.diastolicValue}`
      : '—'
    : o.value !== null ? String(o.value) : '—'

const MAX_ALLERGY_TAGS = 5

// Avoids flashing an empty state while the first page is in flight.
const emptyText = (loading: boolean, text: string) => (loading ? 'Loading...' : text)

const TABS = [
  'Visits', 'Admissions', 'Diagnoses', 'Vitals', 'Demos', 'Insurance',
  'Providers', 'Medications', 'Immunizations', 'Reports', 'Care Plans',
  'Therapy', 'Uploads', 'Notes',
] as const
type Tab = typeof TABS[number]

// Care plan status is free text from PCC; anything unrecognised reads as inactive.
const CARE_PLAN_VARIANT: Record<string, 'active' | 'inactive' | 'completed'> = {
  active: 'active',
  inactive: 'inactive',
  completed: 'completed',
}

// Two-part cells (room/bed, floor/unit) collapse to '—' only when both are empty.
const pair = (a: string | null, b: string | null) => [a, b].filter(Boolean).join(' / ') || '—'

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
  const [uploads, setUploads] = useState<Upload[]>([])
  const [allergies, setAllergies] = useState<Allergy[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showServiceTypeMenu, setShowServiceTypeMenu] = useState(false)
  const [serviceTypeNotice, setServiceTypeNotice] = useState('')
  const [tab, setTab] = useState<Tab>('Visits')
  const fileInput = useRef<HTMLInputElement>(null)

  // Each paginated tab fetches only while it is the active tab.
  const on = (t: Tab, path: string) => (tab === t ? `/api/patients/${patientId}/${path}` : null)
  const visits = usePaged<Visit>(on('Visits', 'visits'), 'visits')
  const diagnoses = usePaged<Diagnosis>(on('Diagnoses', 'diagnoses'), 'diagnoses')
  const vitals = usePaged<Observation>(on('Vitals', 'observations'), 'observations')
  const providers = usePaged<Practitioner>(on('Providers', 'practitioners'), 'practitioners')
  const medications = usePaged<Medication>(on('Medications', 'medications'), 'medications')
  const immunizations = usePaged<Immunization>(on('Immunizations', 'immunizations'), 'immunizations')
  // Admissions shows ADT records and episodes of care as two sections of one tab.
  const adt = usePaged<AdtRecord>(on('Admissions', 'adt'), 'adt')
  const episodes = usePaged<EpisodeOfCare>(on('Admissions', 'episodes-of-care'), 'episodesOfCare')
  const reports = usePaged<DiagnosticReport>(on('Reports', 'diagnostic-reports'), 'diagnosticReports')
  const carePlans = usePaged<CarePlan>(on('Care Plans', 'care-plans'), 'carePlans')
  const therapy = usePaged<TherapyTrack>(on('Therapy', 'therapy'), 'therapy')

  const loadUploads = () =>
    fetch(`/api/patients/${patientId}/uploads`).then(r => r.json()).then(u => setUploads(Array.isArray(u) ? u : []))

  useEffect(() => {
    const json = (path: string) => fetch(`/api/patients/${patientId}${path}`).then(r => r.json())
    Promise.all([
      json(''),
      json('/uploads'),
      json('/allergies'),
      json('/contacts'),
    ]).then(([p, u, a, c]) => {
      setPatient(p)
      setUploads(Array.isArray(u) ? u : [])
      setAllergies(Array.isArray(a) ? a : [])
      setContacts(Array.isArray(c) ? c : [])
      setLoading(false)
    })
  }, [patientId])

  const role = session?.user?.role
  const canEdit = role === 'PROVIDER' || role === 'ADMIN'

  const createVisit = async (careflowType: string) => {
    setShowServiceTypeMenu(false)
    setServiceTypeNotice('')
    setCreating(true)
    const res = await fetch(`/api/patients/${patientId}/visits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ careflowType }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setServiceTypeNotice(data.error ?? 'Failed to create visit')
      setCreating(false)
      return
    }
    const visit = await res.json()
    router.push(`/visits/${visit.id}`)
  }

  const handleNewVisit = () => {
    setServiceTypeNotice('')
    const types = patient?.availableServiceTypes ?? []
    if (types.length === 0) {
      setServiceTypeNotice("No service types available — assign a practice with service types to this patient's facility first.")
      return
    }
    if (types.length === 1) {
      createVisit(types[0])
      return
    }
    setShowServiceTypeMenu(v => !v)
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

  const totalVisits = patient._count.visits
  const signed = patient.signedVisitCount
  const lastVisit = patient.visits[0]
  const syncedDate = patient.diagnoses[0] ? fmt(patient.diagnoses[0].syncedAt) : '—'

  const ec = contacts.find(c => /emerg/i.test(c.contactType ?? '') || /emerg/i.test(c.relationship ?? ''))
  const ecName = ec ? [ec.firstName, ec.lastName].filter(Boolean).join(' ') : ''
  const ecPhone = ec ? (ec.homePhone ?? ec.cellPhone ?? ec.officePhone ?? '') : ''

  const visitColumns: Column<Visit>[] = [
    { key: 'date', label: 'Date of Service', render: v => <span className="font-medium text-text">{fmt(v.visitDate)}</span> },
    { key: 'practice', label: 'Practice', render: () => <span className="text-text-muted">{patient.facility.practice?.name ?? '—'}</span> },
    { key: 'service', label: 'Service', render: v => <span className="text-text-muted">{v.careflowType ? humanizeCareflowType(v.careflowType) : '—'}</span> },
    { key: 'type', label: 'Visit Type', render: v => <span className="text-text-muted">{v.visitType ? (VISIT_TYPE[v.visitType] ?? v.visitType) : '—'}</span> },
    { key: 'provider', label: 'Provider', render: v => (
      <span className="text-text-muted">{v.provider.firstName} {v.provider.lastName}{v.provider.credentials ? `, ${v.provider.credentials}` : ''}</span>
    ) },
    { key: 'cpt', label: 'CPT Codes', render: v => (
      <span className="text-text-muted font-mono text-xs">{v.status === 'signed' && v.note?.cptCodes?.length ? v.note.cptCodes.map(c => c.code).join(', ') : '—'}</span>
    ) },
    { key: 'status', label: 'Status', render: v => <Badge variant={v.status === 'signed' ? 'signed' : 'draft'} label={v.status === 'signed' ? 'Signed' : 'Draft'} /> },
    { key: 'action', label: '', render: v => <span className="text-primary font-medium">{v.status === 'signed' ? 'View →' : 'Continue →'}</span> },
  ]

  const medColumns: Column<Medication>[] = [
    { key: 'name', label: 'Medication', render: m => <span className="font-medium text-text">{m.description}</span> },
    { key: 'strength', label: 'Strength', render: m => <span className="text-text-muted">{[m.strength, m.strengthUOM].filter(Boolean).join(' ') || '—'}</span> },
    { key: 'directions', label: 'Directions', render: m => <span className="text-text-muted">{m.directions ?? '—'}</span> },
    { key: 'status', label: 'Status', render: m => <span className="text-text-muted capitalize">{m.status ?? '—'}</span> },
    { key: 'start', label: 'Start', render: m => <span className="text-text-muted">{fmt(m.startDate)}</span> },
    { key: 'end', label: 'End', render: m => <span className="text-text-muted">{fmt(m.endDate)}</span> },
  ]

  const vitalColumns: Column<Observation>[] = [
    { key: 'date', label: 'Date', render: o => <span className="font-medium text-text">{fmt(o.recordedDate)}</span> },
    { key: 'type', label: 'Type', render: o => <span className="text-text-muted capitalize">{obsType(o.type)}</span> },
    { key: 'value', label: 'Value', render: o => <span className="text-text font-medium">{obsValue(o)}</span> },
    { key: 'unit', label: 'Unit', render: o => <span className="text-text-muted">{o.unit ?? '—'}</span> },
    { key: 'by', label: 'Recorded By', render: o => <span className="text-text-muted">{o.recordedBy ?? '—'}</span> },
  ]

  const immunizationColumns: Column<Immunization>[] = [
    { key: 'vaccine', label: 'Vaccine', render: i => <span className="font-medium text-text">{i.immunization ?? '—'}</span> },
    { key: 'date', label: 'Date Administered', render: i => <span className="text-text-muted">{fmt(i.administrationDateTime)}</span> },
    { key: 'lot', label: 'Lot Number', render: i => <span className="text-text-muted font-mono text-xs">{i.lotNumber ?? '—'}</span> },
    { key: 'manufacturer', label: 'Manufacturer', render: i => <span className="text-text-muted">{i.manufacturerName ?? '—'}</span> },
    { key: 'given', label: 'Given', render: i => (
      i.given ? <span className="text-success font-semibold">✓</span> : <span className="text-text-muted">—</span>
    ) },
  ]

  const providerColumns: Column<Practitioner>[] = [
    { key: 'name', label: 'Name', render: p => (
      <span className="font-medium text-text">{[p.firstName, p.lastName].filter(Boolean).join(' ') || '—'}</span>
    ) },
    { key: 'type', label: 'Type', render: p => <span className="text-text-muted">{p.providerType ?? '—'}</span> },
    { key: 'relation', label: 'Relation', render: p => <span className="text-text-muted">{p.relation ?? '—'}</span> },
    { key: 'npi', label: 'NPI', render: p => <span className="text-text-muted font-mono text-xs">{p.npi ?? '—'}</span> },
  ]

  const adtColumns: Column<AdtRecord>[] = [
    { key: 'date', label: 'Date', render: r => <span className="font-medium text-text">{fmt(r.effectiveDateTime)}</span> },
    { key: 'action', label: 'Action Type', render: r => <span className="text-text-muted">{r.actionType ?? '—'}</span> },
    { key: 'room', label: 'Room / Bed', render: r => <span className="text-text-muted">{pair(r.roomDesc, r.bedDesc)}</span> },
    { key: 'floor', label: 'Floor / Unit', render: r => <span className="text-text-muted">{pair(r.floorDesc, r.unitDesc)}</span> },
    { key: 'payer', label: 'Payer', render: r => <span className="text-text-muted">{r.payerName ?? '—'}</span> },
    { key: 'reason', label: 'Transfer Reason / Discharge Status', render: r => (
      <span className="text-text-muted">{r.transferReason ?? r.dischargeStatus ?? '—'}</span>
    ) },
  ]

  const episodeColumns: Column<EpisodeOfCare>[] = [
    { key: 'name', label: 'Name', render: e => <span className="font-medium text-text">{e.name ?? '—'}</span> },
    { key: 'type', label: 'Type', render: e => <span className="text-text-muted">{e.type ?? '—'}</span> },
    { key: 'status', label: 'Status', render: e => <span className="text-text-muted capitalize">{e.status ?? '—'}</span> },
    { key: 'start', label: 'Start Date', render: e => <span className="text-text-muted">{fmt(e.startDate)}</span> },
    { key: 'end', label: 'End Date', render: e => <span className="text-text-muted">{fmt(e.endDate)}</span> },
    { key: 'payer', label: 'Payer', render: e => <span className="text-text-muted">{e.payerName ?? '—'}</span> },
    { key: 'model', label: 'Model', render: e => <span className="text-text-muted">{e.model ?? '—'}</span> },
  ]

  const reportColumns: Column<DiagnosticReport>[] = [
    { key: 'date', label: 'Date', render: r => <span className="font-medium text-text">{fmt(r.effectiveDateTime)}</span> },
    { key: 'name', label: 'Report Name', render: r => <span className="text-text">{r.reportName ?? '—'}</span> },
    { key: 'type', label: 'Type', render: r => <span className="text-text-muted">{r.reportType ?? '—'}</span> },
    { key: 'status', label: 'Status', render: r => <span className="text-text-muted capitalize">{r.reportStatus ?? '—'}</span> },
    { key: 'category', label: 'Category', render: r => <span className="text-text-muted">{r.category ?? '—'}</span> },
    { key: 'provider', label: 'Ordering Provider', render: r => <span className="text-text-muted">{r.orderingPractitioner ?? '—'}</span> },
  ]

  const carePlanColumns: Column<CarePlan>[] = [
    { key: 'status', label: 'Status', render: c => (
      c.status
        ? <Badge variant={CARE_PLAN_VARIANT[c.status.toLowerCase()] ?? 'inactive'} label={c.status} />
        : <span className="text-text-muted">—</span>
    ) },
    { key: 'created', label: 'Created Date', render: c => <span className="text-text-muted">{fmt(c.createdDate)}</span> },
    { key: 'review', label: 'Next Review Date', render: c => <span className="text-text-muted">{fmt(c.nextReviewDate)}</span> },
    { key: 'closed', label: 'Closed Date', render: c => <span className="text-text-muted">{fmt(c.closedDate)}</span> },
    { key: 'reason', label: 'Closure Reason', render: c => <span className="text-text-muted">{c.closureReason ?? '—'}</span> },
  ]

  const therapyColumns: Column<TherapyTrack>[] = [
    { key: 'discipline', label: 'Discipline', render: t => <span className="font-medium text-text">{t.discipline ?? '—'}</span> },
    { key: 'soc', label: 'Start of Care', render: t => <span className="text-text-muted">{fmt(t.startOfCareDate)}</span> },
    { key: 'certStart', label: 'Cert Start', render: t => <span className="text-text-muted">{fmt(t.certificationStartDate)}</span> },
    { key: 'certEnd', label: 'Cert End', render: t => <span className="text-text-muted">{fmt(t.certificationEndDate)}</span> },
    { key: 'freq', label: 'Frequency / Week', render: t => <span className="text-text-muted">{t.treatmentFreqPerWeek ?? '—'}</span> },
    { key: 'provider', label: 'Provider', render: t => <span className="text-text-muted">{t.therapyProvider ?? '—'}</span> },
    { key: 'medDx', label: 'Medical Diagnosis', render: t => <span className="text-text-muted">{t.medicalDiagnosis ?? '—'}</span> },
    { key: 'txDx', label: 'Treatment Diagnosis', render: t => <span className="text-text-muted">{t.treatmentDiagnosis ?? '—'}</span> },
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
            {canEdit && (
              <div className="relative">
                <Button onClick={handleNewVisit} loading={creating}>+ New Visit</Button>
                {showServiceTypeMenu && (
                  <div className="absolute right-0 mt-1 w-56 bg-white rounded-lg border border-slate-200 shadow-lg z-10 overflow-hidden">
                    {(patient.availableServiceTypes ?? []).map(t => (
                      <button
                        key={t}
                        onClick={() => createVisit(t)}
                        className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        {humanizeCareflowType(t)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        {serviceTypeNotice && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-3">
            {serviceTypeNotice}
          </p>
        )}
      </Card>

      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        <Card padding="p-0">
          <div className="flex divide-x divide-border">
            <div className="flex-1 p-4">
              <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Total Visits</p>
              <p className="text-2xl font-bold text-text mt-1">{totalVisits}</p>
              <p className="text-xs text-text-muted mt-0.5">{signed} signed · {totalVisits - signed} draft</p>
            </div>
            <div className="flex-1 p-4">
              <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Last Visit</p>
              <p className="text-lg font-semibold text-text mt-1">{lastVisit ? fmt(lastVisit.visitDate) : '—'}</p>
              <p className="text-xs text-text-muted mt-0.5">
                {lastVisit
                  ? `${lastVisit.visitType ? VISIT_TYPE[lastVisit.visitType] ?? lastVisit.visitType : 'Type not set'} · ${lastVisit.status === 'signed' ? 'Signed' : 'Draft'}`
                  : 'No visits yet'}
              </p>
            </div>
          </div>
        </Card>

        <Card padding="p-4">
          <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Allergies</p>
          {allergies.length === 0 ? (
            <p className="text-sm text-text-muted mt-2">None on file</p>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {allergies.slice(0, MAX_ALLERGY_TAGS).map(a => (
                <span key={a.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-danger border border-red-200">
                  ⚠ {a.allergen}{a.severity ? ` · ${a.severity}` : ''}
                </span>
              ))}
              {allergies.length > MAX_ALLERGY_TAGS && (
                <span className="text-xs text-text-muted">+ {allergies.length - MAX_ALLERGY_TAGS} more</span>
              )}
            </div>
          )}
        </Card>

        <Card padding="p-4">
          <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Active Diagnoses</p>
          <p className="text-2xl font-bold text-text mt-1">{patient._count.diagnoses}</p>
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
        <>
          <Table columns={visitColumns} rows={visits.rows} onRowClick={v => router.push(`/visits/${v.id}`)} empty={emptyText(visits.loading, 'No visits yet.')} />
          <Pagination {...visits} onPageChange={visits.setPage} onLimitChange={visits.setLimit} unit="visits" />
        </>
      )}

      {tab === 'Admissions' && (
        <div className="space-y-8">
          <div>
            <h3 className="text-sm font-semibold text-text mb-3">ADT Records</h3>
            <Table columns={adtColumns} rows={adt.rows} empty={emptyText(adt.loading, 'No admission records on file')} />
            <Pagination {...adt} onPageChange={adt.setPage} onLimitChange={adt.setLimit} unit="records" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text mb-3">Episodes of Care</h3>
            <Table columns={episodeColumns} rows={episodes.rows} empty={emptyText(episodes.loading, 'No episodes of care on file')} />
            <Pagination {...episodes} onPageChange={episodes.setPage} onLimitChange={episodes.setLimit} unit="episodes" />
          </div>
        </div>
      )}

      {tab === 'Diagnoses' && (
        <>
          <Card padding="p-0">
            {diagnoses.rows.length === 0 ? (
              <div className="p-8 text-center text-text-muted text-sm">{emptyText(diagnoses.loading, 'No diagnoses on file')}</div>
            ) : (
              <ul>
                {diagnoses.rows.map(d => (
                  <li key={d.id} className="flex items-center gap-4 px-5 py-3 border-b border-[#F1F5F9] last:border-0">
                    <span className="font-mono text-xs font-semibold px-2 py-1 rounded bg-[#DBEAFE] text-[#1D4ED8]">{d.icd10}</span>
                    <span className="flex-1 text-sm text-text">{d.description}</span>
                    <Badge variant={d.active ? 'active' : 'inactive'} label={d.active ? 'Active' : 'Inactive'} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Pagination {...diagnoses} onPageChange={diagnoses.setPage} onLimitChange={diagnoses.setLimit} unit="diagnoses" />
        </>
      )}

      {tab === 'Vitals' && (
        <>
          <Table columns={vitalColumns} rows={vitals.rows} empty={emptyText(vitals.loading, 'No vitals on file')} />
          <Pagination {...vitals} onPageChange={vitals.setPage} onLimitChange={vitals.setLimit} unit="vitals" />
        </>
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
              <Detail label="Emergency Contact" value={ec ? `${ecName}${ec.relationship ? ` (${ec.relationship})` : ''}` : '—'} />
              <Detail label="EC Phone" value={ecPhone} />
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

      {tab === 'Providers' && (
        <>
          <Table columns={providerColumns} rows={providers.rows} empty={emptyText(providers.loading, 'No providers on file')} />
          <Pagination {...providers} onPageChange={providers.setPage} onLimitChange={providers.setLimit} unit="providers" />
        </>
      )}

      {tab === 'Medications' && (
        <>
          <Table columns={medColumns} rows={medications.rows} empty={emptyText(medications.loading, 'No medications on file')} />
          <Pagination {...medications} onPageChange={medications.setPage} onLimitChange={medications.setLimit} unit="medications" />
        </>
      )}

      {tab === 'Immunizations' && (
        <>
          <Table columns={immunizationColumns} rows={immunizations.rows} empty={emptyText(immunizations.loading, 'No immunizations on file')} />
          <Pagination {...immunizations} onPageChange={immunizations.setPage} onLimitChange={immunizations.setLimit} unit="immunizations" />
        </>
      )}

      {tab === 'Reports' && (
        <>
          <Table columns={reportColumns} rows={reports.rows} empty={emptyText(reports.loading, 'No diagnostic reports on file')} />
          <Pagination {...reports} onPageChange={reports.setPage} onLimitChange={reports.setLimit} unit="reports" />
        </>
      )}

      {tab === 'Care Plans' && (
        <>
          <Table columns={carePlanColumns} rows={carePlans.rows} empty={emptyText(carePlans.loading, 'No care plans on file')} />
          <Pagination {...carePlans} onPageChange={carePlans.setPage} onLimitChange={carePlans.setLimit} unit="care plans" />
        </>
      )}

      {tab === 'Therapy' && (
        <>
          <Table columns={therapyColumns} rows={therapy.rows} empty={emptyText(therapy.loading, 'No therapy records on file')} />
          <Pagination {...therapy} onPageChange={therapy.setPage} onLimitChange={therapy.setLimit} unit="therapy records" />
        </>
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
