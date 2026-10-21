const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const prisma = require('../lib/prisma')
const { requireAuth } = require('../middleware/auth')

const router = express.Router()

router.post('/login', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' })
  }

  // Accept the short demo handle ("brenie") as well as the full address.
  let identifier = String(email).trim().toLowerCase()
  if (identifier && !identifier.includes('@')) {
    identifier = `${identifier}@abbsey.ph`
  }

  const user = await prisma.user.findUnique({ where: { email: identifier } })
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' })
  }
  
  const isValid = await bcrypt.compare(password, user.passwordHash)
  if (!isValid) {
    return res.status(401).json({ error: 'Invalid email or password' })
  }
  
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    process.env.JWT_SECRET || 'secret',
    { expiresIn: '7d' }
  )
  
  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  })
})

router.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  })
  res.json(user)
})

module.exports = router
