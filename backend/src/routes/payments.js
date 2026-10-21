const express = require('express')
const prisma = require('../lib/prisma')
const { requireAuth } = require('../middleware/auth')
const { buildStats, invalidateStats } = require('../lib/stats')
const { respondThenBroadcast } = require('../lib/broadcast')

const router = express.Router()

router.use(requireAuth)

// ---- helpers ----------------------------------------------------------

const include = {
  member: { select: { fullName: true } },
  plan: { select: { name: true } },
}

// Walk-in / non-member sales have `memberId === null`.
const serialize = (p) => ({
  id: p.id,
  memberId: p.memberId || null,
  memberName: p.member?.fullName || 'Walk-in guest',
  planId: p.planId || null,
  planName: p.plan?.name || null,
  itemName: p.itemName || null,
  notes: p.notes || null,
  method: p.method || null,
  amount: parseFloat(p.amount),
  status: p.status,
  reportId: p.reportId || null,
  paidAt: p.paidAt,
})

// "YYYY-MM-DD" -> local Date at midnight (null when malformed).
const parseDateOnly = (value) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim())
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) {
    return null
  }
  return d
}

const todayStr = () => localISO(new Date())

// "YYYY-MM-DD" for a local Date.
const localISO = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const dayEnd = (start) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1)

// Case-insensitive search across the customer, the item/service, the plan, the
// notes and — when the term contains digits — the amount.
const searchFilter = (search) => {
  const or = [
    { itemName: { contains: search, mode: 'insensitive' } },
    { notes: { contains: search, mode: 'insensitive' } },
    { member: { is: { fullName: { contains: search, mode: 'insensitive' } } } },
    { member: { is: { phone: { contains: search, mode: 'insensitive' } } } },
    { plan: { is: { name: { contains: search, mode: 'insensitive' } } } },
  ]
  const amount = Number(search.replace(/[^0-9.]/g, ''))
  if (/[0-9]/.test(search) && !Number.isNaN(amount) && amount > 0) or.push({ amount })
  return or
}

// ---- routes -----------------------------------------------------------

// GET /api/payments?date=YYYY-MM-DD&q=&page=1
// Newest first. `date` narrows the list to that local calendar day, `q`
// searches the customer, item/service, plan, notes and amount.
//
// Only OPEN receipts are listed — the ones already closed out live in
// Reports (GET /api/reports/closed).
router.get('/', async (req, res) => {
  const { date, q } = req.query
  const search = String(q || '').trim()
  const page = parseInt(req.query.page) || 1
  const limit = 20

  const where = { reportId: null }
  if (date) {
    const start = parseDateOnly(date)
    if (!start) return res.status(400).json({ error: 'Invalid date — expected YYYY-MM-DD' })
    where.paidAt = { gte: start, lt: dayEnd(start) }
  }
  if (search) where.OR = searchFilter(search)

  // While searching, return every match rather than one page of them.
  const paginate = !date && !search
  const skip = (page - 1) * limit

  const [payments, total, dateRows] = await Promise.all([
    prisma.payment.findMany({
      where,
      include,
      orderBy: { paidAt: 'desc' },
      ...(paginate ? { skip, take: limit } : {}),
    }),
    prisma.payment.count({ where }),
    // Every day that has open receipts — the date dropdown's options. They are
    // independent of the search so the dropdown never collapses to one date.
    prisma.payment.findMany({ where: { reportId: null }, select: { paidAt: true } }),
  ])

  const dates = Array.from(new Set(dateRows.map((r) => localISO(r.paidAt)))).sort().reverse()

  res.json({
    payments: payments.map(serialize),
    total,
    page: paginate ? page : 1,
    pages: paginate ? Math.ceil(total / limit) : 1,
    dates,
  })
})

// GET /api/payments/summary?date=YYYY-MM-DD  (default: today)
router.get('/summary', async (req, res) => {
  const dateStr = req.query.date ? String(req.query.date) : todayStr()
  const start = parseDateOnly(dateStr)
  if (!start) return res.status(400).json({ error: 'Invalid date — expected YYYY-MM-DD' })

  const paid = await prisma.payment.findMany({
    where: {
      status: 'PAID',
      paidAt: { gte: start, lt: dayEnd(start) },
    },
  })

  // The open figures are what "Close Daily Sales" acts on, so they drop to
  // zero the moment the day is closed out.
  const open = paid.filter((p) => !p.reportId)

  res.json({
    date: dateStr,
    totalSales: paid.reduce((sum, p) => sum + parseFloat(p.amount), 0),
    transactionCount: paid.length,
    openTotalSales: open.reduce((sum, p) => sum + parseFloat(p.amount), 0),
    openTransactionCount: open.length,
  })
})

// POST /api/payments — { memberName, amount, itemName?, notes?, date?, method? }
// Links the member when a case-insensitive exact name match exists, otherwise
// records a walk-in (memberId null).
router.post('/', async (req, res) => {
  const { memberName, amount, itemName, notes, date, method } = req.body || {}

  if (!memberName || typeof memberName !== 'string' || !memberName.trim()) {
    return res.status(400).json({ error: 'memberName is required' })
  }
  const amountNum = parseFloat(amount)
  if (amount === undefined || amount === null || amount === '' || Number.isNaN(amountNum)) {
    return res.status(400).json({ error: 'amount is required and must be a number' })
  }

  let paidAt = new Date()
  if (date) {
    const start = parseDateOnly(date)
    if (!start) return res.status(400).json({ error: 'Invalid date — expected YYYY-MM-DD' })
    const now = new Date()
    paidAt = new Date(start.getFullYear(), start.getMonth(), start.getDate(),
      now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds())
  }

  const name = memberName.trim()
  const matches = await prisma.member.findMany({
    where: { fullName: { equals: name, mode: 'insensitive' } },
    take: 1,
  })
  const member = matches[0] || null

  const payment = await prisma.payment.create({
    data: {
      memberId: member ? member.id : null,
      planId: member ? member.planId : null,
      amount: amountNum,
      status: 'PAID',
      method: method || null,
      itemName: itemName || null,
      notes: notes || null,
      paidAt,
    },
    include,
  })

  respondThenBroadcast(res, serialize(payment), () => buildStats({ fresh: true }), {
    invalidate: invalidateStats,
    notification: {
      title: 'New payment',
      body: `${member ? member.fullName : name} paid ₱${amountNum.toFixed(2)}${itemName ? ` — ${itemName}` : ''}`,
      kind: 'payment',
    },
  })
})

// POST /api/payments/close-sales — { date? } (default today)
// Rolls today's open (reportId: null) PAID payments into a DailyReport.
router.post('/close-sales', async (req, res) => {
  const dateStr = (req.body && req.body.date) ? String(req.body.date) : todayStr()
  const start = parseDateOnly(dateStr)
  if (!start) return res.status(400).json({ error: 'Invalid date — expected YYYY-MM-DD' })

  const open = await prisma.payment.findMany({
    where: {
      status: 'PAID',
      reportId: null,
      paidAt: { gte: start, lt: dayEnd(start) },
    },
    orderBy: { paidAt: 'asc' },
  })

  if (open.length === 0) {
    return res.status(400).json({ error: 'No open transactions to close' })
  }

  const totalSales = open.reduce((sum, p) => sum + parseFloat(p.amount), 0)
  const transactionCount = open.length

  // A report per day: reuse it when the same day is closed out again later.
  let report = await prisma.dailyReport.findUnique({ where: { date: start } })
  if (report) {
    report = await prisma.dailyReport.update({
      where: { id: report.id },
      data: {
        totalSales: parseFloat(report.totalSales) + totalSales,
        transactionCount: report.transactionCount + transactionCount,
        closedAt: new Date(),
      },
    })
  } else {
    report = await prisma.dailyReport.create({
      data: { date: start, totalSales, transactionCount },
    })
  }

  await prisma.payment.updateMany({
    where: { id: { in: open.map((p) => p.id) } },
    data: { reportId: report.id },
  })

  respondThenBroadcast(res, {
    report: {
      id: report.id,
      date: report.date,
      totalSales: parseFloat(report.totalSales),
      transactionCount: report.transactionCount,
      closedAt: report.closedAt,
    },
    totalSales,
    transactionCount,
  }, () => buildStats({ fresh: true }), {
    invalidate: invalidateStats,
    notification: {
      title: 'Daily sales closed',
      body: `${transactionCount} transactions totaling ₱${totalSales.toFixed(2)} closed for ${dateStr}`,
      kind: 'report',
    },
  })
})

// PUT /api/payments/:id — kept from the original API.
router.put('/:id', async (req, res) => {
  const { id } = req.params
  const { memberId, planId, amount, status, method, paidAt, itemName, notes } = req.body

  const exists = await prisma.payment.findUnique({ where: { id } })
  if (!exists) return res.status(404).json({ error: 'Payment not found' })

  const payment = await prisma.payment.update({
    where: { id },
    data: {
      memberId: memberId === undefined ? undefined : (memberId || null),
      planId: planId === undefined ? undefined : (planId || null),
      amount: amount !== undefined ? parseFloat(amount) : undefined,
      status,
      method: method === '' ? null : method,
      itemName: itemName === undefined ? undefined : (itemName || null),
      notes: notes === undefined ? undefined : (notes || null),
      paidAt: paidAt ? new Date(paidAt) : undefined,
    },
    include,
  })

  respondThenBroadcast(res, serialize(payment), () => buildStats({ fresh: true }), {
    invalidate: invalidateStats,
  })
})

// DELETE /api/payments/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params
  const exists = await prisma.payment.findUnique({ where: { id } })
  if (!exists) return res.status(404).json({ error: 'Payment not found' })

  await prisma.payment.delete({ where: { id } })

  respondThenBroadcast(res, { success: true }, () => buildStats({ fresh: true }), {
    invalidate: invalidateStats,
    notification: {
      title: 'Payment deleted',
      body: `${exists.memberId ? 'A member payment' : 'A walk-in payment'} of ₱${parseFloat(exists.amount).toFixed(2)} was removed`,
      kind: 'payment',
    },
  })
})

module.exports = router
