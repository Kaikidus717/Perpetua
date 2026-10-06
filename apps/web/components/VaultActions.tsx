"use client";

import { crankClaim, harvestFees, stakeShares, unstakeShares } from "@/lib/tx";
import { BUTTON, BUTTON_PRIMARY, CARD } from "@/lib/ui";
import { solanaProvider, useSolanaWallet } from "@/lib/wallet";
import { useState } from "react";

export function VaultActions({ vault }: { vault: string }) {
  const wallet = useSolanaWallet();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const activeProvider = solanaProvider();
  const ready = Boolean(wallet.address && activeProvider);

  async function run(label: string, action: () => Promise<string>) {
    setBusy(label);
    setMessage(null);
    try {
      const signature = await action();
      setMessage(`${label} confirmed: ${signature}`);
    } catch (cause) {
      setMessage(`${label} failed: ${cause instanceof Error ? cause.message : "unknown error"}`);
    } finally {
      setBusy(null);
    }
  }

  const amountValue = (() => {
    try {
      return amount.trim() ? BigInt(amount.trim()) : 0n;
    } catch {
      return null;
    }
  })();

  return (
    <section className={`${CARD} space-y-4 p-5`}>
      <h2 className="text-base font-semibold text-ink">Stake, harvest and crank</h2>
      {!ready ? (
        <p className="text-sm text-muted">
          Connect a Solana wallet (Phantom, Solflare, Backpack) on the Create shares page to sign
          these.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="share amount (base units)"
          className="min-w-[18rem] flex-1 rounded-md border border-line bg-canvas px-3 py-2 font-mono text-sm text-ink outline-none placeholder:text-muted focus:border-ink"
        />
        <button
          type="button"
          disabled={!ready || busy !== null || !amountValue}
          onClick={() => {
            if (activeProvider && amountValue) {
              void run("stake", () => stakeShares(activeProvider, vault, amountValue));
            }
          }}
          className={BUTTON_PRIMARY}
        >
          Stake
        </button>
        <button
          type="button"
          disabled={!ready || busy !== null || !amountValue}
          onClick={() => {
            if (activeProvider && amountValue) {
              void run("unstake", () => unstakeShares(activeProvider, vault, amountValue));
            }
          }}
          className={BUTTON}
        >
          Unstake
        </button>
        <button
          type="button"
          disabled={!ready || busy !== null}
          onClick={() => {
            if (activeProvider) void run("harvest", () => harvestFees(activeProvider, vault));
          }}
          className={BUTTON}
        >
          Harvest fees
        </button>
        <button
          type="button"
          disabled={!ready || busy !== null}
          onClick={() => {
            if (activeProvider) void run("crank", () => crankClaim(activeProvider, vault));
          }}
          className={BUTTON}
        >
          Crank claim
        </button>
      </div>

      {busy ? <p className="text-sm text-muted">{busy}…</p> : null}
      {message ? <p className="break-all font-mono text-xs text-muted">{message}</p> : null}
    </section>
  );
}
