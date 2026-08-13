import { NextResponse } from 'next/server'
import { FacilityType, Prisma } from '@prisma/client'
import { requireRole } from '@/lib/auth'

const trimOrNull = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

export async function GET() {
  const { prisma, error } = await requireRole(['ADMIN'])
  if (error) return error

  const facilities = await prisma.facility.findMany({ orderBy: { name: 'asc' } })
  return NextResponse.json(facilities)
}

export async function POST(req: Request) {
  const { user, prisma, error } = await requireRole(['ADMIN'])
  if (error) return error

  const b = await req.json()
  if (!b.name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  if (!Object.values(FacilityType).includes(b.facilityType)) {
    return NextResponse.json({ error: 'Invalid facility type' }, { status: 400 })
  }
  if (!b.practiceId?.trim()) return NextResponse.json({ error: 'Practice is required' }, { status: 400 })

  try {
    const facility = await prisma.facility.create({
      data: {
        name: b.name.trim(),
        facilityType: b.facilityType,
        practiceId: b.practiceId.trim(),
        tenantId: user.tenantId,
        address: trimOrNull(b.address),
        npi: trimOrNull(b.npi),
        posCode: trimOrNull(b.posCode),
        pccFacilityId: trimOrNull(b.pccFacilityId),
        adminContactName: trimOrNull(b.adminContactName),
        adminContactPhone: trimOrNull(b.adminContactPhone),
        adminContactEmail: trimOrNull(b.adminContactEmail),
        donContactName: trimOrNull(b.donContactName),
        donContactPhone: trimOrNull(b.donContactPhone),
        donContactEmail: trimOrNull(b.donContactEmail),
      },
    })
    return NextResponse.json(facility)
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
      return NextResponse.json({ error: 'Invalid practice' }, { status: 400 })
    }
    throw e
  }
}
