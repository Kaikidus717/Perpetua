import { SITE } from "@/lib/site";
import { CONTAINER, LINK, META } from "@/lib/ui";
import Link from "next/link";

/// One line of stance, one line of fact. Not a sitemap: the header carries the main destinations,
/// and the sandbox lives here so it stays reachable without competing with the walkthrough.
export function Footer() {
  return (
    <footer className="border-t border-line/70">
      <div
        className={`${CONTAINER} flex flex-col gap-3 py-6 sm:flex-row sm:items-center sm:justify-between`}
      >
        <p className={`${META} max-w-xl`}>{SITE.description}</p>
        <p className={`${META} flex flex-wrap items-center gap-x-2 gap-y-1 sm:shrink-0`}>
          <span>Vaults and share trades run on devnet. Pool pricing reads mainnet data.</span>
          <Link href="/sandbox" className={LINK}>
            Sandbox
          </Link>
          <span aria-hidden="true">·</span>
          <Link href="/mcp" className={LINK}>
            API &amp; MCP
          </Link>
        </p>
      </div>
    </footer>
  );
}
