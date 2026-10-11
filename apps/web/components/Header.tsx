"use client";

import { useWalletNetwork } from "@/lib/network";
import { CONTAINER } from "@/lib/ui";
import { useSolanaWallet } from "@/lib/wallet";
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
  const wallet = useSolanaWallet();
  const network = useWalletNetwork(wallet.address);

  return (
    <header className="border-b border-line bg-canvas">
      <div className={`${CONTAINER} flex min-h-16 flex-wrap items-center justify-between gap-x-6`}>
        <Link href="/" className="flex items-baseline gap-2 py-4">
          <span className="text-[15px] font-semibold tracking-tight text-ink">Perpetua</span>
          <span className="hidden text-xs text-muted sm:inline">the fee-rights exchange</span>
          {/* The network the connected wallet signs on — the one thing here that is a fact about the
              visitor rather than about this deployment. It stays hidden until a wallet answers,
              because a build-time label would be wrong for half the audience: one deployment serves
              mainnet and devnet at once (pool pricing and launches are mainnet; vaults and share
              transactions are devnet). The pages spell that out where it changes what you can do. */}
          {network.label ? (
            <span
              title="The network your wallet signs on. Vaults and share transactions are devnet; pool pricing and token launches are mainnet."
              className="rounded-sm border border-line bg-panel px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-muted"
            >
              {network.label} wallet
            </span>
          ) : null}
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
