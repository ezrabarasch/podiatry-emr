#!/usr/bin/env node
// PCC webhook event poller (slice-2 automation, staging only). Finds
// webhook_events rows with status='received' and invokes
// process_webhook_event.py per row - the processor itself marks each row
// processed/failed/skipped, so this script only has to find work and shell
// out to it. Mirrors sync-scheduler.js's Node-decides -> execSync-into-Python
// -> log pattern; see that file for the sibling PCC-sync version of this.
//
// ponytail: DELIBERATELY NOT a one-shot-under-pm2-cron_restart script like
// sync-scheduler.js. That works fine at an hourly cadence, but its
// autorestart-the-instant-it-exits behavior is already known (see
// sync-scheduler.js's own history) to restart far more often than the cron
// expression alone implies. Webhooks need a ~30s cadence to feel prompt - the
// same one-shot pattern at that interval would multiply that same churn
// ~100x for no benefit. Staying resident with setInterval is the normal way
// to run a frequent poll under pm2 (autorestart only fires on an actual
// crash, not every tick).
//
//   pm2 start scripts/webhook-poller.js --name "emr-webhook-poller"

const { execFileSync } = require('child_process')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

const PYTHON = '/home/dbcreator/pcc/.venv/bin/python'
const SCRIPT = '/home/dbcreator/pcc/process_webhook_event.py'
const POLL_INTERVAL_MS = 30 * 1000

let running = false

async function tick() {
  if (running) return // previous tick still working through a backlog - skip, don't overlap
  running = true
  try {
    const due = await prisma.webhookEvent.findMany({
      where: { status: 'received' },
      orderBy: { receivedAt: 'asc' },
    })
    for (const evt of due) {
      console.log(`[${new Date().toISOString()}] Processing ${evt.messageId} (${evt.eventType})...`)
      try {
        // execFileSync, not execSync/a shell string - messageId comes from
        // PCC's own request body (external input), so it must never be
        // interpolated into a shell command.
        const out = execFileSync(PYTHON, [SCRIPT, '--message-id', evt.messageId], {
          encoding: 'utf8',
          timeout: 60 * 1000,
        })
        console.log(`  ${out.trim()}`)
      } catch (err) {
        // The processor already marks its own failures in webhook_events;
        // this catch is only for it crashing outright. One event failing
        // must never stop the rest of the batch.
        console.error(`  ✗ ${evt.messageId}: ${err.message}`)
      }
    }
  } finally {
    running = false
  }
}

console.log(`[${new Date().toISOString()}] webhook-poller started, polling every ${POLL_INTERVAL_MS / 1000}s`)
tick().catch(e => console.error(e))
setInterval(() => { tick().catch(e => console.error(e)) }, POLL_INTERVAL_MS)
