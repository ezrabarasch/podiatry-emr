import { NextResponse } from 'next/server'
import { FacilityType, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'

const trimOrNull = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { error } = await requireRole(['ADMIN'])
  if (error) return error

  const { id } = await context.params
  const facility = await prisma.facility.findUnique({ where: { id } })
  if (!facility) return NextResponse.json({ error: 'Facility not found' }, { status: 404 })
  return NextResponse.json(facility)
}

export async function PUT(req: Request, context: { params: Promise<{ id: string }> }) {
  const { error } = await requireRole(['ADMIN'])
  if (error) return error

  const { id } = await context.params
  const b = await req.json()

  const data: Prisma.FacilityUpdateInput = {}
  if (b.name !== undefined) {
    if (!b.name.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    data.name = b.name.trim()
  }
  if (b.facilityType !== undefined) {
    if (!Object.values(FacilityType).includes(b.facilityType)) {
      return NextResponse.json({ error: 'Invalid facility type' }, { status: 400 })
    }
    data.facilityType = b.facilityType
  }
  if (b.address !== undefined) data.address = trimOrNull(b.address)
  if (b.npi !== undefined) data.npi = trimOrNull(b.npi)
  if (b.posCode !== undefined) data.posCode = trimOrNull(b.posCode)
  if (b.pccFacilityId !== undefined) data.pccFacilityId = trimOrNull(b.pccFacilityId)
  if (b.adminContactName !== undefined) data.adminContactName = trimOrNull(b.adminContactName)
  if (b.adminContactPhone !== undefined) data.adminContactPhone = trimOrNull(b.adminContactPhone)
  if (b.adminContactEmail !== undefined) data.adminContactEmail = trimOrNull(b.adminContactEmail)
  if (b.donContactName !== undefined) data.donContactName = trimOrNull(b.donContactName)
  if (b.donContactPhone !== undefined) data.donContactPhone = trimOrNull(b.donContactPhone)
  if (b.donContactEmail !== undefined) data.donContactEmail = trimOrNull(b.donContactEmail)
  if (b.active !== undefined) data.active = !!b.active

  try {
    const facility = await prisma.facility.update({ where: { id }, data })
    return NextResponse.json(facility)
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return NextResponse.json({ error: 'Facility not found' }, { status: 404 })
    }
    throw e
  }
}
