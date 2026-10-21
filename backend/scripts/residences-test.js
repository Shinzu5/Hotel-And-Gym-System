// Residences API smoke test — exercises the full lease lifecycle that the
// Apartments page drives (Add renter -> Edit lease -> Record payment -> End),
// plus every guard rail. Run with the backend already listening on :5000:
//
//   node scripts/residences-test.js
//
// It seeds the demo data up front (the app itself is seeded brand new) and
// leaves the database brand new again when it finishes.

const { seedDemo, seedEmpty } = require('./seed-helper')

const BASE = process.env.API_URL || 'http://localhost:5000'
const FRONTEND = 'http://localhost:3000'

const results = []
const check = (name, pass, detail) => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const json = async (res) => {
  try { return await res.json() } catch { return {} }
}

async function main() {
  // The app is seeded brand new; the tests need a known state.
  seedDemo()

  // ---- login ----
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: FRONTEND },
    body: JSON.stringify({ email: 'brenie', password: 'brenie' }),
  })
  const { token } = await json(loginRes)
  check('login', loginRes.status === 200 && !!token, `status ${loginRes.status}`)
  if (!token) return finish()

  const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const getStats = async () => json(await fetch(`${BASE}/api/residences/stats`, { headers: H }))
  const getUnits = async () => json(await fetch(`${BASE}/api/residences/units`, { headers: H }))

  // ---- auth guard ----
  const unauth = await fetch(`${BASE}/api/residences/stats`)
  check('unauthenticated request is rejected', unauth.status === 401, `status ${unauth.status}`)

  // ---- seeded headline figures ----
  const before = await getStats()
  check('total earned = 641,643.25', Number(before.summary.totalEarned) === 641643.25, `${before.summary.totalEarned}`)
  check('occupancy = 50% (2 of 4)', before.summary.occupied === 2 && before.summary.total === 4, `${before.summary.occupied}/${before.summary.total}`)
  check('monthly rent roll = 30,500', Number(before.summary.monthlyRentRoll) === 30500, `${before.summary.monthlyRentRoll}`)
  check('earned this month = 18,860', Number(before.summary.earnedThisMonth) === 18860, `${before.summary.earnedThisMonth}`)
  check('income series spans January to December', (before.incomeSeries || []).length === 12 && before.incomeSeries[0].month === 'Jan' && before.incomeSeries[11].month === 'Dec')
  check('earnings by apartment covers all 4 units', (before.earningsByUnit || []).length === 4)
  check('upcoming expirations lists both active leases', (before.upcomingExpirations || []).length === 2)

  const unit2a = before.units.find((u) => u.name === 'Unit 2A')
  const unit1a = before.units.find((u) => u.name === 'Unit 1A')
  const unit2b = before.units.find((u) => u.name === 'Unit 2B')
  check('Unit 2A is vacant', unit2a && unit2a.status === 'VACANT', unit2a && unit2a.pill)
  check('Unit 1A is occupied by Mariel Lopez', unit1a && unit1a.lease && unit1a.lease.renterName === 'Mariel Lopez')

  // ---- the expiring window: a lease is flagged only with 5 days or fewer left ----
  const jerome = (before.upcomingExpirations || []).find((e) => e.renterName === 'Jerome Tan')
  check(
    'a lease with more than 5 days left is NOT flagged expiring',
    jerome && jerome.pill === 'OCCUPIED' && jerome.daysLeft > 5,
    jerome && `${jerome.daysLeft}d ${jerome.pill}`
  )

  // Book a lease that ends in 3 days and check that it IS flagged expiring.
  const iso = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const now = new Date()
  const in3 = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3)
  const soon = await fetch(`${BASE}/api/residences/leases`, {
    method: 'POST', headers: H,
    body: JSON.stringify({
      unitId: unit2b.id, renterName: 'Short Lease', contact: '0900 000 0001',
      startDate: iso(now), endDate: iso(in3), monthlyRent: 1000,
    }),
  })
  const soonJ = await json(soon)
  const soonRow = (await getStats()).upcomingExpirations.find((e) => e.renterName === 'Short Lease')
  check(
    'a lease with 5 days or fewer left IS flagged expiring',
    soon.status === 200 && soonRow && soonRow.pill === 'EXPIRING' && soonRow.daysLeft > 0 && soonRow.daysLeft <= 5,
    soonRow && `${soonRow.daysLeft}d ${soonRow.pill}`
  )

  // Remove it again so the seeded data stays pristine for the checks below.
  await fetch(`${BASE}/api/residences/leases/${soonJ.lease?.id}/end`, { method: 'POST', headers: H, body: JSON.stringify({}) })
  await fetch(`${BASE}/api/residences/leases/${soonJ.lease?.id}`, { method: 'DELETE', headers: H })
  const restored = await getStats()
  check(
    'the short lease is removed and the occupancy is back to 2 of 4',
    restored.summary.occupied === 2 && !restored.upcomingExpirations.some((e) => e.renterName === 'Short Lease'),
    `${restored.summary.occupied}/${restored.summary.total}`
  )

  // ---- validation guards (before any mutation) ----
  const pastEnd = await fetch(`${BASE}/api/residences/leases`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ unitId: unit2a.id, renterName: 'Bad Dates', startDate: '2027-01-01', endDate: '2026-01-01', monthlyRent: 100 }),
  })
  check('rejects lease ending before it starts', pastEnd.status === 400, (await json(pastEnd)).error)

  const noName = await fetch(`${BASE}/api/residences/leases`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ unitId: unit2a.id, renterName: '   ', startDate: '2026-10-01', endDate: '2027-10-01', monthlyRent: 100 }),
  })
  check('rejects empty renter name', noName.status === 400, (await json(noName)).error)

  const zeroRent = await fetch(`${BASE}/api/residences/leases`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ unitId: unit2a.id, renterName: 'No Rent', startDate: '2026-10-01', endDate: '2027-10-01', monthlyRent: 0 }),
  })
  check('rejects zero monthly rent', zeroRent.status === 400, (await json(zeroRent)).error)

  const clash = await fetch(`${BASE}/api/residences/leases`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ unitId: unit1a.id, renterName: 'Double Book', startDate: '2026-11-01', endDate: '2027-11-01', monthlyRent: 100 }),
  })
  // If the unit happened to be free the booking would succeed — clean it up
  // again so the test can never leave stray data behind.
  const clashBody = await json(clash)
  if (clash.status === 200 && clashBody.lease?.id) {
    await fetch(`${BASE}/api/residences/leases/${clashBody.lease.id}/end`, {
      method: 'POST', headers: H, body: JSON.stringify({ endDate: '2026-10-05' }),
    })
    await fetch(`${BASE}/api/residences/leases/${clashBody.lease.id}`, { method: 'DELETE', headers: H })
  }
  check('rejects booking a unit that is already occupied', clash.status === 400, clashBody.error)

  // ---- future-dated lease: Ending it must be refused until it has started ----
  const future = await fetch(`${BASE}/api/residences/leases`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ unitId: unit2a.id, renterName: 'Future Tenant', contact: '0900 000 0000', startDate: '2027-03-01', endDate: '2028-03-01', monthlyRent: 20000 }),
  })
  const futureJ = await json(future)
  check('books a vacant unit', future.status === 200 && !!futureJ.lease?.id, `status ${future.status}`)
  const prematureEnd = await fetch(`${BASE}/api/residences/leases/${futureJ.lease?.id}/end`, { method: 'POST', headers: H, body: JSON.stringify({}) })
  check('refuses to end a lease that has not started', prematureEnd.status === 400, (await json(prematureEnd)).error)

  // An ACTIVE lease cannot be deleted outright — end it first, then remove it,
  // so the seeded demo data is left untouched.
  const delActive = await fetch(`${BASE}/api/residences/leases/${futureJ.lease?.id}`, { method: 'DELETE', headers: H })
  check('refuses to delete an active lease', delActive.status === 400, (await json(delActive)).error)
  const forceEnd = await fetch(`${BASE}/api/residences/leases/${futureJ.lease?.id}/end`, { method: 'POST', headers: H, body: JSON.stringify({ endDate: '2027-03-05' }) })
  check('can close a future lease with an explicit endDate', forceEnd.status === 200, `status ${forceEnd.status}`)
  await fetch(`${BASE}/api/residences/leases/${futureJ.lease?.id}`, { method: 'DELETE', headers: H })

  // ---- the real lifecycle on Unit 2A ----
  // The rent is applied automatically when the lease is saved: 18,000 x 12
  // months (Oct 1 2026 -> Oct 1 2027) = 216,000, dated on the start date.
  const add = await fetch(`${BASE}/api/residences/leases`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ unitId: unit2a.id, renterName: 'Test Renter', contact: '0917 123 4567', startDate: '2026-10-01', endDate: '2027-10-01', monthlyRent: 18000 }),
  })
  const addJ = await json(add)
  const leaseId = addJ.lease?.id
  check('Add renter books Unit 2A', add.status === 200 && !!leaseId, `status ${add.status}`)

  const autoRent = Number(addJ.payment?.amount || 0)
  check(
    'saving the lease applies the whole term rent automatically',
    autoRent === 216000,
    `automatic payment ${autoRent} (want 216000 = 18,000 x 12 months)`
  )

  const afterAdd = await getStats()
  check('occupancy rises to 3 of 4', afterAdd.summary.occupied === 3 && afterAdd.summary.vacantUnits === 1, `${afterAdd.summary.occupied}/${afterAdd.summary.total}`)
  check('rent roll rises to 48,500', Number(afterAdd.summary.monthlyRentRoll) === 48500, `${afterAdd.summary.monthlyRentRoll}`)
  check(
    'the automatic rent lands in the total earned',
    Number(afterAdd.summary.totalEarned) === 641643.25 + autoRent,
    `${afterAdd.summary.totalEarned} (was 641643.25)`
  )

  const edit = await fetch(`${BASE}/api/residences/leases/${leaseId}`, {
    method: 'PUT', headers: H, body: JSON.stringify({ monthlyRent: 19500 }),
  })
  const editedUnits = (await getUnits()).units.find((u) => u.name === 'Unit 2A')
  check(
    'Edit lease updates the rent',
    edit.status === 200 && editedUnits.lease && Number(editedUnits.lease.monthlyRent) === 19500,
    `rent ${editedUnits.lease && editedUnits.lease.monthlyRent}`
  )

  const editBad = await fetch(`${BASE}/api/residences/leases/${leaseId}`, {
    method: 'PUT', headers: H, body: JSON.stringify({ endDate: '2025-01-01' }),
  })
  check('rejects an edit that would end before it starts', editBad.status === 400, (await json(editBad)).error)

  // The rent follows the lease: editing the rent regenerates the automatic
  // payment (19,500 x 12 = 234,000).
  const afterEdit = await getStats()
  const editedRent = 19500 * 12
  check(
    'editing the rent regenerates the automatic payment',
    Number(afterEdit.summary.totalEarned) === 641643.25 + editedRent,
    `${afterEdit.summary.totalEarned} (want ${641643.25 + editedRent})`
  )

  const end = await fetch(`${BASE}/api/residences/leases/${leaseId}/end`, { method: 'POST', headers: H, body: JSON.stringify({}) })
  check('End lease closes it out', end.status === 200, `status ${end.status}`)

  const afterEnd = await getStats()
  check('occupancy drops back to 2 of 4', afterEnd.summary.occupied === 2 && afterEnd.summary.vacantUnits === 2, `${afterEnd.summary.occupied}/${afterEnd.summary.total}`)
  check('rent roll drops back to 30,500', Number(afterEnd.summary.monthlyRentRoll) === 30500, `${afterEnd.summary.monthlyRentRoll}`)
  check('earnings persist after the lease ends', Number(afterEnd.summary.totalEarned) === 641643.25 + editedRent, `${afterEnd.summary.totalEarned}`)

  const doubleEnd = await fetch(`${BASE}/api/residences/leases/${leaseId}/end`, { method: 'POST', headers: H, body: JSON.stringify({}) })
  check('refuses to end a lease twice', doubleEnd.status === 400, (await json(doubleEnd)).error)

  // ---- remove the test lease so seeded data stays pristine ----
  const del = await fetch(`${BASE}/api/residences/leases/${leaseId}`, { method: 'DELETE', headers: H })
  const finalStats = await getStats()
  const cleaned =
    Number(finalStats.summary.totalEarned) === 641643.25 &&
    Number(finalStats.summary.monthlyRentRoll) === 30500 &&
    !finalStats.units.some((u) => u.lease && u.lease.renterName === 'Test Renter') &&
    finalStats.units.filter((u) => u.status === 'VACANT').length === 2
  check(
    'test lease removed and seeded data restored',
    (del.status === 200 || del.status === 404) && cleaned,
    `status ${del.status}, totalEarned ${finalStats.summary.totalEarned}`
  )

  // ---- gym KPIs untouched by anything above ----
  const gym = await json(await fetch(`${BASE}/api/dashboard/stats`, { headers: H }))
  check('gym KPIs untouched', gym.todaySales === 1950 && gym.todayTransactions === 4 && gym.activeMembers === 8, `sales ${gym.todaySales}/${gym.todayTransactions}, active ${gym.activeMembers}`)

  // ---- put the app back to brand new ----
  seedEmpty()
  const brandNew = await getStats()
  check(
    'app left brand new (no tenants, no rent history)',
    brandNew.summary.totalEarned === 0 &&
      brandNew.summary.occupied === 0 &&
      brandNew.summary.vacantUnits === 4 &&
      brandNew.units.length === 4,
    `earned ${brandNew.summary.totalEarned}, occupied ${brandNew.summary.occupied}`
  )

  finish()
}

function finish() {
  const failed = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  if (failed.length) {
    console.log('FAILURES:')
    failed.forEach((f) => console.log(`  - ${f.name}${f.detail ? ` — ${f.detail}` : ''}`))
    process.exit(1)
  }
  console.log('RESIDENCES TEST PASSED')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
