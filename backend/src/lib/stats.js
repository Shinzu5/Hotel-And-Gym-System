// Dashboard KPI builder — extracted from routes/dashboard.js so that every
// mutating route can rebroadcast the exact same payload over Socket.IO
// (`emitStats(await buildStats())`) without duplicating the query logic.
//
// PERFORMANCE NOTE (important):
// The database is Neon over a cross-region pooler, so every round-trip costs
// ~400ms from here. The original implementation issued ~18 *sequential* Prisma
// queries (including a 10-iteration loop, one query per revenue month) which
// made /dashboard/stats take 7-13 seconds and left the UI on skeletons.
//
// Everything below is therefore:
//   1. fetched in ONE parallel batch (Promise.all), and
//   2. bucketed in JavaScript instead of with extra queries.
//
// `buildStats()` also coalesces concurrent in-flight calls, because the
// sidebar, the page and the notification bell all request stats at the same
// moment on first paint. Mutating routes pass `{ fresh: true }` to bypass the
// coalescing and always read the row they just changed.

const prisma = require('./prisma')
const { daysLeftFor, isMonthTerm } = require('./dates')

// A membership is flagged as "expiring" once it is within this many days of
// its expiration.
const EXPIRING_WINDOW_DAYS = 5

// In-flight coalescing — see the note above.
let inflight = null

/**
 * Drop the coalesced read.
 *
 * Called right after a write commits: any read that is already in flight was
 * computed from the database *before* that write, so serving it to the next
 * caller would show stale numbers.
 */
function invalidateStats() {
  inflight = null
}

async function buildStats({ fresh = false } = {}) {
  // A "fresh" build is a broadcast. It must never be shared with readers:
  // a reader that joined it could be handed a snapshot taken before a write.
  // Broadcasts therefore run their own query and never become the coalesced
  // read.
  if (fresh) return queryStats()

  if (inflight) return inflight

  const promise = queryStats()
  inflight = promise
  const clear = () => {
    if (inflight === promise) inflight = null
  }
  promise.then(clear, clear)
  return promise
}

async function queryStats() {
  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)

  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const startOfPrevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const endOfPrevMonth = new Date(today.getFullYear(), today.getMonth(), 1)

  // Dec 1 of last year -> covers last month (relevant in January) plus the
  // whole current-year revenue series.
  const seriesStart = new Date(today.getFullYear() - 1, 11, 1)

  // ---- one parallel batch: 4 round-trips, all at once ----
  //
  // The old code needed ~18 sequential queries. Everything below is derived
  // from these four:
  //   1. every payment since Dec last year   -> today's takings + revenue series
  //   2. the latest 6 payments (with joins)   -> "Recent payments"
  //   3. active + expired members (with plan) -> counts + "Expiring soon"
  //   4. active plan count
  const [allPayments, recentPaymentsData, memberRows, activePlans] = await Promise.all([
    // Every payment (any status) from Dec last year onwards. Covers today's
    // payments, this month, last month and the whole revenue series.
    prisma.payment.findMany({
      where: { paidAt: { gte: seriesStart } },
    }),

    // Latest 6 payments, excluding today's walk-in day-pass payments
    // (matches the demo design).
    prisma.payment.findMany({
      where: {
        NOT: {
          AND: [
            { plan: { is: { name: 'Walk-in' } } },
            { paidAt: { gte: startOfToday, lt: endOfToday } },
          ],
        },
      },
      include: {
        member: { select: { fullName: true } },
        plan: { select: { name: true } },
      },
      orderBy: { paidAt: 'desc' },
      take: 6,
    }),

    // Active + expired members in one go.
    prisma.member.findMany({
      where: { status: { in: ['ACTIVE', 'EXPIRED'] } },
      include: { plan: true },
    }),

    // Active plans.
    prisma.membershipPlan.count({ where: { active: true } }),
  ])

  // ---- bucket in JS (no extra queries) ----

  const todayPayments = allPayments.filter((p) => p.paidAt >= startOfToday && p.paidAt < endOfToday)
  const paidPayments = allPayments.filter((p) => p.status === 'PAID')

  const activeMembersData = memberRows.filter((m) => m.status === 'ACTIVE')
  const activeMembers = activeMembersData.length
  const expiredMembers = memberRows.length - activeMembers

  // ---- bucket the payments in JS (no extra queries) ----

  // Today's sales (PAID payments today) and transactions (all payments today)
  const todaySales = todayPayments
    .filter(p => p.status === 'PAID')
    .reduce((sum, p) => sum + parseFloat(p.amount), 0)
  const todayTransactions = todayPayments.length

  // "Open" sales: today's PAID payments that are not part of any DailyReport
  // (i.e. not yet closed out by POST /api/payments/close-sales).
  const openPayments = todayPayments.filter(p => p.status === 'PAID' && !p.reportId)
  const openSales = openPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0)
  const openTransactions = openPayments.length

  const inRange = (paidAt, from, to) => paidAt >= from && paidAt < to

  // Month revenue (this month's PAID total)
  const monthRevenue = paidPayments
    .filter(p => p.paidAt >= startOfMonth)
    .reduce((sum, p) => sum + parseFloat(p.amount), 0)

  // Prev month revenue
  const prevMonthRevenue = paidPayments
    .filter(p => inRange(p.paidAt, startOfPrevMonth, endOfPrevMonth))
    .reduce((sum, p) => sum + parseFloat(p.amount), 0)

  // Growth percent
  let growthPercent = 0
  if (prevMonthRevenue > 0) {
    growthPercent = ((monthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100
  }
  growthPercent = Math.round(growthPercent * 10) / 10

  const monthLabel = today.toLocaleString('default', { month: 'long' })
  const prevMonthLabel = new Date(today.getFullYear(), today.getMonth() - 1, 1).toLocaleString('default', { month: 'long' })

  // Revenue series Jan through current month (bucketed from the single query)
  const revenueSeries = []
  for (let i = 0; i <= today.getMonth(); i++) {
    const monthStart = new Date(today.getFullYear(), i, 1)
    const monthEnd = new Date(today.getFullYear(), i + 1, 1)
    const revenue = paidPayments
      .filter(p => inRange(p.paidAt, monthStart, monthEnd))
      .reduce((sum, p) => sum + parseFloat(p.amount), 0)
    revenueSeries.push({
      month: monthStart.toLocaleString('default', { month: 'short' }),
      revenue,
    })
  }

  // Expiring soon: members with 1..5 usable days left, sorted by daysLeft asc
  const expiringSoon = activeMembersData
    .map(m => {
      const daysLeft = daysLeftFor(m.endDate, today, {
        monthTerm: isMonthTerm(m.plan?.durationDays),
      })
      return { ...m, daysLeft }
    })
    .filter(m => m.daysLeft > 0 && m.daysLeft <= EXPIRING_WINDOW_DAYS)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .map(m => ({
      id: m.id,
      name: m.fullName,
      plan: m.plan?.name,
      endDate: m.endDate,
      daysLeft: m.daysLeft,
    }))

  const recentPayments = recentPaymentsData.map(p => ({
    id: p.id,
    // memberId tells the UI whether this sale was linked to a registered
    // member (vs a walk-in) so it can tag the name.
    memberId: p.memberId || null,
    memberName: p.member?.fullName || 'Walk-in guest',
    planName: p.plan?.name || null,
    itemName: p.itemName || null,
    notes: p.notes || null,
    method: p.method || null,
    amount: parseFloat(p.amount),
    status: p.status,
    paidAt: p.paidAt,
  }))

  return {
    todaySales,
    todayTransactions,
    // paidToday mirrors todaySales — used by the sidebar ("₱x paid today").
    paidToday: todaySales,
    // Open (not yet closed into a DailyReport) portion of today's takings.
    openSales,
    openTransactions,
    activeMembers,
    expiredMembers,
    activePlans,
    monthRevenue,
    monthLabel,
    prevMonthLabel,
    prevMonthRevenue,
    growthPercent,
    revenueSeries,
    expiringSoon,
    recentPayments,
  }
}

module.exports = { buildStats, invalidateStats }
