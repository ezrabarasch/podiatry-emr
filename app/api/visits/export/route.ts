import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'
import { visitFilter } from '../route'

const HEADERS = ['Patient Name', 'DOB', 'Facility', 'Visit Date', 'Provider', 'Status', 'ICD-10 Codes', 'CPT Codes']

const fmtDate = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : '')

// RFC-4180 escaping: wrap in quotes and double any embedded quotes.
const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`

export async function GET(req: Request) {
  const { error } = await requireRole(['ADMIN', 'PROVIDER'])
  if (error) return error

  const { searchParams } = new URL(req.url)

  const visits = await prisma.visit.findMany({
    where: visitFilter(searchParams),
    include: {
      patient: { select: { firstName: true, lastName: true, dob: true, facility: { select: { name: true } } } },
      provider: { select: { firstName: true, lastName: true, credentials: true } },
      note: { select: { diagnoses: true, cptCodes: true } },
    },
    orderBy: { visitDate: 'desc' },
  })

  const rows = visits.map(v => {
    const dx = ((v.note?.diagnoses ?? []) as Array<{ icd10?: string }>).map(d => d.icd10).filter(Boolean).join('; ')
    const cpt = ((v.note?.cptCodes ?? []) as Array<{ code?: string }>).map(c => c.code).filter(Boolean).join('; ')
    return [
      `${v.patient.lastName}, ${v.patient.firstName}`,
      fmtDate(v.patient.dob),
      v.patient.facility.name,
      fmtDate(v.visitDate),
      `${v.provider.firstName} ${v.provider.lastName}${v.provider.credentials ? `, ${v.provider.credentials}` : ''}`,
      v.status,
      dx,
      cpt,
    ].map(String).map(csvCell).join(',')
  })

  const csv = [HEADERS.map(csvCell).join(','), ...rows].join('\r\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="visits.csv"',
    },
  })
}
