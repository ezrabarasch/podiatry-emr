import type { ScopedPrismaClient } from '@/lib/scopedPrisma'

// Queues an eligibility check; etl/stedi/worker.py does the Stedi call. Reuses
// an in-flight row so repeated clicks/visit creations don't pile up duplicates.
export async function enqueueEligibility(prisma: ScopedPrismaClient, patientId: string, visitId?: string) {
  const inFlight = await prisma.stediEligibilityCheck.findFirst({
    where: { patientId, status: { in: ['pending', 'processing'] } },
  })
  if (inFlight) return inFlight
  return prisma.stediEligibilityCheck.create({ data: { patientId, visitId: visitId ?? null } })
}

// rawResponse (the full payer payload) stays server-side; the UI gets the summary only.
export const CHECK_SELECT = {
  id: true, status: true, outcome: true, message: true, summary: true,
  requestedAt: true, completedAt: true, applicationMode: true,
} as const
