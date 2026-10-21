// The browser origins allowed to talk to this API.
//
// Local development talks to the Next.js dev server on :3000. The deployed
// frontend is allowed too, so a fresh deployment works the moment the service
// is running - no dashboard setup. CORS_ORIGIN overrides the list entirely
// when it is set.
//
// A pattern may contain a single "*" (https://hotel-and-gym-system-*.vercel.app)
// so that Vercel preview deployments - which get a random subdomain - keep
// working without an env edit per deploy. "*" on its own allows every origin.
//
// Both the REST layer (src/index.js) and the Socket.IO layer (src/realtime.js)
// read it, so the two can never disagree about who is allowed in.

const DEFAULT_ORIGINS = [
  'http://localhost:3000',
  'https://hotel-and-gym-system.vercel.app',
  'https://hotel-and-gym-system-*.vercel.app',
]

/** The allowed origins, as an array (or the string "*"). */
function allowedOrigins() {
  const configured = process.env.CORS_ORIGIN
  const list = (configured || DEFAULT_ORIGINS.join(','))
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  if (list.includes('*')) return '*'
  return list
}

/** True when every origin is allowed (CORS_ORIGIN="*"). */
function isWildcard() {
  return allowedOrigins() === '*'
}

/** Escape the regex-special characters of a literal chunk. */
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Does `origin` match one of the configured entries? */
function originAllowed(origin) {
  const matchers = corsMatchers()
  if (matchers === '*') return true
  if (!origin) return false

  return matchers.some((entry) => {
    if (entry instanceof RegExp) return entry.test(origin)
    return entry === origin
  })
}

/**
 * The configured entries as matchers the `cors` package understands.
 *
 * The package (2.8.x) accepts an array of exact origins and RegExps - it
 * does NOT accept a function, so the wildcard entries are compiled to
 * RegExps here.
 */
function corsMatchers() {
  const list = allowedOrigins()
  if (list === '*') return '*'

  return list.map((entry) => {
    if (!entry.includes('*')) return entry
    const pattern = entry
      .split('*')
      .map((chunk) => escapeRegex(chunk))
      .join('.*')
    return new RegExp(`^${pattern}$`)
  })
}

/**
 * The options for the `cors` package.
 *
 * A request without an Origin header (a curl, a health check) simply gets no
 * CORS headers - it is not a browser request, so nothing is blocked.
 */
function corsOptions() {
  const matchers = corsMatchers()
  const wildcard = matchers === '*'
  return {
    origin: wildcard ? '*' : matchers,
    // A wildcard origin cannot be combined with credentials - browsers reject
    // the combination. This app authenticates with a Bearer token rather than
    // cookies, so dropping credentials costs nothing.
    credentials: !wildcard,
  }
}

module.exports = {
  allowedOrigins,
  isWildcard,
  originAllowed,
  corsMatchers,
  corsOptions,
  DEFAULT_ORIGINS,
}
