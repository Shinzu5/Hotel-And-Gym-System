"use client";

/**
 * App-wide client error boundary (App Router `error.js`).
 *
 * Any render/runtime crash below the root layout lands here instead of a
 * blank screen or a raw Next.js overlay, so the user always sees something
 * actionable.
 */

export default function AppError({ error, reset }) {
  const message =
    (typeof error?.message === "string" && error.message) ||
    "Something went wrong while rendering this page.";
  const digest = error?.digest ? String(error.digest) : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-6 w-6"
            aria-hidden="true"
          >
            <path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
          </svg>
        </div>

        <h1 className="mt-5 text-2xl font-bold tracking-tight text-gray-900">
          Something went wrong
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          The page hit an unexpected error. Your data is safe — retry, or head back to the
          dashboard.
        </p>

        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="break-words text-sm font-medium text-red-800">{message}</p>
          {digest ? (
            <p className="mt-1 font-mono text-xs text-red-600">Reference: {digest}</p>
          ) : null}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => (typeof reset === "function" ? reset() : window.location.reload())}
            className="rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-on-accent shadow-sm transition hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => (window.location.href = "/dashboard")}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
          >
            Back to dashboard
          </button>
        </div>

        <p className="mt-6 border-t border-gray-100 pt-4 text-xs text-gray-500">
          Still stuck? Sign out and back in, or check that the backend is running on
          <span className="font-mono"> http://localhost:5000</span>.
        </p>
      </div>
    </div>
  );
}
