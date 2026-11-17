"use client";

import { Logo } from "@/components/Logo";
import { SettingsMenu } from "@/components/SettingsMenu";
import { WalletControl } from "@/components/WalletControl";
import { SITE } from "@/lib/site";
import { CONTAINER } from "@/lib/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/// Plain nouns a first-time visitor can guess at.
export const DESTINATIONS = [
  { href: "/", label: "Vaults" },
  { href: "/terminal", label: "Pricing" },
  { href: "/launch", label: "Launch" },
  { href: "/securitize", label: "Shares" },
  { href: "/mcp", label: "MCP" },
  { href: "/kpi", label: "Stats" },
];

type HeaderMenu = "settings" | "wallet" | null;

export function Header() {
  const pathname = usePathname();
  const lastPathname = useRef(pathname);
  const [menu, setMenu] = useState<HeaderMenu>(null);

  /// A menu belongs to the page it was opened on.
  useEffect(() => {
    if (lastPathname.current === pathname) return;
    lastPathname.current = pathname;
    setMenu(null);
  }, [pathname]);

  useEffect(() => {
    if (!menu) return;
    const closeOutside = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-header-menu]")) return;
      setMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(null);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menu]);

  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-canvas/80 backdrop-blur-xl">
      {/* Three equal side columns keep the centre fixed. Mobile uses that centre for the mark and
          moves settings to the left; desktop puts the destinations there instead. */}
      <div
        className={`${CONTAINER} grid h-14 grid-cols-[1fr_auto_1fr] items-center gap-2 md:h-[68px] md:gap-4`}
      >
        <div className="flex items-center justify-self-start">
          <div className="md:hidden">
            <SettingsMenu
              open={menu === "settings"}
              onOpenChange={(open) => setMenu(open ? "settings" : null)}
            />
          </div>
          <Link
            href="/"
            aria-label={SITE.name}
            className="hidden shrink-0 items-center gap-2 md:flex"
          >
            <Logo className="h-7 w-7" />
            <span className="text-[14px] font-semibold tracking-[-0.01em] text-ink md:text-[15px]">
              {SITE.name}
            </span>
          </Link>
        </div>

        <div className="flex items-center justify-self-center">
          <Link href="/" aria-label={SITE.name} className="flex md:hidden">
            <Logo className="h-7 w-7" />
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-0.5 md:flex">
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
        </div>

        <div className="flex items-center justify-self-end gap-1.5 md:gap-2">
          <div className="hidden md:block">
            <SettingsMenu
              open={menu === "settings"}
              onOpenChange={(open) => setMenu(open ? "settings" : null)}
            />
          </div>
          <WalletControl
            open={menu === "wallet"}
            onOpenChange={(open) => setMenu(open ? "wallet" : null)}
          />
        </div>
      </div>
    </header>
  );
}
