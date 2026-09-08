import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'

// PCC sends Authorization: Basic base64(user:pass) using the credentials we
// set on the subscription. If PCC_WEBHOOK_USER/PASS aren't configured yet,
// warn and allow through rather than failing the very first connectivity test.
function checkAuth(req: Request): boolean {
  const user = process.env.PCC_WEBHOOK_USER
  const pass = process.env.PCC_WEBHOOK_PASS
  if (!user || !pass) {
    console.warn('[PCC-WEBHOOK] PCC_WEBHOOK_USER/PASS not set - skipping auth check')
    return true
  }
  const expected = Buffer.from(`Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`)
  const actual = Buffer.from(req.headers.get('authorization') ?? '')
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

// Slice 1: ACK fast + log. No outbound PCC calls, no DB writes - that's slice 2
// (patient.admit -> GET Patient -> create Patient), well within PCC's 90s ACK budget.
export async function POST(req: Request) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { messageId, eventType, patientId, facId, orgUuid, eventDate } = body ?? {}
  console.log('[PCC-WEBHOOK] received:', JSON.stringify({ messageId, eventType, patientId, facId, orgUuid, eventDate }))

  return NextResponse.json({ received: true }, { status: 200 })
}
