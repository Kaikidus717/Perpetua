"use client";

import { explorerCluster, explorerUrl, shortAddress } from "@/lib/format";
import { humanError } from "@/lib/messages";
import { useWalletNetwork } from "@/lib/network";
import { createLockedPosition } from "@/lib/tx";
import { BUTTON, BUTTON_PRIMARY, CARD, LINK } from "@/lib/ui";
import { SUPPORTED_WALLETS, solanaProvider, useSolanaWallet } from "@/lib/wallet";
import { useState } from "react";

/// A wallet that holds no positions has nothing to securitize, so give it something: one click builds
/// a fresh DAMM v2 pool whose initial position is permanently locked and owned by this wallet. Two
/// signatures, and the wallet pays the rent. Works on devnet and mainnet.
export function CreateLockedPosition({
  cluster,
  onCreated,
}: {
  cluster: string;
  /// Rescans the wallet and reports whether a position is now visible. Called repeatedly, because the
  /// RPC behind the scan can lag a beat behind the confirmation.
  onCreated?: () => Promise<boolean>;
}) {
  const wallet = useSolanaWallet();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [created, setCreated] = useState<{ position: string } | null>(null);

  const provider = solanaProvider();
  const ready = Boolean(wallet.address && provider);
  const network = useWalletNetwork(wallet.address);
  const mismatched = Boolean(network.cluster && network.cluster !== cluster);

  async function run() {
    if (!provider) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await createLockedPosition(provider, cluster);
      setCreated({ position: result.position });
      if (onCreated) {
        for (let attempt = 0; attempt < 5; attempt += 1) {
          if (await onCreated()) break;
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      }
    } catch (cause) {
      setMessage(humanError(cause, "Creating the position"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`${CARD} space-y-3 p-5`}>
      <h2 className="text-base font-semibold text-ink">No locked position yet?</h2>
      <p className="text-sm text-muted">
        Securitizing needs a permanently locked position. This creates one: a fresh DAMM v2 pool
        owned by your wallet, with its liquidity locked forever. Two signatures, and a little SOL
        for rent.
      </p>

      {!ready ? (
        <button type="button" onClick={() => void wallet.connect()} className={BUTTON}>
          Connect a wallet ({SUPPORTED_WALLETS})
        </button>
      ) : null}

      {ready && mismatched ? (
        <p className="text-sm text-warn">
          This wallet is on {network.label}, but this page is set to {cluster}. Switch networks
          first.
        </p>
      ) : null}

      {ready ? (
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy || mismatched}
          className={BUTTON_PRIMARY}
        >
          {busy ? "Waiting for signature…" : "Create a locked position"}
        </button>
      ) : null}

      {message ? <p className="text-sm text-warn">{message}</p> : null}

      {created ? (
        <p className="text-sm text-muted">
          Position{" "}
          <a
            href={explorerUrl(created.position, explorerCluster(cluster))}
            target="_blank"
            rel="noreferrer"
            className={`font-mono text-xs ${LINK}`}
          >
            {shortAddress(created.position)} ↗
          </a>{" "}
          created. Securitize it below.
        </p>
      ) : null}
    </section>
  );
}
