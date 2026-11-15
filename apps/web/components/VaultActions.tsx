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
  warmPool,
} from "@/lib/tx";
import { BUTTON, BUTTON_PRIMARY, CARD, LINK } from "@/lib/ui";
import { SUPPORTED_WALLETS, solanaProvider, useSolanaWallet } from "@/lib/wallet";
import { useState } from "react";

const SHARE_DECIMALS = 6n;

/// The program stores shares in base units. People enter whole shares.
function parseWholeShares(value: string): bigint | null {
  const trimmed = value.trim();
  if (!trimmed) return 0n;
  if (!/^\d+$/.test(trimmed)) return null;
  try {
    return BigInt(trimmed) * 10n ** SHARE_DECIMALS;
  } catch {
    return null;
  }
}

export function VaultActions({ vault }: { vault: string }) {
  const wallet = useSolanaWallet();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  /// Something that *worked* and is worth saying, kept apart from `message`, which is for failures.
  const [note, setNote] = useState<string | null>(null);
  /// The signature of the last transaction this page sent, so a reader can check it themselves.
  const [confirmed, setConfirmed] = useState<string | null>(null);

  const activeProvider = solanaProvider();
  const ready = Boolean(wallet.address && activeProvider);

  async function run(label: string, action: () => Promise<string>) {
    setBusy(label);
    setMessage(null);
    setNote(null);
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

  const canAddVolume = VAULT_CLUSTER === "devnet";

  const network = useWalletNetwork(wallet.address);
  const wrongNetwork = network.cluster === "mainnet-beta";

  const amountValue = parseWholeShares(amount);

  return (
    <section className={`${CARD} space-y-4 p-5`}>
      <h2 className="text-base font-semibold text-ink">Stake shares and collect fees</h2>
      {!ready ? (
        <button type="button" onClick={() => void wallet.connect()} className={BUTTON}>
          Connect a wallet ({SUPPORTED_WALLETS})
        </button>
      ) : null}

      {ready && wrongNetwork ? (
        <p className="text-[13px] leading-5 text-warn">
          This wallet is on {network.label}. Staking and fee collection run on the test network.
          Switch Phantom to Settings → Developer Settings → Change Network → Devnet, then reload.
        </p>
      ) : null}
      {ready && network.label && !wrongNetwork ? (
        <p className="text-[12px] text-muted">These actions run on {network.label}.</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <label className="min-w-[18rem] flex-1 space-y-1 text-[13px]">
          <span className="block text-[12px] text-muted">Shares</span>
          <input
            name="shares"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="How many shares?"
            inputMode="numeric"
            autoComplete="off"
            className="w-full rounded-md border border-line bg-canvas px-3 py-2 font-mono text-[13px] text-ink outline-none placeholder:text-muted focus:border-ink"
          />
        </label>
        {amount.trim() && amountValue === null ? (
          <p className="text-[12px] leading-5 text-warn">Enter a whole number of shares.</p>
        ) : null}
        <button
          type="button"
          disabled={!ready || busy !== null || !amountValue || wrongNetwork}
          onClick={() => {
            if (activeProvider && amountValue) {
              void run("stake your shares", () =>
                stakeShares(activeProvider, vault, amountValue, VAULT_CLUSTER),
              );
            }
          }}
          className={BUTTON_PRIMARY}
        >
          Stake shares
        </button>
        <button
          type="button"
          disabled={!ready || busy !== null || !amountValue || wrongNetwork}
          onClick={() => {
            if (activeProvider && amountValue) {
              void run("unstake your shares", () =>
                unstakeShares(activeProvider, vault, amountValue, VAULT_CLUSTER),
              );
            }
          }}
          className={BUTTON}
        >
          Unstake shares
        </button>
        <button
          type="button"
          disabled={!ready || busy !== null || !amountValue || wrongNetwork}
          title="Return your shares without collecting fees. Use this if a token is paused."
          onClick={() => {
            if (activeProvider && amountValue) {
              void run("exit without collecting fees", () =>
                unstakeNoClaimShares(activeProvider, vault, amountValue, VAULT_CLUSTER),
              );
            }
          }}
          className={BUTTON}
        >
          Exit without fees
        </button>
        <button
          type="button"
          disabled={!ready || busy !== null || wrongNetwork}
          onClick={() => {
            if (activeProvider)
              void run("collect your fees", () =>
                harvestFees(activeProvider, vault, VAULT_CLUSTER),
              );
          }}
          className={BUTTON}
        >
          Collect your fees
        </button>
        <button
          type="button"
          disabled={!ready || busy !== null || wrongNetwork}
          onClick={() => {
            if (!activeProvider) return;
            void run("collect pool fees", async () => {
              if (canAddVolume) {
                try {
                  await warmPool(activeProvider, vault, VAULT_CLUSTER);
                  setNote("Added a small test trade first. Now collect your fees.");
                } catch (cause) {
                  setNote(
                    `The test trade didn't go through. ${humanError(cause, "add a test trade")}`,
                  );
                }
              }
              return crankClaim(activeProvider, vault, VAULT_CLUSTER);
            });
          }}
          className={BUTTON}
        >
          Collect pool fees
        </button>
      </div>

      <p className="text-[12px] leading-5 text-muted">
        Exit without fees returns your shares if a token is paused. Another wallet can collect the
        pool fees later.
      </p>

      {canAddVolume ? (
        <p className="text-[12px] leading-5 text-muted">
          On devnet, collect pool fees makes a small test trade first so there are fees to collect.
          It costs a little test SOL.
        </p>
      ) : null}

      {note ? <p className="text-[13px] text-muted">{note}</p> : null}

      {busy ? (
        <p className="flex items-center gap-2 text-[13px] text-muted">
          <Spinner label={busy} />
          {busy}…
        </p>
      ) : null}
      {message ? <p className="text-[13px] text-warn">{message}</p> : null}
      {confirmed ? (
        <p className="text-[13px] text-ink">
          Done.{" "}
          <a
            href={txUrl(confirmed)}
            target="_blank"
            rel="noreferrer"
            className={`font-mono text-[12px] ${LINK}`}
          >
            View the transaction ↗
          </a>
        </p>
      ) : null}
    </section>
  );
}
