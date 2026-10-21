"use client";

/**
 * Dashboard-scoped error boundary.
 *
 * Keeps a crash inside the admin panel contained and recoverable: retry the
 * segment, return to the dashboard home, or sign out and start over.
 */

export default function DashboardError({ error, reset }) {
  const message =
    (typeof error?.message === "string" && error.message) ||
    "This section failed to load.";
  const digest = error?.digest ? String(error.digest) : null;

  const retry = () => (typeof reset === "function" ? reset() : window.location.reload());
  const goHome = () => (window.location.href = "/dashboard");
  const signOut = () => {
    try {
      window.localStorage.removeItem("token");
    } catch {
      /* storage unavailable — still redirect */
    }
    window.location.href = "/login";
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center rounded-2xl border border-gray-200 bg-white px-6 py-12 text-center shadow-sm">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-600">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-7 w-7"
          aria-hidden="true"
        >
          <path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </svg>
      </div>

      <h1 className="mt-5 text-2xl font-bold tracking-tight text-gray-900">
        This section couldn&apos;t load
      </h1>
      <p className="mt-1 max-w-md text-sm text-gray-500">
        An unexpected error interrupted this screen. Nothing was lost — try again, or go back to
        the dashboard overview.
      </p>

      <div className="mt-5 w-full rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-left">
        <p className="break-words text-sm font-medium text-red-800">{message}</p>
        {digest ? (
          <p className="mt-1 font-mono text-xs text-red-600">Reference: {digest}</p>
        ) : null}
      </div>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={retry}
          className="rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-on-accent shadow-sm transition hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={goHome}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
        >
          Back to dashboard
        </button>
        <button
          type="button"
          onClick={signOut}
          className="rounded-lg px-4 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
