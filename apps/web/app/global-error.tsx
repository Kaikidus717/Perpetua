"use client";

/// Last-resort boundary: if the root layout itself throws, Next renders this instead. It has to
/// supply its own <html> and <body>, so the styles here are inlined rather than Tailwind tokens.
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          background: "#0b0e14",
          color: "#e2e8f0",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          padding: "3rem",
        }}
      >
        <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Perpetua failed to start</h1>
        <p style={{ color: "#94a3b8", marginTop: "0.5rem" }}>
          Check that the indexer API is reachable, then reload.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: "1rem",
            border: "1px solid #38bdf8",
            borderRadius: "0.5rem",
            padding: "0.5rem 1rem",
            color: "#38bdf8",
            background: "transparent",
            cursor: "pointer",
          }}
        >
          Reload
        </button>
      </body>
    </html>
  );
}
