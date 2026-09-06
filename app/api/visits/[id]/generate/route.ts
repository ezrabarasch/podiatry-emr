import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import type { ScopedPrismaClient } from '@/lib/scopedPrisma'
import { formatMedicationList } from '@/lib/medications'
import { loadCodeDescriptions } from '@/lib/careflow/codes'
import { isBlockedByCondition } from '@/lib/careflow/conditions'
import { resolveEncounterType } from '@/lib/careflow/encounter-type'
import { CAREFLOW_SECTIONS } from '@/lib/careflow/sections'
import type { NoteNode } from '@/lib/careflow/note-types'
import { classifyBp, bpWindowUtc, HTN_ICD10_PREFIXES, type BpCase } from '@/lib/careflow/bp-vitals'

const MEDICATIONS_TOKEN = '{medications_list}'

// Derived rules targeting this section represent an actual management plan
// (vs. a finding fragment) — used to count moderate-tier A/P items.
const AP_SECTION = 'Assessment & Plan'
// The "Treatment & Plan" form section (lib/careflow/sections.ts, id: 'treatment') —
// every matched rule here renders as A/P text (see recon), same as an A/P derived rule.
const TREATMENT_SECTION = 'treatment'
// CareflowTypes the NF E/M leveling step applies to. Gated explicitly so a
// future non-podiatry-NF careflowType doesn't silently inherit an NF E/M code.
const NF_EM_CAREFLOW_TYPES = new Set(['at_risk_podiatry'])
// A/P labeling (Stage A of the bold-label design): human-readable label per
// derived-rule conditionName. No such label exists as data anywhere (unlike
// treatment items, which already have one in lib/careflow/sections.ts) — this
// is a hand-authored, hand-maintained table, same pattern as E_M_LOOKUP below.
// Ezra-confirmed wording (8/19). A conditionName not listed here renders
// unlabeled (label: null) rather than failing.
const DERIVED_RULE_LABELS: Record<string, string> = {
  pvd_dx_present: 'PVD',
  edema_present: 'Edema',
  xerosis_present: 'Xerosis',
  ulceration_present: 'Ulceration',
  cuts_fissures_present: 'Cuts/Fissures',
  macerated_interspaces_present: 'Macerated Interspaces',
  bp_followup_present: 'BP Follow-up',
}

// Live BP case for this visit, or null if no qualifying reading exists (no rule
// fires — graceful fallback, not an error; test data is sparse/old, PCC could
// hiccup, and miscoding is worse than omitting).
async function computeBpCase(prisma: ScopedPrismaClient, patientId: string, visitDate: Date): Promise<BpCase | null> {
  const [windowStart, windowEnd] = bpWindowUtc(visitDate)
  const reading = await prisma.patientObservation.findFirst({
    where: { patientId, type: 'bloodPressure', recordedDate: { gte: windowStart, lt: windowEnd } },
    orderBy: { recordedDate: 'desc' },
  })
  if (!reading || reading.systolicValue == null || reading.diastolicValue == null) return null

  // Independent of icd10Set (which only has I10 if this very rule already put
  // it there — circular). PatientDiagnosis is PCC-synced daily, separately.
  const htnDx = await prisma.patientDiagnosis.findFirst({
    where: { patientId, active: true, OR: HTN_ICD10_PREFIXES.map(prefix => ({ icd10: { startsWith: prefix } })) },
  })

  return classifyBp(reading.systolicValue, reading.diastolicValue, !!htnDx, reading.unit)
}

function classRank(cls: string): number {
  if (cls === 'class_c') return 3
  if (cls === 'class_b') return 2
  if (cls === 'class_a') return 1
  return 0
}

// NF E/M visit codes the leveling step (a later foundation) will emit onto
// a visit. Exported so that step reuses this exact set instead of a copy.
export const E_M_CODES = new Set(['99304', '99305', '99306', '99307', '99308', '99309', '99310'])

type CptLine = { code: string; description: string; qualifier: string | null }

// General modifier-derivation step — only the -25 rule is wired today.
// Future rules (laterality LT/RT, class-finding Q7/Q8/Q9) are additional
// branches inside the map below, not a reshape.
function deriveModifiers(lines: CptLine[]): Array<CptLine & { modifiers: string[] }> {
  const hasProcedureCode = lines.some(l => !E_M_CODES.has(l.code))

  return lines.map(line => {
    const modifiers: string[] = []

    // -25: significant, separately identifiable E/M service billed alongside
    // a procedure on the same visit. Dormant until the leveling step starts
    // emitting E/M codes — no E/M line exists yet, so this never fires today.
    if (E_M_CODES.has(line.code) && hasProcedureCode) {
      modifiers.push('25')
    }

    return { ...line, modifiers }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Assemble a visit's generated note. Callable directly (no HTTP) so both the
// GET handler and the sign route share one source of truth for careflow logic.
// Returns the note payload object, or null if the visit doesn't exist.
// ─────────────────────────────────────────────────────────────────────────────
export async function assembleNote(prisma: ScopedPrismaClient, visitId: string) {
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

  if (!visit) return null

  // Return the saved snapshot for signed visits
  if (visit.status === 'signed' && visit.note) {
    const n = visit.note
    return {
      noteText: n.noteText,
      noteStructured: n.noteStructured ?? null, // frozen at sign — null on notes signed before this field existed
      procedureNotes: n.procedureNotes ?? [],
      specialSections: n.specialSections ?? [],
      diagnoses: n.diagnoses,
      cptCodes: n.cptCodes,
      billingAlerts: n.billingAlerts ?? [],
      addendum: n.addendum ?? '',
      isSigned: true,
    }
  }

  const careflowType = visit.careflowType
  const { icd10: ICD10_DESCRIPTIONS, cpt: CPT_DESCRIPTIONS } = await loadCodeDescriptions(prisma)

  // ── Condition context (drives any named dxCondition gates) ─────────────────
  const medHistory = (visit.emrImport?.medicalHistory ?? []) as Array<{ icd10?: string }>
  const conditionCtx = { medicalHistory: medHistory }

  // ── BP vitals coding (SPEC confirmed 2026-08-25) ───────────────────────────
  // Automates the existing manual blood_pressure field from live PCC vitals +
  // HTN dx status — but a clinician's own manual selection always wins; this
  // never overrides an explicit choice, only fills the field when it's blank.
  const hasManualBpSelection = visit.fieldSelections.some(s => s.section === 'vitals' && s.fieldKey === 'blood_pressure')
  const bpCase = hasManualBpSelection ? null : await computeBpCase(prisma, visit.patientId, visit.visitDate)

  // ── Match careflow rules ───────────────────────────────────────────────────
  const fieldSelections = visit.fieldSelections
  const matchedRuleOr = [
    ...fieldSelections.map(sel => ({ section: sel.section, fieldKey: sel.fieldKey, fieldValue: sel.value })),
    // Synthetic selection — reuses the existing blood_pressure CareflowRule
    // rows unchanged, so cptCodes/icd10Codes/noteFragment processing below
    // doesn't need to know or care whether a selection came from the form or
    // from live vitals.
    ...(bpCase ? [{ section: 'vitals', fieldKey: 'blood_pressure', fieldValue: bpCase.fieldValue }] : []),
  ]
  const matchedRules = matchedRuleOr.length > 0
    ? await prisma.careflowRule.findMany({
        where: { careflowType, active: true, OR: matchedRuleOr },
        orderBy: { priority: 'asc' },
      })
    : []

  // ── Process matched rules ──────────────────────────────────────────────────
  const icd10Set = new Set<string>()
  const cptSet = new Set<string>()
  const cptQualifierMap = new Map<string, string>()  // cpt code → highest class
  const qualifierClassesFound = new Set<string>()    // all class findings on this visit
  const ruleFragments: Array<{ text: string; order: number; label: string | null }> = []
  const procedureNotesList: Array<{ label: string; text: string }> = []
  const specialSectionsList: Array<{ label: string; text: string }> = []
  const seenNarratives = new Set<string>()

  // Vitals display line — raw reading + computed case, right under the new
  // "Vitals:" header (priority 29, same as the header — static wins the tie).
  // The coding sentence itself (priority 30) comes from the matched rule above.
  if (bpCase) {
    const unitText = bpCase.unit ? ` ${bpCase.unit}` : ''
    ruleFragments.push({
      text: `Blood Pressure: ${bpCase.systolic}/${bpCase.diastolic}${unitText} (${bpCase.label})`,
      order: 29,
      label: null,
    })
  }

  // A/P labeling (Stage A): human-readable label per treatment-section fieldKey,
  // reusing the labels the form already carries in lib/careflow/sections.ts —
  // no new authoring needed for this source. Keyed by `${sectionId}:${fieldKey}`
  // (not fieldKey alone) so a same-named fieldKey in a different section can't
  // collide with this lookup.
  const treatmentLabelByKey = new Map<string, string>()
  for (const section of CAREFLOW_SECTIONS[careflowType] ?? []) {
    for (const group of section.groups) {
      for (const field of group.fields) {
        treatmentLabelByKey.set(`${section.id}:${field.key}`, field.label)
      }
    }
  }

  // apItemCount sums two disjoint A/P sources: matched treatment-section rules
  // (plan/procedure actions, counted below) + firing A/P derived rules (diagnosis-
  // driven, counted after the derived-rules loop). Disjoint today — treatment-section
  // rules carry no icd10Codes, so they can't themselves trigger a derived rule — but
  // this isn't schema-enforced: a future treatment-section field duplicating a derived
  // rule's clinical action would double-count. Revisit if that's ever authored.
  let apItemCount = 0

  for (const rule of matchedRules) {
    if (rule.noteFragment) {
      const isTreatmentItem = rule.section === TREATMENT_SECTION
      const label = isTreatmentItem ? treatmentLabelByKey.get(`${rule.section}:${rule.fieldKey}`) ?? null : null
      ruleFragments.push({ text: rule.noteFragment, order: rule.priority, label })
      if (isTreatmentItem) apItemCount++
    }

    if (rule.icd10Codes) {
      const codes = rule.icd10Codes as string[]
      // Named dxCondition gate (e.g. "patient_is_diabetic") via the registry
      const blocked = isBlockedByCondition(rule.dxCondition, conditionCtx)
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
    where: { careflowType, active: true },
    orderBy: { priority: 'asc' },
  })

  // Moderate-tier (99305/99308) trigger input for the leveling step (a later
  // foundation) — apItemCount's other addend is above, in the matched-rule loop.
  for (const rule of derivedRules) {
    const triggerCodes = rule.triggerCodes as string[]
    if (triggerCodes.some(c => icd10Set.has(c))) {
      const isApRule = rule.outputSection === AP_SECTION
      const label = isApRule ? DERIVED_RULE_LABELS[rule.conditionName] ?? null : null
      ruleFragments.push({ text: rule.noteFragment, order: rule.priority, label })
      if (isApRule) apItemCount++
    }
  }

  // ── Static fragments ───────────────────────────────────────────────────────
  const staticFragments = await prisma.careflowStaticFragment.findMany({
    where: { careflowType, active: true },
    orderBy: { position: 'asc' },
  })

  // ── Assemble note text ─────────────────────────────────────────────────────
  type NoteItem = { text: string; order: number; isStatic: boolean; label: string | null }

  const allItems: NoteItem[] = [
    ...staticFragments.map(f => ({ text: f.fragmentText, order: f.position, isStatic: true, label: null })),
    ...ruleFragments.map(f => ({ text: f.text, order: f.order, isStatic: false, label: f.label })),
  ]
  allItems.sort((a, b) => a.order !== b.order ? a.order - b.order : (a.isStatic ? -1 : 1))

  const noteLines: string[] = []
  for (const item of allItems) {
    if (item.isStatic && noteLines.length > 0) noteLines.push('')
    noteLines.push(item.text)
  }
  let noteText = noteLines.join('\n')

  // A/P labeling (Stage A) — a structured parallel to noteText, built from the
  // same sorted allItems, so the order always matches. Rendered by the web
  // note view (Stage C) and the PDF (Stage D2) — label is non-null only for
  // the A/P items (set above); every other fragment carries label: null.
  let noteStructured: NoteNode[] = allItems.map(item =>
    item.isStatic
      ? { type: 'header', text: item.text }
      : { type: 'item', label: item.label, text: item.text }
  )

  // ── Token substitution ─────────────────────────────────────────────────────
  if (noteText.includes(MEDICATIONS_TOKEN)) {
    const medications = await prisma.patientMedication.findMany({
      where: { patientId: visit.patientId },
      orderBy: { description: 'asc' },
    })
    const medicationsList = formatMedicationList(medications) || 'none on file'
    noteText = noteText.split(MEDICATIONS_TOKEN).join(medicationsList)
    // Same substitution on the structured path, so both forms agree on this line.
    noteStructured = noteStructured.map(node => ({ ...node, text: node.text.split(MEDICATIONS_TOKEN).join(medicationsList) }))
  }

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

  // ── E/M leveling — emit the nursing-facility E/M visit code from the
  // documented encounter type (F2) + A/P-item count (F4). All three tiers
  // are live — podiatry has no risk-marker path, so the count alone drives
  // the tier. Built as its own cpt line array (not the final
  // deriveModifiers() output) so the E/M line can be added BEFORE
  // deriveModifiers runs — that's what lets the existing -25 rule see both
  // the E/M line and any procedure line and fire automatically.
  const cptLines: CptLine[] = [...cptSet].map(code => ({
    code,
    description: CPT_DESCRIPTIONS[code] ?? code,
    qualifier: cptQualifierMap.get(code) ?? null,
  }))

  let emCode: string | null = null
  let emTier: 'standard' | 'middle' | 'high' | null = null
  let encounterType: 'initial' | 'subsequent' | null = null

  if (NF_EM_CAREFLOW_TYPES.has(careflowType)) {
    encounterType = await resolveEncounterType(visit)

    // Podiatry E/M leveling is driven purely by the A/P-item count — no risk
    // markers (other service lines may use a different formula; this profile
    // is podiatry-only, gated by NF_EM_CAREFLOW_TYPES above). Confirmed bands
    // (Jonathan 8/19): 0-1 items -> standard, 2-4 -> middle, 5+ -> high.
    // Tier names are deliberately not "moderate" — CPT's own MDM-complexity
    // wording for these codes doesn't line up with a clean 3-way split
    // (e.g. 99308's official label is "low complexity", not "moderate").
    const PODIATRY_EM_BANDS = [
      { max: 1, tier: 'standard' as const },        // 0-1 items
      { max: 4, tier: 'middle' as const },          // 2-4 items
      { max: Infinity, tier: 'high' as const },     // 5+ items
    ]
    emTier = PODIATRY_EM_BANDS.find(b => apItemCount <= b.max)!.tier

    // tier → code lookup (a table, so adding e.g. 99310 later is one entry, not logic)
    const E_M_LOOKUP = {
      initial:    { standard: '99304', middle: '99305', high: '99306' },
      subsequent: { standard: '99307', middle: '99308', high: '99309' },
      // 99310 (subsequent highest) reserved — not wired
    } as const

    emCode = E_M_LOOKUP[encounterType][emTier]
    cptLines.push({ code: emCode, description: CPT_DESCRIPTIONS[emCode] ?? emCode, qualifier: null })
  }

  // ── Build payload ──────────────────────────────────────────────────────────
  return {
    noteText,
    noteStructured, // A/P-labeled parallel form (Stage A) — not persisted or rendered yet
    procedureNotes: procedureNotesList,
    specialSections: specialSectionsList,
    diagnoses: [...icd10Set].map(code => ({
      icd10: code,
      description: ICD10_DESCRIPTIONS[code] ?? code,
    })),
    cptCodes: deriveModifiers(cptLines),
    billingAlerts,
    addendum: fieldSelections.find(s => s.section === '_addendum' && s.fieldKey === 'text')?.value ?? '',
    apItemCount, // moderate-tier input for the leveling step
    emCode, // the emitted NF E/M code (null if this careflowType doesn't get one)
    emTier, // 'standard' | 'middle' | 'high' | null — driven purely by apItemCount (no risk-marker path)
    encounterType, // 'initial' | 'subsequent' | null, from resolveEncounterType (F2)
    isSigned: false,
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: visitId } = await context.params
  const payload = await assembleNote(session.prisma, visitId)
  if (!payload) return NextResponse.json({ error: 'Visit not found' }, { status: 404 })
  return NextResponse.json(payload)
}
