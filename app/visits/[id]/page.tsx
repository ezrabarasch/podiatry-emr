'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import Nav from '@/app/components/Nav'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface VisitData {
  id: string
  visitDate: string
  visitType: string
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

type RadioField = {
  type: 'radio'
  key: string
  label: string
  options: { value: string; label: string }[]
}
type CheckboxField = {
  type: 'checkbox'
  key: string
  label: string
  checkValue: string
}
type FieldDef = RadioField | CheckboxField

interface FieldGroup {
  groupLabel?: string
  accentColor?: string
  fields: FieldDef[]
}
interface SectionDef {
  id: string
  label: string
  groups: FieldGroup[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Section Data
// ─────────────────────────────────────────────────────────────────────────────

const SIDES = [
  { value: 'right', label: 'Right' },
  { value: 'left', label: 'Left' },
  { value: 'bilateral', label: 'Bilateral' },
]
const DIGITS_R_ALL = ['R1','R2','R3','R4','R5'].map(v => ({ value: v, label: v })).concat([{ value: 'R1-5', label: 'R1–5' }])
const DIGITS_L_ALL = ['L1','L2','L3','L4','L5'].map(v => ({ value: v, label: v })).concat([{ value: 'L1-5', label: 'L1–5' }])
const ORD_ALL = ['1st','2nd','3rd','4th','5th'].map(v => ({ value: v, label: v })).concat([{ value: '1st-5th', label: '1st–5th' }])

const SECTIONS: SectionDef[] = [
  {
    id: 'header',
    label: 'Header',
    groups: [{
      fields: [{
        type: 'radio', key: 'visit_type', label: 'Visit type',
        options: [{ value: 'new_patient', label: 'New patient' }, { value: 'established', label: 'Established' }],
      }],
    }],
  },
  {
    id: 'hpi',
    label: 'HPI',
    groups: [{
      fields: [
        { type: 'radio', key: 'ambulatory_status', label: 'Ambulatory status',
          options: [{ value: 'ambulatory', label: 'Ambulatory' }, { value: 'bedridden', label: 'Bedridden' }] },
        { type: 'radio', key: 'responsive_capacity', label: 'Responsive capacity',
          options: [
            { value: 'good', label: 'Good' }, { value: 'fair', label: 'Fair' },
            { value: 'poor', label: 'Poor' }, { value: 'combative', label: 'Combative' },
          ] },
        { type: 'radio', key: 'place_of_service', label: 'Place of service',
          options: [{ value: 'bedside', label: 'Bedside' }, { value: 'wheelchair', label: 'Wheelchair' }] },
        { type: 'checkbox', key: 'chronically_ill', label: 'Chronically ill appearance', checkValue: 'true' },
        { type: 'checkbox', key: 'on_vent', label: 'On ventilator', checkValue: 'true' },
        { type: 'checkbox', key: 'unable_to_communicate', label: 'Unable to communicate', checkValue: 'true' },
      ],
    }],
  },
  {
    id: 'social_history',
    label: 'Social History',
    groups: [{
      fields: [{
        type: 'radio', key: 'smoking_status', label: 'Smoking status',
        options: [{ value: 'current_smoker', label: 'Current smoker' }, { value: 'non_smoker', label: 'Non-smoker' }],
      }],
    }],
  },
  {
    id: 'vitals',
    label: 'Vitals',
    groups: [{
      fields: [{
        type: 'radio', key: 'blood_pressure', label: 'Blood pressure',
        options: [
          { value: 'normal_no_htn', label: 'Normal / No HTN' },
          { value: 'normal_with_htn', label: 'Normal w/ HTN' },
          { value: 'elevated_no_htn', label: 'Elevated / No HTN' },
          { value: 'elevated_with_htn', label: 'Elevated w/ HTN' },
        ],
      }],
    }],
  },
  {
    id: 'vascular_exam',
    label: 'Vascular Exam',
    groups: [
      {
        groupLabel: 'Class A', accentColor: 'bg-red-400',
        fields: [
          { type: 'radio', key: 'class_a_amputation', label: 'Amputation', options: SIDES },
        ],
      },
      {
        groupLabel: 'Class B', accentColor: 'bg-orange-400',
        fields: [
          { type: 'radio', key: 'dp_pulse_right', label: 'DP pulse — right',
            options: [{ value: 'absent', label: 'Absent' }, { value: 'trace', label: 'Trace' }, { value: 'palpable', label: 'Palpable' }] },
          { type: 'radio', key: 'dp_pulse_left', label: 'DP pulse — left',
            options: [{ value: 'absent', label: 'Absent' }, { value: 'trace', label: 'Trace' }, { value: 'palpable', label: 'Palpable' }] },
          { type: 'radio', key: 'pt_pulse_right', label: 'PT pulse — right',
            options: [{ value: 'absent', label: 'Absent' }, { value: '1/4', label: '1/4' }, { value: '2/4', label: '2/4' }, { value: '3/4', label: '3/4' }] },
          { type: 'radio', key: 'pt_pulse_left', label: 'PT pulse — left',
            options: [{ value: 'absent', label: 'Absent' }, { value: '1/4', label: '1/4' }, { value: '2/4', label: '2/4' }, { value: '3/4', label: '3/4' }] },
          { type: 'radio', key: 'hair_growth_decrease', label: 'Hair growth ↓',
            options: [{ value: 'right', label: 'Right' }, { value: 'left', label: 'Left' }, { value: 'bilateral', label: 'Bilateral' }, { value: 'absent', label: 'Absent' }] },
          { type: 'radio', key: 'pigmentary_changes', label: 'Pigmentary changes', options: SIDES },
          { type: 'radio', key: 'skin_color_change', label: 'Skin color change', options: SIDES },
          { type: 'checkbox', key: 'skin_texture_scaly', label: 'Skin texture: scaly', checkValue: 'true' },
          { type: 'checkbox', key: 'skin_texture_thin', label: 'Skin texture: thin', checkValue: 'true' },
          { type: 'checkbox', key: 'skin_texture_shiny', label: 'Skin texture: shiny', checkValue: 'true' },
          { type: 'radio', key: 'nail_thickening', label: 'Nail thickening', options: SIDES },
        ],
      },
      {
        groupLabel: 'Class C', accentColor: 'bg-yellow-400',
        fields: [
          { type: 'radio', key: 'claudication', label: 'Claudication',
            options: [{ value: 'right', label: 'Right' }, { value: 'left', label: 'Left' }] },
          { type: 'checkbox', key: 'burning', label: 'Burning sensation', checkValue: 'yes' },
          { type: 'checkbox', key: 'tingling', label: 'Tingling', checkValue: 'yes' },
          { type: 'radio', key: 'temp_change_coolness', label: 'Temp change (coolness)',
            options: [{ value: 'right', label: 'Right' }, { value: 'left', label: 'Left' }] },
          { type: 'radio', key: 'edema_right', label: 'Edema — right',
            options: [{ value: '1+', label: '1+' }, { value: '2+', label: '2+' }] },
          { type: 'radio', key: 'edema_left', label: 'Edema — left',
            options: [{ value: '1+', label: '1+' }, { value: '2+', label: '2+' }] },
        ],
      },
    ],
  },
  {
    id: 'orthopedic_exam',
    label: 'Orthopedic Exam',
    groups: [{
      fields: [
        { type: 'radio', key: 'foot_pain', label: 'Foot pain', options: SIDES },
        { type: 'radio', key: 'hammer_toe_right', label: 'Hammer toe — right',
          options: ['2nd','3rd','4th','5th'].map(v => ({ value: v, label: v })).concat([{ value: '2nd-5th', label: '2nd–5th' }]) },
        { type: 'radio', key: 'hammer_toe_left', label: 'Hammer toe — left',
          options: ['2nd','3rd','4th','5th'].map(v => ({ value: v, label: v })).concat([{ value: '2nd-5th', label: '2nd–5th' }]) },
        { type: 'radio', key: 'bunion', label: 'Bunion', options: SIDES },
        { type: 'radio', key: 'rom_right', label: 'ROM — right',
          options: [{ value: 'WNL', label: 'WNL' }, { value: 'decreased', label: 'Decreased' }] },
        { type: 'radio', key: 'rom_left', label: 'ROM — left',
          options: [{ value: 'WNL', label: 'WNL' }, { value: 'decreased', label: 'Decreased' }] },
        { type: 'radio', key: 'mmt_right', label: 'MMT — right',
          options: ['0/5','1/5','2/5','3/5','4/5','5/5'].map(v => ({ value: v, label: v })) },
        { type: 'radio', key: 'mmt_left', label: 'MMT — left',
          options: ['0/5','1/5','2/5','3/5','4/5','5/5'].map(v => ({ value: v, label: v })) },
        { type: 'radio', key: 'lesion_area', label: 'Lesion area',
          options: ['inner','outer','dorsal','plantar'].map(v => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) })) },
      ],
    }],
  },
  {
    id: 'derm_exam',
    label: 'Dermatological Exam',
    groups: [{
      fields: [
        { type: 'radio', key: 'hyperkeratosis_right', label: 'Hyperkeratosis — right', options: ORD_ALL },
        { type: 'radio', key: 'hyperkeratosis_left', label: 'Hyperkeratosis — left', options: ORD_ALL },
        { type: 'radio', key: 'ulceration_right', label: 'Ulceration — right',
          options: [
            { value: '1st', label: '1st digit' }, { value: 'heel', label: 'Heel' },
            { value: 'forefoot', label: 'Forefoot' }, { value: 'bandage_present', label: 'Bandage present' },
          ] },
        { type: 'radio', key: 'ulceration_left', label: 'Ulceration — left',
          options: [{ value: '1st', label: '1st digit' }, { value: 'heel', label: 'Heel' }, { value: 'forefoot', label: 'Forefoot' }] },
        { type: 'radio', key: 'dry_xerotic_right', label: 'Dry/xerotic — right', options: ORD_ALL },
        { type: 'radio', key: 'dry_xerotic_left', label: 'Dry/xerotic — left', options: ORD_ALL },
        { type: 'radio', key: 'interspaces', label: 'Interspaces',
          options: [{ value: 'clear', label: 'Clear' }, { value: 'macerated', label: 'Macerated' }] },
        { type: 'radio', key: 'cuts_fissures', label: 'Cuts/fissures', options: SIDES },
      ],
    }],
  },
  {
    id: 'nails',
    label: 'Nail Exam',
    groups: [{
      fields: [
        { type: 'radio', key: 'nail_mycotic_right', label: 'Mycotic — right', options: DIGITS_R_ALL },
        { type: 'radio', key: 'nail_mycotic_left', label: 'Mycotic — left', options: DIGITS_L_ALL },
        { type: 'radio', key: 'ingrown_nail_right', label: 'Ingrown — right', options: DIGITS_R_ALL },
        { type: 'radio', key: 'ingrown_nail_left', label: 'Ingrown — left', options: DIGITS_L_ALL },
        { type: 'radio', key: 'hematoma_right', label: 'Hematoma — right', options: DIGITS_R_ALL },
        { type: 'radio', key: 'hematoma_left', label: 'Hematoma — left', options: DIGITS_L_ALL },
      ],
    }],
  },
  {
    id: 'neuro_exam',
    label: 'Neurological Exam',
    groups: [{
      fields: [
        { type: 'radio', key: 'monofilament', label: 'Monofilament (10g)',
          options: [{ value: 'pass', label: 'Pass' }, { value: 'fail', label: 'Fail' }] },
        { type: 'radio', key: 'pinprick_right', label: 'Pinprick — right',
          options: [{ value: 'normal', label: 'Normal' }, { value: 'abnormal', label: 'Abnormal' }] },
        { type: 'radio', key: 'pinprick_left', label: 'Pinprick — left',
          options: [{ value: 'normal', label: 'Normal' }, { value: 'abnormal', label: 'Abnormal' }] },
        { type: 'radio', key: 'ankle_reflex_right', label: 'Ankle reflex — right',
          options: [{ value: 'present', label: 'Present' }, { value: 'absent', label: 'Absent' }] },
        { type: 'radio', key: 'ankle_reflex_left', label: 'Ankle reflex — left',
          options: [{ value: 'present', label: 'Present' }, { value: 'absent', label: 'Absent' }] },
        { type: 'checkbox', key: 'unable_to_test_sensation', label: 'Unable to test sensation', checkValue: 'true' },
        { type: 'radio', key: 'neuro_result', label: 'Neuro result',
          options: [{ value: 'passed', label: 'Passed' }, { value: 'failed', label: 'Failed' }] },
      ],
    }],
  },
  {
    id: 'treatment',
    label: 'Treatment & Plan',
    groups: [
      {
        groupLabel: 'Procedures',
        fields: [
          { type: 'radio', key: 'nail_debridement', label: 'Nail debridement',
            options: [{ value: '1-5', label: '1–5 nails' }, { value: '6-10', label: '6–10 nails' }] },
          { type: 'radio', key: 'ingrown_nail_procedure', label: 'Ingrown nail procedure',
            options: [{ value: 'right', label: 'Right' }, { value: 'left', label: 'Left' }] },
          { type: 'radio', key: 'skin_paring', label: 'Skin paring',
            options: [{ value: '1', label: '1 lesion' }, { value: '2-4', label: '2–4' }, { value: '4+', label: '4+' }] },
        ],
      },
      {
        groupLabel: 'Plan',
        fields: [
          { type: 'checkbox', key: 'patient_evaluated', label: 'Patient seen & evaluated', checkValue: 'true' },
          { type: 'checkbox', key: 'diabetic_education', label: 'Diabetic education rendered', checkValue: 'true' },
          { type: 'checkbox', key: 'foot_hygiene', label: 'Foot hygiene reviewed', checkValue: 'true' },
          { type: 'checkbox', key: 'wide_shoe_gear', label: 'Wide shoe gear recommended', checkValue: 'true' },
          { type: 'checkbox', key: 'no_barefoot', label: 'No barefoot walking', checkValue: 'true' },
          { type: 'checkbox', key: 'smoking_cessation', label: 'Smoking cessation reviewed', checkValue: 'true' },
          { type: 'checkbox', key: 'continue_pt', label: 'Continue physical therapy', checkValue: 'true' },
          { type: 'checkbox', key: 'bed_chair_exercises', label: 'Bed/chair exercises demonstrated', checkValue: 'true' },
          { type: 'checkbox', key: 'protective_footwear', label: 'Protective footwear education', checkValue: 'true' },
          { type: 'checkbox', key: 'will_monitor', label: 'Will continue to monitor', checkValue: 'true' },
        ],
      },
    ],
  },
]

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
}: {
  section: SectionDef
  selections: Selections
  onRadio: (sectionId: string, key: string, value: string | null) => void
  onCheckbox: (sectionId: string, key: string, checkValue: string, checked: boolean) => void
  readOnly: boolean
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-4">
      <div className="px-6 py-3.5 bg-slate-50 border-b border-slate-200">
        <h3 className="text-sm font-semibold text-slate-700">{section.label}</h3>
      </div>
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
    <div className="min-h-screen bg-slate-50">
      <Nav
        left={
          <>
            <button
              onClick={() => router.push(`/patients/${visit.patient.id}`)}
              className="text-sm text-slate-500 hover:text-slate-800 transition-colors"
            >
              ← {visit.patient.lastName}, {visit.patient.firstName}
            </button>
            <span className="text-slate-300">|</span>
            <h1 className="text-lg font-semibold text-slate-800">QWC Podiatry</h1>
          </>
        }
        right={
          <>
            {!readOnly && saveStatus === 'saving' && (
              <span className="text-xs text-slate-400">Saving...</span>
            )}
            {!readOnly && saveStatus === 'saved' && (
              <span className="text-xs text-green-600 font-medium">Saved ✓</span>
            )}
            {!readOnly && saveStatus === 'error' && (
              <span className="text-xs text-red-500">Save failed</span>
            )}
            <button
              onClick={() => router.push(`/visits/${visitId}/note`)}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {readOnly ? 'View Note →' : 'Generate Note →'}
            </button>
          </>
        }
      />

      <main className="max-w-4xl mx-auto px-6 py-8">
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
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                  visit.patient.facilityType === 'SNF'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-purple-100 text-purple-700'
                }`}>
                  {visit.patient.facilityType}
                </span>
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
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                  visit.status === 'signed'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {visit.status === 'signed' ? 'Signed' : 'Draft'}
                </span>
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
          />
        ))}

        {/* Bottom CTA */}
        <div className="flex items-center justify-between pt-2 pb-16">
          {readOnly ? (
            <span />
          ) : (
            <button
              onClick={() => setShowCancelDialog(true)}
              className="text-sm font-medium text-red-600 hover:text-red-800 border border-red-300 hover:border-red-400 px-4 py-2.5 rounded-lg transition-colors"
            >
              Cancel Visit
            </button>
          )}
          <button
            onClick={() => router.push(`/visits/${visitId}/note`)}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors"
          >
            {readOnly ? 'View Note →' : 'Generate Note →'}
          </button>
        </div>
      </main>

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
    </div>
  )
}
