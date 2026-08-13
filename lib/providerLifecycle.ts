import { Prisma, PrismaClient, Role } from '@prisma/client'

type Db = PrismaClient | Prisma.TransactionClient

// A PROVIDER with zero ProviderPractice rows is deactivated — call this after
// removing a provider's practice assignment(s), inside the same transaction as
// the removal so the count reflects final state. Never reactivates (assigning
// a practice is a separate, deliberate admin action) and never touches
// OFFICE/ADMIN users, who aren't practice-scoped.
export async function deactivateProviderIfNoPractices(db: Db, userId: string) {
  const remaining = await db.providerPractice.count({ where: { userId } })
  if (remaining > 0) return

  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } })
  if (user?.role === Role.PROVIDER) {
    await db.user.update({ where: { id: userId }, data: { active: false } })
  }
}
