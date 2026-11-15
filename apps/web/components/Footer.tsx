import { SITE } from "@/lib/site";
import { CONTAINER, LINK, META } from "@/lib/ui";
import Link from "next/link";

/// One line of stance, one line of fact. Not a sitemap: the header carries the main destinations,
/// and the sandbox and walkthrough live here so they stay reachable without crowding the nav.
///
/// The bottom padding on mobile clears the fixed bottom navigation. Without it the last line of the
/// footer sits under the nav and cannot be read or tapped.
export function Footer() {
  return (
    <footer className="border-t border-line/70 pb-28 md:pb-0">
      <div
        className={`${CONTAINER} flex flex-col gap-3 py-6 sm:flex-row sm:items-center sm:justify-between`}
      >
        <p className={`${META} max-w-xl`}>{SITE.description}</p>
        <p className={`${META} flex flex-wrap items-center gap-x-2 gap-y-1 sm:shrink-0`}>
          <span>Shares and trading run on the test network. Pricing reads mainnet data.</span>
          <Link href="/sandbox" className={LINK}>
            Sandbox
          </Link>
          <span aria-hidden="true">·</span>
          <Link href="/walkthrough" className={LINK}>
            Walkthrough
          </Link>
        </p>
      </div>
    </footer>
  );
}
