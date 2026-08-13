import { NextResponse } from 'next/server'
import { getSessionUser, requireRole } from '@/lib/auth'
import { pageParams } from '@/lib/pagination'

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { prisma } = session

  const { id } = await context.params
  const { page, limit, skip, take } = pageParams(new URL(req.url).searchParams)

  const [visits, total] = await Promise.all([
    prisma.visit.findMany({
      where: { patientId: id },
      include: {
        provider: {
          select: { firstName: true, lastName: true, credentials: true }
        },
        note: { select: { cptCodes: true } },
      },
      orderBy: { visitDate: 'desc' },
      skip,
      take,
    }),
    prisma.visit.count({ where: { patientId: id } }),
  ])

  return NextResponse.json({ visits, total, page, limit })
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { user, prisma, error } = await requireRole(['PROVIDER', 'ADMIN'])
  if (error) return error

  const { id } = await context.params
  const b = await req.json().catch(() => ({}))
  const careflowType = typeof b.careflowType === 'string' ? b.careflowType : ''

  const patient = await prisma.patient.findUnique({
    where: { id },
    include: { facility: { include: { practice: { include: { serviceTypes: true } } } } },
  })

  if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 })

  const allowed = patient.facility.practice?.serviceTypes.map(st => st.careflowType) ?? []
  if (allowed.length === 0) {
    return NextResponse.json({ error: "No service type available for this patient's practice" }, { status: 400 })
  }
  if (!careflowType || !allowed.includes(careflowType as (typeof allowed)[number])) {
    return NextResponse.json({ error: 'Invalid or unavailable service type' }, { status: 400 })
  }

  // tenantId is stamped here explicitly (Prisma requires it — it has no
  // schema default, so the scoped client can't silently supply it without
  // this object already satisfying the type checker). practiceId is
  // deliberately NOT set here: Visit.practiceId is nullable, so the scoped
  // client's write-path (lib/scopedPrisma.ts) fills it in from the session's
  // activePracticeId automatically — this is the "provider's active practice
  // finally lands on the visit" behavior the scoping layer adds.
  const visit = await prisma.visit.create({
    data: {
      patientId: patient.id,
      providerId: user.id,
      visitDate: new Date(),
      visitType: null,
      facilityType: patient.facilityType,
      careflowType: careflowType as (typeof allowed)[number],
      status: 'draft',
      tenantId: user.tenantId,
    },
  })

  return NextResponse.json(visit)
}
