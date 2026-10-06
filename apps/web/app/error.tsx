"use client";

import { BUTTON, CARD_MUTED } from "@/lib/ui";

/// Route-level boundary. Without it an unexpected render error blanks the whole app instead of
/// the page that failed.
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className={`${CARD_MUTED} mx-auto max-w-2xl space-y-4 p-6 text-center`}>
      <h1 className="text-base font-semibold text-ink">Something went wrong</h1>
      <p className="text-sm text-muted">{error.message || "The page failed to render."}</p>
      {error.digest ? <p className="font-mono text-xs text-muted">digest {error.digest}</p> : null}
      <button type="button" onClick={reset} className={BUTTON}>
        Try again
      </button>
    </div>
  );
}
