"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { connectSocket, isConnected, on } from "./socket";

const FALLBACK_POLL_MS = 30_000;

/**
 * Live Apartments stats — same contract as `useStats`:
 *
 * 1. Fetches `/residences/stats` on mount (skipped while `enabled` is false so
 *    gym-only screens never make the request).
 * 2. Replaces the payload immediately on the socket `residences:update` push.
 * 3. Falls back to 30s polling while the socket is down.
 *
 * Returns `{ stats, loading, error, refresh }`.
 */
export function useResidences({ enabled = true } = {}) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const aliveRef = useRef(true);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const pollRef = useRef(null);

  const fetchStats = useCallback(async ({ silent = false } = {}) => {
    if (!enabledRef.current) return null;
    if (!silent) setLoading(true);
    try {
      const data = await api.get("/residences/stats");
      if (!aliveRef.current) return null;
      setStats(data || null);
      setError("");
      return data;
    } catch (err) {
      if (!aliveRef.current) return null;
      setError(err?.message || "Failed to load residences stats.");
      return null;
    } finally {
      if (aliveRef.current && !silent) setLoading(false);
    }
  }, []);

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(() => fetchStats({ silent: true }), FALLBACK_POLL_MS);
  }, [fetchStats]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const refresh = useCallback(() => fetchStats({ silent: true }), [fetchStats]);

  useEffect(() => {
    aliveRef.current = true;
    setStats(null);

    if (!enabled) {
      stopPolling();
      return () => {
        aliveRef.current = false;
      };
    }

    fetchStats();

    const unsubscribers = [
      on("residences:update", (payload) => {
        if (!aliveRef.current || !enabledRef.current) return;
        if (payload && typeof payload === "object") {
          setStats(payload);
          setError("");
        }
      }),
      on("connect", () => stopPolling()),
      on("disconnect", () => startPolling()),
    ];

    connectSocket();
    if (!isConnected()) startPolling();

    return () => {
      aliveRef.current = false;
      stopPolling();
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [enabled, fetchStats, startPolling, stopPolling]);

  return { stats, loading, error, refresh };
}
