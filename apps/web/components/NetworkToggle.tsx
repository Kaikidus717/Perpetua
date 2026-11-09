"use client";

import { NETWORK_LABEL, type Network, useNetwork } from "@/lib/cluster";

export function NetworkToggle() {
  const { network, setNetwork } = useNetwork();
  const mainnet = network === "mainnet-beta";
  const next: Network = mainnet ? "devnet" : "mainnet-beta";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={mainnet}
      aria-label={`Network: ${NETWORK_LABEL[network]}. Switch to ${NETWORK_LABEL[next]}.`}
      onClick={() => setNetwork(next)}
      className="relative flex h-11 shrink-0 items-center rounded-full border border-line bg-panel px-1 transition-colors duration-150 hover:border-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent2/60 motion-reduce:transition-none sm:h-8"
    >
      <span
        aria-hidden="true"
        className={`absolute bottom-1 left-1 top-1 w-[72px] rounded-full bg-accent2/15 ring-1 ring-inset ring-accent2/40 transition-transform duration-150 ease-out motion-reduce:transition-none ${
          mainnet ? "translate-x-[74px]" : "translate-x-0"
        }`}
      />
      <span
        className={`relative z-10 w-[72px] text-center text-[11px] font-medium uppercase tracking-wide transition-colors duration-150 motion-reduce:transition-none ${
          mainnet ? "text-muted" : "text-accent2"
        }`}
      >
        Devnet
      </span>
      <span
        className={`relative z-10 w-[72px] text-center text-[11px] font-medium uppercase tracking-wide transition-colors duration-150 motion-reduce:transition-none ${
          mainnet ? "text-accent2" : "text-muted"
        }`}
      >
        Mainnet
      </span>
    </button>
  );
}
