const express = require('express')
const prisma = require('../lib/prisma')
const { requireAuth } = require('../middleware/auth')

const router = express.Router()

router.use(requireAuth)

const include = {
  member: { select: { fullName: true } },
  plan: { select: { name: true } },
}

const serializeReceipt = (p) => ({
  id: p.id,
  memberId: p.memberId || null,
  memberName: p.member?.fullName || 'Walk-in guest',
  planName: p.plan?.name || null,
  itemName: p.itemName || null,
  notes: p.notes || null,
  method: p.method || null,
  amount: parseFloat(p.amount),
  status: p.status,
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

// GET /api/reports/closed — the closed-out days, newest first, plus the
// lifetime totals for the Reports dashboard.
//
// The receipts of a day are fetched separately (GET /api/reports/:id/receipts)
// so this stays one cheap query no matter how much history there is.
router.get('/closed', async (req, res) => {
  const take = Math.min(Number(req.query.take) || 60, 365)

  const [reports, totals] = await Promise.all([
    prisma.dailyReport.findMany({
      orderBy: { date: 'desc' },
      take,
    }),
    prisma.dailyReport.aggregate({
      _sum: { totalSales: true, transactionCount: true },
      _count: true,
    }),
  ])

  const totalSales = parseFloat(totals._sum.totalSales || 0)
  const transactionCount = totals._sum.transactionCount || 0
  const daysClosed = totals._count || 0

  res.json({
    reports: reports.map((r) => ({
      id: r.id,
      date: r.date,
      totalSales: parseFloat(r.totalSales),
      transactionCount: r.transactionCount,
      closedAt: r.closedAt,
    })),
    totals: {
      totalSales,
      transactionCount,
      daysClosed,
      averagePerDay: daysClosed ? totalSales / daysClosed : 0,
    },
  })
})

// GET /api/reports/search?q=&date= — archived receipts matching a term.
//
// This is the shortcut for "find that receipt I closed last month": the hits
// carry the day they were closed in, so one click jumps to that day in the
// list above. `date` narrows by the CLOSED day, not the receipt timestamp.
router.get('/search', async (req, res) => {
  const { q, date } = req.query
  const search = String(q || '').trim()

  if (!search) return res.json({ receipts: [], total: 0 })

  const where = { reportId: { not: null } }

  if (date) {
    const start = parseDateOnly(date)
    if (!start) return res.status(400).json({ error: 'Invalid date — expected YYYY-MM-DD' })
    where.report = { is: { date: { gte: start, lt: dayEnd(start) } } }
  }

  where.OR = searchFilter(search)

  const receipts = await prisma.payment.findMany({
    where,
    include: { ...include, report: { select: { id: true, date: true } } },
    orderBy: { paidAt: 'desc' },
    take: 100,
  })

  res.json({
    receipts: receipts.map((r) => ({
      ...serializeReceipt(r),
      reportId: r.reportId,
      reportDate: r.report?.date || null,
    })),
    total: receipts.length,
  })
})

// GET /api/reports/:id/receipts — every receipt rolled into one closed day.
router.get('/:id/receipts', async (req, res) => {
  const { id } = req.params

  const report = await prisma.dailyReport.findUnique({ where: { id } })
  if (!report) return res.status(404).json({ error: 'Report not found' })

  const receipts = await prisma.payment.findMany({
    where: { reportId: id },
    include,
    orderBy: { paidAt: 'desc' },
  })

  res.json({
    report: {
      id: report.id,
      date: report.date,
      totalSales: parseFloat(report.totalSales),
      transactionCount: report.transactionCount,
      closedAt: report.closedAt,
    },
    receipts: receipts.map(serializeReceipt),
  })
})

module.exports = router
