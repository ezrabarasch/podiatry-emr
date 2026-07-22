#!/usr/bin/env node
// PCC sync scheduler. PM2 runs this hourly (--cron "0 * * * *"); the script
// decides which resources are actually due and triggers their Python sync.
//
//   pm2 start scripts/sync-scheduler.js --name "emr-sync-scheduler" --cron "0 * * * *"
//
// ponytail: no cron dependency — all configured crons fire at minute 0, so we
// back-scan hour by hour (max 8 days) to find each resource's last scheduled
// fire time and compare it against lastSyncAt.

const { execSync } = require('child_process')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

const PYTHON = '/home/dbcreator/pcc/.venv/bin/python'
const SCRIPT = '/home/dbcreator/pcc/sync_to_emr.py'

// Match one cron field ("*", "*/n", or an exact number) against a value.
function matchField(field, value) {
  if (field === '*') return true
  if (field.startsWith('*/')) return value % Number(field.slice(2)) === 0
  return Number(field) === value
}

// True if the 5-field cron fires at the given Date (local time).
function cronMatches(cron, d) {
  const [min, hr, dom, mon, dow] = cron.trim().split(/\s+/)
  return (
    matchField(min, d.getMinutes()) &&
    matchField(hr, d.getHours()) &&
    matchField(dom, d.getDate()) &&
    matchField(mon, d.getMonth() + 1) &&
    matchField(dow, d.getDay())
  )
}

// Most recent time (<= now) at which `cron` fired, or null if none in 8 days.
function lastFireTime(cron, now) {
  const t = new Date(now)
  t.setMinutes(0, 0, 0)
  for (let i = 0; i < 8 * 24; i++) {
    if (cronMatches(cron, t)) return t
    t.setHours(t.getHours() - 1)
  }
  return null
}

// node scripts/sync-scheduler.js --selftest
function selftest() {
  const assert = require('assert')
  // Fixed reference: Wed 2026-07-22 09:00 local.
  const now = new Date(2026, 6, 22, 9, 5, 0)
  // Every 6h (0,6,12,18): last fire before 09:00 is 06:00 same day.
  assert.strictEqual(lastFireTime('0 */6 * * *', now).getHours(), 6)
  // Every 4h (0,4,8,...): last fire is 08:00.
  assert.strictEqual(lastFireTime('0 */4 * * *', now).getHours(), 8)
  // Daily 1am: last fire is today 01:00.
  const d = lastFireTime('0 1 * * *', now)
  assert.strictEqual(d.getHours(), 1)
  assert.strictEqual(d.getDate(), 22)
  // Weekly Mon 1am: last Monday before Wed is 2026-07-20.
  const w = lastFireTime('0 1 * * 1', now)
  assert.strictEqual(w.getDay(), 1)
  assert.strictEqual(w.getDate(), 20)
  console.log('selftest OK')
}

if (process.argv.includes('--selftest')) { selftest(); process.exit(0) }

async function main() {
  const now = new Date()

  const source = await prisma.integrationSource.findUnique({
    where: { name: 'PCC' },
    include: { configs: { where: { enabled: true } } },
  })
  if (!source) {
    console.log('No PCC source configured; nothing to do.')
    return
  }

  for (const cfg of source.configs) {
    const fire = lastFireTime(cfg.cronExpression, now)
    // Due if there is a fire time since the last successful sync.
    const due = fire && (!cfg.lastSyncAt || cfg.lastSyncAt < fire)
    if (!due) continue

    console.log(`[${now.toISOString()}] Syncing ${cfg.resourceName}...`)
    try {
      const out = execSync(`${PYTHON} ${SCRIPT} --resource ${cfg.resourceName}`, {
        encoding: 'utf8',
        timeout: 30 * 60 * 1000,
      })
      // sync_to_emr.py prints the row count as its final token.
      const count = parseInt(out.trim().split(/\s+/).pop(), 10)
      await prisma.integrationSyncConfig.update({
        where: { id: cfg.id },
        data: { lastSyncAt: new Date(), lastCount: Number.isNaN(count) ? null : count, lastError: null },
      })
      console.log(`  ✓ ${cfg.resourceName}: ${count}`)
    } catch (err) {
      await prisma.integrationSyncConfig.update({
        where: { id: cfg.id },
        data: { lastSyncAt: new Date(), lastError: String(err.message || err).slice(0, 1000) },
      })
      console.error(`  ✗ ${cfg.resourceName}: ${err.message}`)
    }
  }

  await prisma.integrationSource.update({ where: { id: source.id }, data: { lastSyncAt: new Date() } })
}

main()
  .catch(e => { console.error(e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
