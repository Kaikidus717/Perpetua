"use client";

import { api } from "@/lib/api";
import { shortAddress, txUrl } from "@/lib/format";
import { useWalletNetwork } from "@/lib/network";
import { RPC_URL } from "@/lib/tx";
import { BUTTON, BUTTON_PRIMARY, CARD, CARD_MUTED, CHIP, LINK, META } from "@/lib/ui";
import { SUPPORTED_WALLETS, useSolanaWallet } from "@/lib/wallet";
import { Connection, PublicKey } from "@solana/web3.js";
import { useEffect, useState } from "react";

const AIRDROP_LAMPORTS = 1_000_000_000;

function sol(lamports: number | null): string {
  return lamports === null ? "—" : `${(lamports / 1_000_000_000).toFixed(3)} SOL`;
}

/// Funding lives in the sandbox, not in a separate faucet page. It first asks the deployment's
/// shared devnet faucet (0.05 SOL, only to a wallet that has none); if that is absent or rate-limits,
/// it falls back to the public RPC, then tells the visitor to use faucet.solana.com.
export function SandboxFunds() {
  const wallet = useSolanaWallet();
  const network = useWalletNetwork(wallet.address);
  const [balance, setBalance] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    if (!wallet.address) {
      setBalance(null);
      return;
    }
    const connection = new Connection(RPC_URL, "confirmed");
    void connection
      .getBalance(new PublicKey(wallet.address))
      .then((value) => {
        if (live) setBalance(value);
      })
      .catch(() => {
        if (live) setBalance(null);
      });
    return () => {
      live = false;
    };
  }, [wallet.address]);

  async function refreshBalance(address: string): Promise<void> {
    try {
      const connection = new Connection(RPC_URL, "confirmed");
      setBalance(await connection.getBalance(new PublicKey(address)));
    } catch {
      setBalance(null);
    }
  }

  async function copy(address: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setNote("Copy failed — select the address and copy it manually.");
    }
  }

  async function airdrop(): Promise<void> {
    if (!wallet.address) return;
    const address = wallet.address;
    setBusy(true);
    setNote(null);
    setSignature(null);
    try {
      const result = await api.faucet(address);
      if (result.skipped) {
        setNote(result.reason ?? "This wallet already has enough devnet SOL.");
        await refreshBalance(address);
        return;
      }
      setSignature(result.signature);
      setNote(
        `The shared faucet sent ${sol(result.amountLamports)}. Give it a moment to confirm, then refresh.`,
      );
      await refreshBalance(address);
      setTimeout(() => void refreshBalance(address), 2500);
    } catch {
      /// No shared faucet on this deployment (503), or it could not send. The public RPC is the
      /// same fallback the old sandbox used, and it is also the one that rate-limits by IP.
      try {
        const connection = new Connection(RPC_URL, "confirmed");
        const tx = await connection.requestAirdrop(new PublicKey(address), AIRDROP_LAMPORTS);
        const latest = await connection.getLatestBlockhash();
        await connection.confirmTransaction({ signature: tx, ...latest }, "confirmed");
        setSignature(tx);
        setNote("1 devnet SOL sent by the public RPC.");
        await refreshBalance(address);
      } catch (cause) {
        setNote(
          `No airdrop: ${
            cause instanceof Error ? cause.message : String(cause)
          }. The public devnet faucet rate-limits by IP. Copy the address below and use faucet.solana.com — one request is enough.`,
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`${CARD} space-y-3 p-4 sm:p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-[13px] font-semibold text-ink">1 · Wallet and test funds</h2>
          <p className={`${META} max-w-xl leading-5`}>
            Connect a devnet wallet. The sandbox pays for its own rent and fees; nothing here
            touches mainnet or real funds.
          </p>
        </div>
        {network.label ? <span className={CHIP}>{network.label} wallet</span> : null}
      </div>

      {!wallet.address ? (
        <button type="button" onClick={() => void wallet.connect()} className={BUTTON_PRIMARY}>
          Connect a wallet ({SUPPORTED_WALLETS})
        </button>
      ) : (
        <>
          <div className={`${CARD_MUTED} flex flex-wrap items-center justify-between gap-2 p-3`}>
            <span className="break-all font-mono text-[12px] text-ink">{wallet.address}</span>
            <button
              type="button"
              onClick={() => void copy(wallet.address ?? "")}
              className={BUTTON}
            >
              {copied ? "Copied" : "Copy address"}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[13px] text-muted">
              Balance <span className="tnum text-ink">{sol(balance)}</span>
            </span>
            <button
              type="button"
              onClick={() => void airdrop()}
              disabled={busy}
              className={BUTTON_PRIMARY}
            >
              {busy ? "Requesting…" : "Request devnet SOL"}
            </button>
            <button type="button" onClick={() => void wallet.disconnect()} className={BUTTON}>
              Disconnect
            </button>
          </div>

          {network.cluster === "mainnet-beta" ? (
            <p className="text-[13px] leading-5 text-warn">
              This wallet is on mainnet. The vault program is devnet-only — switch Phantom to
              Settings → Developer Settings → Change Network → Devnet, then reload.
            </p>
          ) : null}

          <p className={`${META} leading-5`}>
            The shared faucet sends 0.05 SOL, only to a wallet below 0.1 SOL. If this deployment has
            no shared faucet or the public RPC is rate-limiting, copy the address and use{" "}
            <a href="https://faucet.solana.com" target="_blank" rel="noreferrer" className={LINK}>
              faucet.solana.com ↗
            </a>
            .
          </p>

          {signature ? (
            <a
              href={txUrl(signature, "devnet")}
              target="_blank"
              rel="noreferrer"
              className={`text-[12px] ${LINK}`}
            >
              View the transaction {shortAddress(signature)} ↗
            </a>
          ) : null}
        </>
      )}

      {wallet.error ? <p className="text-[13px] text-warn">{wallet.error}</p> : null}
      {note ? <p className="break-all text-[13px] leading-5 text-muted">{note}</p> : null}
    </section>
  );
}
