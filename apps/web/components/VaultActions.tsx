"use client";

import { Spinner } from "@/components/Spinner";
import { txUrl } from "@/lib/format";
import { humanError } from "@/lib/messages";
import { useWalletNetwork } from "@/lib/network";
import {
  crankClaim,
  harvestFees,
  stakeShares,
  unstakeNoClaimShares,
  unstakeShares,
} from "@/lib/tx";
import { BUTTON, BUTTON_PRIMARY, CARD, LINK } from "@/lib/ui";
import { SUPPORTED_WALLETS, solanaProvider, useSolanaWallet } from "@/lib/wallet";
import { useState } from "react";

export function VaultActions({ vault }: { vault: string }) {
  const wallet = useSolanaWallet();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  /// The signature of the last transaction this page sent, so a reader can check it themselves.
  const [confirmed, setConfirmed] = useState<string | null>(null);

  const activeProvider = solanaProvider();
  const ready = Boolean(wallet.address && activeProvider);

  async function run(label: string, action: () => Promise<string>) {
    setBusy(label);
    setMessage(null);
    setConfirmed(null);
    try {
      const signature = await action();
      setConfirmed(signature);
    } catch (cause) {
      setMessage(humanError(cause, label));
    } finally {
      setBusy(null);
    }
  }

  /// The vault program is deployed on devnet, so every action here is a devnet transaction. Saying so
  /// explicitly keeps it correct even when the deploy's default cluster is mainnet.
  const VAULT_CLUSTER = "devnet";

  /// A mainnet wallet cannot sign these — the program is not deployed there — so the buttons stay
  /// shut and the page says why, instead of failing at the wallet. The answer comes from the shared
  /// lookup in `lib/network`, so this card and the header badge can never disagree.
  const network = useWalletNetwork(wallet.address);
  const wrongNetwork = network.cluster === "mainnet-beta";

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
        <button type="button" onClick={() => void wallet.connect()} className={BUTTON}>
          Connect a wallet ({SUPPORTED_WALLETS})
        </button>
      ) : null}

      {ready && wrongNetwork ? (
        <p className="text-sm text-warn">
          This wallet is on {network.label}. Staking, harvesting and cranking need the vault
          program, which is deployed on devnet only — switch the wallet to devnet (Phantom: Settings
          → Developer Settings → Change Network → Devnet) and reload to use these. Every transaction
          below is a devnet one.
        </p>
      ) : null}
      {ready && network.label && !wrongNetwork ? (
        <p className="text-xs text-muted">
          This wallet is on {network.label}, where the vault program lives — so these are{" "}
          {network.label} transactions.
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
          disabled={!ready || busy !== null || !amountValue || wrongNetwork}
          onClick={() => {
            if (activeProvider && amountValue) {
              void run("stake", () =>
                stakeShares(activeProvider, vault, amountValue, VAULT_CLUSTER),
              );
            }
          }}
          className={BUTTON_PRIMARY}
        >
          Stake
        </button>
        <button
          type="button"
          disabled={!ready || busy !== null || !amountValue || wrongNetwork}
          onClick={() => {
            if (activeProvider && amountValue) {
              void run("unstake", () =>
                unstakeShares(activeProvider, vault, amountValue, VAULT_CLUSTER),
              );
            }
          }}
          className={BUTTON}
        >
          Unstake
        </button>
        <button
          type="button"
          disabled={!ready || busy !== null || !amountValue || wrongNetwork}
          title="Release shares without claiming fees, for a paused or blocked fee mint."
          onClick={() => {
            if (activeProvider && amountValue) {
              void run("force exit", () =>
                unstakeNoClaimShares(activeProvider, vault, amountValue, VAULT_CLUSTER),
              );
            }
          }}
          className={BUTTON}
        >
          Force exit
        </button>
        <button
          type="button"
          disabled={!ready || busy !== null || wrongNetwork}
          onClick={() => {
            if (activeProvider)
              void run("harvest", () => harvestFees(activeProvider, vault, VAULT_CLUSTER));
          }}
          className={BUTTON}
        >
          Harvest fees
        </button>
        <button
          type="button"
          disabled={!ready || busy !== null || wrongNetwork}
          onClick={() => {
            if (activeProvider)
              void run("crank", () => crankClaim(activeProvider, vault, VAULT_CLUSTER));
          }}
          className={BUTTON}
        >
          Crank claim
        </button>
      </div>

      <p className="text-xs text-muted">
        Force exit releases your shares without claiming fees. Use it if a fee mint is paused or
        blocked; have another wallet crank, then harvest, to collect what is owed.
      </p>

      {busy ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Spinner label={busy} />
          {busy}…
        </p>
      ) : null}
      {message ? <p className="text-sm text-warn">{message}</p> : null}
      {confirmed ? (
        <p className="text-sm text-ink">
          Done.{" "}
          <a
            href={txUrl(confirmed)}
            target="_blank"
            rel="noreferrer"
            className={`font-mono text-xs ${LINK}`}
          >
            view it on Solscan ↗
          </a>
        </p>
      ) : null}
    </section>
  );
}
