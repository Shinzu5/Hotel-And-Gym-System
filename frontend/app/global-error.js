"use client";

/**
 * Root-level fallback (`global-error.js`).
 *
 * Only mounts when the ROOT layout itself fails, so it renders its own
 * <html>/<body> and uses inline styles — Tailwind may not be available here.
 */

export default function GlobalError({ error, reset }) {
  const message =
    (typeof error?.message === "string" && error.message) ||
    "The application failed to start.";
  const digest = error?.digest ? String(error.digest) : null;

  const button = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "0.5rem",
    padding: "0.625rem 1rem",
    fontSize: "0.875rem",
    fontWeight: 600,
    cursor: "pointer",
    border: "none",
  };

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem 1rem",
          background: "#f9fafb",
          color: "#111827",
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "32rem",
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: "1rem",
            padding: "2rem",
            boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
          }}
        >
          <div
            style={{
              width: "3rem",
              height: "3rem",
              borderRadius: "9999px",
              background: "#fee2e2",
              color: "#dc2626",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.5rem",
            }}
          >
            !
          </div>

          <h1 style={{ margin: "1.25rem 0 0", fontSize: "1.5rem", fontWeight: 700 }}>
            Fitness Gym couldn&apos;t start
          </h1>
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.875rem", color: "#6b7280" }}>
            A critical error stopped the app from rendering. Reloading usually fixes it.
          </p>

          <div
            style={{
              marginTop: "1.25rem",
              border: "1px solid #fecaca",
              background: "#fef2f2",
              borderRadius: "0.75rem",
              padding: "0.75rem 1rem",
            }}
          >
            <p style={{ margin: 0, fontSize: "0.875rem", color: "#991b1b", wordBreak: "break-word" }}>
              {message}
            </p>
            {digest ? (
              <p
                style={{
                  margin: "0.25rem 0 0",
                  fontSize: "0.75rem",
                  color: "#dc2626",
                  fontFamily: "ui-monospace, monospace",
                }}
              >
                Reference: {digest}
              </p>
            ) : null}
          </div>

          <div style={{ marginTop: "1.5rem", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => (typeof reset === "function" ? reset() : window.location.reload())}
              style={{ ...button, background: "#16a34a", color: "#fff" }}
            >
              Reload app
            </button>
            <button
              type="button"
              onClick={() => (window.location.href = "/login")}
              style={{ ...button, background: "#fff", color: "#374151", border: "1px solid #d1d5db" }}
            >
              Go to sign in
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
