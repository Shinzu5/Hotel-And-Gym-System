// Reports flow test — the "Close Daily Sales" -> archive -> reset cycle.
//
//   node scripts/reports-test.js
//
// Verifies that closing the day:
//   * archives the receipts under a dated DailyReport
//   * resets the open figures to zero (summary AND the dashboard KPIs)
//   * takes the closed receipts out of the Payments list
//   * refuses to close the same day twice
//
// It seeds the demo data up front (the app itself is seeded brand new) and
// leaves the database brand new again when it finishes.

const { seedDemo, seedEmpty, fetchRetry } = require('./seed-helper')
const prisma = require('../src/lib/prisma')

const BASE = process.env.API_URL || 'http://localhost:5000'

const results = []
const check = (name, pass, detail) => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const localISO = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

async function main() {
  // The app is seeded brand new; the tests need a known state.
  seedDemo()

  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'brenie', password: 'brenie' }),
  })
  const { token } = await loginRes.json()
  if (!token) throw new Error('login failed')
  const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const get = async (path) => (await fetchRetry(`${BASE}${path}`, { headers: H })).json()

  const today = localISO(new Date())

  // ---- the open payments we are about to close ----
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date(start.getTime() + 86400000)
  const openBefore = await prisma.payment.findMany({
    where: { status: 'PAID', reportId: null, paidAt: { gte: start, lt: end } },
  })
  const openSum = openBefore.reduce((s, p) => s + parseFloat(p.amount), 0)
  check('there are open payments today to close', openBefore.length > 0, `${openBefore.length} tx / ${openSum}`)

  // ---- before closing ----
  const sumBefore = await get(`/api/payments/summary?date=${today}`)
  check(
    'summary reports the open figures',
    Number(sumBefore.openTotalSales) === openSum && sumBefore.openTransactionCount === openBefore.length,
    `open=${sumBefore.openTotalSales}/${sumBefore.openTransactionCount}`
  )
  const statsBefore = await get('/api/dashboard/stats')
  check(
    'dashboard KPIs agree with the open figures',
    Number(statsBefore.openSales) === openSum && statsBefore.openTransactions === openBefore.length,
    `openSales=${statsBefore.openSales} openTransactions=${statsBefore.openTransactions}`
  )

  const reportsBefore = await get('/api/reports/closed')
  const daysBefore = reportsBefore.totals?.daysClosed || 0

  // ---- close the day ----
  const closeRes = await fetch(`${BASE}/api/payments/close-sales`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ date: today }),
  })
  const closed = await closeRes.json()
  check(
    'closing the day succeeds',
    closeRes.status === 200 && closed.transactionCount === openBefore.length,
    `status ${closeRes.status}, ${closed.transactionCount} tx / ${closed.totalSales}`
  )

  // ---- the reset ----
  const sumAfter = await get(`/api/payments/summary?date=${today}`)
  check(
    'summary open figures reset to zero',
    Number(sumAfter.openTotalSales) === 0 && sumAfter.openTransactionCount === 0,
    `open=${sumAfter.openTotalSales}/${sumAfter.openTransactionCount}`
  )
  const statsAfter = await get('/api/dashboard/stats')
  check(
    'dashboard KPIs reset to zero',
    Number(statsAfter.openSales) === 0 && statsAfter.openTransactions === 0,
    `openSales=${statsAfter.openSales} openTransactions=${statsAfter.openTransactions}`
  )

  // ---- the receipts moved out of Payments ----
  const paymentsAfter = await get('/api/payments')
  const stillListed = paymentsAfter.payments.filter((p) => openBefore.some((o) => o.id === p.id))
  check('closed receipts leave the Payments list', stillListed.length === 0, `${stillListed.length} still listed`)

  // ---- and into Reports ----
  const reportsAfter = await get('/api/reports/closed')
  check(
    'a new closed day appears in Reports',
    reportsAfter.totals?.daysClosed === daysBefore + 1,
    `${daysBefore} -> ${reportsAfter.totals?.daysClosed} days closed`
  )
  const todayReport = reportsAfter.reports.find((r) => localISO(new Date(r.date)) === today)
  check('the closed day is dated today', !!todayReport, todayReport ? localISO(new Date(todayReport.date)) : 'not found')
  check(
    'the closed day carries the right totals',
    todayReport && Number(todayReport.totalSales) === openSum && todayReport.transactionCount === openBefore.length,
    todayReport ? `${todayReport.transactionCount} tx / ${todayReport.totalSales}` : 'n/a'
  )

  const receiptsRes = await get(`/api/reports/${todayReport.id}/receipts`)
  check(
    'every closed receipt is archived under that day',
    receiptsRes.receipts?.length === openBefore.length,
    `${receiptsRes.receipts?.length} receipts`
  )
  check(
    'archived receipts keep their member link',
    (receiptsRes.receipts || []).every((r) => r.memberId !== undefined),
    'memberId present'
  )

  // ---- closing twice is refused ----
  const twice = await fetch(`${BASE}/api/payments/close-sales`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ date: today }),
  })
  check(
    'closing an already-closed day is refused',
    twice.status === 400,
    `status ${twice.status}: ${(await twice.json()).error}`
  )

  // ---- restore the seeded state ----
  await prisma.payment.updateMany({
    where: { id: { in: openBefore.map((p) => p.id) } },
    data: { reportId: null },
  })
  await prisma.dailyReport.deleteMany({ where: { id: todayReport.id } })
  await prisma.$disconnect()

  const restored = await get(`/api/payments/summary?date=${today}`)
  check(
    'seeded state restored',
    Number(restored.openTotalSales) === openSum && restored.openTransactionCount === openBefore.length,
    `open=${restored.openTotalSales}/${restored.openTransactionCount}`
  )

  /* ------------------------------- searching ------------------------------ */

  // The date dropdown's options come from the API, independent of the search.
  const all = await get('/api/payments')
  check('payments list the days that have open receipts', Array.isArray(all.dates) && all.dates.length > 0, `${all.dates?.length} day(s)`)

  const byName = await get('/api/payments?q=Rafael')
  check(
    'search by customer name',
    byName.payments.length > 0 && byName.payments.every((p) => /rafael/i.test(p.memberName)),
    `${byName.payments.length} hit(s): ${byName.payments.map((p) => p.memberName).join(', ')}`
  )

  const byItem = await get('/api/payments?q=Protein')
  check(
    'search by item / service',
    byItem.payments.length > 0 && byItem.payments.every((p) => /protein/i.test(p.itemName || '')),
    `${byItem.payments.length} hit(s)`
  )

  const byAmount = await get('/api/payments?q=670')
  check(
    'search by amount',
    byAmount.payments.length > 0 && byAmount.payments.every((p) => p.amount === 670),
    `${byAmount.payments.length} hit(s)`
  )

  const byDate = await get(`/api/payments?q=Rafael&date=${today}`)
  check(
    'search and date combine',
    byDate.payments.every((p) => /rafael/i.test(p.memberName)),
    `${byDate.payments.length} hit(s)`
  )

  const noMatch = await get('/api/payments?q=zzzznope')
  check('a search with no matches returns nothing', noMatch.payments.length === 0, `${noMatch.payments.length} hit(s)`)

  const archived = await get('/api/reports/search?q=Kim')
  check(
    'reports search finds archived receipts',
    archived.receipts.length > 0 && archived.receipts.every((r) => r.reportDate),
    `${archived.receipts.length} hit(s)`
  )

  const archivedNone = await get('/api/reports/search?q=zzzznope')
  check('reports search with no matches returns nothing', archivedNone.receipts.length === 0, `${archivedNone.receipts.length} hit(s)`)

  const archivedEmpty = await get('/api/reports/search')
  check('reports search needs a term', archivedEmpty.receipts.length === 0, `${archivedEmpty.receipts.length} hit(s)`)

  // ---- put the app back to brand new ----
  seedEmpty()
  const brandNew = await get('/api/dashboard/stats')
  check(
    'app left brand new (no members, receipts or reports)',
    brandNew.todaySales === 0 &&
      brandNew.todayTransactions === 0 &&
      brandNew.activeMembers === 0 &&
      brandNew.activePlans === 2,
    `sales ${brandNew.todaySales}, members ${brandNew.activeMembers}, plans ${brandNew.activePlans}`
  )

  const failed = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  if (failed.length) {
    console.log('FAILURES:')
    failed.forEach((f) => console.log(`  - ${f.name}${f.detail ? ` — ${f.detail}` : ''}`))
    process.exit(1)
  }
  console.log('REPORTS TEST PASSED')
  process.exit(0)
}

main().catch(async (err) => {
  console.error(err)
  try { await prisma.$disconnect() } catch { /* ignore */ }
  process.exit(1)
})
