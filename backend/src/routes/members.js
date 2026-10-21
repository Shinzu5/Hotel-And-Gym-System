const express = require('express')
const prisma = require('../lib/prisma')
const { requireAuth } = require('../middleware/auth')
const { buildStats, invalidateStats } = require('../lib/stats')
const { respondThenBroadcast } = require('../lib/broadcast')
const { expirationFor, daysLeftFor, isMonthTerm, renewalExpiration, MS_DAY } = require('../lib/dates')

const router = express.Router()

router.use(requireAuth)

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

// Classification rules (shared by GET list, POST create, renew):
//   expired  = no usable days left
//   expiring = 1..5 usable days left
//   active   = more than 5 days left
//
// `daysLeft` follows the member's plan: a month-length plan (30 days) counts
// the days that remain, a fixed-day plan (15 days) counts today as well.
const EXPIRING_WINDOW_DAYS = 5

const classify = (endDate, now, monthTerm = false) => {
  const endMs = new Date(endDate).getTime()
  const nowMs = now.getTime()
  const diffMs = endMs - nowMs
  const daysLeft = daysLeftFor(endDate, now, { monthTerm })
  let status
  if (daysLeft <= 0) status = 'EXPIRED'
  else if (daysLeft <= EXPIRING_WINDOW_DAYS) status = 'EXPIRING'
  else status = 'ACTIVE'
  // A fixed-day term stays usable through the end of its last day, so the
  // countdown runs to the end of that day rather than its midnight.
  const overAt = monthTerm ? endMs : endMs + MS_DAY
  return { endMs, nowMs, daysLeft, status, timeRemainingMs: Math.max(0, overAt - nowMs) }
}

// Member rows shaped for the API: fixed fields + computed countdown/status.
const decorate = (m, now, paidSum) => {
  const monthTerm = isMonthTerm(m.plan?.durationDays)
  const { daysLeft, status, timeRemainingMs } = classify(m.endDate, now, monthTerm)
  return {
    id: m.id,
    fullName: m.fullName,
    phone: m.phone,
    email: m.email,
    createdAt: m.createdAt,
    startDate: m.startDate,
    endDate: m.endDate,
    daysLeft,
    timeRemainingMs,
    status,
    plan: m.plan
      ? { id: m.plan.id, name: m.plan.name, durationDays: m.plan.durationDays }
      : null,
    amountPaid: paidSum,
    _endMs: new Date(m.endDate).getTime(),
  }
}

const withPaidSum = (m) =>
  (m.payments || []).reduce((sum, p) => sum + parseFloat(p.amount), 0)

// GET /api/members?q=&filter=  -> { counts, members }
// `counts` is computed BEFORE `filter` is applied:
//   all     = every (search-matched) member
//   active  = not expired (endDate >= now)          <- includes expiring
//   expiring= 0 <= daysLeft <= 15
//   expired = endDate < now
router.get('/', async (req, res) => {
  const now = new Date()
  const q = String(req.query.q || '').trim()
  const filter = String(req.query.filter || 'all').toLowerCase()

  const where = {}
  if (q) {
    where.OR = [
      { fullName: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q, mode: 'insensitive' } },
      { plan: { name: { contains: q, mode: 'insensitive' } } },
    ]
  }

  const rows = await prisma.member.findMany({
    where,
    include: {
      plan: true,
      payments: { where: { status: 'PAID' }, select: { amount: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  const members = rows.map((m) => decorate(m, now, withPaidSum(m)))

  const counts = {
    all: members.length,
    active: members.filter((m) => m._endMs >= now.getTime()).length,
    expiring: members.filter((m) => m._endMs >= now.getTime() && m.status === 'EXPIRING').length,
    expired: members.filter((m) => m._endMs < now.getTime()).length,
  }

  let list = members
  if (filter === 'active') list = members.filter((m) => m._endMs >= now.getTime())
  else if (filter === 'expiring') list = members.filter((m) => m._endMs >= now.getTime() && m.status === 'EXPIRING')
  else if (filter === 'expired') list = members.filter((m) => m._endMs < now.getTime())

  res.json({
    counts,
    members: list.map(({ _endMs, ...m }) => m),
  })
})

// POST /api/members — { fullName, phone?, planId, startDate, amount }
// Creates the member (endDate = startDate + plan.durationDays + 1 — the
// expiration is the first day the membership is over) and a linked PAID
// payment named "<plan> membership".
router.post('/', async (req, res) => {
  const { fullName, email, phone, planId, startDate, amount, method } = req.body || {}

  if (!fullName || typeof fullName !== 'string' || !fullName.trim()) {
    return res.status(400).json({ error: 'fullName is required' })
  }
  const plan = await prisma.membershipPlan.findUnique({ where: { id: planId } })
  if (!plan) return res.status(400).json({ error: 'planId is required and must be a valid plan' })

  const start = parseDateOnly(startDate)
  if (!start) return res.status(400).json({ error: 'startDate is required (YYYY-MM-DD)' })

  const amountNum = parseFloat(amount)
  if (amount === undefined || amount === null || amount === '' || Number.isNaN(amountNum)) {
    return res.status(400).json({ error: 'amount is required and must be a number' })
  }

  const now = new Date()
  const end = expirationFor(start, plan.durationDays)
  const { status } = classify(end, now, isMonthTerm(plan.durationDays))

  const member = await prisma.member.create({
    data: {
      fullName: fullName.trim(),
      email: email || null,
      phone: phone || null,
      planId: plan.id,
      startDate: start,
      endDate: end,
      status,
    },
  })

  await prisma.payment.create({
    data: {
      memberId: member.id,
      planId: plan.id,
      amount: amountNum,
      status: 'PAID',
      method: method || null,
      itemName: `${plan.name} membership`,
      paidAt: now,
    },
  })

  const created = await prisma.member.findUnique({
    where: { id: member.id },
    include: { plan: true, payments: { where: { status: 'PAID' }, select: { amount: true } } },
  })

  respondThenBroadcast(res, decorate(created, now, withPaidSum(created)), () => buildStats({ fresh: true }), {
    invalidate: invalidateStats,
    notification: {
      title: 'New member',
      body: `${member.fullName} joined — ${plan.name} membership (₱${amountNum.toFixed(2)})`,
      kind: 'member',
    },
  })
})

// POST /api/members/:id/renew — { planId?, days, amount }
router.post('/:id/renew', async (req, res) => {
  const { id } = req.params
  const { planId, days, amount, method } = req.body || {}

  const daysNum = Number(days)
  if (!Number.isInteger(daysNum) || daysNum <= 0) {
    return res.status(400).json({ error: 'days is required and must be a positive integer' })
  }
  const amountNum = parseFloat(amount)
  if (amount === undefined || amount === null || amount === '' || Number.isNaN(amountNum)) {
    return res.status(400).json({ error: 'amount is required and must be a number' })
  }

  const member = await prisma.member.findUnique({ where: { id }, include: { plan: true } })
  if (!member) return res.status(404).json({ error: 'Member not found' })

  let plan = member.plan
  if (planId) {
    plan = await prisma.membershipPlan.findUnique({ where: { id: planId } })
    if (!plan) return res.status(404).json({ error: 'Plan not found' })
  }

  const now = new Date()
  const previousExpiration = new Date(member.endDate)
  const newExpiration = renewalExpiration(previousExpiration, daysNum, now)

  await prisma.member.update({
    where: { id: member.id },
    data: { endDate: newExpiration, planId: plan.id, status: 'ACTIVE' },
  })

  await prisma.payment.create({
    data: {
      memberId: member.id,
      planId: plan.id,
      amount: amountNum,
      status: 'PAID',
      method: method || null,
      itemName: `${plan.name} renewal`,
      notes: `Renewed ${daysNum} days`,
      paidAt: now,
    },
  })

  const refreshed = await prisma.member.findUnique({
    where: { id: member.id },
    include: { plan: true, payments: { where: { status: 'PAID' }, select: { amount: true } } },
  })

  respondThenBroadcast(res, {
    member: decorate(refreshed, now, withPaidSum(refreshed)),
    previousExpiration,
    newExpiration,
    daysAdded: daysNum,
  }, () => buildStats({ fresh: true }), {
    invalidate: invalidateStats,
    notification: {
      title: 'Renewal recorded',
      body: `${member.fullName} renewed ${daysNum} days — ₱${amountNum.toFixed(2)}`,
      kind: 'renewal',
    },
  })
})

// PUT /api/members/:id — kept from the original API.
router.put('/:id', async (req, res) => {
  const { id } = req.params
  const { fullName, email, phone, planId, startDate, endDate, status } = req.body

  const exists = await prisma.member.findUnique({ where: { id } })
  if (!exists) return res.status(404).json({ error: 'Member not found' })

  await prisma.member.update({
    where: { id },
    data: {
      fullName,
      email: email === '' ? null : email,
      phone: phone === '' ? null : phone,
      planId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      status,
    },
    include: { plan: true },
  })

  const updated = await prisma.member.findUnique({
    where: { id },
    include: { plan: true, payments: { where: { status: 'PAID' }, select: { amount: true } } },
  })

  respondThenBroadcast(res, decorate(updated, new Date(), withPaidSum(updated)), () => buildStats({ fresh: true }), {
    invalidate: invalidateStats,
  })
})

// DELETE /api/members/:id — payments first, then the member.
router.delete('/:id', async (req, res) => {
  const { id } = req.params
  const exists = await prisma.member.findUnique({ where: { id } })
  if (!exists) return res.status(404).json({ error: 'Member not found' })

  await prisma.payment.deleteMany({ where: { memberId: id } })
  await prisma.member.delete({ where: { id } })

  respondThenBroadcast(res, { success: true }, () => buildStats({ fresh: true }), {
    invalidate: invalidateStats,
    notification: {
      title: 'Member removed',
      body: `${exists.fullName} was removed along with their payment history`,
      kind: 'member',
    },
  })
})

module.exports = router
