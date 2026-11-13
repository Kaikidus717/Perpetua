"use client";

import { Logo } from "@/components/Logo";
import { NetworkToggle } from "@/components/NetworkToggle";
import { SITE } from "@/lib/site";
import { CONTAINER } from "@/lib/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";

/// Plain nouns a first-time visitor can guess at.
export const DESTINATIONS = [
  { href: "/", label: "Vaults" },
  { href: "/terminal", label: "Pricing" },
  { href: "/launch", label: "Launch" },
  { href: "/securitize", label: "Shares" },
  { href: "/mcp", label: "AI" },
  { href: "/kpi", label: "Stats" },
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-canvas/80 backdrop-blur-xl">
      {/* Three columns rather than a space-between row: the destinations keep the centre of the bar no
          matter how wide the network switch or the wallet chip gets, so nothing nudges the nav
          sideways while someone is using it. */}
      <div
        className={`${CONTAINER} grid h-14 grid-cols-[1fr_auto_1fr] items-center gap-4 md:h-[68px]`}
      >
        <Link
          href="/"
          aria-label={SITE.name}
          className="flex shrink-0 items-center gap-2 justify-self-start"
        >
          <Logo className="h-7 w-7" />
          {/* On a phone the mark carries the brand on its own: a 90px wordmark next to a 24px mark and
              a 152px switch is the definition of clustered. */}
          <span className="hidden text-[14px] font-semibold tracking-[-0.01em] text-ink sm:inline md:text-[15px]">
            {SITE.name}
          </span>
        </Link>

        {/* Centred on a desktop, where a reader looks after the page title. On a phone these live in
            the bottom bar instead â€” six destinations never fit a 390px header without shrinking to
            something nobody can tap. */}
        <nav aria-label="Main" className="hidden items-center gap-0.5 justify-self-center md:flex">
          {DESTINATIONS.map((link) => {
            const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex min-h-10 items-center rounded-lg px-3.5 text-[13px] transition-colors duration-150 motion-reduce:transition-none md:text-[14px] ${
                  active ? "text-ink" : "text-muted hover:text-ink"
                }`}
              >
                {link.label}
                {active ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-3 -bottom-[9px] h-[2px] rounded-full bg-accent"
                  />
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-2 justify-self-end">
          <NetworkToggle />
        </div>
      </div>
    </header>
  );
}
