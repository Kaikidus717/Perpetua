"use client";

import { BUTTON, CARD_MUTED } from "@/lib/ui";

/// Route-level boundary. Without it an unexpected render error blanks the whole app instead of the
/// page that failed. What a visitor gets is a sentence they can act on — the raw error is not
/// something they can use.
export default function ErrorBoundary({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className={`${CARD_MUTED} mx-auto max-w-2xl space-y-4 p-6 text-center`}>
      <h1 className="text-base font-semibold text-ink">Something went wrong</h1>
      <p className="text-sm text-muted">
        This page didn&apos;t finish loading. Reloading usually clears it.
      </p>
      <button type="button" onClick={reset} className={BUTTON}>
        Try again
      </button>
    </div>
  );
}
