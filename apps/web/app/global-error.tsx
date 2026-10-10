"use client";

/// Last-resort boundary: if the root layout itself throws, Next renders this instead. It has to
/// supply its own <html> and <body>, so the styles here are inlined rather than Tailwind tokens.
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          background: "#ffffff",
          color: "#16181d",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          padding: "3rem",
        }}
      >
        <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Perpetua failed to start</h1>
        <p style={{ color: "#6b7280", marginTop: "0.5rem" }}>
          The page could not load. Reload to try again.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: "1rem",
            border: "1px solid #16181d",
            borderRadius: "0.375rem",
            padding: "0.5rem 1rem",
            color: "#16181d",
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
