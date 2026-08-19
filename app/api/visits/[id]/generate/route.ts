import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'
import { formatMedicationList } from '@/lib/medications'
import { loadCodeDescriptions } from '@/lib/careflow/codes'
import { isBlockedByCondition } from '@/lib/careflow/conditions'

const MEDICATIONS_TOKEN = '{medications_list}'

// Derived rules targeting this section represent an actual management plan
// (vs. a finding fragment) — used to count moderate-tier A/P items.
const AP_SECTION = 'Assessment & Plan'
// The "Treatment & Plan" form section (lib/careflow/sections.ts, id: 'treatment') —
// every matched rule here renders as A/P text (see recon), same as an A/P derived rule.
const TREATMENT_SECTION = 'treatment'

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
export async function assembleNote(visitId: string) {
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
  const { icd10: ICD10_DESCRIPTIONS, cpt: CPT_DESCRIPTIONS } = await loadCodeDescriptions()

  // ── Condition context (drives any named dxCondition gates) ─────────────────
  const medHistory = (visit.emrImport?.medicalHistory ?? []) as Array<{ icd10?: string }>
  const conditionCtx = { medicalHistory: medHistory }

  // ── Match careflow rules ───────────────────────────────────────────────────
  const fieldSelections = visit.fieldSelections
  const matchedRules = fieldSelections.length > 0
    ? await prisma.careflowRule.findMany({
        where: {
          careflowType,
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

  // apItemCount sums two disjoint A/P sources: matched treatment-section rules
  // (plan/procedure actions, counted below) + firing A/P derived rules (diagnosis-
  // driven, counted after the derived-rules loop). Disjoint today — treatment-section
  // rules carry no icd10Codes, so they can't themselves trigger a derived rule — but
  // this isn't schema-enforced: a future treatment-section field duplicating a derived
  // rule's clinical action would double-count. Revisit if that's ever authored.
  let apItemCount = 0

  for (const rule of matchedRules) {
    if (rule.noteFragment) {
      ruleFragments.push({ text: rule.noteFragment, order: rule.priority })
      if (rule.section === TREATMENT_SECTION) apItemCount++
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
      ruleFragments.push({ text: rule.noteFragment, order: rule.priority })
      if (rule.outputSection === AP_SECTION) apItemCount++
    }
  }

  // ── Static fragments ───────────────────────────────────────────────────────
  const staticFragments = await prisma.careflowStaticFragment.findMany({
    where: { careflowType, active: true },
    orderBy: { position: 'asc' },
  })

  // ── Assemble note text ─────────────────────────────────────────────────────
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
  let noteText = noteLines.join('\n')

  // ── Token substitution ─────────────────────────────────────────────────────
  if (noteText.includes(MEDICATIONS_TOKEN)) {
    const medications = await prisma.patientMedication.findMany({
      where: { patientId: visit.patientId },
      orderBy: { description: 'asc' },
    })
    noteText = noteText.split(MEDICATIONS_TOKEN).join(formatMedicationList(medications) || 'none on file')
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

  // ── Build payload ──────────────────────────────────────────────────────────
  return {
    noteText,
    procedureNotes: procedureNotesList,
    specialSections: specialSectionsList,
    diagnoses: [...icd10Set].map(code => ({
      icd10: code,
      description: ICD10_DESCRIPTIONS[code] ?? code,
    })),
    cptCodes: deriveModifiers([...cptSet].map(code => ({
      code,
      description: CPT_DESCRIPTIONS[code] ?? code,
      qualifier: cptQualifierMap.get(code) ?? null,
    }))),
    billingAlerts,
    addendum: fieldSelections.find(s => s.section === '_addendum' && s.fieldKey === 'text')?.value ?? '',
    apItemCount, // moderate-tier input for the leveling step — not yet consumed anywhere
    isSigned: false,
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!(await getSessionUser())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: visitId } = await context.params
  const payload = await assembleNote(visitId)
  if (!payload) return NextResponse.json({ error: 'Visit not found' }, { status: 404 })
  return NextResponse.json(payload)
}
