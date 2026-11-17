"use client";

import { WALKTHROUGH_COOKIE, WALKTHROUGH_COOKIE_VALUE } from "@/lib/walkthrough";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/// A first-visit offer, not a gate. One sentence, one button, and a close control.
export function OnboardingPrompt({ show }: { show: boolean }) {
  const [visible, setVisible] = useState(show);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!visible || !mounted) return null;

  function markSeen() {
    document.cookie = `${WALKTHROUGH_COOKIE}=${WALKTHROUGH_COOKIE_VALUE}; path=/; max-age=31536000; samesite=lax`;
  }

  return createPortal(
    <aside
      aria-label="Onboarding"
      className="fixed bottom-20 right-4 z-40 w-[15rem] max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-panel p-3 md:bottom-6 md:right-6"
    >
      <button
        type="button"
        aria-label="Dismiss onboarding"
        onClick={() => {
          markSeen();
          setVisible(false);
        }}
        className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-md border border-line bg-canvas text-muted transition-colors duration-150 hover:border-muted hover:text-ink motion-reduce:transition-none"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          className="h-3.5 w-3.5"
        >
          <path strokeLinecap="round" d="m4 4 12 12M16 4 4 16" />
        </svg>
      </button>

      <p className="pr-9 text-[13px] font-medium text-ink">First time here?</p>
      <Link
        href="/walkthrough"
        onClick={markSeen}
        className="mt-2 flex w-full items-center justify-center rounded-md bg-accent px-3 py-1.5 text-[12px] font-semibold text-canvas transition-colors duration-150 hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 motion-reduce:transition-none"
      >
        Take the tour
      </Link>
    </aside>,
    document.body,
  );
}
