const express = require('express')
const prisma = require('../lib/prisma')
const { requireAuth } = require('../middleware/auth')
const { buildStats, buildUnits, invalidateResidences } = require('../lib/residences')
const { respondThenBroadcast } = require('../lib/broadcast')
const { monthsBetween } = require('../lib/dates')

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

const toNumber = (value) => {
  if (value === undefined || value === null || value === '') return NaN
  return Number(value)
}

// Answer the client straight away, then push the refreshed residences
// numbers + a toast over the socket. See lib/broadcast.js for why.
function push(res, payload, notification) {
  respondThenBroadcast(res, payload, () => buildStats({ fresh: true }), {
    event: 'residences',
    notification,
    invalidate: invalidateResidences,
  })
}

// The rent for a lease is recorded automatically when the lease is saved —
// the whole term, exactly the "Total lease value" the modal shows. A lease's
// payments are always automatic, so regenerating them on an edit is safe.
const AUTO_RENT_NOTE = 'Automatic rent for the lease term'

/** Replace a lease's automatic rent payment with one for its current term. */
async function syncAutomaticRent(lease) {
  await prisma.leasePayment.deleteMany({ where: { leaseId: lease.id } })

  const months = monthsBetween(lease.startDate, lease.endDate)
  const amount = Math.round(parseFloat(lease.monthlyRent) * months * 100) / 100
  if (!(amount > 0)) return null

  return prisma.leasePayment.create({
    data: {
      leaseId: lease.id,
      amount,
      method: 'Automatic',
      notes: AUTO_RENT_NOTE,
      paidAt: lease.startDate,
    },
  })
}

/* ---------------------------------- Read ---------------------------------- */

// GET /api/residences/stats — overview KPIs, income series, expiring leases.
router.get('/stats', async (req, res) => {
  res.json(await buildStats())
})

// GET /api/residences/units — summary + every room card for the Apartments tab.
router.get('/units', async (req, res) => {
  res.json(await buildUnits())
})

/* --------------------------------- Leases --------------------------------- */

// POST /api/residences/leases — { unitId, renterName, contact?, startDate,
// endDate, monthlyRent } — books a vacant unit.
router.post('/leases', async (req, res) => {
  const { unitId, renterName, contact, startDate, endDate, monthlyRent } = req.body || {}

  if (!renterName || typeof renterName !== 'string' || !renterName.trim()) {
    return res.status(400).json({ error: 'renterName is required' })
  }

  const unit = await prisma.apartmentUnit.findUnique({ where: { id: unitId }, include: { leases: true } })
  if (!unit) return res.status(400).json({ error: 'A valid unitId is required' })

  const now = new Date()
  const clash = unit.leases.find((l) => l.status === 'ACTIVE' && new Date(l.endDate) >= now)
  if (clash) {
    return res.status(400).json({ error: `${unit.name} already has an active lease — end it first.` })
  }

  const start = parseDateOnly(startDate)
  const end = parseDateOnly(endDate)
  if (!start) return res.status(400).json({ error: 'startDate is required (YYYY-MM-DD)' })
  if (!end) return res.status(400).json({ error: 'expirationDate is required (YYYY-MM-DD)' })
  if (end.getTime() <= start.getTime()) {
    return res.status(400).json({ error: 'The expiration date must be after the start date' })
  }

  const rent = toNumber(monthlyRent)
  if (Number.isNaN(rent) || rent <= 0) {
    return res.status(400).json({ error: 'monthlyRent is required and must be greater than zero' })
  }

  const lease = await prisma.lease.create({
    data: {
      unitId: unit.id,
      renterName: renterName.trim(),
      contact: contact && String(contact).trim() ? String(contact).trim() : null,
      startDate: start,
      endDate: end,
      monthlyRent: rent,
      status: 'ACTIVE',
    },
  })

  // The rent is applied automatically, for the whole term.
  const payment = await syncAutomaticRent(lease)
  const leaseValue = payment ? parseFloat(payment.amount) : 0

  push(res, { lease, payment }, {
    title: 'Lease saved',
    body: `${lease.renterName} booked ${unit.name} until ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} — ₱${leaseValue.toFixed(0)} rent applied automatically`,
    kind: 'lease',
  })
})

// PUT /api/residences/leases/:id — edit renter/contact/dates/rent in place.
router.put('/leases/:id', async (req, res) => {
  const { id } = req.params
  const { renterName, contact, startDate, endDate, monthlyRent } = req.body || {}

  const lease = await prisma.lease.findUnique({ where: { id }, include: { unit: true } })
  if (!lease) return res.status(404).json({ error: 'Lease not found' })

  const data = {}

  if (renterName !== undefined) {
    if (!renterName || !String(renterName).trim()) {
      return res.status(400).json({ error: 'renterName cannot be empty' })
    }
    data.renterName = String(renterName).trim()
  }

  if (contact !== undefined) {
    data.contact = contact && String(contact).trim() ? String(contact).trim() : null
  }

  if (monthlyRent !== undefined) {
    const rent = toNumber(monthlyRent)
    if (Number.isNaN(rent) || rent <= 0) {
      return res.status(400).json({ error: 'monthlyRent must be greater than zero' })
    }
    data.monthlyRent = rent
  }

  const start = startDate !== undefined ? parseDateOnly(startDate) : null
  const end = endDate !== undefined ? parseDateOnly(endDate) : null
  if (startDate !== undefined && !start) return res.status(400).json({ error: 'startDate must be YYYY-MM-DD' })
  if (endDate !== undefined && !end) return res.status(400).json({ error: 'expirationDate must be YYYY-MM-DD' })

  const finalStart = start || lease.startDate
  const finalEnd = end || lease.endDate
  if (new Date(finalEnd).getTime() <= new Date(finalStart).getTime()) {
    return res.status(400).json({ error: 'The expiration date must be after the start date' })
  }
  if (start) data.startDate = start
  if (end) data.endDate = end

  await prisma.lease.update({ where: { id }, data })

  // The rent follows the lease: regenerate the automatic payment so the money
  // keeps tracking the days, exactly like the expiration does.
  const updated = await prisma.lease.findUnique({ where: { id } })
  const payment = await syncAutomaticRent(updated)
  const leaseValue = payment ? parseFloat(payment.amount) : 0

  push(res, { success: true, payment }, {
    title: 'Lease updated',
    body: `${data.renterName || lease.renterName} · ${lease.unit.name} — ₱${leaseValue.toFixed(0)} rent applied automatically`,
    kind: 'lease',
  })
})

// DELETE /api/residences/leases/:id — removes a lease and its rent history
// (cascade). Refused while the lease is still ACTIVE; end it first so the
// move-out is recorded rather than silently erased.
router.delete('/leases/:id', async (req, res) => {
  const { id } = req.params

  const lease = await prisma.lease.findUnique({ where: { id }, include: { unit: true } })
  if (!lease) return res.status(404).json({ error: 'Lease not found' })
  if (lease.status === 'ACTIVE') {
    return res.status(400).json({ error: 'End this lease before deleting it.' })
  }

  await prisma.lease.delete({ where: { id } })

  push(res, { success: true }, {
    title: 'Lease deleted',
    body: `The lease record for ${lease.renterName} · ${lease.unit.name} was removed`,
    kind: 'lease',
  })
})

// POST /api/residences/leases/:id/end — free the unit up (destructive, confirm
// on the client). Optional { endDate } backdates the move-out.
router.post('/leases/:id/end', async (req, res) => {
  const { id } = req.params
  const { endDate, reason } = req.body || {}

  const lease = await prisma.lease.findUnique({ where: { id }, include: { unit: true } })
  if (!lease) return res.status(404).json({ error: 'Lease not found' })
  if (lease.status !== 'ACTIVE') return res.status(400).json({ error: 'This lease has already ended' })

  const when = endDate ? parseDateOnly(endDate) : new Date()
  if (endDate && !when) return res.status(400).json({ error: 'endDate must be YYYY-MM-DD' })
  if (when.getTime() < new Date(lease.startDate).getTime()) {
    return res.status(400).json({
      error: `This lease hasn't started yet — it begins ${new Date(lease.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}. Pass an endDate on or after that date to end it.`,
    })
  }

  await prisma.lease.update({
    where: { id },
    data: {
      status: 'ENDED',
      endedAt: when,
      endedReason: reason && String(reason).trim() ? String(reason).trim() : null,
    },
  })

  push(res, { success: true, endedAt: when }, {
    title: 'Lease ended',
    body: `${lease.renterName} moved out of ${lease.unit.name} — the unit is now vacant`,
    kind: 'lease',
  })
})

// Rent is never recorded by hand: it is applied automatically when a lease is
// saved (and regenerated when the lease is edited). See syncAutomaticRent.

module.exports = router
