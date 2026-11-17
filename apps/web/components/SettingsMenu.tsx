"use client";

import { type Network, useNetwork } from "@/lib/cluster";

const NETWORKS: Array<{ value: Network; label: string; note: string }> = [
  { value: "devnet", label: "Devnet", note: "Test money" },
  { value: "mainnet-beta", label: "Mainnet", note: "Real money" },
];

function GearIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      className="h-5 w-5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 1 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281Z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );
}

export function SettingsMenu({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { network, setNetwork } = useNetwork();
  const currentLabel = network === "mainnet-beta" ? "Mainnet" : "Devnet";

  return (
    <div className="relative" data-header-menu>
      <button
        type="button"
        aria-label={`Settings. Network: ${currentLabel}.`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-panel hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent2/60 motion-reduce:transition-none md:h-9 md:w-9"
      >
        <GearIcon />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Settings"
          className="absolute left-0 top-full z-50 mt-2 w-64 rounded-xl border border-line bg-panel p-2 md:left-auto md:right-0"
        >
          <p className="px-3 pb-1 pt-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
            Network
          </p>
          {NETWORKS.map((option) => {
            const active = network === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setNetwork(option.value);
                  onOpenChange(false);
                }}
                className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-[13px] transition-colors duration-150 motion-reduce:transition-none ${
                  active ? "bg-accent2/10 text-ink" : "text-muted hover:bg-canvas hover:text-ink"
                }`}
              >
                <span>
                  <span className="block">{option.label}</span>
                  <span className="block text-[11px] text-muted">{option.note}</span>
                </span>
                {active ? (
                  <span aria-hidden="true" className="text-[13px] text-accent2">
                    ✓
                  </span>
                ) : null}
              </button>
            );
          })}
          <p className="px-3 pb-1 pt-2 text-[11px] leading-4 text-muted">
            Your wallet has to be on the same network to sign.
          </p>
        </div>
      ) : null}
    </div>
  );
}
