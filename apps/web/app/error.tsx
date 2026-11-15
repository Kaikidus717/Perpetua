"use client";

import { BUTTON, CARD, META } from "@/lib/ui";

export default function ErrorBoundary({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className={`${CARD} max-w-lg space-y-4 p-5`}>
      <div className="space-y-1">
        <h1 className="text-[15px] font-semibold text-ink">This page stopped loading</h1>
        <p className={`${META} leading-5`}>
          Your wallet was not touched. Try again. If it keeps happening, go back to Vaults and
          return in a moment.
        </p>
      </div>
      <button type="button" onClick={reset} className={BUTTON}>
        Try again
      </button>
    </div>
  );
}
