const express = require('express')
const { requireAuth } = require('../middleware/auth')
const { buildStats } = require('../lib/stats')

const router = express.Router()

router.use(requireAuth)

// KPI payload lives in src/lib/stats.js so mutating routes can rebroadcast
// the exact same shape over Socket.IO.
router.get('/stats', async (req, res) => {
  res.json(await buildStats())
})

module.exports = router
