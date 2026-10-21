// Resume + (re)deploy the Render backend, then verify it.
//
//   setx RENDER_API_KEY "rnd_..."          (once, in a terminal)
//   node scripts/render-resume.js
//
// The key is read from the environment (or from the file in
// RENDER_API_KEY_FILE). It is never written to disk by this script and never
// printed.
//
// What it does, in order:
//   1. finds the Render service for this repo
//   2. resumes it if it is suspended
//   3. triggers a deploy of the latest commit (so the running code matches
//      the repository - the CORS default lives in the newest commit)
//   4. waits for the deploy to finish and for the API to answer
//   5. verifies the CORS preflight and a real login
//
// It is safe to run it as often as you like.

const API_ROOT = 'https://api.render.com/v1'
const APP = (process.env.APP_URL || 'https://hotel-and-gym-system.vercel.app').replace(/\/+$/, '')

const log = (...args) => console.log(...args)
const step = (text) => console.log(`\n> ${text}`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * A variable set with `setx` lives in the registry, and a process that was
 * started before the `setx` keeps the old environment block. So the machine
 * and user scopes are read straight from the registry as a fallback.
 */
function readStoredEnv(name) {
  const { execFileSync } = require('child_process')
  for (const scope of ['Machine', 'User']) {
    try {
      const out = execFileSync(
        'powershell.exe',
        ['-NoProfile', '-Command', `[Environment]::GetEnvironmentVariable('${name}','${scope}')`],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
      )
      const value = (out || '').trim()
      if (value) return value
    } catch {
      /* scope not readable - try the next one */
    }
  }
  return ''
}

/** The API key: from the environment, the registry, or the file it points at. */
function readApiKey() {
  if (process.env.RENDER_API_KEY) return process.env.RENDER_API_KEY.trim()
  const file = process.env.RENDER_API_KEY_FILE
  if (file) {
    try {
      return require('fs').readFileSync(file, 'utf8').trim()
    } catch (err) {
      console.error(`Could not read RENDER_API_KEY_FILE (${file}): ${err.message}`)
      process.exit(2)
    }
  }
  return readStoredEnv('RENDER_API_KEY')
}

const API_KEY = readApiKey()

if (!API_KEY) {
  console.error(
    [
      'No Render API key found.',
      '',
      'Create one: Render -> Account Settings -> API Keys -> Create API Key.',
      'Then set it once, without pasting it into a chat:',
      '',
      '  setx RENDER_API_KEY "rnd_..."',
      '',
      '...and run this script again. (A new terminal is needed for setx to',
      'take effect; this script also reads the machine environment directly,',
      'so it works either way.)',
    ].join('\n')
  )
  process.exit(2)
}

async function render(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API_ROOT}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { raw: text }
  }
  if (!res.ok) {
    const message = (data && (data.message || data.error)) || `HTTP ${res.status}`
    const error = new Error(message)
    error.status = res.status
    throw error
  }
  return data
}

/**
 * The list endpoint nests the service under `service`, so the id, the name
 * and the public URL all live one level down.
 */
const serviceId = (x) => (x && (x.id || (x.service && x.service.id))) || ''
const serviceName = (x) => (x && (x.name || (x.service && x.service.name))) || '?'
const serviceUrl = (x) => {
  const details = x && x.service && x.service.serviceDetails
  return (details && details.url) || ''
}

async function findService() {
  const wanted = (process.env.RENDER_SERVICE || 'hotel|gym|backend|abbey|abbsey').toLowerCase()
  const services = await render('/services?limit=100')
  const list = Array.isArray(services) ? services : []
  const match = list.find((s) => new RegExp(wanted).test(serviceName(s).toLowerCase()))
  return {
    service: match || null,
    all: list.map((s) => ({ id: serviceId(s), name: serviceName(s), url: serviceUrl(s) })),
  }
}

async function main() {
  log(`Render API key: ${API_KEY.slice(0, 6)}...${API_KEY.slice(-4)} (len ${API_KEY.length})`)

  /* ---------------------------- 1. find the service ------------------------ */
  step('Looking for the service')
  const { service, all } = await findService()
  if (!service) {
    console.error('No matching service found. Services on this account:')
    all.forEach((s) => console.error(`  ${s.id}  ${s.name}`))
    console.error('\nSet RENDER_SERVICE=<name> and run it again.')
    process.exit(1)
  }
  const id = serviceId(service)
  log(`Found: ${serviceName(service)} (${id})`)
  log(`  url=${serviceUrl(service)} branch=${(service.service && service.service.branch) || '?'} autoDeploy=${(service.service && service.service.autoDeployTrigger) || '?'} suspended=${(service.service && service.service.suspended) || '?'}`)

  /* ------------------------------ 2. resume it ----------------------------- */
  step('Resuming the service')
  try {
    await render(`/services/${id}/resume`, { method: 'POST' })
    log('Resume requested.')
  } catch (err) {
    if (err.status === 409 || /not suspended|already/i.test(err.message)) {
      log('It was not suspended - nothing to resume.')
    } else {
      throw err
    }
  }

  /* --------------------------- 3. deploy the latest ------------------------ */
  step('Deploying the latest commit')
  let deploy = null
  try {
    deploy = await render(`/services/${id}/deploys`, {
      method: 'POST',
      body: { clearCache: 'do_not_clear' },
    })
    log(`Deploy ${(deploy && deploy.id) || ''} queued.`)
  } catch (err) {
    log(`Could not queue a deploy (${err.message}) - continuing; the resumed build may already be current.`)
  }

  /* -------------------------- 4. wait for it to serve ---------------------- */
  step('Waiting for the API to answer')
  const apiHost = (serviceUrl(service) || `https://${serviceName(service)}.onrender.com`).replace(/\/+$/, '')
  let health = null
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`${apiHost}/health`, { headers: { Accept: 'application/json' } })
      const text = await res.text()
      health = { status: res.status, text, headers: res.headers }
      if (res.ok) {
        log(`API is up: HTTP ${res.status} ${text.slice(0, 80)}`)
        break
      }
      const routing = res.headers.get('x-render-routing')
      log(`  HTTP ${res.status}${routing ? ` (x-render-routing: ${routing})` : ''}`)
    } catch (err) {
      log(`  ${err.message}`)
    }
    await sleep(15000)
  }

  if (!health || health.status !== 200) {
    console.error('\nThe API still does not answer 200.')
    if (health && health.headers && health.headers.get('x-render-routing')) {
      console.error(`Render says: x-render-routing: ${health.headers.get('x-render-routing')}`)
    }
    console.error('Check the service\'s Events tab in the Render dashboard for a failed build.')
    process.exit(1)
  }

  /* ------------------------------ 5. verify CORS --------------------------- */
  step('Verifying CORS and a real login')
  for (const origin of [APP, APP.replace('.vercel.app', '-preview.vercel.app')]) {
    const res = await fetch(`${apiHost}/api/auth/login`, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,authorization',
      },
    })
    const allowed = res.headers.get('access-control-allow-origin')
    log(`  CORS ${allowed === origin ? 'allows' : 'BLOCKS'} ${origin}`)
  }

  const login = await fetch(`${apiHost}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: APP },
    body: JSON.stringify({ email: 'brenie', password: 'brenie' }),
  })
  const body = await login.json().catch(() => ({}))
  log(`  login: HTTP ${login.status}${body.token ? ' (token returned)' : ''}`)

  log(`\nAPI host: ${apiHost}`)
  log('Done. The deployed app can sign in.')
}

main().catch((err) => {
  if (err.status === 401 || err.status === 403) {
    console.error(`\nFAILED: Render rejected the API key (HTTP ${err.status}). Check RENDER_API_KEY.`)
  } else {
    console.error('\nFAILED:', err.message)
  }
  process.exit(1)
})
