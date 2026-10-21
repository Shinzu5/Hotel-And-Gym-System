// Socket.IO realtime layer.
//
// - `initRealtime(server)` attaches socket.io to the raw HTTP server with CORS
//   restricted to the frontend origin.
// - Clients MAY send a JWT in `socket.handshake.auth.token`; an invalid or
//   missing token never rejects the connection — it only means the socket is
//   not associated with a user (`socket.data.user` stays null).
// - `emitStats(payload)` / `emitNotification({...})` broadcast to every
//   connected socket (dashboard listens for `stats:update` and `notification`).
// - Heartbeat: socket.io's built-in engine ping/pong (pingInterval 25s,
//   pingTimeout 20s by default) keeps connections alive; an application-level
//   `ping` -> `pong` event is also exposed for easy client-side checks.

const { Server } = require('socket.io')
const jwt = require('jsonwebtoken')
const { corsOptions } = require('./lib/allowedOrigins')

let io = null

function initRealtime(server) {
  io = new Server(server, {
    // The same allowlist the REST layer uses (CORS_ORIGIN).
    cors: corsOptions(),
    // pingInterval/pingTimeout are socket.io's defaults (25s / 20s) — kept
    // explicitly so the heartbeat behaviour is documented.
    pingInterval: 25000,
    pingTimeout: 20000,
  })

  io.on('connection', (socket) => {
    // Optional auth: never reject, just identify (or not).
    const token = socket.handshake.auth && socket.handshake.auth.token
    if (token) {
      try {
        socket.data.user = jwt.verify(token, process.env.JWT_SECRET || 'secret')
      } catch (err) {
        socket.data.user = null // invalid token -> anonymous socket
      }
    } else {
      socket.data.user = null
    }

    // Lightweight application-level heartbeat for clients/tests.
    socket.on('ping', (cb) => {
      const now = Date.now()
      if (typeof cb === 'function') cb({ pong: true, ts: now })
      else socket.emit('pong', { ts: now })
    })

    socket.on('disconnect', () => {
      // Nothing to clean up; sockets are anonymous by default.
    })
  })

  return io
}

function getIo() {
  return io
}

// Broadcast fresh dashboard numbers to every connected client.
function emitStats(payload) {
  if (!io) return
  io.emit('stats:update', payload)
}

// Broadcast fresh Apartments numbers (overview + apartments KPIs).
function emitResidences(payload) {
  if (!io) return
  io.emit('residences:update', payload)
}

// Broadcast a toast/notification to every connected client.
function emitNotification({ title, body, kind } = {}) {
  if (!io) return
  io.emit('notification', {
    title,
    body: body || null,
    kind: kind || 'info',
    read: false,
    createdAt: new Date().toISOString(),
  })
}

module.exports = { initRealtime, getIo, emitStats, emitResidences, emitNotification }
