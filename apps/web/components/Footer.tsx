import { SITE } from "@/lib/site";
import { CONTAINER, LINK, META } from "@/lib/ui";
import Link from "next/link";

/// One line of stance, one line of fact. Not a sitemap: the header already carries every destination,
/// and repeating it here would be a fourth copy of the same six words.
export function Footer() {
  return (
    <footer className="border-t border-line/70">
      <div
        className={`${CONTAINER} flex flex-col gap-3 py-6 sm:flex-row sm:items-center sm:justify-between`}
      >
        <p className={`${META} max-w-xl`}>{SITE.description}</p>
        <p className={`${META} shrink-0`}>
          Vaults and share trades run on devnet. Pool pricing reads mainnet data.{" "}
          <Link href="/mcp" className={LINK}>
            API &amp; MCP
          </Link>
        </p>
      </div>
    </footer>
  );
}
