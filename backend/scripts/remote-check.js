// Deployment check - diagnoses the live setup in one command.
//
//   node scripts/remote-check.js
//
// It answers the only question that matters when the app does not load on a
// phone: WHERE is it broken? The chain is
//
//   phone -> Vercel (the frontend) -> Render (the API) -> Neon (the database)
//
// and every link can fail on its own. This script checks each one and prints
// a plain-English verdict. Nothing here needs a browser, so CORS cannot get
// in the way - the checks see exactly what the host is doing.
//
// Overridable with env vars:
//   API_URL     the API origin      (default https://abbey-backend.onrender.com)
//   APP_URL     the frontend origin (default https://hotel-and-gym-system.vercel.app)

const API = (process.env.API_URL || 'https://hotel-and-gym-system.onrender.com').replace(/\/+$/, '')
const APP = (process.env.APP_URL || 'https://hotel-and-gym-system.vercel.app').replace(/\/+$/, '')

const results = []
const ok = (name, pass, detail) => {
  results.push({ name, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`)
}
const note = (text) => console.log(`      ${text}`)

async function main() {
  console.log(`API      : ${API}`)
  console.log(`Frontend : ${APP}\n`)

  /* ---------------------------- 1. the API is up --------------------------- */
  let health = null
  try {
    const res = await fetch(`${API}/health`, { headers: { Accept: 'application/json' } })
    const text = await res.text()
    health = { status: res.status, text, headers: res.headers }
    if (res.ok) {
      ok('the API is running', true, `HTTP ${res.status} ${text.slice(0, 80)}`)
    } else {
      ok('the API is running', false, `HTTP ${res.status}`)
      const routing = res.headers.get('x-render-routing')
      if (routing) note(`Render says: x-render-routing: ${routing}`)
      if (/suspended/i.test(text)) {
        note('The service is SUSPENDED. Render dashboard -> Services ->')
        note('the service -> "Resume Service".')
      } else if (/deploy/i.test(text)) {
        note('A deploy is in progress - wait for it to finish and re-run this.')
      } else {
        note(text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160))
      }
    }
  } catch (err) {
    ok('the API is running', false, err.message)
    note('The API host did not answer at all.')
  }

  /* --------------------------- 2. CORS from the app ------------------------ */
  for (const origin of [APP, APP.replace('.vercel.app', '-preview.vercel.app')]) {
    try {
      const res = await fetch(`${API}/api/auth/login`, {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type,authorization',
        },
      })
      const allowed = res.headers.get('access-control-allow-origin')
      ok(`CORS allows ${origin}`, allowed === origin, allowed ? '' : 'no allow-origin header')
    } catch (err) {
      ok(`CORS allows ${origin}`, false, err.message)
    }
  }

  /* ------------------------- 3. a real login round trip -------------------- */
  try {
    const res = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: APP },
      body: JSON.stringify({ email: 'brenie', password: 'brenie' }),
    })
    const body = await res.json().catch(() => ({}))
    ok('the API accepts a login', res.ok && !!body.token, res.ok ? 'token returned' : `HTTP ${res.status}`)
  } catch (err) {
    ok('the API accepts a login', false, err.message)
  }

  /* ------------------ 4. the deployed frontend points at it ---------------- */
  try {
    const res = await fetch(`${APP}/api-config.json`, { cache: 'no-store' })
    const cfg = await res.json().catch(() => ({}))
    const configured = cfg.apiUrl || ''
    ok('the deployed frontend has an API config', res.ok && !!configured, configured || 'no apiUrl')
    if (configured) {
      // Compare the origins: the config carries the "/api" path, the API
      // variable is just the host.
      const same = new URL(configured).origin === new URL(API).origin
      ok('the frontend points at this API', same, same ? '' : `frontend -> ${configured}`)
    }
  } catch (err) {
    ok('the deployed frontend has an API config', false, err.message)
  }

  /* ------------------ 5. no leftover localhost in the bundle --------------- */
  try {
    const html = await (await fetch(APP, { cache: 'no-store' })).text()
    const srcs = [...html.matchAll(/src="(\/_next\/static\/[^"]+\.js)"/g)].map((m) => m[1])
    let bundle = ''
    for (const src of srcs) {
      bundle += await (await fetch(APP + src, { cache: 'no-store' })).text()
    }
    const local = bundle.includes('localhost:5000')
    ok('the deployed bundle has no localhost API url', !local, local ? 'localhost:5000 is still in the bundle' : '')
  } catch (err) {
    ok('the deployed bundle has no localhost API url', false, err.message)
  }

  const failed = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  if (failed.length) {
    console.log('\nNOT READY. The failing checks above say exactly which link is broken.')
    process.exit(1)
  }
  console.log('READY. The deployed app can sign in.')
}

main().catch((err) => {
  console.error('CHECK FAILED:', err.message)
  process.exit(1)
})
