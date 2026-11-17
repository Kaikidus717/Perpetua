"use client";

import { shortAddress } from "@/lib/format";
import { BUTTON, BUTTON_PRIMARY } from "@/lib/ui";
import { useSolanaWallet } from "@/lib/wallet";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export function WalletControl({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const wallet = useSolanaWallet();
  const pathname = usePathname();
  const [showError, setShowError] = useState(false);

  useEffect(() => {
    if (wallet.error) setShowError(true);
  }, [wallet.error]);

  useEffect(() => {
    if (pathname) setShowError(false);
  }, [pathname]);

  return (
    <div className="relative" data-header-menu>
      <button
        type="button"
        aria-label={wallet.address ? `Wallet ${shortAddress(wallet.address)}` : "Connect wallet"}
        aria-haspopup={wallet.address ? "menu" : undefined}
        aria-expanded={wallet.address ? open : undefined}
        onClick={() => {
          if (wallet.address) {
            onOpenChange(!open);
            return;
          }
          onOpenChange(false);
          setShowError(false);
          void wallet.connect();
        }}
        className={
          wallet.address
            ? `${BUTTON} whitespace-nowrap !px-2.5 font-mono text-[11px]`
            : `${BUTTON_PRIMARY} whitespace-nowrap !px-3 text-[12px]`
        }
      >
        {wallet.address ? (
          <>
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent2" />
            {shortAddress(wallet.address)}
          </>
        ) : (
          "Connect wallet"
        )}
      </button>

      {open && wallet.address ? (
        <div
          role="menu"
          aria-label="Wallet"
          className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-line bg-panel p-3"
        >
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
            Connected wallet
          </p>
          <p className="mt-1 break-all font-mono text-[12px] leading-5 text-ink">
            {wallet.address}
          </p>
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              await wallet.disconnect();
              onOpenChange(false);
            }}
            className={`${BUTTON} mt-3 w-full`}
          >
            Disconnect
          </button>
        </div>
      ) : null}

      {!wallet.address && showError && wallet.error ? (
        <div
          role="alert"
          className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-warn/40 bg-panel p-3 text-[12px] leading-5 text-warn"
        >
          <p>{wallet.error}</p>
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setShowError(false);
                void wallet.connect();
              }}
              className={BUTTON}
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => setShowError(false)}
              className="text-[11px] text-muted underline decoration-line underline-offset-2 hover:text-ink"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
