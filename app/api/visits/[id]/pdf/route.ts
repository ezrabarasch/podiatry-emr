import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { buildPdf, wrap, CHARS_PER_LINE, type Line } from '@/lib/pdf'
import type { NoteNode } from '@/lib/careflow/note-types'

const fmt = (d: Date | null) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
const fmtDt = (d: Date | null) =>
  d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { prisma } = session

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

  // Progress note — structured (bold A/P labels) when noteStructured is
  // present; falls back to the original flat body(noteText) for notes
  // signed before Stage B (noteStructured null) — unchanged for those notes.
  heading('PROGRESS NOTE')
  const noteStructured = (n.noteStructured ?? null) as NoteNode[] | null
  if (noteStructured) {
    for (const node of noteStructured) {
      if (node.type === 'header') {
        // Bold as a unit, same as the web view's header styling — wrapped
        // (not a single unwrapped heading() line) because a header node can
        // be a full narrative sentence, not just a short section title (e.g.
        // the HPI static fragment), and could otherwise overflow the page width.
        lines.push({ text: '' })
        wrap(node.text).forEach(l => lines.push({ text: l, bold: true }))
      } else if (node.label) {
        // Bold "Label: " run + plain sentence run, same line, no Td between
        // them (see lib/pdf.ts) — wrap-continuation: only the FIRST physical
        // line carries the bold label (at a width reduced by the label's own
        // length); any remaining words wrap as plain lines at full width.
        const labelPrefix = `${node.label}: `
        const firstLineWidth = Math.max(1, CHARS_PER_LINE - labelPrefix.length)
        const firstSegment = wrap(node.text, firstLineWidth)[0] ?? ''
        const remainder = node.text.split(' ').slice(firstSegment.split(' ').length).join(' ')
        lines.push({ runs: [{ text: labelPrefix, bold: true }, { text: firstSegment }] })
        if (remainder) wrap(remainder).forEach(l => lines.push({ text: l }))
      } else {
        body(node.text)
      }
    }
  } else if (n.noteText) {
    body(n.noteText)
  } else {
    lines.push({ text: '(none)' })
  }

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
