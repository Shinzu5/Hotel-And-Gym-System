// Where the API lives.
//
// Three layers, in order of priority:
//   1. NEXT_PUBLIC_API_URL - set on the host (Vercel/Render). Compiled into
//      the bundle, so it needs a rebuild when it changes.
//   2. /api-config.json - a static file served by the app. It lets the
//      deployed app find the API WITHOUT any build-time setup, which is what
//      keeps a phone from talking to its own "localhost".
//   3. The built-in default below - the last resort, so the app still points
//      somewhere sensible if the config file is missing.
const CONFIGURED_API_URL = process.env.NEXT_PUBLIC_API_URL || "";
const FALLBACK_API_URL = "https://abbey-backend.onrender.com/api";

const TOKEN_KEY = "token";

/** The API URL resolved from /api-config.json, once it has been read. */
let runtimeApiUrl = "";
/** The in-flight config read, so it only ever happens once per page. */
let apiUrlPromise = null;

/**
 * The API URL to call right now.
 *
 * Synchronous on purpose: the socket connects from an effect and cannot
 * await. By then the config file has been read (the app calls the API on
 * mount), so this returns the real URL.
 */
export function getApiUrl() {
  if (CONFIGURED_API_URL) return CONFIGURED_API_URL;
  if (runtimeApiUrl) return runtimeApiUrl;
  return FALLBACK_API_URL;
}

/**
 * Read /api-config.json once and remember the URL.
 *
 * Resolves to the API URL. Never rejects - a missing or broken config file
 * simply leaves the built-in default in place.
 */
export function loadApiUrl() {
  if (CONFIGURED_API_URL) return Promise.resolve(CONFIGURED_API_URL);
  if (apiUrlPromise) return apiUrlPromise;

  if (typeof window === "undefined") return Promise.resolve(FALLBACK_API_URL);

  apiUrlPromise = (async () => {
    try {
      const res = await fetch("/api-config.json", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        const url = typeof data?.apiUrl === "string" ? data.apiUrl.trim() : "";
        if (url) {
          runtimeApiUrl = url;
          return url;
        }
      }
    } catch {
      /* no config file - the default is fine */
    }
    return FALLBACK_API_URL;
  })();

  return apiUrlPromise;
}

// Start reading the config as soon as the app loads, so the socket (which
// cannot await) already knows the real URL by the time it connects.
if (typeof window !== "undefined") {
  void loadApiUrl();
}

export function getToken() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore storage errors */
  }
}

export function clearToken() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore storage errors */
  }
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// A free-tier host sleeps after a few idle minutes, so the first request can
// take a while. A minute of patience, then say so instead of hanging.
const REQUEST_TIMEOUT_MS = 60000;

async function request(path, { method = "GET", body } = {}) {
  const token = getToken();
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const baseUrl = await loadApiUrl();
  const url = `${baseUrl}${path}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (err) {
    const timedOut = err && err.name === "AbortError";
    throw new ApiError(
      timedOut
        ? `The server at ${baseUrl} took too long to answer. It may be waking up — try again in a moment.`
        : `Could not reach ${baseUrl}. The server may be down or suspended, the API URL may be wrong, or CORS blocked the request.`,
      0
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }

  // Session expired / invalid token -> clear and send back to login.
  if (res.status === 401 && !path.startsWith("/auth/login")) {
    clearToken();
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
    throw new ApiError(
      (data && (data.error || data.message)) || "Session expired. Please sign in again.",
      401
    );
  }

  if (!res.ok) {
    // 503/502/504 mean the host itself is not serving - a suspended or
    // still-building service. Say that, instead of a bare status code.
    const hostDown = res.status === 502 || res.status === 503 || res.status === 504;
    throw new ApiError(
      hostDown
        ? `The server at ${baseUrl} is unavailable (${res.status}). It may be suspended or still deploying — check the host's dashboard.`
        : (data && (data.error || data.message)) || `Request failed (${res.status})`,
      res.status
    );
  }

  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: "POST", body }),
  put: (path, body) => request(path, { method: "PUT", body }),
  del: (path) => request(path, { method: "DELETE" }),
};

export async function login(email, password) {
  const data = await request("/auth/login", { method: "POST", body: { email, password } });
  if (data && data.token) setToken(data.token);
  return data;
}

export function logout() {
  clearToken();
  if (typeof window !== "undefined") window.location.href = "/login";
}
