// Socket.IO smoke test — run while the backend is up on port 5000:
//   node scripts/socket-test.js
//
// Logs in, opens an (unauthenticated) socket, records a ₱250 walk-in payment
// and verifies that a `notification` and a `stats:update` event arrive, plus
// that the application-level `ping` heartbeat answers. Cleans up after itself
// by deleting the test payment.
//
// Requires the devDependency `socket.io-client` (npm i -D socket.io-client).

const { io } = require('socket.io-client')
const { seedDemo, seedEmpty } = require('./seed-helper')

const BASE = process.env.API_URL || 'http://localhost:5000'

async function main() {
  // The app is seeded brand new; the test needs a known state.
  seedDemo()

  // 1. login
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'brenie', password: 'brenie' }),
  })
  if (!loginRes.ok) throw new Error(`login failed: ${loginRes.status} ${await loginRes.text()}`)
  const { token } = await loginRes.json()
  console.log('login ok')

  // 2. connect a socket (auth is optional; anonymous is fine)
  const socket = io(BASE, { transports: ['websocket'] })

  const events = { notification: null, stats: null, residences: null, pong: null }
  socket.on('connect', () => console.log('socket connected (anonymous):', socket.id))
  socket.on('notification', (n) => { events.notification = n; console.log('notification event:', JSON.stringify(n)) })
  socket.on('stats:update', (s) => {
    events.stats = s
    console.log(`stats:update event: todaySales=${s.todaySales} openSales=${s.openSales} openTransactions=${s.openTransactions}`)
  })
  socket.on('residences:update', (r) => {
    events.residences = r
    console.log(`residences:update event: earned=${r.summary.totalEarned} occupied=${r.summary.occupied}/${r.summary.total} month=${r.summary.earnedThisMonth}`)
  })
  socket.on('connect_error', (err) => console.error('connect_error:', err.message))

  socket.on('ready', () => {})
  await new Promise((resolve) => socket.on('connect', resolve))

  // 3. ping heartbeat
  const pong = await new Promise((resolve) => {
    socket.emit('ping', resolve)
    setTimeout(() => resolve(null), 3000)
  })
  console.log('ping ->', pong ? 'pong ok' : 'NO PONG')
  events.pong = pong

  // 4. record a payment -> expect notification + stats:update
  const res = await fetch(`${BASE}/api/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ memberName: 'Walk-in guest', amount: 250, itemName: 'Walk-in', method: 'Cash' }),
  })
  const payment = await res.json()
  console.log('POST /api/payments ->', res.status, payment.id)

  // 5. wait for both events
  const deadline = Date.now() + 8000
  while ((!events.notification || !events.stats) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100))
  }

  // 6. cleanup: delete the test payment
  const del = await fetch(`${BASE}/api/payments/${payment.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  console.log('cleanup DELETE ->', del.status)

  // 7. residences:update — book a vacant unit, expect the push. The rent is
  // applied automatically when the lease is saved.
  const authed = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  const unitsRes = await fetch(`${BASE}/api/residences/units`, { headers: authed })
  const { units } = await unitsRes.json()
  const vacant = units.find((u) => u.status === 'VACANT')

  const leaseRes = await fetch(`${BASE}/api/residences/leases`, {
    method: 'POST',
    headers: authed,
    body: JSON.stringify({
      unitId: vacant.id,
      renterName: 'Socket Test',
      contact: '0900 000 0000',
      startDate: '2026-10-01',
      endDate: '2027-10-01',
      monthlyRent: vacant.monthlyRent,
    }),
  })
  const lease = await leaseRes.json()
  console.log('POST /api/residences/leases ->', leaseRes.status, 'automatic rent ->', lease.payment?.amount)

  const resDeadline = Date.now() + 8000
  while (!events.residences && Date.now() < resDeadline) {
    await new Promise((r) => setTimeout(r, 100))
  }

  // 8. clean up the test lease (end it, then delete it)
  await fetch(`${BASE}/api/residences/leases/${lease.lease.id}/end`, {
    method: 'POST',
    headers: authed,
    body: JSON.stringify({ endDate: '2026-10-03' }),
  })
  const leaseDel = await fetch(`${BASE}/api/residences/leases/${lease.lease.id}`, {
    method: 'DELETE',
    headers: authed,
  })
  console.log('cleanup lease DELETE ->', leaseDel.status)

  socket.close()

  // Put the app back to brand new.
  seedEmpty()

  const ok = !!(events.notification && events.stats && events.residences && events.pong)
  console.log(ok ? 'SOCKET TEST PASSED' : `SOCKET TEST FAILED: ${JSON.stringify({ pong: !!events.pong, notification: !!events.notification, stats: !!events.stats, residences: !!events.residences })}`)
  process.exit(ok ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
