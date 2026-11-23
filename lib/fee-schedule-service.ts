import { prisma } from '@/lib/prisma'
import type { FeeInput } from '@/lib/fee-schedule'

/** Upsert fee entries all-or-nothing. A missing description leaves the existing one untouched. */
export async function upsertFees(items: FeeInput[]) {
  await prisma.$transaction(items.map(i => prisma.feeScheduleItem.upsert({
    where: { cptCode: i.cptCode },
    create: i,
    update: { amount: i.amount, ...(i.description ? { description: i.description } : {}) },
  })))
}
