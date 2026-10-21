"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { connectSocket, isConnected, on } from "./socket";

const FALLBACK_POLL_MS = 30_000;

/**
 * Live dashboard stats.
 *
 * 1. Fetches `/dashboard/stats` on mount.
 * 2. Subscribes to the socket `stats:update` event and replaces the payload
 *    immediately (realtime).
 * 3. Falls back to a 30s refetch while the socket is disconnected.
 *
 * Returns `{ stats, loading, error, refresh }`.
 */
export function useStats() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const aliveRef = useRef(true);
  const pollRef = useRef(null);

  const fetchStats = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const data = await api.get("/dashboard/stats");
      if (!aliveRef.current) return null;
      setStats((current) => ({ ...(current || {}), ...(data || {}) }));
      setError("");
      return data;
    } catch (err) {
      if (!aliveRef.current) return null;
      setError(err?.message || "Failed to load dashboard stats.");
      return null;
    } finally {
      if (aliveRef.current && !silent) setLoading(false);
    }
  }, []);

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(() => {
      fetchStats({ silent: true });
    }, FALLBACK_POLL_MS);
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
    fetchStats();

    const unsubscribers = [
      // Realtime: server pushes the full stats object.
      on("stats:update", (payload) => {
        if (!aliveRef.current || !payload || typeof payload !== "object") return;
        setStats(payload);
        setError("");
      }),
      on("connect", () => stopPolling()),
      on("disconnect", () => startPolling()),
    ];

    // Socket already up? No polling. Otherwise poll until it connects.
    connectSocket();
    if (!isConnected()) startPolling();

    return () => {
      aliveRef.current = false;
      stopPolling();
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [fetchStats, startPolling, stopPolling]);

  return { stats, loading, error, refresh };
}
