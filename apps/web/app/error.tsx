"use client";

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
    <div className="space-y-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-6">
      <h1 className="text-lg font-semibold text-amber-200">Something went wrong</h1>
      <p className="text-sm text-amber-200/80">{error.message || "The page failed to render."}</p>
      {error.digest ? (
        <p className="font-mono text-xs text-amber-200/60">digest {error.digest}</p>
      ) : null}
      <button
        type="button"
        onClick={reset}
        className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-4 py-2 text-sm font-medium text-amber-200"
      >
        Try again
      </button>
    </div>
  );
}
