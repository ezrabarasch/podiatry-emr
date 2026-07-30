const http = require('http')
const crypto = require('crypto')
const { exec } = require('child_process')

// Secret comes from the environment (set in the PM2 ecosystem/start command),
// falling back to the legacy hardcoded value so nothing breaks before the
// GitHub webhook config + PM2 env are updated in lockstep.
const SECRET = process.env.WEBHOOK_SECRET || 'emr-webhook-secret-2024'
const PORT = 9000

// Branch -> deploy script routing. A push to any other ref is acknowledged
// and ignored.
const DEPLOY_TARGETS = {
  'refs/heads/main': { name: 'production', script: '/opt/deploy-emr.sh' },
  'refs/heads/staging': { name: 'staging', script: '/opt/deploy-emr-staging.sh' },
}

// Timing-safe signature comparison - a plain !== leaks timing information.
function validSignature(body, sigHeader) {
  if (!sigHeader) return false
  const expected = 'sha256=' + crypto.createHmac('sha256', SECRET).update(body).digest('hex')
  const a = Buffer.from(sigHeader)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/deploy') {
    res.writeHead(404)
    res.end()
    return
  }
  let body = ''
  req.on('data', chunk => body += chunk)
  req.on('end', () => {
    if (!validSignature(body, req.headers['x-hub-signature-256'])) {
      console.log(`[${new Date().toISOString()}] Invalid signature`)
      res.writeHead(401)
      res.end()
      return
    }

    let payload
    try {
      payload = JSON.parse(body)
    } catch {
      res.writeHead(400)
      res.end('Bad payload')
      return
    }

    const target = DEPLOY_TARGETS[payload.ref]
    if (!target) {
      res.writeHead(200)
      res.end(`Ref ${payload.ref} not deployable, skipping`)
      return
    }

    console.log(`[${new Date().toISOString()}] ${target.name} deploy triggered by push to ${payload.ref} (${(payload.after || '').slice(0, 7)})`)
    res.writeHead(200)
    res.end(`Deploying ${target.name}...`)
    exec(target.script, (err, stdout, stderr) => {
      if (err) console.error(`[${target.name}] Deploy error:`, err)
      if (stdout) console.log(`[${target.name}] ${stdout}`)
      if (stderr) console.error(`[${target.name}] ${stderr}`)
    })
  })
})

server.listen(PORT, () => {
  console.log('Webhook server listening on port ' + PORT)
})

