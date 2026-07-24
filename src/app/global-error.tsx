"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[arabclue] global error", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
          background: "#f8fafc",
          color: "#0f172a",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 420 }}>
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "#115e59",
              marginBottom: 8,
            }}
          >
            ArabClue
          </p>
          <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>
            Application error
          </h1>
          <p style={{ fontSize: 14, color: "#64748b", marginBottom: 16 }}>
            A critical error stopped this page. You can try again.
          </p>
          {error.digest ? (
            <p
              style={{
                fontSize: 11,
                fontFamily: "ui-monospace, monospace",
                color: "#94a3b8",
                marginBottom: 16,
              }}
            >
              {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            style={{
              height: 40,
              padding: "0 16px",
              borderRadius: 8,
              border: "none",
              background: "#115e59",
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
