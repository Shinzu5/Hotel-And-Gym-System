// Apartments KPI builder — the single source of truth for both the
// Apartments overview and the Apartments page. Mutating routes rebroadcast
// the exact same payload over Socket.IO (`emitResidences(await buildStats())`).
//
// Everything here is derived from ApartmentUnit / Lease / LeasePayment, so the
// numbers move the moment a lease is added, edited, ended or paid.
//
// PERFORMANCE: the whole payload is built from ONE Prisma query. The units
// query already includes every lease and its payments, so the month figures
// and the 6-month income series are bucketed in JavaScript rather than
// costing extra round-trips to Neon (~400ms each from here).
//
// Like `lib/stats.js`, concurrent calls are coalesced into a single query;
// mutating routes pass `{ fresh: true }` to bypass that.

const prisma = require('./prisma')
const { daysLeftUntil } = require('./dates')

const MS_DAY = 24 * 60 * 60 * 1000

// A lease is flagged as "expiring" once it is within this many days of its
// expiration — the same window the gym uses for memberships.
const EXPIRING_WINDOW_DAYS = 5

const toDate = (value) => (value instanceof Date ? value : new Date(value))

/**
 * Days still usable after today for an exclusive expiration date.
 * Oct 20 -> Nov 20 is 31 calendar days, so 30 days left.
 */
function daysUntil(end, now) {
  return daysLeftUntil(end, now)
}

/** Days remaining in the current month (Oct 20 -> 11 on a 31-day month). */
function daysLeftInMonth(now) {
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  return Math.max(0, last - now.getDate())
}

/**
 * Lease/occupancy pill for a card:
 *   no active lease -> VACANT (gray)
 *   ends within 5d  -> EXPIRING (amber)
 *   otherwise       -> OCCUPIED (green)
 */
function leasePill(activeLease, now) {
  if (!activeLease) return 'VACANT'
  const days = daysUntil(activeLease.endDate, now)
  if (days < 0) return 'VACANT'
  return days <= EXPIRING_WINDOW_DAYS ? 'EXPIRING' : 'OCCUPIED'
}

const money = (n) => Math.round(Number(n) * 100) / 100

const sum = (list, pick) => list.reduce((acc, item) => acc + Number(pick(item) || 0), 0)

/**
 * Units ordered as shown in the UI, with leases + payments loaded once.
 *
 * Only the columns we actually read are selected: the nested include with
 * `select` is ~450ms faster than pulling whole rows, and one query beats two
 * parallel ones because the Neon pooler serialises concurrent queries.
 */
async function loadUnits() {
  return prisma.apartmentUnit.findMany({
    orderBy: [{ order: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
      monthlyRent: true,
      order: true,
      createdAt: true,
      leases: {
        orderBy: { startDate: 'asc' },
        select: {
          id: true,
          unitId: true,
          renterName: true,
          contact: true,
          startDate: true,
          endDate: true,
          monthlyRent: true,
          status: true,
          endedAt: true,
          endedReason: true,
          createdAt: true,
          payments: {
            orderBy: { paidAt: 'asc' },
            select: { id: true, leaseId: true, amount: true, method: true, notes: true, paidAt: true },
          },
        },
      },
    },
  })
}

/** Flat list of every rent payment across every lease. */
function collectPayments(rows) {
  const all = []
  rows.forEach((unit) => {
    unit.leases.forEach((lease) => {
      lease.payments.forEach((payment) => all.push(payment))
    })
  })
  return all
}

/** Decorate one unit: occupancy, all-time earnings, active lease, vacancy. */
function decorateUnit(unit, now) {
  const activeLease =
    unit.leases.find((l) => l.status === 'ACTIVE' && toDate(l.endDate).getTime() >= now.getTime()) || null

  const totalEarned = money(sum(unit.leases, (l) => sum(l.payments, (p) => p.amount)))

  const lastLease = unit.leases[unit.leases.length - 1] || null
  const vacantSince = activeLease ? null : toDate(lastLease ? lastLease.endDate : unit.createdAt)
  const vacantDays = vacantSince ? Math.max(0, Math.floor((now.getTime() - vacantSince.getTime()) / MS_DAY)) : 0

  let lease = null
  if (activeLease) {
    const daysLeft = daysUntil(activeLease.endDate, now)
    lease = {
      id: activeLease.id,
      renterName: activeLease.renterName,
      contact: activeLease.contact,
      startDate: activeLease.startDate,
      endDate: activeLease.endDate,
      monthlyRent: Number(activeLease.monthlyRent),
      status: activeLease.status,
      daysLeft,
      timeRemainingMs: Math.max(0, toDate(activeLease.endDate).getTime() - now.getTime()),
      paid: money(sum(activeLease.payments, (p) => p.amount)),
      paymentCount: activeLease.payments.length,
    }
  }

  return {
    id: unit.id,
    code: unit.code,
    name: unit.name,
    type: unit.type,
    monthlyRent: Number(unit.monthlyRent),
    status: activeLease ? 'OCCUPIED' : 'VACANT',
    pill: leasePill(activeLease, now),
    totalEarned,
    pastLeaseCount: unit.leases.filter((l) => l.status !== 'ACTIVE').length,
    lease,
    vacantSince,
    vacantDays,
    vacantLabel: vacantLabel(vacantDays),
  }
}

/** "12 days" / "39 days" / "2 months" — the copy under a vacant card. */
function vacantLabel(days) {
  if (days <= 0) return 'Available today'
  if (days < 30) return `${days} day${days === 1 ? '' : 's'}`
  const months = Math.floor(days / 30)
  return `${months} month${months === 1 ? '' : 's'}`
}

/** Summary shared by BOTH the overview cards and the apartments KPI row. */
function buildSummary(units, now) {
  const occupied = units.filter((u) => u.status === 'OCCUPIED')
  const totalEarned = money(sum(units, (u) => u.totalEarned))
  const monthlyRentRoll = money(sum(occupied, (u) => (u.lease ? u.lease.monthlyRent : 0)))
  const total = units.length

  return {
    totalEarned,
    occupied: occupied.length,
    total,
    occupancyPercent: total ? Math.round((occupied.length / total) * 100) : 0,
    occupancyLabel: `${occupied.length} of ${total} units ${occupied.length === total ? 'rented' : 'occupied'}`,
    monthlyRentRoll,
    vacantUnits: total - occupied.length,
    daysLeftInMonth: daysLeftInMonth(now),
  }
}

/** "Earned this month" — every rent payment stamped inside the current month. */
function earnedThisMonth(payments, now) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return money(
    payments
      .filter((p) => p.paidAt >= start && p.paidAt < end)
      .reduce((s, p) => s + Number(p.amount), 0)
  )
}

/**
 * Rental income for the current calendar year, January → December.
 *
 * The future months are included (at zero) so the chart always spans the
 * whole year and fills in as the year goes on.
 */
function incomeSeries(payments, now) {
  const year = now.getFullYear()
  const months = []
  for (let m = 0; m < 12; m++) {
    const start = new Date(year, m, 1)
    const end = new Date(year, m + 1, 1)
    months.push({ start, end, label: start.toLocaleString('default', { month: 'short' }) })
  }

  return months.map((m) => ({
    month: m.label,
    amount: money(
      payments
        .filter((p) => p.paidAt >= m.start && p.paidAt < m.end)
        .reduce((s, p) => s + Number(p.amount), 0)
    ),
  }))
}

// In-flight coalescing — see the note at the top of the file.
let inflight = null

/**
 * Drop the coalesced read.
 *
 * Called right after a write commits: any read that is already in flight was
 * computed from the database *before* that write, so serving it to the next
 * caller would show stale numbers.
 */
function invalidateResidences() {
  inflight = null
}

async function load({ fresh = false } = {}) {
  // A "fresh" build is a broadcast. It must never be shared with readers:
  // a reader that joined it could be handed a snapshot taken before a write.
  if (fresh) return loadUnits()

  if (inflight) return inflight

  const promise = loadUnits()
  inflight = promise
  const clear = () => {
    if (inflight === promise) inflight = null
  }
  promise.then(clear, clear)
  return promise
}

/**
 * Full payload: summary, income series, per-unit earnings, upcoming
 * expirations and the decorated units.
 */
async function buildStats(opts = {}) {
  const now = new Date()
  const rows = await load(opts)
  const units = rows.map((u) => decorateUnit(u, now))
  const payments = collectPayments(rows)

  const summary = buildSummary(units, now)
  summary.earnedThisMonth = earnedThisMonth(payments, now)

  const earningsByUnit = units.map((u) => ({
    id: u.id,
    name: u.name,
    type: u.type,
    amount: u.totalEarned,
    percent: 0,
  }))
  const peak = Math.max(...earningsByUnit.map((e) => e.amount), 0)
  earningsByUnit.forEach((e) => {
    e.percent = peak ? Math.round((e.amount / peak) * 100) : 0
  })

  // Every active lease, soonest-ending first — drives "Upcoming lease expirations".
  const upcomingExpirations = units
    .filter((u) => u.lease)
    .map((u) => ({
      leaseId: u.lease.id,
      renterName: u.lease.renterName,
      unitId: u.id,
      unitName: u.name,
      unitCode: u.code,
      endDate: u.lease.endDate,
      daysLeft: u.lease.daysLeft,
      status: u.lease.daysLeft < 0 ? 'EXPIRED' : u.lease.daysLeft <= EXPIRING_WINDOW_DAYS ? 'EXPIRING' : 'OCCUPIED',
      pill: u.pill,
    }))
    .sort((a, b) => new Date(a.endDate) - new Date(b.endDate))

  return {
    summary,
    incomeSeries: incomeSeries(payments, now),
    earningsByUnit,
    upcomingExpirations,
    units,
  }
}

/** The Apartments page payload — summary + decorated units. */
async function buildUnits(opts = {}) {
  const payload = await buildStats(opts)
  return { summary: payload.summary, units: payload.units }
}

module.exports = { buildStats, buildUnits, invalidateResidences, vacantLabel }
