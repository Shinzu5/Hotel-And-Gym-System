"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, CheckCircle2, Info, X, XCircle } from "lucide-react";

const TONES = {
  success: { icon: CheckCircle2, cls: "border-green-200 bg-green-50 text-green-800" },
  error: { icon: XCircle, cls: "border-red-200 bg-red-50 text-red-800" },
  warning: { icon: AlertCircle, cls: "border-amber-200 bg-amber-50 text-amber-800" },
  info: { icon: Info, cls: "border-blue-200 bg-blue-50 text-blue-800" },
};

/* ------------------------------ global store ------------------------------ */
/* Module-level so every page / hook raises toasts into ONE viewport. */

let toasts = [];
let seq = 0;
const listeners = new Set();

function notify() {
  listeners.forEach((listener) => listener());
}

/**
 * Raise a toast.
 *
 * `action` is optional — pass `{ label, href }` to add a link (e.g. "View in
 * Reports →" after closing the day's sales).
 */
export function pushToast(message, type = "success", action = null) {
  if (!message) return null;
  const id = `toast-${++seq}`;
  toasts = [...toasts, { id, message: String(message), type, action: action || null }];
  notify();
  setTimeout(() => dismissToast(id), action ? 7000 : 4500);
  return id;
}

export function dismissToast(id) {
  const next = toasts.filter((t) => t.id !== id);
  if (next.length === toasts.length) return;
  toasts = next;
  notify();
}

/** `const { push } = useToasts();` — push("Saved.", "success") */
export function useToasts() {
  const push = useCallback(
    (message, type = "success", action = null) => pushToast(message, type, action),
    []
  );
  return { push };
}

/* -------------------------------- viewport -------------------------------- */

/** Mounted once (root layout) — renders every toast from the global store. */
export function ToastViewport() {
  const [list, setList] = useState(toasts);

  useEffect(() => {
    const listener = () => setList(toasts);
    listeners.add(listener);
    listener();
    return () => listeners.delete(listener);
  }, []);

  if (!list.length) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-[min(22rem,calc(100vw-2.5rem))] flex-col gap-2"
      aria-live="polite"
    >
      {list.map((toast) => {
        const tone = TONES[toast.type] || TONES.info;
        const Icon = tone.icon;
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex animate-toast-in items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg ${tone.cls}`}
            role="status"
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="flex-1 font-medium">
              {toast.message}
              {toast.action?.href ? (
                <Link
                  href={toast.action.href}
                  onClick={() => dismissToast(toast.id)}
                  className="mt-1 inline-flex items-center gap-1 text-xs font-bold underline underline-offset-2"
                >
                  {toast.action.label}
                  <ArrowRight className="h-3 w-3" />
                </Link>
              ) : null}
            </p>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              aria-label="Dismiss"
              className="-m-0.5 rounded p-0.5 opacity-60 transition hover:opacity-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
