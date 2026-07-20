import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'
import { buildPdf, wrap, type Line } from '@/lib/pdf'

const fmt = (d: Date | null) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
const fmtDt = (d: Date | null) =>
  d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!(await getSessionUser())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params
  const visit = await prisma.visit.findUnique({
    where: { id },
    include: {
      patient: { include: { facility: true } },
      provider: true,
      note: true,
    },
  })

  if (!visit) return NextResponse.json({ error: 'Visit not found' }, { status: 404 })
  if (!visit.note) return NextResponse.json({ error: 'Note not signed yet' }, { status: 400 })

  const n = visit.note
  const p = visit.patient
  const prov = `${visit.provider.firstName} ${visit.provider.lastName}${visit.provider.credentials ? `, ${visit.provider.credentials}` : ''}`
  const diagnoses = (n.diagnoses ?? []) as Array<{ icd10: string; description: string }>
  const cptCodes = (n.cptCodes ?? []) as Array<{ code: string; description: string; qualifier: string | null }>
  const procedureNotes = (n.procedureNotes ?? []) as Array<{ label: string; text: string }>

  const lines: Line[] = []
  const heading = (t: string) => { lines.push({ text: '' }, { text: t, bold: true }) }
  const body = (t: string) => wrap(t).forEach(l => lines.push({ text: l }))

  // Header
  lines.push({ text: 'PODIATRY PROGRESS NOTE', bold: true })
  lines.push({ text: `Patient:  ${p.lastName}, ${p.firstName}` })
  lines.push({ text: `DOB:      ${fmt(p.dob)}` })
  lines.push({ text: `Facility: ${p.facility.name} (${p.facilityType})` })
  lines.push({ text: `Visit:    ${fmt(visit.visitDate)}` })
  lines.push({ text: `Provider: ${prov}` })

  // Progress note
  heading('PROGRESS NOTE')
  if (n.noteText) body(n.noteText); else lines.push({ text: '(none)' })

  // Procedure notes
  procedureNotes.forEach(proc => {
    heading((proc.label || 'Procedure Note').toUpperCase())
    body(proc.text)
  })

  // Diagnoses
  heading('DIAGNOSES (ICD-10)')
  if (diagnoses.length === 0) lines.push({ text: '(none)' })
  else diagnoses.forEach(d => body(`${d.icd10}  ${d.description}`))

  // CPT codes
  heading('CPT CODES')
  if (cptCodes.length === 0) lines.push({ text: '(none)' })
  else cptCodes.forEach(c => body(`${c.code}  ${c.description}${c.qualifier ? `  [${c.qualifier.replace('_', ' ').toUpperCase()}]` : ''}`))

  // Addendum
  if (n.addendum) {
    heading('ADDENDUM')
    body(n.addendum)
  }

  // Footer
  lines.push({ text: '' }, { text: '' })
  lines.push({ text: `Signed: ${fmtDt(visit.signedAt)}`, bold: true })
  lines.push({ text: '' })
  lines.push({ text: `Provider signature: ${prov}` })
  lines.push({ text: '____________________________________________' })

  const pdf = buildPdf(lines)
  const filename = `note-${p.lastName}-${fmt(visit.visitDate).replace(/[^a-zA-Z0-9]/g, '')}.pdf`

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
