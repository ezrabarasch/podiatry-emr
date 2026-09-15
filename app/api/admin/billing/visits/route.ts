import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { billingVisitsQuery } from '../export/route'

// One object per visit (not per CPT code) - backs the "View Details" modal,
// which lists visits, unlike the export's one-row-per-CPT-code CSV.
export async function GET(req: Request) {
  const { prisma, error } = await requireRole(['ADMIN', 'OFFICE'])
  if (error) return error

  const { searchParams } = new URL(req.url)
  const weekStart = searchParams.get('weekStart')
  const weekEnd = searchParams.get('weekEnd')
  if (!weekStart || !weekEnd) {
    return NextResponse.json({ error: 'weekStart and weekEnd are required' }, { status: 400 })
  }

  const visits = await prisma.visit.findMany(billingVisitsQuery(weekStart, weekEnd))

  const result = visits.map(v => {
    const cptCodes = (v.note?.cptCodes ?? []) as Array<{ code?: string }>
    const diagnoses = (v.note?.diagnoses ?? []) as Array<{ icd10?: string }>
    return {
      visitId: v.id,
      dos: v.visitDate.toISOString().slice(0, 10),
      patientName: `${v.patient.lastName}, ${v.patient.firstName}`,
      providerName: `${v.provider.firstName} ${v.provider.lastName}${v.provider.credentials ? ` ${v.provider.credentials}` : ''}`,
      facilityName: v.patient.facility.name,
      cptCodes: cptCodes.map(c => c.code).filter(Boolean),
      dxCodes: diagnoses.map(d => d.icd10).filter(Boolean),
    }
  })

  return NextResponse.json(result)
}
