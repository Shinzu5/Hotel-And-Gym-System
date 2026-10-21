// Respond-first, broadcast-second helper.
//
// A Neon round-trip costs ~400-700ms, and a client that submits a form only
// needs to know that the write succeeded — the refreshed numbers arrive over
// the socket a moment later. Awaiting the rebuild *before* answering made
// every mutation feel frozen (the "Save lease" button sat on "Saving…" for
// 2-3 seconds).
//
// `build` must return the promise for the payload to broadcast. It is kicked
// off immediately, so by the time the client reacts to the response and
// refetches, the rebuild is already in flight and the client's own request
// coalesces onto it instead of issuing a second query.

const { emitStats, emitResidences, emitNotification } = require('../realtime')

// Background builds are chained so that a burst of mutations never piles up
// several rebuilds at once — each one holds a database connection for the
// best part of a second, and starving the pool would slow down the *writes*
// that the next user is waiting on.
let chain = Promise.resolve()

function respondThenBroadcast(res, payload, build, { event = 'stats', notification, invalidate } = {}) {
  // A write just landed — drop any coalesced read, because it was computed
  // from the database before this write and would show stale numbers.
  if (invalidate) invalidate()

  res.json(payload)

  chain = chain
    .then(() => build())
    .then((stats) => {
      if (event === 'residences') emitResidences(stats)
      else emitStats(stats)
      if (notification) emitNotification(notification)
    })
    .catch((err) => {
      console.error('[broadcast] failed:', err.message)
    })
}

module.exports = { respondThenBroadcast }
