const express = require('express')
const prisma = require('../lib/prisma')
const { requireAuth } = require('../middleware/auth')

const router = express.Router()

router.use(requireAuth)

const serialize = (plan) => ({ ...plan, price: parseFloat(plan.price) })

router.get('/', async (req, res) => {
  const plans = await prisma.membershipPlan.findMany({
    orderBy: { createdAt: 'asc' },
  })
  res.json(plans.map(serialize))
})

router.post('/', async (req, res) => {
  const { name, price, durationDays, active } = req.body
  const plan = await prisma.membershipPlan.create({
    data: {
      name,
      price: parseFloat(price),
      durationDays: parseInt(durationDays),
      active: active !== false,
    },
  })
  res.json(serialize(plan))
})

router.put('/:id', async (req, res) => {
  const { id } = req.params
  const { name, price, durationDays, active } = req.body
  const plan = await prisma.membershipPlan.update({
    where: { id },
    data: {
      name,
      price: price ? parseFloat(price) : undefined,
      durationDays: durationDays !== undefined ? parseInt(durationDays) : undefined,
      active: active !== undefined ? active : undefined,
    },
  })
  res.json(serialize(plan))
})

router.delete('/:id', async (req, res) => {
  const { id } = req.params
  await prisma.membershipPlan.delete({ where: { id } })
  res.json({ success: true })
})

module.exports = router
