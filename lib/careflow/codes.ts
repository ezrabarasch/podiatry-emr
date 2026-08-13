import type { ScopedPrismaClient } from '@/lib/scopedPrisma'

/**
 * Loads ICD-10/CPT descriptions from the shared `codes` table.
 * Any service line's rules can reference any code here — this is
 * deliberately not scoped to a single careflowType, since codes
 * (e.g. I10 hypertension) are often shared across specialties. Code is a
 * global/exempt model, so this would behave identically on the bare
 * singleton — takes the caller's scoped client anyway so this file never
 * needs its own `@/lib/prisma` import (which the app-wide ESLint rule bans).
 */
export async function loadCodeDescriptions(prisma: ScopedPrismaClient) {
  const rows = await prisma.code.findMany()
  const icd10: Record<string, string> = {}
  const cpt: Record<string, string> = {}
  for (const row of rows) {
    if (row.system === 'icd10') icd10[row.code] = row.description
    else cpt[row.code] = row.description
  }
  return { icd10, cpt }
}

