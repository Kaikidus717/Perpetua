"use client";

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
  { href: "/kpi", label: "Stats" },
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className="border-b border-line bg-canvas">
      <div className={`${CONTAINER} flex min-h-16 flex-wrap items-center justify-between gap-x-6`}>
        <Link href="/" className="flex items-baseline gap-2 py-4">
          <span className="text-[15px] font-semibold tracking-tight text-ink">Perpetua</span>
          <span className="hidden text-xs text-muted sm:inline">pool fee shares</span>
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
