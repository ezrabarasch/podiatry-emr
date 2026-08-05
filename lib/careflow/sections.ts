// ─────────────────────────────────────────────────────────────────────────────
// Careflow form structure — the canonical definition of which sections, fields,
// and field values exist on a careflow visit form.
//
// Extracted verbatim from app/visits/[id]/page.tsx so that server-side code
// (e.g. the careflow-rules admin API) can validate that a rule's
// section/fieldKey/fieldValue actually corresponds to a field the form renders.
//
// Pure data + types: no React, no server-only APIs. Safe to import from both
// client components and server code.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type RadioField = {
  type: 'radio'
  key: string
  label: string
  options: { value: string; label: string }[]
}
export type CheckboxField = {
  type: 'checkbox'
  key: string
  label: string
  checkValue: string
}
export type FieldDef = RadioField | CheckboxField

export interface FieldGroup {
  groupLabel?: string
  accentColor?: string
  fields: FieldDef[]
}
export interface SectionDef {
  id: string
  label: string
  groups: FieldGroup[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Section Data
// ─────────────────────────────────────────────────────────────────────────────

export const SIDES = [
  { value: 'right', label: 'Right' },
  { value: 'left', label: 'Left' },
  { value: 'bilateral', label: 'Bilateral' },
]
export const DIGITS_R_ALL = ['R1','R2','R3','R4','R5'].map(v => ({ value: v, label: v })).concat([{ value: 'R1-5', label: 'R1–5' }])
export const DIGITS_L_ALL = ['L1','L2','L3','L4','L5'].map(v => ({ value: v, label: v })).concat([{ value: 'L1-5', label: 'L1–5' }])
export const ORD_ALL = ['1st','2nd','3rd','4th','5th'].map(v => ({ value: v, label: v })).concat([{ value: '1st-5th', label: '1st–5th' }])

// Keyed by CareflowType. Only `at_risk_podiatry` exists today; additional
// service lines are added here as they are built.
export const CAREFLOW_SECTIONS: Record<string, SectionDef[]> = {
  at_risk_podiatry: [
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
  ],
}

/**
 * The at-risk-podiatry form structure — the only service line today.
 * Kept as a named export so existing consumers (the visit page) are unchanged.
 */
export const SECTIONS = CAREFLOW_SECTIONS.at_risk_podiatry
