// Demo data for the gym admin app — safely re-runnable.
//
// TWO MODES
// ---------
//   node prisma/seed.js            -> the full DEMO data (members, receipts,
//                                      a closed report, tenants, rent history)
//   node prisma/seed.js --empty    -> BRAND NEW: just the admin account, the
//                                      two membership tiers and the four
//                                      apartments. No sample records at all.
//
// `npm run seed` runs the empty one; `npm run seed:demo` runs the demo.
//
// The demo mode pins the dashboard KPIs to:
//   todaySales=1950  todayTransactions=4  openSales=1950  openTransactions=4
//   activeMembers=8  expiredMembers=4  activePlans=2
//   monthRevenue=486250  prevMonthRevenue=432600  growthPercent≈12.4
//   revenueSeries: Jan 210000, Feb 245500, Mar 268000, Apr 301250, May 289000,
//                  Jun 325400, Jul 355000, Aug 398750, Sep 432600, Oct 486250
//
// Each month's member-level payments are seeded first; the remaining balance
// of the month target is filled with large "Corporate billing" bank-transfer
// payments (the same approach the original seed used), so the monthly totals
// land exactly on the figures above no matter how the small payments are
// tuned. The demo seed is tuned for the current month being October.

require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

// `--empty` produces the brand-new state; without it the demo data is created.
const DEMO = !process.argv.includes('--empty')

const now = new Date()
const MS_DAY = 24 * 60 * 60 * 1000
const plus = (n) => new Date(now.getTime() + n * MS_DAY)
const minus = (n) => new Date(now.getTime() - n * MS_DAY)

const year = now.getFullYear()
const monthIdx = now.getMonth() // seed is tuned for October (9)

// Date at a given month/day of this year, 12:00 by default.
const md = (m, day, hour = 12, min = 0) => new Date(year, m, day, hour, min, 0, 0)
// Today / yesterday at a given clock time.
const at = (h, mi) => new Date(year, monthIdx, now.getDate(), h, mi, 0, 0)
const yesterdayAt = (h, mi) => new Date(year, monthIdx, now.getDate() - 1, h, mi, 0, 0)

async function main() {
  if (DEMO && monthIdx !== 9) {
    console.warn('Note: this seed is tuned for October — monthly revenue figures will differ in other months.')
  }

  // ---- reset (safe re-run, FK order: leasePayments -> leases -> units;
  //                then payments -> members -> reports) ----
  await prisma.leasePayment.deleteMany({})
  await prisma.lease.deleteMany({})
  await prisma.apartmentUnit.deleteMany({})
  await prisma.payment.deleteMany({})
  await prisma.member.deleteMany({})
  await prisma.dailyReport.deleteMany({})
  await prisma.notification.deleteMany({})

  // ---- admin user (preserved) ----
  const passwordHash = await bcrypt.hash('brenie', parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10))
  await prisma.user.upsert({
    where: { email: 'brenie@abbsey.ph' },
    update: {},
    create: { email: 'brenie@abbsey.ph', passwordHash, name: 'Admin', role: 'ADMIN' },
  })

  // ---- plans: exactly 5, all active (leftovers from older seeds removed) ----
  // ---- membership plans: two tiers only ----
  // "15 days" and "30 days". The expiration is the first day the membership
  // is over, so a 30-day plan starting on the 20th expires on the 20th of
  // the next month.
  const planDefs = [
    { name: '15 days', price: 200.0, durationDays: 15 },
    { name: '30 days', price: 350.0, durationDays: 30 },
  ]
  await prisma.membershipPlan.deleteMany({
    where: { name: { notIn: planDefs.map((d) => d.name) } },
  })
  const plans = {}
  for (const def of planDefs) {
    let plan = await prisma.membershipPlan.findFirst({ where: { name: def.name } })
    if (!plan) {
      plan = await prisma.membershipPlan.create({ data: { ...def, active: true } })
    } else {
      plan = await prisma.membershipPlan.update({
        where: { id: plan.id },
        data: { price: def.price, durationDays: def.durationDays, active: true },
      })
    }
    plans[def.name] = plan
  }

  // ---- Apartments: the four apartments (always present) ----
  // The units are the property, not sample data: there is no "add apartment"
  // action in the UI, so they always exist. Their tenants and rent history
  // are the demo data (see below).
  const unitDefs = [
    { code: 'ROOM 1', name: 'Unit 1A', type: 'Studio', monthlyRent: 12500, order: 1 },
    { code: 'ROOM 2', name: 'Unit 1B', type: '1 Bedroom', monthlyRent: 18000, order: 2 },
    { code: 'ROOM 3', name: 'Unit 2A', type: '1 Bedroom', monthlyRent: 18000, order: 3 },
    { code: 'ROOM 4', name: 'Unit 2B', type: '2 Bedroom', monthlyRent: 25500, order: 4 },
  ]
  const units = {}
  for (const def of unitDefs) {
    units[def.name] = await prisma.apartmentUnit.create({ data: def })
  }

  // ---- brand new: stop here ----
  // `npm run seed` (--empty) leaves the app looking brand new — an admin, the
  // two membership tiers, the four apartments, and no sample records at all.
  if (!DEMO) {
    console.log(`Seeded (brand new): 1 admin, ${planDefs.length} plans, ${unitDefs.length} apartments`)
    console.log('No members, payments, reports, notifications, leases or rent records.')
    return
  }

  // ---- members: 12 total — 8 ACTIVE, 4 EXPIRED ----
  // NOTE: the expiry windows follow each plan's term, so the end dates below
  // are tuned to give the demo a useful spread of day counts. Exactly three
  // members (Kim 4d, Paolo 3d, Miguel 1d) fall inside the 5-day expiry window
  // the dashboard's "expiring" KPI counts.
  const memberDefs = [
    // ACTIVE (8)
    { fullName: 'Andreas Santos', phone: '0917 895 2082', plan: '30 days', startDate: minus(5), endDate: plus(25), status: 'ACTIVE' },
    { fullName: 'Bea Villanueva', phone: '0995 771 4408', plan: '30 days', startDate: minus(120), endDate: plus(245), status: 'ACTIVE' },
    { fullName: 'Lance Aquino', phone: '0918 233 9076', plan: '30 days', startDate: minus(30), endDate: plus(60), status: 'ACTIVE' },
    { fullName: 'Janine Dela Cruz', phone: '0918 442 7731', plan: '30 days', startDate: minus(11), endDate: plus(19), status: 'ACTIVE' },
    { fullName: 'Rafael Bucosta', phone: '0916 554 2018', plan: '15 days', startDate: minus(14), endDate: plus(14), status: 'ACTIVE' },
    { fullName: 'Kim Navarro', phone: '0917 334 8820', plan: '30 days', startDate: minus(15), endDate: plus(4), status: 'ACTIVE' },
    { fullName: 'Paolo Cruz', phone: '0921 774 5510', plan: '15 days', startDate: minus(12), endDate: plus(1), status: 'ACTIVE' },
    { fullName: 'Miguel Reyes', phone: '0927 118 3390', plan: '30 days', startDate: minus(29), endDate: plus(1), status: 'ACTIVE' },
    // EXPIRED (4)
    { fullName: 'Joan Lim', phone: '0918 553 2214', plan: '30 days', startDate: minus(35), endDate: minus(5), status: 'EXPIRED' },
    { fullName: 'Carlos Santos', phone: '0915 224 7719', plan: '30 days', startDate: minus(102), endDate: minus(12), status: 'EXPIRED' },
    { fullName: 'Dana Reyes', phone: '0919 668 4432', plan: '15 days', startDate: minus(21), endDate: minus(3), status: 'EXPIRED' },
    { fullName: 'Eric Tan', phone: '0920 117 8864', plan: '30 days', startDate: minus(50), endDate: minus(20), status: 'EXPIRED' },
  ]

  const members = {}
  for (const m of memberDefs) {
    const created = await prisma.member.create({
      data: {
        fullName: m.fullName,
        email: null,
        phone: m.phone,
        planId: plans[m.plan].id,
        startDate: m.startDate,
        // The expiration is the first day the membership is over, so every
        // seeded end date sits one day later than the old "start + duration"
        // rule. The displayed day counts stay exactly as designed.
        endDate: new Date(m.endDate.getTime() + MS_DAY),
        status: m.status,
      },
    })
    members[m.fullName] = created
  }

  // ---- yesterday's CLOSED DailyReport (3 payments, reportId set) ----
  const CLOSED_TOTAL = 350 + 350 + 350 // 1050 — three "30 days" memberships
  const closedReport = await prisma.dailyReport.create({
    data: {
      date: new Date(year, monthIdx, now.getDate() - 1), // start of yesterday
      totalSales: CLOSED_TOTAL,
      transactionCount: 3,
    },
  })

  // ---- payments ----
  // The demo history below was written against the old five-plan menu. Every
  // legacy plan is mapped onto one of the two tiers that exist now and priced
  // at the tier price, so the whole payment history stays coherent with the
  // plan list. Sales that are not a membership (walk-ins, protein shakes,
  // personal training) keep their own amount and label.
  const PLAN_TIERS = {
    Monthly: '30 days',
    Quarterly: '30 days',
    Annual: '30 days',
    '15-days': '15 days',
    '18-days': '15 days',
  }
  const TIER_PRICE = { '15 days': 200, '30 days': 350 }

  const payments = []
  const add = ({
    member = null, plan = null, amount, status = 'PAID', method = null,
    paidAt, itemName = null, notes = null, reportId = null,
  }) => {
    const tier = plan ? PLAN_TIERS[plan] || plan : null
    payments.push({
      memberId: member ? members[member].id : null,
      planId: tier ? plans[tier].id : null,
      amount: tier ? (TIER_PRICE[tier] ?? amount) : amount,
      status,
      method: method || null,
      itemName: tier ? `${tier} membership` : itemName || null,
      notes: notes || null,
      reportId: reportId || null,
      paidAt,
    })
  }

  // -- Prior PAID payments so every ACTIVE member's amountPaid is non-zero --
  // August — one membership payment per ACTIVE member.
  const priorA = [
    ['Andreas Santos', 'Monthly', 300, 'GCash', 4],
    ['Bea Villanueva', 'Annual', 10500, 'Bank Transfer', 5],
    ['Lance Aquino', 'Quarterly', 850, 'GCash', 6],
    ['Janine Dela Cruz', 'Monthly', 300, 'Cash', 7],
    ['Rafael Bucosta', '15-days', 300, 'Cash', 8],
    ['Kim Navarro', 'Monthly', 300, 'GCash', 9],
    ['Paolo Cruz', '15-days', 300, 'GCash', 10],
    ['Miguel Reyes', 'Monthly', 300, 'Cash', 11],
  ]
  for (const [m, pl, amt, method, day] of priorA) {
    add({ member: m, plan: pl, amount: amt, method, paidAt: md(7, day, 10), itemName: `${pl} membership` })
  }
  // September — a second one for each ACTIVE member.
  const priorB = [
    ['Andreas Santos', 'Monthly', 300, 'Cash', 3],
    ['Bea Villanueva', 'Annual', 10500, 'Bank Transfer', 6],
    ['Lance Aquino', 'Quarterly', 850, 'GCash', 9],
    ['Janine Dela Cruz', 'Monthly', 300, 'GCash', 12],
    ['Rafael Bucosta', '15-days', 300, 'GCash', 15],
    ['Kim Navarro', 'Monthly', 300, 'Cash', 18],
    ['Paolo Cruz', '15-days', 300, 'Cash', 21],
    ['Miguel Reyes', 'Monthly', 300, 'GCash', 24],
  ]
  for (const [m, pl, amt, method, day] of priorB) {
    add({ member: m, plan: pl, amount: amt, method, paidAt: md(8, day, 16), itemName: `${pl} membership` })
  }
  // July — one older payment each for the EXPIRED members.
  const priorExpired = [
    ['Joan Lim', 'Monthly', 300, 'Cash', 8],
    ['Carlos Santos', 'Quarterly', 850, 'Bank Transfer', 11],
    ['Dana Reyes', '18-days', 350, 'GCash', 14],
    ['Eric Tan', 'Monthly', 300, 'GCash', 17],
  ]
  for (const [m, pl, amt, method, day] of priorExpired) {
    add({ member: m, plan: pl, amount: amt, method, paidAt: md(6, day, 15), itemName: `${pl} membership` })
  }

  // -- Early-October membership sales (days 1..13) --
  const earlyOctober = [
    ['Joan Lim', 'Monthly', 300, 'GCash', 1],
    ['Carlos Santos', 'Quarterly', 850, 'Bank Transfer', 2],
    ['Bea Villanueva', 'Annual', 10500, 'Bank Transfer', 3],
    ['Kim Navarro', 'Monthly', 300, 'GCash', 4],
    ['Andreas Santos', 'Monthly', 300, 'Cash', 5],
    ['Lance Aquino', 'Quarterly', 850, 'GCash', 6],
    ['Janine Dela Cruz', 'Monthly', 300, 'GCash', 7],
    ['Rafael Bucosta', '15-days', 300, 'Cash', 8],
    ['Paolo Cruz', '15-days', 300, 'GCash', 9],
    ['Miguel Reyes', 'Monthly', 300, 'Cash', 10],
    ['Lance Aquino', 'Quarterly', 850, 'GCash', 12],
    ['Andreas Santos', 'Monthly', 300, 'Cash', 13],
  ]
  for (const [m, pl, amt, method, day] of earlyOctober) {
    add({ member: m, plan: pl, amount: amt, method, paidAt: md(9, day, 10, 30), itemName: `${pl} membership` })
  }

  // -- Recent payments (last few days, two still pending) --
  add({ member: 'Janine Dela Cruz', plan: 'Monthly', amount: 300, method: 'Cash', paidAt: minus(2), itemName: 'Monthly membership' })
  add({ member: 'Paolo Cruz', plan: '15-days', amount: 300, method: 'GCash', paidAt: minus(3), itemName: '15-days membership' })
  add({ member: 'Bea Villanueva', plan: 'Annual', amount: 10500, method: 'Bank Transfer', paidAt: minus(4), itemName: 'Annual membership' })
  add({ member: 'Miguel Reyes', plan: 'Monthly', amount: 300, status: 'PENDING', method: 'GCash', paidAt: minus(5), itemName: 'Monthly membership', notes: 'Awaiting GCash confirmation' })
  add({ member: 'Joan Lim', plan: 'Monthly', amount: 300, status: 'PENDING', method: 'GCash', paidAt: minus(6), itemName: 'Monthly membership', notes: 'Renewal reminder sent' })

  // -- Yesterday's 3 payments — rolled into the closed DailyReport --
  add({ member: 'Andreas Santos', plan: 'Monthly', amount: 300, method: 'GCash', paidAt: yesterdayAt(9, 30), itemName: 'Monthly membership', reportId: closedReport.id })
  add({ member: 'Kim Navarro', plan: 'Monthly', amount: 300, method: 'Cash', paidAt: yesterdayAt(13, 15), itemName: 'Monthly membership', reportId: closedReport.id })
  add({ member: 'Bea Villanueva', plan: 'Annual', amount: 10500, method: 'Bank Transfer', paidAt: yesterdayAt(18, 20), itemName: 'Annual membership', reportId: closedReport.id })

  // -- TODAY's 4 payments: exactly ₱1,950.00, all open (reportId null) --
  add({ member: 'Lance Aquino', plan: '30 days', amount: 350, method: 'GCash', paidAt: at(8, 12), itemName: '30 days membership', notes: 'Paid via GCash' })
  add({ member: null, plan: null, amount: 780, paidAt: at(11, 40), itemName: 'Personal training session' }) // walk-in guest
  add({ member: 'Janine Dela Cruz', plan: null, amount: 150, paidAt: at(13, 5), itemName: 'Protein shake' }) // no "Trisha Gomez" member
  add({ member: 'Rafael Bucosta', plan: null, amount: 670, method: 'Cash', paidAt: at(17, 50), itemName: 'Personal training session', notes: 'Coach Marv' })

  // ---- corporate fillers: pin each month's PAID total to the demo figures ----
  const monthTargets = [210000, 245500, 268000, 301250, 289000, 325400, 355000, 398750, 432600, 486250] // Jan..Oct
  const split = (amount) => {
    const parts = []
    let rest = Math.round(amount * 100) / 100
    let cap = 180000
    while (rest > 0) {
      const part = Math.min(cap, rest)
      parts.push(part)
      rest = Math.round((rest - part) * 100) / 100
      cap = 150000
    }
    return parts
  }
  for (let m = 0; m < monthTargets.length; m++) {
    const target = monthTargets[m]
    const paidInMonth = payments.filter(
      (p) => p.status === 'PAID' && p.paidAt.getFullYear() === year && p.paidAt.getMonth() === m
    )
    const sum = paidInMonth.reduce((s, p) => s + p.amount, 0)
    const remainder = Math.round((target - sum) * 100) / 100
    if (remainder < 0) {
      throw new Error(`Seed overflow in month index ${m}: member payments (${sum}) exceed target (${target})`)
    }
    if (remainder === 0) continue
    split(remainder).forEach((part, i) => {
      // For the current month keep filler days strictly before today so
      // today's transaction count stays at exactly 4.
      const day = m === monthIdx
        ? Math.min(Math.max(1, now.getDate() - 6 + i * 2), Math.max(1, now.getDate() - 2))
        : [15, 20, 25][i] ?? (26 + i)
      add({
        member: 'Bea Villanueva',
        plan: null, // a bulk corporate invoice, not a membership
        amount: part,
        method: 'Bank Transfer',
        paidAt: md(m, day, 12),
        itemName: 'Corporate billing',
        notes: 'Bulk corporate invoice',
      })
    })
  }

  await prisma.payment.createMany({ data: payments })

  /* ---------------------------------------------------------------------- *
   * Apartments — 6 leases (2 active) and their rent history.                  *
   *                                                                         *
   * The four apartments themselves are created above (they always exist);   *
   * the tenants and their rent history are the demo data.                    *
   *                                                                         *
   * Pinned to the Residences KPIs shown in the design:                      *
   *   totalEarned        = 641,643.25   (all-time, incl. past renters)      *
   *   occupied           = 2 of 4 units (50% occupancy)                     *
   *   monthlyRentRoll    = 12,500 + 18,000 = 30,500                         *
   *   earnedThisMonth    = 18,860       (1A rent 12,500 + 2A final 6,360)   *
   *   earningsByUnit     = 1A 121,673.46 · 1B 250,126.03                    *
   *                        2A 132,360.00 · 2B 137,483.76                    *
   *   incomeSeries       = a real May..Oct curve built from the payments    *
   *                        below (Oct is intentionally the smallest month). *
   * Unit 1B has deliberately NOT paid October yet (due on the 25th) so the  *
   * month total stays at 18,860 while occupancy/rent roll stay realistic.   *
   * ---------------------------------------------------------------------- */

  const leaseDefs = [
    // Unit 1A — Liza Ramos handed over to Mariel Lopez on May 20.
    { key: 'liza',   unit: 'Unit 1A', renterName: 'Liza Ramos',      contact: '0918 227 4410', startDate: new Date(year, 1, 1),       endDate: new Date(year, 4, 19),        monthlyRent: 12500, status: 'ENDED', endedAt: new Date(year, 4, 19),  endedReason: 'Lease completed' },
    { key: 'mariel', unit: 'Unit 1A', renterName: 'Mariel Lopez',    contact: '0917 421 3800', startDate: new Date(year, 4, 20),      endDate: new Date(year + 1, 4, 23),    monthlyRent: 12500, status: 'ACTIVE' },
    // Unit 1B — Nico Perez handed over to Jerome Tan on Nov 13, 2025.
    { key: 'nico',   unit: 'Unit 1B', renterName: 'Nico Perez',      contact: '0917 908 3345', startDate: new Date(year - 1, 7, 13),  endDate: new Date(year - 1, 10, 12),   monthlyRent: 18000, status: 'ENDED', endedAt: new Date(year - 1, 10, 12), endedReason: 'Lease completed' },
    { key: 'jerome', unit: 'Unit 1B', renterName: 'Jerome Tan',      contact: '0998 659 7472', startDate: new Date(year - 1, 10, 13), endDate: new Date(year, 10, 13),       monthlyRent: 18000, status: 'ACTIVE' },
    // Unit 2A / 2B — both currently vacant (previous renters moved out).
    { key: 'paolo',  unit: 'Unit 2A', renterName: 'Paolo Sarmiento', contact: '0917 553 2208', startDate: new Date(year, 2, 8),       endDate: new Date(year, 9, 8),         monthlyRent: 18000, status: 'ENDED', endedAt: new Date(year, 9, 8),   endedReason: 'Moved out' },
    { key: 'dianne', unit: 'Unit 2B', renterName: 'Dianne Chua',     contact: '0995 884 1176', startDate: new Date(year, 3, 15),      endDate: new Date(year, 8, 11),        monthlyRent: 25500, status: 'ENDED', endedAt: new Date(year, 8, 11),  endedReason: 'Lease completed' },
  ]
  const leases = {}
  for (const def of leaseDefs) {
    const { key, unit, ...data } = def
    leases[key] = await prisma.lease.create({ data: { ...data, unitId: units[unit].id } })
  }

  // Rent received — `md` is a past month/day, `thisMonth` is always stamped
  // inside the CURRENT month so `earnedThisMonth` lands on 18,860 whenever
  // the seed runs.
  const rentPayments = []
  const rent = (key, amount, paidAt, notes) => {
    rentPayments.push({ leaseId: leases[key].id, amount, method: 'Bank Transfer', notes: notes || null, paidAt })
  }
  const thisMonth = (day, hour = 11) =>
    new Date(year, monthIdx, Math.max(1, Math.min(day, now.getDate())), hour, 0, 0, 0)

  // Unit 1A · Liza Ramos — 3 full months + a prorated final month (46,673.46)
  rent('liza', 12500, md(1, 1), 'February rent')
  rent('liza', 12500, md(2, 1), 'March rent')
  rent('liza', 12500, md(3, 1), 'April rent')
  rent('liza', 9173.46, md(4, 19), 'Final month (prorated)')
  // Unit 1A · Mariel Lopez — May..Sep rent + the current month (75,000)
  ;[4, 5, 6, 7, 8].forEach((m) => rent('mariel', 12500, md(m, 20), 'Monthly rent'))
  rent('mariel', 12500, thisMonth(20, 9), 'Monthly rent')

  // Unit 1B · Nico Perez — 3 months (54,000)
  rent('nico', 18000, new Date(year - 1, 7, 13, 12), 'August rent')
  rent('nico', 18000, new Date(year - 1, 8, 13, 12), 'September rent')
  rent('nico', 18000, new Date(year - 1, 9, 13, 12), 'October rent')
  // Unit 1B · Jerome Tan — prorated first month, then Dec..Sep (196,126.03).
  // Deliberately no payment in the current month (due on the 25th).
  rent('jerome', 16126.03, new Date(year - 1, 10, 13, 12), 'First month (prorated)')
  rent('jerome', 18000, new Date(year - 1, 11, 13, 12), 'December rent')
  for (let m = 0; m <= 8; m++) rent('jerome', 18000, md(m, 13), 'Monthly rent')

  // Unit 2A · Paolo Sarmiento — 7 months + prorated final (132,360)
  ;[2, 3, 4, 5, 6, 7, 8].forEach((m) => rent('paolo', 18000, md(m, 8), 'Monthly rent'))
  rent('paolo', 6360, thisMonth(8, 11), 'Final month (prorated)')

  // Unit 2B · Dianne Chua — 5 months + prorated final (137,483.76)
  ;[3, 4, 5, 6, 7].forEach((m) => rent('dianne', 25500, md(m, 15), 'Monthly rent'))
  rent('dianne', 9983.76, md(8, 8), 'Final month (prorated)')

  await prisma.leasePayment.createMany({ data: rentPayments })

  // ---- notifications (mix of read/unread) ----
  await prisma.notification.createMany({
    data: [
      { title: 'New payment received', body: 'Lance Aquino paid ₱350.00 — 30 days membership', kind: 'payment', read: true, createdAt: at(8, 13) },
      { title: 'Membership expiring soon', body: 'Miguel Reyes expires in 1 day — renewal reminder due', kind: 'warning', read: false, createdAt: at(9, 0) },
      { title: 'Daily sales closed', body: "Yesterday's sales were closed out and archived", kind: 'report', read: true, createdAt: at(10, 0) },
      { title: 'Renewal recorded', body: 'Kim Navarro renewed 30 days — ₱350.00', kind: 'renewal', read: false, createdAt: at(12, 30) },
    ],
  })

  // ---- verification summary ----
  const todayStart = new Date(year, monthIdx, now.getDate())
  const todayEnd = new Date(year, monthIdx, now.getDate() + 1)
  const todays = payments.filter((p) => p.status === 'PAID' && p.paidAt >= todayStart && p.paidAt < todayEnd)
  const todaySum = todays.reduce((s, p) => s + p.amount, 0)
  const monthLog = monthTargets.map((target, m) => {
    const sum = payments
      .filter((p) => p.status === 'PAID' && p.paidAt.getFullYear() === year && p.paidAt.getMonth() === m)
      .reduce((s, p) => s + p.amount, 0)
    return `m${m}=${sum}/${target}`
  }).join(' ')

  // ---- residences verification ----
  const unitRows = await prisma.apartmentUnit.findMany({
    orderBy: { order: 'asc' },
    include: { leases: { include: { payments: true } } },
  })
  const nowMs = Date.now()
  const unitTotals = unitRows.map((u) => {
    const total = u.leases.reduce(
      (s, l) => s + l.payments.reduce((x, p) => x + parseFloat(p.amount), 0),
      0
    )
    const active = u.leases.find((l) => l.status === 'ACTIVE' && new Date(l.endDate).getTime() >= nowMs)
    return {
      name: u.name,
      total: Math.round(total * 100) / 100,
      occupied: !!active,
      rent: active ? parseFloat(active.monthlyRent) : 0,
    }
  })
  const resTotal = Math.round(unitTotals.reduce((s, u) => s + u.total, 0) * 100) / 100
  const resOccupied = unitTotals.filter((u) => u.occupied).length
  const resRentRoll = unitTotals.reduce((s, u) => s + u.rent, 0)
  const monthStart = new Date(year, monthIdx, 1)
  const monthEnd = new Date(year, monthIdx + 1, 1)
  const allRent = await prisma.leasePayment.findMany()
  const resMonth = Math.round(
    allRent
      .filter((p) => p.paidAt >= monthStart && p.paidAt < monthEnd)
      .reduce((s, p) => s + parseFloat(p.amount), 0) * 100
  ) / 100

  console.log(`Seeded: 1 admin, ${planDefs.length} plans, ${memberDefs.length} members, ${payments.length} payments, 1 closed report, 4 notifications`)
  console.log(`Today's open sales: ${todays.length} transactions totaling ₱${todaySum.toFixed(2)} (expected 4 / 1950.00)`)
  console.log(`Monthly PAID totals: ${monthLog}`)
  console.log(`Residences: total earned ₱${resTotal.toFixed(2)} (expected 641643.25) · ${resOccupied}/${unitTotals.length} occupied · rent roll ₱${resRentRoll} (expected 30500) · earned this month ₱${resMonth.toFixed(2)} (expected 18860)`)
  unitTotals.forEach((u) => console.log(`  ${u.name}: ₱${u.total.toFixed(2)}${u.occupied ? ' (occupied)' : ' (vacant)'}`))
  if (todays.length !== 4 || todaySum !== 1950) {
    console.warn("WARNING: today's payment totals do not match the demo KPIs (4 / 1950.00)")
  }
  if (resTotal !== 641643.25 || resRentRoll !== 30500 || resMonth !== 18860) {
    console.warn('WARNING: residences totals do not match the demo KPIs (641643.25 / 30500 / 18860)')
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
