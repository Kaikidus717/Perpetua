"use client";

import { PREVIOUS_PATH_KEY } from "@/lib/navigation";
import { useRouter } from "next/navigation";

/// Returns to the page the reader came from, with a home fallback for a direct visit.
export function ClosePageButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      aria-label="Close and go back"
      title="Close"
      onClick={() => {
        let previous: string | null = null;
        try {
          previous = window.sessionStorage.getItem(PREVIOUS_PATH_KEY);
        } catch {
          /// Storage can be unavailable; the home fallback still works.
        }
        router.push(previous && previous !== window.location.pathname ? previous : "/");
      }}
      className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-canvas text-muted transition-colors duration-150 hover:border-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent2/60 motion-reduce:transition-none"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        className="h-4 w-4"
      >
        <path strokeLinecap="round" d="m4 4 12 12M16 4 4 16" />
      </svg>
    </button>
  );
}
