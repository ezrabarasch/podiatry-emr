import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PUT(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: visitId } = await context.params
  const { section, fieldKey, value } = await req.json()

  if (!section || !fieldKey) {
    return NextResponse.json({ error: 'Missing section or fieldKey' }, { status: 400 })
  }

  if (value === null || value === '') {
    await prisma.visitFieldSelection.deleteMany({
      where: { visitId, section, fieldKey },
    })
    return NextResponse.json({ deleted: true })
  }

  const selection = await prisma.visitFieldSelection.upsert({
    where: { visitId_section_fieldKey: { visitId, section, fieldKey } },
    update: { value },
    create: { visitId, section, fieldKey, value },
  })

  // Keep Visit model fields in sync for fields that map to Visit columns
  if (section === 'header' && fieldKey === 'visit_type') {
    await prisma.visit.update({
      where: { id: visitId },
      data: { visitType: value as 'new_patient' | 'established' },
    })
  }
  if (section === 'hpi' && fieldKey === 'place_of_service') {
    await prisma.visit.update({
      where: { id: visitId },
      data: { placeOfService: value as 'bedside' | 'wheelchair' },
    })
  }

  return NextResponse.json(selection)
}
