import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'
import { formatMedicationList } from '@/lib/medications'
import { loadCodeDescriptions } from '@/lib/careflow/codes'
import { isBlockedByCondition } from '@/lib/careflow/conditions'

const MEDICATIONS_TOKEN = '{medications_list}'

function classRank(cls: string): number {
  if (cls === 'class_c') return 3
  if (cls === 'class_b') return 2
  if (cls === 'class_a') return 1
  return 0
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

  for (const rule of matchedRules) {
    if (rule.noteFragment) {
      ruleFragments.push({ text: rule.noteFragment, order: rule.priority })
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

  for (const rule of derivedRules) {
    const triggerCodes = rule.triggerCodes as string[]
    if (triggerCodes.some(c => icd10Set.has(c))) {
      ruleFragments.push({ text: rule.noteFragment, order: rule.priority })
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
    cptCodes: [...cptSet].map(code => ({
      code,
      description: CPT_DESCRIPTIONS[code] ?? code,
      qualifier: cptQualifierMap.get(code) ?? null,
    })),
    billingAlerts,
    addendum: fieldSelections.find(s => s.section === '_addendum' && s.fieldKey === 'text')?.value ?? '',
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
