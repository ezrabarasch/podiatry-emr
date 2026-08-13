import { Prisma, Role } from '@prisma/client'
import { prisma as basePrisma } from '@/lib/prisma'

// ─────────────────────────────────────────────────────────────────────────────
// THE TENANT/PRACTICE SCOPING LAYER
//
// This is the ONLY place that decides which rows a request is allowed to see
// or touch. Every route gets its Prisma client from getSessionUser()/
// requireRole() (lib/auth.ts), never from the bare singleton (lib/prisma.ts)
// directly — that's enforced by an ESLint rule (eslint.config.mjs), not just
// convention. A bug in this file is a cross-tenant PHI leak. Read the whole
// file before touching it.
//
// Proven mechanism (see spike/ from the earlier concurrency spike): a
// per-request client built via prisma.$extends(), with the tenant/practice
// context captured in this function's closure — not read from any shared
// mutable state — so there is nothing for one concurrent request to leak
// into another.
// ─────────────────────────────────────────────────────────────────────────────

export type ScopeContext = {
  tenantId: string
  role: Role
  activePracticeId: string | null
  allowedPracticeIds: string[]
  // Set only by a future super-admin "act within tenant T" picker — nothing
  // in the app sets this yet (see lib/auth.ts's toScopeContext). Until it
  // does, SUPER_ADMIN always resolves to full bypass, never tenant-only.
  impersonatingTenantId?: string | null
}

// The 5 models with a direct tenantId column.
const SCOPED_MODELS = new Set(['Facility', 'Practice', 'User', 'Patient', 'Visit'])

// Shared rules-engine / reference tables — no tenantId, never filtered.
// Scoping any of these would silently zero them out for every tenant, which
// breaks the app for everyone rather than leaking data — still wrong, just a
// different failure mode, so they're exempted explicitly rather than by
// omission.
const EXEMPT_MODELS = new Set([
  'Code',
  'CareflowRule',
  'CareflowStaticFragment',
  'CareflowDerivedRule',
  'CptQualifierRule',
  'CareflowSection',
  'CareflowFieldGroup',
  'CareflowField',
])

// Patient-child models: no tenantId of their own, reached only via patientId.
// Every route that lists these (medications, allergies, diagnoses, uploads,
// coverages, ...) takes patientId straight from the URL with no separate
// "does this patient belong to me" check today — the ancestry filter below
// (patient: {...patientWhere}) is what actually closes that gap, for every
// current AND future direct query on these models, without touching each
// route individually.
const PATIENT_CHILD_MODELS = new Set([
  'PatientDiagnosis',
  'PatientUpload',
  'PatientCoverage',
  'PatientMedication',
  'PatientAllergy',
  'PatientObservation',
  'PatientContact',
  'PatientAdtRecord',
  'PatientPractitioner',
  'PatientImmunization',
  'PatientDiagnosticReport',
  'PatientCarePlan',
  'PatientAssessment',
  'PatientEpisodeOfCare',
  'PatientTherapyTrack',
])

// groupBy is included alongside the task's original findMany/findFirst/
// findUnique/count/aggregate list — the app already calls it directly on a
// scoped model (Visit.groupBy for the visits-list provider dropdown) and a
// by-ancestry one (PatientCoverage.groupBy for the payer-type filter), and
// leaving it out would ship both of those unscoped.
const READ_OPS = new Set(['findMany', 'findFirst', 'findUnique', 'count', 'aggregate', 'groupBy'])
const WRITE_OPS = new Set(['create', 'createMany', 'update', 'updateMany', 'delete', 'deleteMany', 'upsert'])

// ─────────────────────────────────────────────────────────────────────────────
// Resolved scope — computed once per client, not per query. Three modes:
//   bypass            true super-admin: no filter of any kind, on anything.
//   tenant-only        super-admin impersonating tenant T: tenant filter, no
//                       practice filter (per spec — impersonation isn't
//                       staffed to any particular practice).
//   tenant-and-practice everyone else: both filters apply.
// ─────────────────────────────────────────────────────────────────────────────

type ResolvedScope =
  | { mode: 'bypass' }
  | { mode: 'tenant-only'; tenantId: string }
  | {
      mode: 'tenant-and-practice'
      tenantId: string
      // Role-branched "what data am I actively working with right now" scope
      // — used for Facility/Patient/Visit.
      practiceIds: string[]
      // Full, un-narrowed membership — used for Practice itself. Deliberately
      // NOT role-branched: /api/me/practices (3b) has to list a multi-practice
      // provider's whole allowed set so they can pick one, which is exactly
      // the moment activePracticeId is still null — narrowing Practice reads
      // to activePracticeId the same way Facility/Patient/Visit are would
      // return zero rows to the one user that endpoint exists to serve.
      // "Which practices am I a member of" and "which practice's data am I
      // currently viewing" are different questions; only the latter is
      // role-narrowed.
      allowedPracticeIds: string[]
    }

// PROVIDER is scoped to their single active practice (or nothing, if they
// haven't chosen yet — fail closed, matching the /select-practice gate).
// OFFICE/ADMIN are scoped to every practice they're staffed to at once.
function scopePracticeIds(ctx: ScopeContext): string[] {
  if (ctx.role === Role.PROVIDER) return ctx.activePracticeId ? [ctx.activePracticeId] : []
  return ctx.allowedPracticeIds
}

function resolveScope(ctx: ScopeContext): ResolvedScope {
  if (ctx.role === Role.SUPER_ADMIN) {
    if (!ctx.impersonatingTenantId) return { mode: 'bypass' }
    return { mode: 'tenant-only', tenantId: ctx.impersonatingTenantId }
  }
  return {
    mode: 'tenant-and-practice',
    tenantId: ctx.tenantId,
    practiceIds: scopePracticeIds(ctx),
    allowedPracticeIds: ctx.allowedPracticeIds,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-model READ filters. Each returns null for a true bypass (don't touch
// args.where at all); every other mode returns a where-clause to merge in.
// ─────────────────────────────────────────────────────────────────────────────

// Facility is in scope if EITHER its legacy single FK (Facility.practiceId,
// schema.prisma:108 — "kept until dropped in a later migration") OR its
// PracticeFacility M2M links point at an in-scope practice. Belt-and-
// suspenders until that legacy column is actually dropped.
function facilityWhere(scope: ResolvedScope): Prisma.FacilityWhereInput | null {
  if (scope.mode === 'bypass') return null
  if (scope.mode === 'tenant-only') return { tenantId: scope.tenantId }
  return {
    tenantId: scope.tenantId,
    OR: [
      { practiceId: { in: scope.practiceIds } },
      { practiceLinks: { some: { practiceId: { in: scope.practiceIds } } } },
    ],
  }
}

function practiceWhere(scope: ResolvedScope): Prisma.PracticeWhereInput | null {
  if (scope.mode === 'bypass') return null
  if (scope.mode === 'tenant-only') return { tenantId: scope.tenantId }
  return { tenantId: scope.tenantId, id: { in: scope.allowedPracticeIds } }
}

// User is tenant-scoped only — users HAVE practice memberships, they aren't
// themselves practice-scoped data (an ADMIN managing staff needs to see every
// tenant user, not just ones tied to their own active practice).
function userWhere(scope: ResolvedScope): Prisma.UserWhereInput | null {
  if (scope.mode === 'bypass') return null
  return { tenantId: scope.tenantId }
}

// "Facility-level all": a user scoped to practice(s) P sees every patient at
// any facility linked to any practice in P — not just patients they've
// personally had a visit with. Patient -> Facility -> PracticeFacility ->
// Practice, expressed as a single nested where (no extra query needed; Prisma
// turns this into a join).
function patientWhere(scope: ResolvedScope): Prisma.PatientWhereInput | null {
  if (scope.mode === 'bypass') return null
  if (scope.mode === 'tenant-only') return { tenantId: scope.tenantId }
  return {
    tenantId: scope.tenantId,
    facility: {
      OR: [
        { practiceId: { in: scope.practiceIds } },
        { practiceLinks: { some: { practiceId: { in: scope.practiceIds } } } },
      ],
    },
  }
}

// Visit.practiceId is nullable ("the practice this visit was created under...
// nullable — historical visits may not resolve one", schema.prisma:419).
// Those null-practiceId visits are a TENANT-WIDE VISIBLE fallback, not
// hidden — included via the `practiceId: null` arm below, not excluded.
function visitWhere(scope: ResolvedScope): Prisma.VisitWhereInput | null {
  if (scope.mode === 'bypass') return null
  if (scope.mode === 'tenant-only') return { tenantId: scope.tenantId }
  return {
    tenantId: scope.tenantId,
    OR: [
      { practiceId: { in: scope.practiceIds } },
      { practiceId: null },
    ],
  }
}

const SCOPED_MODEL_WHERE: Record<string, (scope: ResolvedScope) => object | null> = {
  Facility: facilityWhere,
  Practice: practiceWhere,
  User: userWhere,
  Patient: patientWhere,
  Visit: visitWhere,
}

// SessionLog: not one of the 5 scoped models, not global/exempt either — an
// audit table keyed by a NULLABLE userId (failed logins for unknown emails
// have no user at all). Ancestry-scoped via its `user` relation like the
// Patient-child models, but handled separately here because the relation is
// optional: rows with no user can't be tenant-attributed at all, so they're
// left tenant-neutral (visible to everyone) rather than silently dropped or
// silently shown cross-tenant. Only admin/sessions/route.ts reads this
// directly; logSession() in lib/auth.ts writes it pre-session via the bare
// client (correct — there's no tenant context yet at login/logout time).
function sessionLogWhere(scope: ResolvedScope): Prisma.SessionLogWhereInput | null {
  if (scope.mode === 'bypass') return null
  const tenantId = scope.tenantId
  return { OR: [{ userId: null }, { user: { tenantId } }] }
}

// ─────────────────────────────────────────────────────────────────────────────
// The extension
// ─────────────────────────────────────────────────────────────────────────────

export function buildScopedClient(ctx: ScopeContext) {
  const scope = resolveScope(ctx)

  return basePrisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (EXEMPT_MODELS.has(model)) return query(args)

          const a = args as { where?: Record<string, unknown>; data?: unknown }

          if (READ_OPS.has(operation)) {
            if (SCOPED_MODELS.has(model)) {
              const where = SCOPED_MODEL_WHERE[model](scope)
              if (where) a.where = { ...a.where, ...where }
            } else if (PATIENT_CHILD_MODELS.has(model)) {
              const where = patientWhere(scope)
              if (where) {
                a.where = {
                  ...a.where,
                  patient: { ...(a.where?.patient as object | undefined), ...where },
                }
              }
            } else if (model === 'SessionLog') {
              const where = sessionLogWhere(scope)
              if (where) a.where = { ...a.where, ...where }
            }
            return query(args)
          }

          if (WRITE_OPS.has(operation) && SCOPED_MODELS.has(model)) {
            return handleScopedWrite({ model, operation, args, query, ctx, scope })
          }

          return query(args)
        },
      },
    },
  })
}

export type ScopedPrismaClient = ReturnType<typeof buildScopedClient>

// ─────────────────────────────────────────────────────────────────────────────
// Write-path handling for the 5 scoped models.
//
// CREATE: stamp tenantId from context (replaces the old DEFAULT_TENANT_ID
// stopgaps). A true-bypass SUPER_ADMIN has no tenant to stamp, so creating
// is refused outright — they must pick a tenant to act within first.
//
// UPDATE/DELETE: merge tenantId into `where` so a request can never mutate a
// row outside its own tenant. Per spec this is tenant-only, not additionally
// practice-filtered — see the STOP-FOR-REVIEW report for why that's worth a
// second look.
// ─────────────────────────────────────────────────────────────────────────────

async function handleScopedWrite(params: {
  model: string
  operation: string
  args: unknown
  query: (args: unknown) => Promise<unknown>
  ctx: ScopeContext
  scope: ResolvedScope
}) {
  const { model, operation, query, ctx, scope } = params
  const args = params.args as { where?: Record<string, unknown>; data?: unknown; create?: unknown }

  const isCreate = operation === 'create' || operation === 'createMany'
  const isUpsert = operation === 'upsert'

  if ((isCreate || isUpsert) && scope.mode === 'bypass') {
    throw new Error(
      `SUPER_ADMIN cannot create a ${model} row without impersonatingTenantId set — ` +
      `pick a tenant to act within before writing scoped data.`
    )
  }

  const tenantId = scope.mode === 'bypass' ? null : scope.tenantId

  if (operation === 'create') {
    const data = args.data as Record<string, unknown>
    args.data = { ...data, tenantId: data.tenantId ?? tenantId }
    if (model === 'Visit' && args.data && (args.data as Record<string, unknown>).practiceId === undefined) {
      ;(args.data as Record<string, unknown>).practiceId = ctx.activePracticeId ?? null
    }
    return query(args)
  }

  if (operation === 'createMany') {
    const rows = Array.isArray(args.data) ? args.data : [args.data]
    args.data = rows.map((row: Record<string, unknown>) => ({
      ...row,
      tenantId: row.tenantId ?? tenantId,
      ...(model === 'Visit' && row.practiceId === undefined ? { practiceId: ctx.activePracticeId ?? null } : {}),
    }))
    return query(args)
  }

  if (isUpsert) {
    const create = args.create as Record<string, unknown>
    args.create = { ...create, tenantId: create.tenantId ?? tenantId }
    if (model === 'Visit' && (args.create as Record<string, unknown>).practiceId === undefined) {
      ;(args.create as Record<string, unknown>).practiceId = ctx.activePracticeId ?? null
    }
    if (tenantId) args.where = { ...args.where, tenantId }
    return query(args)
  }

  // update / updateMany / delete / deleteMany
  if (tenantId) args.where = { ...args.where, tenantId }
  return query(args)
}
