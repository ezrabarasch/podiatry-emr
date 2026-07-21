import { NextResponse } from 'next/server'
import { FacilityType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'

const trimOrNull = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

export async function GET() {
  const { error } = await requireRole(['ADMIN'])
  if (error) return error

  const facilities = await prisma.facility.findMany({ orderBy: { name: 'asc' } })
  return NextResponse.json(facilities)
}

export async function POST(req: Request) {
  const { error } = await requireRole(['ADMIN'])
  if (error) return error

  const b = await req.json()
  if (!b.name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  if (!Object.values(FacilityType).includes(b.facilityType)) {
    return NextResponse.json({ error: 'Invalid facility type' }, { status: 400 })
  }

  const facility = await prisma.facility.create({
    data: {
      name: b.name.trim(),
      facilityType: b.facilityType,
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
}
