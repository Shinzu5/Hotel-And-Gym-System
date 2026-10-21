/**
 * Singleton Socket.IO client.
 *
 * - Connects on demand (first `on()` call) using the stored auth token.
 * - Auto-reconnects with backoff (socket.io defaults + capped delay).
 * - Rebuilds the connection when the stored token changes.
 * - Exposes a tiny `on(event, cb)` / `off(event, cb)` API that fans server
 *   events out to every subscriber.
 *
 * Server origin: the API url without the `/api` suffix
 * (NEXT_PUBLIC_API_URL, e.g. http://localhost:5000/api -> http://localhost:5000).
 */
import { io } from "socket.io-client";
import { API_URL, getToken } from "./api";

const BASE_URL = API_URL.replace(/\/api\/?$/, "");

/** Server events we forward to local subscribers. */
const SERVER_EVENTS = [
  "connect",
  "disconnect",
  "connect_error",
  "reconnect",
  "reconnect_attempt",
  "reconnect_error",
  "reconnect_failed",
  "stats:update",
  "residences:update",
  "notification",
];

let socket = null;
let socketToken = null;
const listeners = new Map(); // event -> Set<callback>

function setFor(event) {
  let set = listeners.get(event);
  if (!set) {
    set = new Set();
    listeners.set(event, set);
  }
  return set;
}

function dispatch(event, ...args) {
  const set = listeners.get(event);
  if (!set) return;
  set.forEach((cb) => {
    try {
      cb(...args);
    } catch (err) {
      // Never let one subscriber break the socket pipeline.
      console.error(`[socket] listener for "${event}" failed`, err);
    }
  });
}

/** True while the socket has an active connection. */
export function isConnected() {
  return !!(socket && socket.connected);
}

/** Create (or reuse) the singleton connection. Safe to call repeatedly. */
export function connectSocket() {
  if (typeof window === "undefined") return null;

  const token = getToken();
  if (!token) return null; // not signed in -> nothing to connect to

  if (socket) {
    if (token === socketToken) {
      if (!socket.connected) socket.connect();
      return socket;
    }
    // Token changed (re-login) -> rebuild with fresh auth.
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
    socketToken = null;
  }

  socketToken = token;
  socket = io(BASE_URL, {
    auth: { token },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 800,
    reconnectionDelayMax: 10000,
    randomizationFactor: 0.4,
    timeout: 12000,
  });

  SERVER_EVENTS.forEach((event) => {
    socket.on(event, (...args) => dispatch(event, ...args));
  });

  return socket;
}

/** Subscribe to a server event. Returns an unsubscribe function. */
export function on(event, cb) {
  if (typeof cb !== "function") return () => {};
  setFor(event).add(cb);
  connectSocket(); // connect on demand
  return () => off(event, cb);
}

/** Remove a subscription. */
export function off(event, cb) {
  const set = listeners.get(event);
  if (!set) return;
  set.delete(cb);
  if (!set.size) listeners.delete(event);
}

/** Tear the connection down (used on logout). */
export function disconnectSocket() {
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
  socketToken = null;
}
