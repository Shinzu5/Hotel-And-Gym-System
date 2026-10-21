const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

/**
 * Keep one connection warm.
 *
 * The database is Neon behind a pooler, and the pooler drops idle server-side
 * connections. The next request then has to re-handshake, which shows up as a
 * random 3-4 second spike on an otherwise ~1 second endpoint. A cheap periodic
 * query keeps the connection (and its TLS session) alive so the first real
 * request after an idle period is not the one that pays for the handshake.
 */
const KEEP_ALIVE_MS = 3 * 60 * 1000

let keepAliveTimer = null

function startKeepAlive() {
  const ping = async () => {
    try {
      await prisma.$queryRaw`SELECT 1`
    } catch {
      // A failed keep-alive is harmless — the pool simply reconnects.
    }
  }

  ping()
  keepAliveTimer = setInterval(ping, KEEP_ALIVE_MS)
  if (keepAliveTimer.unref) keepAliveTimer.unref()
  return keepAliveTimer
}

function stopKeepAlive() {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer)
    keepAliveTimer = null
  }
}

module.exports = prisma
module.exports.startKeepAlive = startKeepAlive
module.exports.stopKeepAlive = stopKeepAlive
