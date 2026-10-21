"use client";

import { useCallback, useEffect, useState } from "react";
import { on } from "./socket";
import { pushToast } from "@/components/Toasts";

const KIND_TO_TOAST = {
  success: "success",
  error: "error",
  danger: "error",
  warning: "warning",
  warn: "warning",
  info: "info",
};

function normalize(raw) {
  const payload = raw && typeof raw === "object" ? raw : { title: String(raw || "") };
  return {
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: payload.title || "Notification",
    body: payload.body || "",
    kind: payload.kind || "info",
    at: Date.now(),
  };
}

/**
 * Socket.IO `notification` events -> an in-memory list (for the bell dropdown)
 * plus a toast via `components/Toasts.js`.
 *
 * Returns `{ items, unread, markAllRead, remove, clear }`.
 */
export function useNotifications(limit = 12) {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const unsubscribe = on("notification", (payload) => {
      const item = normalize(payload);
      setItems((list) => [item, ...list].slice(0, limit));
      setUnread((count) => count + 1);
      pushToast(item.body ? `${item.title} — ${item.body}` : item.title, KIND_TO_TOAST[item.kind] || "info");
    });
    return unsubscribe;
  }, [limit]);

  const markAllRead = useCallback(() => setUnread(0), []);
  const remove = useCallback(
    (id) => setItems((list) => list.filter((item) => item.id !== id)),
    []
  );
  const clear = useCallback(() => {
    setItems([]);
    setUnread(0);
  }, []);

  return { items, unread, markAllRead, remove, clear };
}
