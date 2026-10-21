// Date rules test — the membership/lease term rules, the expiring window and
// the January→December rental series.
//
//   node scripts/dates-test.js
//
// The app is seeded brand new; the test seeds the demo data up front and
// leaves the database brand new again when it finishes.

const { seedDemo, seedEmpty, fetchRetry } = require('./seed-helper')

const BASE = process.env.API_URL || 'http://localhost:5000'

const results = []
const check = (name, pass, detail) => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const localISO = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** A date N days ago, as YYYY-MM-DD. */
const daysAgo = (n) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return localISO(d)
}

async function main() {
  seedDemo()

  const loginRes = await fetchRetry(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'brenie', password: 'brenie' }),
  })
  const { token } = await loginRes.json()
  const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const get = async (path) => (await fetchRetry(`${BASE}${path}`, { headers: H })).json()

  const plans = await get('/api/plans')
  const p15 = plans.find((p) => p.name === '15 days')
  const p30 = plans.find((p) => p.name === '30 days')

  const created = []
  const enrol = async (plan, startDate, name) => {
    const res = await fetchRetry(`${BASE}/api/members`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ fullName: name, planId: plan.id, startDate, amount: plan.price }),
    })
    const member = await res.json()
    created.push(member.id)
    return member
  }

  /* ---------------- a fixed-day term: 15 days, last usable day ------------- */
  const today = localISO(new Date())
  const fixed = await enrol(p15, today, 'Date Test Fixed')
  const fixedExpiry = localISO(new Date(fixed.endDate))
  const fixedWant = (() => {
    const d = new Date()
    d.setDate(d.getDate() + 14)
    return localISO(d)
  })()
  check(
    'a 15-day plan expires on its LAST usable day (start + 14)',
    fixedExpiry === fixedWant,
    `start ${today} -> ${fixedExpiry} (want ${fixedWant})`
  )
  check('a 15-day plan shows 15 days left on the enrolment day', fixed.daysLeft === 15, `${fixed.daysLeft} days left`)
  check('a 15-day plan starts ACTIVE', fixed.status === 'ACTIVE', fixed.status)

  /* ---------------- a month-length term: 30 days, same day next month ------ */
  const monthly = await enrol(p30, today, 'Date Test Monthly')
  const monthlyExpiry = localISO(new Date(monthly.endDate))
  const monthlyWant = (() => {
    const d = new Date()
    d.setMonth(d.getMonth() + 1);
    return localISO(d)
  })()
  check(
    'a 30-day plan expires on the same day next month',
    monthlyExpiry === monthlyWant,
    `start ${today} -> ${monthlyExpiry} (want ${monthlyWant})`
  )
  check('a 30-day plan shows 30 days left on the enrolment day', monthly.daysLeft === 30, `${monthly.daysLeft} days left`)

  /* ----------------------------- the expiring window ---------------------- */
  // 5 days left -> EXPIRING, 6 days -> ACTIVE, expired -> EXPIRED.
  const inFive = await enrol(p15, daysAgo(9), 'Date Test 5d') // expiry today+5 -> 6 left
  const inFour = await enrol(p15, daysAgo(10), 'Date Test 4d') // expiry today+4 -> 5 left
  const expired = await enrol(p15, daysAgo(15), 'Date Test Expired') // expiry yesterday

  check('6 days left is still ACTIVE', inFive.daysLeft === 6 && inFive.status === 'ACTIVE', `${inFive.daysLeft}d ${inFive.status}`)
  check('5 days left is EXPIRING', inFour.daysLeft === 5 && inFour.status === 'EXPIRING', `${inFour.daysLeft}d ${inFour.status}`)
  check('past its last day it is EXPIRED', expired.daysLeft === 0 && expired.status === 'EXPIRED', `${expired.daysLeft}d ${expired.status}`)

  const stats = await get('/api/dashboard/stats')
  check(
    'the dashboard counts only the 1-5 day window as expiring',
    stats.expiringSoon.length > 0 && stats.expiringSoon.every((m) => m.daysLeft > 0 && m.daysLeft <= 5),
    `${stats.expiringSoon.length} expiring: ${stats.expiringSoon.map((m) => `${m.name} ${m.daysLeft}d`).join(', ')}`
  )

  /* ------------------ the residences series: January -> December ---------- */
  const residences = await get('/api/residences/stats')
  const months = residences.incomeSeries.map((m) => m.month)
  check(
    'the rental income series spans January to December',
    residences.incomeSeries.length === 12 && months[0] === 'Jan' && months[11] === 'Dec',
    `${months.length} months: ${months.join(',')}`
  )

  /* --------------- ending a lease must not erase the earnings ------------- */
  const unitsRes = await get('/api/residences/units')
  const vacant = unitsRes.units.find((u) => u.status === 'VACANT')
  const leaseRes = await fetchRetry(`${BASE}/api/residences/leases`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      unitId: vacant.id,
      renterName: 'Earnings Test',
      contact: '0900',
      startDate: daysAgo(10),
      endDate: localISO(new Date(Date.now() + 20 * 86400000)),
      monthlyRent: vacant.monthlyRent,
    }),
  })
  const lease = await leaseRes.json()

  // The rent is applied automatically when the lease is saved, so the unit
  // already shows the money before anything else happens.
  const afterSave = await get('/api/residences/stats')
  const savedUnit = afterSave.units.find((u) => u.id === vacant.id)
  check(
    'saving a lease applies the rent automatically',
    savedUnit.status === 'OCCUPIED' && Number(savedUnit.totalEarned) > 0 && Number(lease.payment?.amount) > 0,
    `unit total ${savedUnit.totalEarned}, automatic payment ${lease.payment?.amount}`
  )

  const beforeEnd = afterSave
  const beforeUnit = savedUnit

  await fetchRetry(`${BASE}/api/residences/leases/${lease.lease.id}/end`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ endDate: daysAgo(2) }),
  })

  const afterEnd = await get('/api/residences/stats')
  const afterUnit = afterEnd.units.find((u) => u.id === vacant.id)

  const autoRent = Number(lease.payment?.amount || 0)
  check(
    'ending a lease keeps the rent in the dashboard total',
    Number(afterEnd.summary.totalEarned) === Number(beforeEnd.summary.totalEarned) &&
      Number(afterEnd.summary.totalEarned) >= autoRent,
    `${beforeEnd.summary.totalEarned} -> ${afterEnd.summary.totalEarned}`
  )
  check(
    "ending a lease keeps the unit's Total earned",
    Number(afterUnit.totalEarned) === Number(beforeUnit.totalEarned) && Number(afterUnit.totalEarned) >= autoRent,
    `${beforeUnit.totalEarned} -> ${afterUnit.totalEarned}`
  )
  check(
    'ending a lease frees the unit (occupancy drops)',
    afterUnit.status === 'VACANT' && afterEnd.summary.occupied === beforeEnd.summary.occupied - 1,
    `occupied ${beforeEnd.summary.occupied} -> ${afterEnd.summary.occupied}`
  )

  /* ------------------------------- cleanup -------------------------------- */
  for (const id of created) {
    await fetchRetry(`${BASE}/api/members/${id}`, { method: 'DELETE', headers: H })
  }
  await fetchRetry(`${BASE}/api/residences/leases/${lease.lease.id}/end`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ endDate: daysAgo(2) }),
  })
  await fetchRetry(`${BASE}/api/residences/leases/${lease.lease.id}`, { method: 'DELETE', headers: H })

  seedEmpty()
  const brandNew = await get('/api/dashboard/stats')
  check(
    'app left brand new',
    brandNew.todaySales === 0 && brandNew.activeMembers === 0 && brandNew.activePlans === 2,
    `sales ${brandNew.todaySales}, members ${brandNew.activeMembers}`
  )

  const failed = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  if (failed.length) {
    console.log('FAILURES:')
    failed.forEach((f) => console.log(`  - ${f.name}${f.detail ? ` — ${f.detail}` : ''}`))
    process.exit(1)
  }
  console.log('DATES TEST PASSED')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
