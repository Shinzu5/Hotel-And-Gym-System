const express = require('express')
const http = require('http')
const cors = require('cors')
const dotenv = require('dotenv')

dotenv.config()

const { initRealtime } = require('./realtime')

const app = express()

app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true,
}))

app.use(express.json())

// Routes
app.use('/api/auth', require('./routes/auth'))
app.use('/api/dashboard', require('./routes/dashboard'))
app.use('/api/payments', require('./routes/payments'))
app.use('/api/members', require('./routes/members'))
app.use('/api/plans', require('./routes/plans'))
app.use('/api/reports', require('./routes/reports'))
app.use('/api/notifications', require('./routes/notifications'))
app.use('/api/residences', require('./routes/residences'))

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// Generic error handler
app.use((err, req, res, next) => {
  console.error(err)
  const status = err.status || err.statusCode || 500
  res.status(status).json({ error: err.message || 'Internal server error' })
})

const PORT = process.env.PORT || 5000

// Raw HTTP server so Socket.IO can share the port with Express.
const server = http.createServer(app)
initRealtime(server)

// Node's default keep-alive timeout is 5s. The browser pools connections, so
// closing one that idle can hand the next request a dead socket (ECONNRESET) —
// and a POST would not be retried for the client. Keep them open longer.
server.keepAliveTimeout = 65 * 1000
server.headersTimeout = 70 * 1000

// Hold a warm database connection so the first request after an idle period
// doesn't pay for a cold TLS handshake (see src/lib/prisma.js).
require('./lib/prisma').startKeepAlive()

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
