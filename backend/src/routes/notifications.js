const express = require('express')
const prisma = require('../lib/prisma')
const { requireAuth } = require('../middleware/auth')

const router = express.Router()

router.use(requireAuth)

// Seeded history; realtime notifications arrive over Socket.IO (src/realtime.js).
router.get('/', async (req, res) => {
  const notifications = await prisma.notification.findMany({
    orderBy: { createdAt: 'desc' },
    take: 30,
  })
  res.json({ notifications })
})

module.exports = router
