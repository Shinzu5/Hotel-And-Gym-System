"use client";

import { useEffect, useRef } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { initials, titleCase } from "@/lib/format";

/* ---------------------------------- Card --------------------------------- */

export function Card({ className = "", children, ...props }) {
  return (
    <div className={`card ${className}`} {...props}>
      {children}
    </div>
  );
}

/** Sticky-friendly card head: title + subtitle on the left, actions on the right. */
export function CardHeader({ title, subtitle, actions, icon: Icon, className = "" }) {
  return (
    <div className={`card-header ${className}`}>
      <div className="flex items-center gap-3">
        {Icon ? (
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-50 text-green-600">
            <Icon className="h-[18px] w-[18px]" />
          </span>
        ) : null}
        <div>
          <h2 className="card-title">{title}</h2>
          {subtitle ? <p className="card-subtitle">{subtitle}</p> : null}
        </div>
      </div>
      {actions}
    </div>
  );
}

/* --------------------------------- Button -------------------------------- */

const VARIANTS = {
  primary: "bg-green-600 text-on-accent hover:brightness-95 shadow-sm",
  secondary: "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 shadow-sm",
  danger: "bg-red-600 text-on-accent hover:brightness-95 shadow-sm",
  ghost: "text-gray-500 hover:bg-gray-100 hover:text-gray-800",
};

const SIZES = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2.5 text-sm",
  lg: "px-5 py-3 text-sm",
};

export function Button({ variant = "primary", size = "md", className = "", children, ...props }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

/* ---------------------------------- Avatar -------------------------------- */

const AVATAR_TONES = {
  green: "bg-green-100 text-green-700",
  amber: "bg-amber-100 text-amber-700",
  blue: "bg-blue-100 text-blue-700",
  red: "bg-red-100 text-red-700",
  violet: "bg-violet-100 text-violet-700",
  gray: "bg-gray-100 text-gray-600",
};

export function Avatar({ name = "", tone = "green", size = "md" }) {
  const sizes = {
    sm: "h-8 w-8 text-[11px]",
    md: "h-9 w-9 text-xs",
    lg: "h-11 w-11 text-sm",
  };
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold ${AVATAR_TONES[tone] || AVATAR_TONES.green} ${sizes[size]}`}
    >
      {initials(name)}
    </span>
  );
}

/* -------------------------------- StatusPill ------------------------------- */

const PILL_TONES = {
  paid: "bg-green-100 text-green-700",
  active: "bg-green-100 text-green-700",
  occupied: "bg-green-100 text-green-700",
  completed: "bg-green-100 text-green-700",
  vacant: "bg-gray-100 text-gray-600",
  expiring: "bg-amber-100 text-amber-700",
  "expiring soon": "bg-amber-100 text-amber-700",
  pending: "bg-amber-100 text-amber-700",
  processing: "bg-amber-100 text-amber-700",
  open: "bg-amber-100 text-amber-700",
  failed: "bg-red-100 text-red-700",
  expired: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-600",
  inactive: "bg-gray-100 text-gray-500",
};

/** Active=green · Expiring=amber · Expired=red · Paid=green · Pending=amber */
export function StatusPill({ status, className = "" }) {
  const key = titleCase(status);
  const tone =
    PILL_TONES[String(status || "").trim().toLowerCase()] || "bg-gray-100 text-gray-600";
  return (
    <span className={`pill ${tone} ${className}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {key}
    </span>
  );
}

/** Plain pill (no status semantics) — used for day counts / chips. */
export function Chip({ tone = "gray", className = "", children }) {
  const tones = {
    gray: "bg-gray-100 text-gray-600",
    green: "bg-green-100 text-green-700",
    amber: "bg-amber-100 text-amber-700",
    red: "bg-red-100 text-red-700",
  };
  return <span className={`pill ${tones[tone] || tones.gray} ${className}`}>{children}</span>;
}

/* --------------------------------- Fields --------------------------------- */

export function Field({ label, htmlFor, hint, children, className = "" }) {
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        {label ? (
          <label htmlFor={htmlFor} className="label-text">
            {label}
          </label>
        ) : null}
        {hint}
      </div>
      {children}
    </div>
  );
}

/** The one text input. `prefix` renders an inline affix (e.g. ₱). */
export function TextInput({ prefix, className = "", ...props }) {
  if (prefix) {
    return (
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-400">
          {prefix}
        </span>
        <input className={`input-base pl-8 ${className}`} {...props} />
      </div>
    );
  }
  return <input className={`input-base ${className}`} {...props} />;
}

/** The one select — same box as the inputs, with a chevron affordance. */
export function SelectInput({ className = "", children, ...props }) {
  return (
    <div className="relative">
      <select className={`input-base ${className}`} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
    </div>
  );
}

export function TextArea({ className = "", ...props }) {
  return <textarea className={`input-base ${className}`} {...props} />;
}

export function SearchInput({ value, onChange, placeholder = "Search…", className = "" }) {
  return (
    <div className={`relative ${className}`}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input-base pl-9"
      />
    </div>
  );
}

/* ---------------------------------- Switch -------------------------------- */

export function Switch({ checked, onChange, disabled = false, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
        checked ? "bg-green-600" : "bg-gray-300"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

/* -------------------------------- Skeletons ------------------------------- */

export function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded-md bg-gray-200 ${className}`} />;
}

export function TableSkeleton({ rows = 5, cols = 5 }) {
  return (
    <div className="space-y-3 p-5">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4">
          {Array.from({ length: cols }).map((__, c) => (
            <Skeleton key={c} className={c === 0 ? "h-9 w-40" : "h-4 flex-1"} />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------- Empty / Error ----------------------------- */

export function EmptyState({ icon: Icon, title, message, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      {Icon ? (
        <span className="mb-1 inline-flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400">
          <Icon className="h-6 w-6" />
        </span>
      ) : null}
      <p className="text-sm font-semibold text-gray-900">{title}</p>
      {message ? <p className="max-w-sm text-sm text-gray-500">{message}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <EmptyState
      icon={AlertTriangleIcon}
      title="Something went wrong"
      message={message || "We could not load this data."}
      action={
        onRetry ? (
          <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
            Try again
          </Button>
        ) : null
      }
    />
  );
}

function AlertTriangleIcon({ className = "" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

/* ---------------------------------- Modal --------------------------------- */

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The one modal: backdrop, ESC to close, focus trap + focus restore,
 * consistent header/body/footer padding.
 *
 * `accent="danger"` tints the header for destructive flows.
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = "max-w-lg",
  accent = "default",
}) {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const previouslyFocused = document.activeElement;
    const dialog = dialogRef.current;

    const focusFirst = () => {
      if (!dialog) return;
      const first = dialog.querySelector(FOCUSABLE);
      if (first) first.focus();
      else dialog.focus();
    };
    const frame = requestAnimationFrame(focusFirst);

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialog) return;
      // Focus trap.
      const nodes = Array.from(dialog.querySelectorAll(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null
      );
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      if (previouslyFocused && typeof previouslyFocused.focus === "function") {
        previouslyFocused.focus();
      }
    };
  }, [open, onClose]);

  if (!open) return null;

  const headerTone =
    accent === "danger"
      ? "border-red-100 bg-red-50/70"
      : accent === "green"
        ? "border-green-100 bg-green-50/70"
        : "border-gray-100";

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : "Dialog"}
        tabIndex={-1}
        className={`relative flex max-h-[92vh] w-full ${width} animate-pop-in flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl outline-none sm:rounded-2xl`}
      >
        <div className={`flex items-start justify-between gap-4 border-b px-6 py-4 ${headerTone}`}>
          <div>
            <h2
              className={`display-heading text-base ${accent === "danger" ? "text-red-700" : "text-gray-900"}`}
            >
              {title}
            </h2>
            {subtitle ? <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-m-1 rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer ? (
          <div className="flex items-center justify-end gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* --------------------------------- Toasts --------------------------------- */

export { pushToast, ToastViewport, useToasts } from "./Toasts";
