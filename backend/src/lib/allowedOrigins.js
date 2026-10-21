// The browser origins allowed to talk to this API.
//
// Local development talks to the Next.js dev server on :3000, so that is the
// default. A deployment sets CORS_ORIGIN to a comma-separated list of the
// frontend's origins, e.g.
//
//   CORS_ORIGIN=https://my-app.vercel.app,https://my-app.onrender.com
//
// Both the REST layer (src/index.js) and the Socket.IO layer (src/realtime.js)
// read it, so the two can never disagree about who is allowed in.

const DEFAULT_ORIGIN = 'http://localhost:3000'

/**
 * The allowed origins, as an array.
 *
 * A single origin stays a one-item array, so the `cors` package treats both
 * the local and the deployed setup the same way.
 */
function allowedOrigins() {
  const configured = process.env.CORS_ORIGIN || DEFAULT_ORIGIN
  return configured
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}

module.exports = { allowedOrigins, DEFAULT_ORIGIN }
