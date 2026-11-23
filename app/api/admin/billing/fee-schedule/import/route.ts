import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { parseFeeCsv } from '@/lib/fee-schedule'
import { upsertFees } from '@/lib/fee-schedule-service'

// POST { csv } - CSV file contents or pasted text. Columns cpt_code,description,amount (header
// optional) or cpt,amount pairs. Upsert: existing codes get the new charge, new ones are added.
// All-or-nothing: any bad line returns 400 with the line numbers and nothing is written.
export async function POST(req: Request) {
  const { error } = await requireRole(['ADMIN'])
  if (error) return error
  const b = await req.json().catch(() => ({}))
  if (typeof b.csv !== 'string' || b.csv.length > 1_000_000) return NextResponse.json({ error: 'csv text is required' }, { status: 400 })
  const { items, errors } = parseFeeCsv(b.csv)
  if (errors.length) return NextResponse.json({ error: `${errors.length} bad line(s); nothing imported`, errors: errors.slice(0, 20) }, { status: 400 })
  await upsertFees(items)
  return NextResponse.json({ saved: items.length })
}
