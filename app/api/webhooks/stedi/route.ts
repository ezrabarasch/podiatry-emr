import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { applyAcknowledgment, applyEra } from '@/lib/claims-service'
import { fetchReport, parse277Report, parseEraReport, verifyStediSignature } from '@/lib/claims-stedi'

// Stedi event destination (Standard Webhooks HMAC: webhook-id / webhook-timestamp / webhook-signature, secret whsec_...).
// Events are thin: they point at a transaction, so we fetch the 277CA / 835 report, match claims by patient control
// number, and apply. Idempotent: the webhook-id is stored on the claim event (unique per claim).
// Auth is the signature, not a session; fails closed (503) until STEDI_WEBHOOK_SECRET is set.
export async function POST(req: Request) {
  const secret = process.env.STEDI_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 503 })
  const raw = await req.text()
  const eventId = req.headers.get('webhook-id')
  if (!verifyStediSignature({ id: eventId, timestamp: req.headers.get('webhook-timestamp'), signature: req.headers.get('webhook-signature') }, raw, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try { body = JSON.parse(raw) } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  // ponytail: payload shape for thin events isn't verified against a live delivery yet; keys are probed defensively.
  const detail = (body.detail ?? body.data ?? body) as Record<string, unknown>
  const txId = [detail.transactionId, body.transactionId, (detail.transaction as Record<string, unknown> | undefined)?.id].find((v): v is string => typeof v === 'string')
  if (!txId) return NextResponse.json({ ignored: 'no transaction id' })
  const hint = JSON.stringify(body)
  const kinds = (['277', '835'] as const).filter(k => hint.includes(`x12.${k}`) || hint.includes(`"${k}"`))

  let applied = 0, unmatched = 0
  for (const kind of kinds.length ? kinds : (['277', '835'] as const)) {
    let report: Record<string, unknown>
    try { report = await fetchReport(kind, txId) } catch (e) {
      if (!kinds.length) continue // type unknown: the wrong kind simply 4xxs
      console.error('[stedi-webhook]', e instanceof Error ? e.message : e)
      return NextResponse.json({ error: 'Report fetch failed' }, { status: 500 }) // non-2xx -> Stedi retries
    }
    const items = kind === '277' ? parse277Report(report) : parseEraReport(report)
    for (const it of items) {
      const claim = await prisma.claim.findUnique({ where: { patientControlNumber: it.pcn }, select: { id: true } })
      if (!claim) { unmatched++; continue }
      if ('codes' in it) await applyAcknowledgment(prisma, claim.id, it.codes, { correlationId: it.correlationId, raw: it, source: '277CA', stediEventId: eventId })
      else await applyEra(prisma, claim.id, it, { raw: it, stediEventId: eventId })
      applied++
    }
  }
  return NextResponse.json({ applied, unmatched })
}
