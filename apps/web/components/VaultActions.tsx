"use client";

import { crankClaim, harvestFees, stakeShares, unstakeShares } from "@/lib/tx";
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
    <section className="space-y-3 rounded-lg border border-edge bg-panel p-5">
      <h2 className="text-lg font-semibold">Stake, harvest and crank</h2>
      {!ready ? (
        <p className="text-sm text-slate-400">
          Connect a Solana wallet (Phantom, Solflare, Backpack) from the Securitize page to sign.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="share amount (base units)"
          className="min-w-[18rem] rounded-lg border border-edge bg-ink px-3 py-2 font-mono text-sm outline-none focus:border-accent"
        />
        <button
          type="button"
          disabled={!ready || busy !== null || !amountValue}
          onClick={() => {
            if (activeProvider && amountValue) {
              void run("stake", () => stakeShares(activeProvider, vault, amountValue));
            }
          }}
          className="rounded-lg border border-accent/40 bg-accent/10 px-4 py-2 text-sm text-accent disabled:opacity-40"
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
          className="rounded-lg border border-edge px-4 py-2 text-sm disabled:opacity-40"
        >
          Unstake
        </button>
        <button
          type="button"
          disabled={!ready || busy !== null}
          onClick={() => {
            if (activeProvider) void run("harvest", () => harvestFees(activeProvider, vault));
          }}
          className="rounded-lg border border-edge px-4 py-2 text-sm disabled:opacity-40"
        >
          Harvest fees
        </button>
        <button
          type="button"
          disabled={!ready || busy !== null}
          onClick={() => {
            if (activeProvider) void run("crank", () => crankClaim(activeProvider, vault));
          }}
          className="rounded-lg border border-edge px-4 py-2 text-sm disabled:opacity-40"
        >
          Crank claim
        </button>
      </div>

      {busy ? <p className="text-sm text-slate-400">{busy}…</p> : null}
      {message ? <p className="break-all font-mono text-xs text-slate-400">{message}</p> : null}
    </section>
  );
}
