'use client'

import { useEffect, useState, useCallback, useRef, type ReactNode } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import PageShell from '@/app/components/PageShell'
import Badge from '@/app/components/Badge'
import Button from '@/app/components/Button'
import { formatMedicationList } from '@/lib/medications'
import { SECTIONS, type FieldDef, type SectionDef, type CheckboxField } from '@/lib/careflow/sections'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface VisitData {
  id: string
  visitDate: string
  visitType: string | null
  facilityType: string
  status: string
  patient: {
    id: string
    firstName: string
    lastName: string
    dob: string
    facilityType: string
    facility: { name: string }
  }
  provider: { firstName: string; lastName: string; credentials: string | null }
  fieldSelections: Array<{ section: string; fieldKey: string; value: string }>
}

type Selections = Record<string, Record<string, string>>
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function FieldRow({
  field,
  sectionId,
  selections,
  onRadio,
  onCheckbox,
  readOnly,
}: {
  field: FieldDef
  sectionId: string
  selections: Selections
  onRadio: (sectionId: string, key: string, value: string | null) => void
  onCheckbox: (sectionId: string, key: string, checkValue: string, checked: boolean) => void
  readOnly: boolean
}) {
  if (field.type === 'radio') {
    const current = selections[sectionId]?.[field.key]
    return (
      <div className="flex items-start gap-4 py-1">
        <span className="text-xs font-medium text-slate-500 w-44 flex-shrink-0 pt-1.5">
          {field.label}
        </span>
        <div className="flex flex-wrap gap-1.5">
          {field.options.map(opt => (
            <button
              key={opt.value}
              type="button"
              disabled={readOnly}
              onClick={() => onRadio(sectionId, field.key, current === opt.value ? null : opt.value)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors ${
                current === opt.value
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600'
              } ${readOnly ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  const checked = selections[sectionId]?.[field.key] === field.checkValue
  return (
    <div className="flex items-center gap-4 py-1">
      <span className="text-xs font-medium text-slate-500 w-44 flex-shrink-0">
        {field.label}
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={readOnly}
        onChange={e => onCheckbox(sectionId, field.key, field.checkValue, e.target.checked)}
        className={`h-4 w-4 rounded border-slate-300 accent-blue-600 ${readOnly ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      />
    </div>
  )
}

function SectionCard({
  section,
  selections,
  onRadio,
  onCheckbox,
  readOnly,
  banner,
}: {
  section: SectionDef
  selections: Selections
  onRadio: (sectionId: string, key: string, value: string | null) => void
  onCheckbox: (sectionId: string, key: string, checkValue: string, checked: boolean) => void
  readOnly: boolean
  banner?: ReactNode
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-4">
      <div className="px-6 py-3.5 bg-slate-50 border-b border-slate-200">
        <h3 className="text-sm font-semibold text-slate-700">{section.label}</h3>
      </div>
      {banner}
      <div className="divide-y divide-slate-100">
        {section.groups.map((group, gi) => {
          const allCheckboxes = group.fields.every(f => f.type === 'checkbox')
          return (
            <div key={gi} className="px-6 py-4">
              {group.groupLabel && (
                <div className="flex items-center gap-2 mb-3">
                  {group.accentColor && (
                    <div className={`h-2 w-2 rounded-full flex-shrink-0 ${group.accentColor}`} />
                  )}
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
                    {group.groupLabel}
                  </span>
                </div>
              )}
              {allCheckboxes ? (
                <div className="grid grid-cols-2 gap-x-8 gap-y-2.5">
                  {group.fields.map(f => {
                    const cbf = f as CheckboxField
                    const checked = selections[section.id]?.[cbf.key] === cbf.checkValue
                    return (
                      <label key={cbf.key} className={`flex items-center gap-2 ${readOnly ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={readOnly}
                          onChange={e => onCheckbox(section.id, cbf.key, cbf.checkValue, e.target.checked)}
                          className={`h-4 w-4 rounded border-slate-300 accent-blue-600 ${readOnly ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                        />
                        <span className="text-sm text-slate-700">{cbf.label}</span>
                      </label>
                    )
                  })}
                </div>
              ) : (
                <div className="space-y-1">
                  {group.fields.map(f => (
                    <FieldRow
                      key={f.key}
                      field={f}
                      sectionId={section.id}
                      selections={selections}
                      onRadio={onRadio}
                      onCheckbox={onCheckbox}
                      readOnly={readOnly}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function VisitPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const params = useParams()
  const visitId = params.id as string
  const readOnly = session?.user?.role === 'OFFICE'

  const [visit, setVisit] = useState<VisitData | null>(null)
  const [loading, setLoading] = useState(true)
  const [medicationsList, setMedicationsList] = useState('')
  const [selections, setSelections] = useState<Selections>({})
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    if (session === null) router.push('/login')
  }, [session, router])

  useEffect(() => {
    fetch(`/api/visits/${visitId}`)
      .then(r => r.json())
      .then((data: VisitData) => {
        setVisit(data)
        const map: Selections = {}
        for (const sel of data.fieldSelections) {
          if (!map[sel.section]) map[sel.section] = {}
          map[sel.section][sel.fieldKey] = sel.value
        }
        setSelections(map)
        setLoading(false)
      })
  }, [visitId])

  const saveField = useCallback(async (section: string, fieldKey: string, value: string | null) => {
    clearTimeout(saveTimer.current)
    setSaveStatus('saving')
    try {
      await fetch(`/api/visits/${visitId}/fields`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section, fieldKey, value }),
      })
      setSaveStatus('saved')
      saveTimer.current = setTimeout(() => setSaveStatus('idle'), 2000)
    } catch {
      setSaveStatus('error')
    }
  }, [visitId])

  const handleRadio = useCallback((sectionId: string, fieldKey: string, value: string | null) => {
    setSelections(prev => {
      const next = { ...prev, [sectionId]: { ...prev[sectionId] } }
      if (value === null) {
        delete next[sectionId][fieldKey]
      } else {
        next[sectionId][fieldKey] = value
      }
      return next
    })
    saveField(sectionId, fieldKey, value)
  }, [saveField])

  const handleCheckbox = useCallback((sectionId: string, fieldKey: string, checkValue: string, checked: boolean) => {
    setSelections(prev => {
      const next = { ...prev, [sectionId]: { ...prev[sectionId] } }
      if (checked) {
        next[sectionId][fieldKey] = checkValue
      } else {
        delete next[sectionId][fieldKey]
      }
      return next
    })
    saveField(sectionId, fieldKey, checked ? checkValue : null)
  }, [saveField])

  // Current medications live on the patient chart, not on this form. Pull them
  // in and flag the HPI field so the careflow rule's {medications_list} token
  // resolves when the note is generated.
  useEffect(() => {
    if (!visit) return
    fetch(`/api/patients/${visit.patient.id}/medications?limit=100`)
      .then(r => r.json())
      .then(data => {
        const list = formatMedicationList(Array.isArray(data.medications) ? data.medications : [])
        setMedicationsList(list)
        const alreadyImported = visit.fieldSelections.some(
          s => s.section === 'hpi' && s.fieldKey === 'current_medications'
        )
        if (list && !readOnly && visit.status !== 'signed' && !alreadyImported) {
          handleRadio('hpi', 'current_medications', 'imported')
        }
      })
  }, [visit, readOnly, handleRadio])

  const handleCancelVisit = async () => {
    setCancelling(true)
    try {
      await fetch(`/api/visits/${visitId}`, { method: 'DELETE' })
      router.push(`/patients/${visit!.patient.id}`)
    } catch {
      setCancelling(false)
      setShowCancelDialog(false)
    }
  }

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Loading visit...</p>
      </div>
    )
  }

  if (!visit) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Visit not found.</p>
      </div>
    )
  }

  return (
    <PageShell>
      <div className="max-w-4xl mx-auto">
        {/* Action bar */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => router.push(`/patients/${visit.patient.id}`)}
            className="text-sm text-text-muted hover:text-text transition-colors"
          >
            ← {visit.patient.lastName}, {visit.patient.firstName}
          </button>
          <div className="flex items-center gap-3">
            {!readOnly && saveStatus === 'saving' && <span className="text-xs text-text-muted">Saving...</span>}
            {!readOnly && saveStatus === 'saved' && <span className="text-xs text-success font-medium">Saved ✓</span>}
            {!readOnly && saveStatus === 'error' && <span className="text-xs text-danger">Save failed</span>}
            <Button onClick={() => router.push(`/visits/${visitId}/note`)}>
              {readOnly ? 'View Note →' : 'Generate Note →'}
            </Button>
          </div>
        </div>

        {readOnly && (
          <div className="bg-amber-50 border border-amber-300 text-amber-800 text-sm rounded-lg px-4 py-3 mb-6">
            Read-only view — you do not have permission to edit visits.
          </div>
        )}

        {/* Visit header */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-800">
                {visit.patient.lastName}, {visit.patient.firstName}
              </h2>
              <div className="flex items-center gap-3 mt-1.5 text-sm text-slate-500">
                <span>DOB: {formatDate(visit.patient.dob)}</span>
                <span>·</span>
                <span>{visit.patient.facility.name}</span>
                <span>·</span>
                <Badge variant={visit.patient.facilityType === 'SNF' ? 'snf' : 'alf'} label={visit.patient.facilityType} />
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-sm font-medium text-slate-700">
                {formatDate(visit.visitDate)}
              </div>
              <div className="flex items-center gap-2 justify-end mt-1.5">
                <span className="text-xs text-slate-500">
                  {visit.provider.firstName} {visit.provider.lastName}
                  {visit.provider.credentials && `, ${visit.provider.credentials}`}
                </span>
                <Badge variant={visit.status === 'signed' ? 'signed' : 'draft'} label={visit.status === 'signed' ? 'Signed' : 'Draft'} />
              </div>
            </div>
          </div>
        </div>

        {/* Careflow form sections */}
        {SECTIONS.map(section => (
          <SectionCard
            key={section.id}
            section={section}
            selections={selections}
            onRadio={handleRadio}
            onCheckbox={handleCheckbox}
            readOnly={readOnly}
            banner={section.id === 'hpi' && medicationsList ? (
              <div className="px-6 py-3 border-b border-slate-100 bg-blue-50/60 text-xs text-slate-600">
                <span className="font-semibold text-slate-700">Current medications (from chart): </span>
                {medicationsList}
              </div>
            ) : undefined}
          />
        ))}

        {/* Bottom CTA */}
        <div className="flex items-center justify-between pt-2 pb-16">
          {readOnly ? (
            <span />
          ) : (
            <Button variant="ghost" className="!text-danger !border-red-300 hover:!border-red-400" onClick={() => setShowCancelDialog(true)}>
              Cancel Visit
            </Button>
          )}
          <Button size="lg" onClick={() => router.push(`/visits/${visitId}/note`)}>
            {readOnly ? 'View Note →' : 'Generate Note →'}
          </Button>
        </div>
      </div>

      {/* Cancel Visit Dialog */}
      {showCancelDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl border border-slate-200 p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-base font-semibold text-slate-800 mb-2">Cancel Visit?</h3>
            <p className="text-sm text-slate-600 mb-5">
              Are you sure you want to discard changes to the visit information?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCancelDialog(false)}
                disabled={cancelling}
                className="flex-1 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 py-2.5 rounded-lg transition-colors"
              >
                Keep Editing
              </button>
              <button
                onClick={handleCancelVisit}
                disabled={cancelling}
                className="flex-1 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:bg-slate-300 disabled:cursor-not-allowed py-2.5 rounded-lg transition-colors"
              >
                {cancelling ? 'Cancelling...' : 'Yes, Cancel Visit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  )
}
