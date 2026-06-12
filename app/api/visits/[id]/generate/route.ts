import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// ─────────────────────────────────────────────────────────────────────────────
// Lookup tables for codes used in the at_risk_podiatry careflow
// ─────────────────────────────────────────────────────────────────────────────

const ICD10_DESCRIPTIONS: Record<string, string> = {
  'B35.1': 'Tinea unguium (onychomycosis)',
  'B35.3': 'Tinea pedis',
  'E11.40': 'Type 2 diabetes mellitus with diabetic neuropathy, unspecified',
  'F17.210': 'Nicotine dependence, cigarettes, uncomplicated',
  'I10': 'Essential (primary) hypertension',
  'I70.21': 'Atherosclerosis with intermittent claudication',
  'I73.9': 'Peripheral vascular disease, unspecified',
  'L60.0': 'Ingrowing nail',
  'L84': 'Corns and callosities',
  'L85': 'Other epidermal thickening',
  'L85.3': 'Xerosis cutis',
  'L89.8': 'Pressure ulcer of other site',
  'L97.411': 'Non-pressure chronic ulcer of right heel, unspecified severity',
  'L97.412': 'Non-pressure chronic ulcer of left heel, unspecified severity',
  'L98.8': 'Other specified disorders of skin and subcutaneous tissue',
  'M20.11': 'Hallux valgus (acquired), right foot',
  'M20.12': 'Hallux valgus (acquired), left foot',
  'M20.41': 'Other hammer toe(s) (acquired), right foot',
  'M20.42': 'Other hammer toe(s) (acquired), left foot',
  'M62.81': 'Muscle weakness, right lower leg',
  'M62.82': 'Muscle weakness, left lower leg',
  'M79.671': 'Pain in right foot',
  'M79.672': 'Pain in left foot',
  'R60.0': 'Localized edema',
  'Z89.411': 'Acquired absence of right great toe',
  'Z89.412': 'Acquired absence of left great toe',
  'Z89.419': 'Acquired absence of unspecified toe(s)',
}

const CPT_DESCRIPTIONS: Record<string, string> = {
  '11055': 'Paring/cutting of benign hyperkeratotic lesion, single',
  '11056': 'Paring/cutting, 2–4 lesions',
  '11057': 'Paring/cutting, 4+ lesions',
  '11720': 'Debridement of nail(s), 1–5',
  '11721': 'Debridement of nail(s), 6–10',
  '11750': 'Excision of nail and nail matrix (ingrown nail)',
  'G0108': 'Diabetes outpatient self-management training',
  'G8427': 'Documentation of current medications',
  'G8783': 'Blood pressure controlled/normal',
  'G8950': 'Blood pressure elevated',
}

function classRank(cls: string): number {
  if (cls === 'class_c') return 3
  if (cls === 'class_b') return 2
  if (cls === 'class_a') return 1
  return 0
}

// ─────────────────────────────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: visitId } = await context.params

  const visit = await prisma.visit.findUnique({
    where: { id: visitId },
    include: {
      patient: true,
      provider: true,
      fieldSelections: true,
      emrImport: true,
      note: true,
    },
  })

  if (!visit) return NextResponse.json({ error: 'Visit not found' }, { status: 404 })

  // Return the saved snapshot for signed visits
  if (visit.status === 'signed' && visit.note) {
    const n = visit.note
    return NextResponse.json({
      noteText: n.noteText,
      procedureNotes: n.procedureNotes ?? [],
      specialSections: n.specialSections ?? [],
      diagnoses: n.diagnoses,
      cptCodes: n.cptCodes,
      billingAlerts: n.billingAlerts ?? [],
      addendum: n.addendum ?? '',
      isSigned: true,
    })
  }

  // ── Diabetes gate ──────────────────────────────────────────────────────────
  const medHistory = (visit.emrImport?.medicalHistory ?? []) as Array<{ icd10?: string }>
  const isDiabetic = medHistory.some(dx => /^E1[013]/.test(dx.icd10 ?? ''))

  // ── Match careflow rules ───────────────────────────────────────────────────
  const fieldSelections = visit.fieldSelections
  const matchedRules = fieldSelections.length > 0
    ? await prisma.careflowRule.findMany({
        where: {
          careflowType: 'at_risk_podiatry',
          active: true,
          OR: fieldSelections.map(sel => ({
            section: sel.section,
            fieldKey: sel.fieldKey,
            fieldValue: sel.value,
          })),
        },
        orderBy: { priority: 'asc' },
      })
    : []

  // ── Process matched rules ──────────────────────────────────────────────────
  const icd10Set = new Set<string>()
  const cptSet = new Set<string>()
  const cptQualifierMap = new Map<string, string>()  // cpt code → highest class
  const qualifierClassesFound = new Set<string>()    // all class findings on this visit
  const ruleFragments: Array<{ text: string; order: number }> = []
  const procedureNotesList: Array<{ label: string; text: string }> = []
  const specialSectionsList: Array<{ label: string; text: string }> = []
  const seenNarratives = new Set<string>()

  for (const rule of matchedRules) {
    if (rule.noteFragment) {
      ruleFragments.push({ text: rule.noteFragment, order: rule.priority })
    }

    if (rule.icd10Codes) {
      const codes = rule.icd10Codes as string[]
      // Skip diabetic neuropathy codes if no diabetes in EMR history
      const blocked = rule.dxCondition === 'patient_is_diabetic' && !isDiabetic
      if (!blocked) {
        codes.forEach(c => icd10Set.add(c))
      }
    }

    if (rule.cptCodes) {
      const codes = rule.cptCodes as string[]
      codes.forEach(c => {
        cptSet.add(c)
        if (rule.cptQualifier) {
          const current = cptQualifierMap.get(c)
          if (!current || classRank(rule.cptQualifier) > classRank(current)) {
            cptQualifierMap.set(c, rule.cptQualifier)
          }
        }
      })
    }

    if (rule.cptQualifier) {
      qualifierClassesFound.add(rule.cptQualifier)
    }

    if (rule.sectionLabel && rule.procedureNarrative) {
      const narrative = rule.procedureNarrative
      if (!seenNarratives.has(narrative)) {
        seenNarratives.add(narrative)
        if (rule.sectionLabel === 'Procedure Note') {
          procedureNotesList.push({ label: 'Procedure Note', text: narrative })
        } else {
          specialSectionsList.push({ label: rule.sectionLabel, text: narrative })
        }
      }
    }
  }

  // ── Derived rules — fire when their trigger codes are in the ICD-10 set ───
  const derivedRules = await prisma.careflowDerivedRule.findMany({
    where: { careflowType: 'at_risk_podiatry', active: true },
    orderBy: { priority: 'asc' },
  })

  for (const rule of derivedRules) {
    const triggerCodes = rule.triggerCodes as string[]
    if (triggerCodes.some(c => icd10Set.has(c))) {
      ruleFragments.push({ text: rule.noteFragment, order: rule.priority })
    }
  }

  // ── Static fragments ───────────────────────────────────────────────────────
  const staticFragments = await prisma.careflowStaticFragment.findMany({
    where: { careflowType: 'at_risk_podiatry', active: true },
    orderBy: { position: 'asc' },
  })

  // ── Assemble note text ─────────────────────────────────────────────────────
  // Merge static (by position) and conditional (by priority) items.
  // Static fragments act as section headers; blank lines are inserted before them.
  // On ties, static comes first (section header precedes its findings).
  type NoteItem = { text: string; order: number; isStatic: boolean }

  const allItems: NoteItem[] = [
    ...staticFragments.map(f => ({ text: f.fragmentText, order: f.position, isStatic: true })),
    ...ruleFragments.map(f => ({ text: f.text, order: f.order, isStatic: false })),
  ]
  allItems.sort((a, b) => a.order !== b.order ? a.order - b.order : (a.isStatic ? -1 : 1))

  const noteLines: string[] = []
  for (const item of allItems) {
    if (item.isStatic && noteLines.length > 0) noteLines.push('')
    noteLines.push(item.text)
  }
  const noteText = noteLines.join('\n')

  // ── CPT qualifier billing alerts ───────────────────────────────────────────
  const billingAlerts: Array<{ code: string; message: string }> = []
  const hasQualifyingFinding =
    qualifierClassesFound.has('class_b') || qualifierClassesFound.has('class_c')

  for (const code of ['11720', '11721']) {
    if (cptSet.has(code) && !hasQualifyingFinding) {
      billingAlerts.push({
        code,
        message: `CPT ${code} requires a documented Class B or Class C vascular finding. No qualifying finding recorded.`,
      })
    }
  }

  // ── Build response ─────────────────────────────────────────────────────────
  return NextResponse.json({
    noteText,
    procedureNotes: procedureNotesList,
    specialSections: specialSectionsList,
    diagnoses: [...icd10Set].map(code => ({
      icd10: code,
      description: ICD10_DESCRIPTIONS[code] ?? code,
    })),
    cptCodes: [...cptSet].map(code => ({
      code,
      description: CPT_DESCRIPTIONS[code] ?? code,
      qualifier: cptQualifierMap.get(code) ?? null,
    })),
    billingAlerts,
    addendum: '',
    isSigned: false,
  })
}
