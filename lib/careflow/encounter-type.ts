import { prisma } from '@/lib/prisma'
import type { Visit, VisitType } from '@prisma/client'

// ─────────────────────────────────────────────────────────────────────────────
// CLINICAL DIAL — to change how readmissions are detected (e.g. count
// DCHP→RA round-trips, or add an interval threshold), edit these sets and
// the reset scan in deriveEncounterType() below. Nothing downstream depends
// on the internals of this file beyond deriveEncounterType()'s return value.
//
// Staging ADT recon (read-only, real data) found PCC has NO Leave-of-Absence
// code — a "Discharge (to Hospital)" (DCHP) followed by a "ReAdmission" (RA)
// cannot be told apart from a 1-7 day hospital round-trip (one real patient
// had SIX such cycles). Option D therefore keys ONLY on the clean DD → IA
// reset pair and ignores DCHP/RA — conservative: it undercodes a genuine
// DCHP-based readmit as "subsequent" rather than risking overcoding an LOA
// round-trip as "initial."
// ─────────────────────────────────────────────────────────────────────────────
export const RESET_DISCHARGE_CODES = new Set(['DD']) // terminal discharge that (with a later IA) resets the stay
export const RESET_ADMIT_CODES = new Set(['IA']) // fresh admission
// Excluded from reset detection FOR NOW (clinical dial — may change):
// DCHP + RA = the ambiguous hospital round-trip pair (no LOA code in PCC → can't tell round-trip from real readmit)
// BC/LC/PC/PCC = bed change / billing-admin / system markers
export const EXCLUDE_FROM_RESET = new Set(['DCHP', 'RA', 'BC', 'LC', 'PC', 'PCC'])

export interface AdtEvent {
  actionCode: string | null
  effectiveDateTime: Date | null
}

export interface EncounterTypeInput {
  visitType: VisitType | null
  priorSignedVisitDate: Date | null
  thisVisitDate: Date
  adtEvents: AdtEvent[]
}

/**
 * Pure decision: 'initial' (NF initial-visit codes) vs 'subsequent' (NF
 * subsequent-visit codes). No DB access — takes already-fetched data, so
 * it's directly unit-testable.
 */
export function deriveEncounterType(input: EncounterTypeInput): 'initial' | 'subsequent' {
  const { visitType, priorSignedVisitDate, thisVisitDate, adtEvents } = input

  // No prior signed visit — first (or migrated) visit for this patient.
  // There's no ADT window to derive from yet; the provider's own selection governs.
  if (!priorSignedVisitDate) {
    if (visitType === 'new_patient') return 'initial'
    if (visitType === 'established') return 'subsequent'
    return 'subsequent' // conservative fallback — visitType wasn't captured either
  }

  // Reset window: (priorSignedVisitDate, thisVisitDate]. A DD followed later
  // by an IA, both in-window, means the stay was reset — order matters, so
  // events are scanned chronologically rather than just checked for co-existence.
  const inWindow = adtEvents
    .filter((e): e is { actionCode: string; effectiveDateTime: Date } =>
      e.actionCode !== null && e.effectiveDateTime !== null &&
      e.effectiveDateTime > priorSignedVisitDate && e.effectiveDateTime <= thisVisitDate
    )
    .sort((a, b) => a.effectiveDateTime.getTime() - b.effectiveDateTime.getTime())

  let sawDischarge = false
  for (const event of inWindow) {
    if (EXCLUDE_FROM_RESET.has(event.actionCode)) continue
    if (RESET_DISCHARGE_CODES.has(event.actionCode)) {
      sawDischarge = true
    } else if (RESET_ADMIT_CODES.has(event.actionCode) && sawDischarge) {
      return 'initial'
    }
  }

  return 'subsequent'
}

/**
 * Thin DB wrapper around deriveEncounterType() — fetches the two facts the
 * pure function needs (most recent prior signed visit date, this patient's
 * ADT history) and calls it. All clinical logic lives in deriveEncounterType()
 * and the constants above; this function only fetches. ADT events are fetched
 * unfiltered by date and windowed inside the pure function, so the window
 * definition can change (the dial) without touching this query.
 */
export async function resolveEncounterType(visit: Visit): Promise<'initial' | 'subsequent'> {
  const priorVisit = await prisma.visit.findFirst({
    where: { patientId: visit.patientId, status: 'signed', visitDate: { lt: visit.visitDate } },
    orderBy: { visitDate: 'desc' },
    select: { visitDate: true },
  })

  const adtEvents = await prisma.patientAdtRecord.findMany({
    where: { patientId: visit.patientId },
    select: { actionCode: true, effectiveDateTime: true },
  })

  return deriveEncounterType({
    visitType: visit.visitType,
    priorSignedVisitDate: priorVisit?.visitDate ?? null,
    thisVisitDate: visit.visitDate,
    adtEvents,
  })
}
