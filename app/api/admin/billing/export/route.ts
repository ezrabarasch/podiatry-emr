import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'

// RFC-4180 escaping: wrap in quotes and double any embedded quotes. Every
// column is quoted (not just ones that need it) - Excel strips leading
// zeros from bare numeric-looking cells, which would corrupt CPT/ICD-10/
// NPI/MRN/member-id values.
export const csvCell = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`

const fmtDate = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : '')

type CoverageRow = { payerName: string; payerType: string; memberId: string | null; isPrimary: boolean; active: boolean }
type PractitionerRow = { firstName: string | null; lastName: string | null; npi: string | null; relation: string | null }

// Coverage/practitioner "first match" needs a deterministic order - Prisma
// does not guarantee row order without an explicit orderBy, so the include
// below sorts by syncedAt ascending and these just take the first hit.
export function resolvePrimaryCoverage(coverages: CoverageRow[]) {
  return coverages.find(c => c.isPrimary) ?? null
}

export function resolveSecondaryCoverage(coverages: CoverageRow[]) {
  return coverages.find(c => !c.isPrimary && c.payerType !== 'COMMERCIAL') ?? null
}

export function resolveReferringProvider(practitioners: PractitionerRow[]) {
  return practitioners.find(p => p.relation === 'Primary') ?? null
}

// Shared query both billing routes need - one signed-visit lookup, fully
// loaded with everything the export/detail views read from.
export function billingVisitsQuery(weekStart: string, weekEnd: string) {
  return {
    where: {
      status: 'signed' as const,
      visitDate: {
        gte: new Date(`${weekStart}T00:00:00.000Z`),
        lte: new Date(`${weekEnd}T23:59:59.999Z`),
      },
    },
    include: {
      note: true,
      provider: true,
      patient: {
        include: {
          facility: true,
          coverages: { where: { active: true }, orderBy: { syncedAt: 'asc' as const } },
          practitioners: { orderBy: { syncedAt: 'asc' as const } },
        },
      },
    },
    orderBy: { visitDate: 'asc' as const },
  }
}

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

  const HEADERS = [
    'week_start', 'week_end', 'dos', 'patient_last', 'patient_first', 'dob', 'mrn',
    'facility_name', 'pos_code', 'provider_last', 'provider_first', 'provider_npi',
    'primary_insurance_name', 'primary_insurance_id', 'secondary_insurance_name', 'secondary_insurance_id',
    'referring_provider_last', 'referring_provider_first', 'referring_provider_npi',
    'cpt_code', 'cpt_description', 'cpt_qualifier', 'dx_codes', 'dx_descriptions',
    'visit_id', 'careflow_type', 'signed_at',
  ]

  const rows: string[][] = []

  for (const v of visits) {
    const cptCodes = (v.note?.cptCodes ?? []) as Array<{ code?: string; description?: string; qualifier?: string }>
    if (cptCodes.length === 0) continue // nothing to bill for this visit - no rows contributed

    const diagnoses = (v.note?.diagnoses ?? []) as Array<{ icd10?: string; description?: string }>
    const dxCodes = diagnoses.map(d => d.icd10 ?? '').join('|')
    const dxDescriptions = diagnoses.map(d => d.description ?? '').join('|')

    const primary = resolvePrimaryCoverage(v.patient.coverages)
    const secondary = resolveSecondaryCoverage(v.patient.coverages)
    const referring = resolveReferringProvider(v.patient.practitioners)

    const common = [
      weekStart, weekEnd, fmtDate(v.visitDate),
      v.patient.lastName, v.patient.firstName, fmtDate(v.patient.dob), v.patient.medicalRecordNumber ?? '',
      v.patient.facility.name, v.patient.facility.posCode ?? '',
      v.provider.lastName, v.provider.firstName, v.provider.npi ?? '',
      primary?.payerName ?? '', primary?.memberId ?? '',
      secondary?.payerName ?? '', secondary?.memberId ?? '',
      referring?.lastName ?? '', referring?.firstName ?? '', referring?.npi ?? '',
    ]

    for (const cpt of cptCodes) {
      rows.push([
        ...common,
        cpt.code ?? '', cpt.description ?? '', cpt.qualifier ?? '',
        dxCodes, dxDescriptions,
        v.id, v.careflowType, fmtDate(v.signedAt),
      ])
    }
  }

  const csv = [HEADERS, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="billing_export_${weekStart}_${weekEnd}.csv"`,
    },
  })
}
