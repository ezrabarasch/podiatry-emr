import type { ScopedPrismaClient } from '@/lib/scopedPrisma'
import { buildDetail, type EligibilityDetail } from '@/lib/stedi-detail'

// Queues an eligibility check; etl/stedi/worker.py does the Stedi call. Reuses
// an in-flight row so repeated clicks/visit creations don't pile up duplicates.
export async function enqueueEligibility(prisma: ScopedPrismaClient, patientId: string, visitId?: string) {
  const inFlight = await prisma.stediEligibilityCheck.findFirst({
    where: { patientId, status: { in: ['pending', 'processing'] } },
  })
  if (inFlight) return inFlight
  return prisma.stediEligibilityCheck.create({ data: { patientId, visitId: visitId ?? null } })
}

const CHECK_SELECT = {
  id: true, status: true, outcome: true, message: true, summary: true, rawResponse: true,
  requestedAt: true, completedAt: true, applicationMode: true,
} as const

// The raw payer payload stays server-side: the browser gets the structured
// detail built from it, never the payload itself.
export async function getCheck(prisma: ScopedPrismaClient, where: { id?: string; patientId?: string }) {
  const row = await prisma.stediEligibilityCheck.findFirst({
    where, orderBy: { requestedAt: 'desc' }, select: CHECK_SELECT,
  })
  if (!row) return null
  const { rawResponse, ...rest } = row
  const detail: EligibilityDetail | null = rawResponse
    ? buildDetail(rawResponse as Record<string, unknown>, row.outcome ?? 'unknown')
    : null
  return { ...rest, detail }
}

export function checkHistory(prisma: ScopedPrismaClient, patientId: string) {
  return prisma.stediEligibilityCheck.findMany({
    where: { patientId }, orderBy: { requestedAt: 'desc' }, take: 25,
    select: { id: true, status: true, outcome: true, message: true, requestedAt: true, completedAt: true, applicationMode: true },
  })
}
