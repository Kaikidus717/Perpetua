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
        <h1 className="text-[15px] font-semibold text-ink">This page didn&apos;t finish loading</h1>
        <p className={`${META} leading-5`}>
          Reloading usually clears it. If it keeps happening, open Stats — if those figures arrive,
          the API is fine and this page is the problem.
        </p>
      </div>
      <button type="button" onClick={reset} className={BUTTON}>
        Try again
      </button>
    </div>
  );
}
