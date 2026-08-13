import { Role } from '@prisma/client'

// Structural, not nominal: both the bare PrismaClient's $transaction callback
// and the scoped (extended) client's $transaction callback satisfy this —
// the extended client's transaction type isn't nominally assignable to
// Prisma.TransactionClient, but every caller here only ever needs these 3
// calls, so typing against exactly that avoids fighting the extension's
// generated types for no benefit.
type Db = {
  providerPractice: { count(args: { where: { userId: string } }): Promise<number> }
  user: {
    findUnique(args: { where: { id: string }; select: { role: true } }): Promise<{ role: Role } | null>
    update(args: { where: { id: string }; data: { active: boolean } }): Promise<unknown>
  }
}

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
