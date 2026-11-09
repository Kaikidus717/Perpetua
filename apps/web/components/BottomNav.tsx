"use client";

import { DESTINATIONS } from "@/components/Header";
import Link from "next/link";
import { usePathname } from "next/navigation";

/// Where the destinations live on a phone: pinned to the bottom, above the home indicator, within
/// thumb reach. Same active colour as the desktop header, so the app reads as one thing at any size.
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line/70 bg-canvas/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    >
      <ul className="mx-auto flex w-full max-w-lg items-stretch px-1">
        {DESTINATIONS.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-1 text-[11px] font-medium uppercase tracking-wide transition-colors duration-150 motion-reduce:transition-none ${
                  active ? "text-accent" : "text-muted"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`h-1 w-1 rounded-full ${active ? "bg-accent" : "bg-line"}`}
                />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
