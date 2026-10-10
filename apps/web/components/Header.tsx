"use client";

import { APP_CLUSTER } from "@/lib/format";
import { CONTAINER } from "@/lib/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";

/// Plain nouns a first-time visitor can guess at. The old labels were internal project jargon
/// ("Explore", "Terminal", "Securitize", "KPI").
const LINKS = [
  { href: "/", label: "Vaults" },
  { href: "/terminal", label: "Pricing" },
  { href: "/securitize", label: "Create shares" },
  { href: "/launch", label: "Launch plan" },
  { href: "/mcp", label: "Use with AI" },
  { href: "/kpi", label: "Stats" },
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className="border-b border-line bg-canvas">
      <div className={`${CONTAINER} flex min-h-16 flex-wrap items-center justify-between gap-x-6`}>
        <Link href="/" className="flex items-baseline gap-2 py-4">
          <span className="text-[15px] font-semibold tracking-tight text-ink">Perpetua</span>
          <span className="hidden text-xs text-muted sm:inline">the fee-rights exchange</span>
          {/* Vaults and transactions live on the cluster this build talks to, while pool pricing is
              always mainnet. Saying which one this is stops the two being mistaken for each other. */}
          {APP_CLUSTER === "mainnet" ? null : (
            <span className="rounded-sm border border-line bg-panel px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-muted">
              {APP_CLUSTER}
            </span>
          )}
        </Link>

        <nav aria-label="Main" className="flex flex-wrap items-center gap-1 py-2">
          {LINKS.map((link) => {
            const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`border-b-2 px-3 py-2 text-sm ${
                  active
                    ? "border-ink font-medium text-ink"
                    : "border-transparent text-muted hover:border-line hover:text-ink"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
