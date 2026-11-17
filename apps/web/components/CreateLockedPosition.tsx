"use client";

import { explorerCluster, explorerUrl, shortAddress } from "@/lib/format";
import { humanError } from "@/lib/messages";
import { useWalletNetwork } from "@/lib/network";
import { createLockedPosition } from "@/lib/tx";
import { BUTTON_PRIMARY, CARD, LINK } from "@/lib/ui";
import { solanaProvider, useSolanaWallet } from "@/lib/wallet";
import { useState } from "react";

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
      setMessage(humanError(cause, "create a test pool"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`${CARD} space-y-3 p-5`}>
      <h2 className="text-base font-semibold text-ink">No test pool yet?</h2>
      <p className="text-[13px] leading-5 text-muted">
        This creates a new Meteora pool owned by your wallet, with its funds locked forever. You
        will approve two wallet prompts and pay a small network fee.
      </p>

      {!ready ? (
        <p className="text-[12px] leading-5 text-muted">
          Connect your wallet in the header to create a test pool.
        </p>
      ) : null}

      {ready && mismatched ? (
        <p className="text-[13px] leading-5 text-warn">
          This wallet is on {network.label}, but this page is set to {cluster}. Switch the wallet
          network first.
        </p>
      ) : null}

      {ready ? (
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy || mismatched}
          className={BUTTON_PRIMARY}
        >
          {busy ? "Waiting for signature…" : "Create a test pool"}
        </button>
      ) : null}

      {message ? <p className="text-[13px] text-warn">{message}</p> : null}

      {created ? (
        <p className="text-[13px] text-muted">
          Position{" "}
          <a
            href={explorerUrl(created.position, explorerCluster(cluster))}
            target="_blank"
            rel="noreferrer"
            className={`font-mono text-[12px] ${LINK}`}
          >
            {shortAddress(created.position)} ↗
          </a>{" "}
          created. Turn it into shares below.
        </p>
      ) : null}
    </section>
  );
}
