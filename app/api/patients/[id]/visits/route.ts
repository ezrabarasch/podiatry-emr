import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, requireRole } from '@/lib/auth'
import { pageParams } from '@/lib/pagination'
import { DEFAULT_TENANT_ID } from '@/lib/tenant'

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!(await getSessionUser())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
  const { user, error } = await requireRole(['PROVIDER', 'ADMIN'])
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

  const visit = await prisma.visit.create({
    data: {
      patientId: patient.id,
      providerId: user.id,
      visitDate: new Date(),
      visitType: null,
      facilityType: patient.facilityType,
      careflowType: careflowType as (typeof allowed)[number],
      status: 'draft',
      tenantId: DEFAULT_TENANT_ID, // STOPGAP: replace with session-derived tenantId in scoping phase
    },
  })

  return NextResponse.json(visit)
}
