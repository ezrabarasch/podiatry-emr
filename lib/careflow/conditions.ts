// ─────────────────────────────────────────────────────────────────────────────
// NAMED CONDITION PREDICATES
//
// CareflowRule.dxCondition stores the *name* of a gate (e.g. "patient_is_diabetic").
// Each service line can register its own predicates here without touching
// generate/route.ts. The engine just looks up the name and calls the function.
// ─────────────────────────────────────────────────────────────────────────────

export interface ConditionContext {
  medicalHistory: Array<{ icd10?: string }>
}

export const CONDITIONS: Record<string, (ctx: ConditionContext) => boolean> = {
  patient_is_diabetic: ctx =>
    ctx.medicalHistory.some(dx => /^E1[013]/.test(dx.icd10 ?? '')),

  // Example of how a future service line registers its own gate:
  // patient_has_prior_amputation: ctx =>
  //   ctx.medicalHistory.some(dx => /^Z89/.test(dx.icd10 ?? '')),
}

/** Returns true if the rule's dxCondition (if any) blocks it for this context. */
export function isBlockedByCondition(
  dxCondition: string | null | undefined,
  ctx: ConditionContext
): boolean {
  if (!dxCondition) return false
  const predicate = CONDITIONS[dxCondition]
  // Unknown condition name fails closed (blocks) so a typo'd dxCondition
  // can't silently let codes through unguarded.
  if (!predicate) return true
  return !predicate(ctx)
}
